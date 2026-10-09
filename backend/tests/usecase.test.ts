import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, migrate } from '../src/db.js';
import { crearDeposito, AppError, type CrearDepositoCmd } from '../src/usecases/create-deposit.js';
import { FakeBalanceAdapter, FakeCustomerAccountAdapter } from '../src/adapters/fakes.js';
import type { BalancePort, CustomerAccountPort } from '../src/ports.js';

const customers = new FakeCustomerAccountAdapter();
const balance = new FakeBalanceAdapter();
let n = 0;
const cmd = (over: Partial<CrearDepositoCmd> = {}): CrearDepositoCmd => ({
  cliente_id: 'A',
  monto: '150.50',
  metodo_origen: 'TRANSFERENCIA',
  idempotencyKey: `key-uc-${Date.now()}-${n++}`,
  ...over,
});

describe('caso de uso crear-deposito (puertos mockeados)', () => {
  beforeAll(async () => {
    await migrate();
    await pool.query(`DELETE FROM depositos_usd`);
    await pool.query(`DELETE FROM fake_ledger`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('UC-01 depósito correcto -> COMPLETADO', async () => {
    const { deposito, replay } = await crearDeposito(cmd(), { customers, balance });
    expect(replay).toBe(false);
    expect(deposito.estado).toBe('COMPLETADO');
    expect(deposito.moneda).toBe('USD');
    expect(deposito.movimiento_saldo_id).toMatch(/^FAKE-/);
  });

  it('UC-02 cliente inexistente -> 404 sin abono', async () => {
    await expect(crearDeposito(cmd({ cliente_id: 'nadie-zzz' }), { customers, balance })).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
    });
    const l = await pool.query(`SELECT COUNT(*)::int c FROM fake_ledger`);
    expect(l.rows[0].c).toBe(1); // solo el UC-01
  });

  it('UC-03 cuenta solo PEN -> 422 antes del crédito', async () => {
    const bal: BalancePort = {
      credit: async () => {
        throw new Error('no debió llamarse');
      },
    };
    await expect(crearDeposito(cmd({ cliente_id: 'C' }), { customers, balance: bal })).rejects.toMatchObject({
      code: 'USD_ACCOUNT_NOT_ENABLED',
    });
  });

  it('UC-04 saldo falla -> FALLIDO nunca COMPLETADO', async () => {
    const balCaido: BalancePort = {
      credit: async () => {
        throw new Error('caído');
      },
    };
    const c = cmd();
    await expect(crearDeposito(c, { customers, balance: balCaido })).rejects.toMatchObject({
      code: 'BALANCE_SERVICE_UNAVAILABLE',
    });
    const { rows } = await pool.query(`SELECT estado FROM depositos_usd WHERE idempotency_key = $1`, [c.idempotencyKey]);
    expect(rows[0].estado).toBe('FALLIDO');
  });

  it('UC-05 idempotencia: dos llamadas, un solo abono', async () => {
    const c = cmd();
    const r1 = await crearDeposito(c, { customers, balance });
    const r2 = await crearDeposito(c, { customers, balance });
    expect(r2.replay).toBe(true);
    expect(r2.deposito.deposito_id).toBe(r1.deposito.deposito_id);
    const l = await pool.query(`SELECT COUNT(*)::int c FROM fake_ledger WHERE referencia = $1`, [r1.deposito.deposito_id]);
    expect(l.rows[0].c).toBe(1);
  });

  it('UC-06 misma key + distinto monto -> 409', async () => {
    const c = cmd({ monto: '10.00' });
    await crearDeposito(c, { customers, balance });
    await expect(crearDeposito({ ...c, monto: '20.00' }, { customers, balance })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });

  it('clientes caído -> 503 CUSTOMER_SERVICE_UNAVAILABLE', async () => {
    const cliCaido: CustomerAccountPort = {
      validateUsdDestination: async () => {
        throw new Error('timeout');
      },
    };
    await expect(crearDeposito(cmd(), { customers: cliCaido, balance })).rejects.toMatchObject({
      code: 'CUSTOMER_SERVICE_UNAVAILABLE',
    } as Partial<AppError>);
  });
});
