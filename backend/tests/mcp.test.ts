import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { pool, migrate } from '../src/db.js';
import { createApp } from '../src/index.js';
import { SandboxHttpClient } from '../src/mcp/client.js';
import { createMcpServer } from '../src/mcp/index.js';

process.env.VITEST = 'true';
process.env.USE_FAKES = 'true';
process.env.SANDBOX_MODE = 'true';

describe('MCP Sandbox y Contratos Canónicos (Specs 002)', () => {
  const app = createApp();
  let serverInstance: any;
  let testPort: number;
  let client: SandboxHttpClient;

  beforeAll(async () => {
    await migrate();
    await pool.query('DELETE FROM depositos_usd');
    await pool.query('DELETE FROM fake_ledger');
    await pool.query('DELETE FROM billetera_movimientos');
    await pool.query('DELETE FROM wallets');

    // Levantar el servidor HTTP en un puerto efímero para que SandboxHttpClient pueda invocarlo
    await new Promise<void>((resolve) => {
      serverInstance = app.listen(0, () => {
        testPort = (serverInstance.address() as any).port;
        client = new SandboxHttpClient({ baseUrl: `http://localhost:${testPort}` });
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (serverInstance) {
      await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
    }
  });

  describe('Fase C: Contratos OpenAPI', () => {
    it('GET /docs.json y /openapi.json exponen la especificación viva OpenAPI 3.0', async () => {
      const resDocs = await request(app).get('/docs.json');
      expect(resDocs.status).toBe(200);
      expect(resDocs.body.openapi).toMatch(/^3\./);
      expect(resDocs.body.info.title).toContain('DOLARA');

      const resOpenApi = await request(app).get('/openapi.json');
      expect(resOpenApi.status).toBe(200);
      expect(resOpenApi.body.paths).toHaveProperty('/api/v1/depositos/usd');
      expect(resOpenApi.body.paths).toHaveProperty('/api/v1/billetera/wallets');
      expect(resOpenApi.body.paths).toHaveProperty('/api/v1/sandbox/reset');
    });
  });

  describe('Fase S: Sandbox y Escenarios de Simulación', () => {
    it('GET /api/v1/sandbox/scenarios lista los escenarios de prueba para agentes', async () => {
      const res = await request(app).get('/api/v1/sandbox/scenarios');
      expect(res.status).toBe(200);
      expect(res.body.active).toBe(true);
      expect(res.body.scenarios.length).toBeGreaterThan(0);
      const codes = res.body.scenarios.map((s: any) => s.code);
      expect(codes).toContain('MONEDA_INVALIDA_PEN');
      expect(codes).toContain('CLIENTE_BLOQUEADO');
      expect(codes).toContain('IDEMPOTENCY_CONFLICT');
    });

    it('POST /api/v1/sandbox/reset limpia registros de prueba', async () => {
      // Insertar un usuario y depósito de prueba sandbox
      await pool.query(`INSERT INTO wallets (user_id, balance, moneda) VALUES ('sandbox-temp', 10, 'USD')`);
      const res = await request(app).post('/api/v1/sandbox/reset');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      const { rows } = await pool.query(`SELECT 1 FROM wallets WHERE user_id = 'sandbox-temp'`);
      expect(rows.length).toBe(0);
    });
  });

  describe('Fase M: Servidor MCP e Invocación de Tools', () => {
    it('inicializa McpServer y registra herramientas y recursos', () => {
      const { server } = createMcpServer(`http://localhost:${testPort}`);
      expect(server).toBeDefined();
    });

    it('billetera_crear_cuenta y billetera_consultar_saldo operan mediante el cliente MCP', async () => {
      const user = `sandbox-agent-${Date.now()}`;
      const resCrear = await client.crearBilletera({ user_id: user, nombre: 'Agente Test' });
      expect(resCrear.status).toBe(201);
      expect((resCrear.data as any).moneda).toBe('USD');

      const resSaldo = await client.consultarSaldo(user);
      expect(resSaldo.status).toBe(200);
      expect((resSaldo.data as any).balance).toBe('0.00');
    });

    it('depositos_crear_usd: 1 vs 10 repeticiones con misma key acreditan exactamente una vez', async () => {
      const key = `key-idempotente-${Date.now()}`;
      const clienteId = 'cliente-activo';

      // 1ra llamada: crea el depósito
      const res1 = await client.crearDeposito(
        { cliente_id: clienteId, monto: '50.00', metodo_origen: 'TRANSFERENCIA' },
        key,
      );
      expect(res1.status).toBe(201);
      const depositoId = (res1.data as any).deposito_id;
      expect(depositoId).toBeDefined();
      expect((res1.data as any).estado).toBe('COMPLETADO');

      // 10 repeticiones sucesivas con la misma key
      for (let i = 0; i < 10; i++) {
        const replayRes = await client.crearDeposito(
          { cliente_id: clienteId, monto: '50.00', metodo_origen: 'TRANSFERENCIA' },
          key,
        );
        expect(replayRes.status).toBe(200);
        expect((replayRes.data as any).deposito_id).toBe(depositoId);
      }

      // Verificar que en fake_ledger solo existe exactamente 1 registro para esta referencia
      const { rows } = await pool.query('SELECT * FROM fake_ledger WHERE referencia = $1', [depositoId]);
      expect(rows.length).toBe(1);
    });

    it('rechaza con 409 IDEMPOTENCY_CONFLICT si la misma key lleva un payload diferente', async () => {
      const key = `key-conflict-${Date.now()}`;
      const res1 = await client.crearDeposito(
        { cliente_id: 'cliente-activo', monto: '15.00', metodo_origen: 'TRANSFERENCIA' },
        key,
      );
      expect(res1.status).toBe(201);

      // Mismo key, distinto monto ($30.00)
      const resConflict = await client.crearDeposito(
        { cliente_id: 'cliente-activo', monto: '30.00', metodo_origen: 'TRANSFERENCIA' },
        key,
      );
      expect(resConflict.status).toBe(409);
      expect((resConflict.data as any).code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('rechaza con 400 VALIDATION_ERROR cualquier intento de usar moneda PEN', async () => {
      const res = await client.crearDeposito({
        cliente_id: 'cliente-activo',
        monto: '50.00',
        metodo_origen: 'TRANSFERENCIA',
        moneda: 'PEN',
      });
      expect(res.status).toBe(400);
      expect((res.data as any).message).toMatch(/USD/i);
    });

    it('rechaza con 422 CUSTOMER_BLOCKED si el cliente está bloqueado', async () => {
      const res = await client.crearDeposito({
        cliente_id: 'cliente-bloqueado',
        monto: '100.00',
        metodo_origen: 'TRANSFERENCIA',
      });
      expect(res.status).toBe(422);
      expect((res.data as any).code).toBe('CUSTOMER_BLOCKED');
    });

    it('rechaza con 422 USD_ACCOUNT_NOT_ENABLED si el cliente solo tiene cuenta PEN', async () => {
      const res = await client.crearDeposito({
        cliente_id: 'cliente-pen',
        monto: '100.00',
        metodo_origen: 'TRANSFERENCIA',
      });
      expect(res.status).toBe(422);
      expect((res.data as any).code).toBe('USD_ACCOUNT_NOT_ENABLED');
    });

    it('transferencia atómica: realiza débito y crédito pareados y bloquea sobregiros', async () => {
      // Crear billetera A con $100 y B con $0
      const userA = `user-a-${Date.now()}`;
      const userB = `user-b-${Date.now()}`;
      const resA = await client.crearBilletera({ user_id: userA });
      const resB = await client.crearBilletera({ user_id: userB });

      // Recargar saldo a A
      await pool.query(`UPDATE wallets SET balance = 100.00 WHERE user_id = $1`, [userA]);

      // Transferir $40 de A a B
      const resTransfer = await client.transferir({
        origen_id: userA,
        destino_id: userB,
        monto: '40.00',
      });
      expect(resTransfer.status).toBe(201);
      expect((resTransfer.data as any).origen_balance).toBe('60.00');
      expect((resTransfer.data as any).destino_balance).toBe('40.00');

      // Verificar saldos finales
      const saldoA = await client.consultarSaldo(userA);
      const saldoB = await client.consultarSaldo(userB);
      expect((saldoA.data as any).balance).toBe('60.00');
      expect((saldoB.data as any).balance).toBe('40.00');

      // Intentar transferir $100 desde A (saldo insuficiente -> 422)
      const resFail = await client.transferir({
        origen_id: userA,
        destino_id: userB,
        monto: '100.00',
      });
      expect(resFail.status).toBe(422);
      expect((resFail.data as any).code).toBe('FONDOS_INSUFICIENTES');
    });
  });
});
