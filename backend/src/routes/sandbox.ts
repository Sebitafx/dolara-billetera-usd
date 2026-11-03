import { Router } from 'express';
import { pool } from '../db.js';
import { apiError } from '../errors.js';

export const sandbox = Router();

function isSandboxAllowed(): boolean {
  return (
    process.env.SANDBOX_MODE === 'true' ||
    (process.env.USE_FAKES ?? 'true') === 'true' ||
    process.env.NODE_ENV !== 'production'
  );
}

/**
 * @openapi
 * /api/v1/sandbox/reset:
 *   post:
 *     summary: Reinicia los datos de prueba del Sandbox (Fase S)
 *     description: Limpia transacciones demo y billeteras con prefijo de prueba para permitir suites reproducibles entre agentes. Bloqueado en producción.
 */
sandbox.post('/reset', async (req, res, next) => {
  if (!isSandboxAllowed()) {
    return next(apiError(403, 'FORBIDDEN', 'Sandbox reset no está permitido en producción'));
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Limpiar fake_ledger
      await client.query('DELETE FROM fake_ledger');
      // Limpiar transacciones y billeteras generadas con prefijos de prueba
      await client.query(`
        DELETE FROM billetera_movimientos 
        WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id LIKE 'sandbox-%' OR user_id LIKE 'test-%')
      `);
      await client.query(`
        DELETE FROM depositos_usd 
        WHERE cliente_id LIKE 'sandbox-%' OR cliente_id LIKE 'test-%'
      `);
      await client.query(`
        DELETE FROM wallets 
        WHERE user_id LIKE 'sandbox-%' OR user_id LIKE 'test-%'
      `);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({
      status: 'success',
      message: 'Sandbox reiniciado exitosamente. Datos demo limpios.',
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/sandbox/scenarios:
 *   get:
 *     summary: Lista los escenarios de simulación disponibles para pruebas de integración de agentes (Fase S)
 */
sandbox.get('/scenarios', (_req, res) => {
  res.json({
    active: isSandboxAllowed(),
    scenarios: [
      {
        code: 'CLIENTE_ACTIVO',
        description: 'Cliente con cuenta USD activa y habilitada para recibir abonos.',
        trigger: 'Usar cliente_id = "cliente-activo", "A", o cualquier usuario creado con prefijo "sandbox-" o "test-".',
        expected_status: 201,
      },
      {
        code: 'CLIENTE_BLOQUEADO',
        description: 'Cliente bloqueado por compliance / prevención de fraude.',
        trigger: 'Usar cliente_id = "cliente-bloqueado" o "B".',
        expected_status: 422,
        expected_code: 'CUSTOMER_BLOCKED',
      },
      {
        code: 'USD_ACCOUNT_NOT_ENABLED',
        description: 'Cliente activo pero su cuenta solo admite moneda PEN (sin cuenta USD).',
        trigger: 'Usar cliente_id = "cliente-pen" o "C".',
        expected_status: 422,
        expected_code: 'USD_ACCOUNT_NOT_ENABLED',
      },
      {
        code: 'MONEDA_INVALIDA_PEN',
        description: 'Intento de enviar moneda PEN a la API de Depósitos USD.',
        trigger: 'Enviar body con { "moneda": "PEN" } en POST /api/v1/depositos/usd.',
        expected_status: 400,
        expected_code: 'VALIDATION_ERROR',
      },
      {
        code: 'IDEMPOTENCY_CONFLICT',
        description: 'Reenvío de la misma Idempotency-Key con montos o datos alterados.',
        trigger: 'Misma Idempotency-Key con payload_hash diferente.',
        expected_status: 409,
        expected_code: 'IDEMPOTENCY_CONFLICT',
      },
      {
        code: 'SALDO_INSUFICIENTE',
        description: 'Intento de transferir o retirar un monto mayor al saldo disponible de la billetera.',
        trigger: 'POST /api/v1/billetera/transferencias con monto > balance.',
        expected_status: 422,
        expected_code: 'SALDO_INSUFICIENTE',
      },
      {
        code: 'BALANCE_SERVICE_UNAVAILABLE',
        description: 'Simula indisponibilidad temporal del microservicio de Saldos/Ledger.',
        trigger: 'Header X-Sandbox-Simulate: BALANCE_UNAVAILABLE o variable de entorno FAIL_NEXT_BALANCE=true.',
        expected_status: 503,
        expected_code: 'BALANCE_SERVICE_UNAVAILABLE',
      },
    ],
  });
});

