import { Router } from 'express';
import { pool } from '../db.js';
import { apiError, correlationId } from '../errors.js';
import { crearDepositoSchema, paginationSchema } from '../validators.js';
import { crearDeposito, AppError } from '../usecases/create-deposit.js';
import { FakeBalanceAdapter, FakeCustomerAccountAdapter } from '../adapters/fakes.js';
import { BalanceHttpAdapter, CustomerAccountHttpAdapter } from '../adapters/http.js';

export const deposits = Router();

function ports() {
  const fakes = (process.env.USE_FAKES ?? 'true') === 'true';
  return {
    fakes,
    customers: fakes ? new FakeCustomerAccountAdapter() : new CustomerAccountHttpAdapter(),
    balance: fakes ? new FakeBalanceAdapter() : new BalanceHttpAdapter(),
  };
}

/**
 * @openapi
 * /api/v1/depositos/usd:
 *   post:
 *     summary: Crea un depósito USD (RF-1)
 */
deposits.post('/', async (req, res, next) => {
  try {
    const key = req.header('Idempotency-Key');
    if (!key) return next(apiError(400, 'VALIDATION_ERROR', 'Idempotency-Key obligatorio'));
    const parsed = crearDepositoSchema.safeParse(req.body);
    if (!parsed.success) {
      const monedaMal = parsed.error.issues.some((i) => String(i.path[0] ?? '') === 'moneda');
      if (monedaMal) return next(apiError(400, 'VALIDATION_ERROR', 'billetera USD-only: moneda debe ser USD'));
      const montoMal = req.body?.monto !== undefined;
      return next(apiError(400, montoMal ? 'INVALID_AMOUNT' : 'VALIDATION_ERROR', 'payload inválido'));
    }
    const p = ports();
    const { deposito, replay } = await crearDeposito(
      { ...parsed.data, idempotencyKey: key },
      { customers: p.customers, balance: p.balance },
    );
    res.status(replay ? 200 : 201).json(deposito);
  } catch (e) {
    if (e instanceof AppError) return next(apiError(e.status, e.code, e.message));
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/depositos/usd/{id}:
 *   get:
 *     summary: Consulta un depósito por id (RF-6)
 */
deposits.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM depositos_usd WHERE id = $1`, [req.params.id]);
    if (rows.length === 0) return next(apiError(404, 'NOT_FOUND', 'depósito no existe'));
    const r = rows[0];
    res.json({
      deposito_id: r.id,
      cliente_id: r.cliente_id,
      cuenta_destino_id: r.cuenta_destino_id,
      monto: String(r.monto),
      moneda: 'USD',
      estado: r.estado,
      movimiento_saldo_id: r.movimiento_saldo_id,
      creado_en: new Date(r.creado_en).toISOString(),
      completado_en: r.completado_en ? new Date(r.completado_en).toISOString() : null,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/depositos/usd:
 *   get:
 *     summary: Historial paginado por cliente (RF-6)
 */
deposits.get('/', async (req, res, next) => {
  try {
    const cliente_id = String(req.query.cliente_id ?? '');
    if (!cliente_id) return next(apiError(400, 'VALIDATION_ERROR', 'cliente_id obligatorio'));
    const page = paginationSchema.parse({ page: req.query.page, limit: req.query.limit });
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM depositos_usd WHERE cliente_id = $1`, [cliente_id]);
    const { rows } = await pool.query(
      `SELECT id, monto, moneda, estado, creado_en FROM depositos_usd
       WHERE cliente_id = $1 ORDER BY creado_en DESC, id DESC LIMIT $2 OFFSET $3`,
      [cliente_id, page.limit, (page.page - 1) * page.limit],
    );
    res.json({
      items: rows.map((r: Record<string, unknown>) => ({
        deposito_id: r.id,
        monto: String(r.monto),
        moneda: 'USD',
        estado: r.estado,
        creado_en: new Date(r.creado_en as string).toISOString(),
      })),
      page: page.page,
      limit: page.limit,
      total: total.rows[0].c,
      correlation_id: correlationId(req),
    });
  } catch (e) {
    next(e);
  }
});
