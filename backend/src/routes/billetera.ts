import { Router } from 'express';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { pool } from '../db.js';
import { apiError } from '../errors.js';
import {
  crearWalletSchema,
  idempotencyKeySchema,
  loginSchema,
  montoRequestSchema,
  paginationSchema,
  registroSchema,
  transferenciaSchema,
  uuidSchema,
  walletOwnerIdSchema,
} from '../validators.js';
import { add, sub, gte } from '../money.js';

export const billetera = Router();

// Acceso demo de Billetera Digital USD (sin auth real): alias + nombre + PIN.
// El PIN se guarda como SHA-256, nunca en claro. Formularios mínimos para demo.
function pinHash(pin: string): string {
  return createHash('sha256').update(`billetera-digital-usd-demo:${pin}`).digest('hex');
}

function legacyPinHash(pin: string): string {
  const legacyPrefix = Buffer.from('ZG9sYXJhLWRlbW86', 'base64').toString('utf8');
  return createHash('sha256').update(`${legacyPrefix}${pin}`).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function walletDTO(w: Record<string, unknown>) {
  return {
    id: w.id,
    user_id: w.user_id,
    nombre: (w.nombre as string | null) ?? null,
    balance: String(w.balance),
    moneda: 'USD',
  };
}

async function resolverWalletId(ref: string): Promise<string | null> {
  if (uuidSchema.safeParse(ref).success) return ref;
  const { rows } = await pool.query(`SELECT id FROM wallets WHERE user_id = $1`, [ref]);
  return rows.length > 0 ? (rows[0].id as string) : null;
}

/**
 * @openapi
 * /api/v1/billetera/wallets:
 *   post:
 *     summary: Crea billetera USD (RF-9)
 */
billetera.post('/wallets', async (req, res, next) => {
  try {
    const { user_id, nombre = null } = crearWalletSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO wallets (user_id, nombre, moneda) VALUES ($1, $2, 'USD') RETURNING id, user_id, nombre, balance, moneda`,
      [user_id, nombre],
    );
    res.status(201).json(walletDTO(rows[0]));
  } catch (e: unknown) {
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === '23505') {
      return next(apiError(409, 'YA_EXISTE', 'billetera ya existe'));
    }
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/billetera/registro:
 *   post:
 *     summary: Registro demo — alias + nombre + PIN (RF-13)
 */
billetera.post('/registro', async (req, res, next) => {
  try {
    const { user_id, nombre, pin } = registroSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO wallets (user_id, nombre, pin_hash, moneda) VALUES ($1, $2, $3, 'USD')
       RETURNING id, user_id, nombre, balance, moneda`,
      [user_id, nombre, pinHash(pin)],
    );
    res.status(201).json(walletDTO(rows[0]));
  } catch (e: unknown) {
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === '23505') {
      return next(apiError(409, 'YA_EXISTE', 'ese alias ya está registrado, inicia sesión'));
    }
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/billetera/login:
 *   post:
 *     summary: Login demo — alias + PIN (RF-13)
 */
billetera.post('/login', async (req, res, next) => {
  try {
    const { user_id, pin } = loginSchema.parse(req.body);
    const { rows } = await pool.query(`SELECT id, user_id, nombre, balance, moneda, pin_hash FROM wallets WHERE user_id = $1`, [
      user_id,
    ]);
    if (rows.length === 0) return next(apiError(404, 'NO_ENCONTRADA', 'alias no registrado'));
    const w = rows[0];
    const currentHash = pinHash(pin);
    if (!w.pin_hash) {
      // Billetera legacy sin PIN: lo fija en el primer login demo.
      await pool.query(`UPDATE wallets SET pin_hash = $1 WHERE id = $2`, [currentHash, w.id]);
    } else if (!sameHash(String(w.pin_hash), currentHash)) {
      if (sameHash(String(w.pin_hash), legacyPinHash(pin))) {
        await pool.query(`UPDATE wallets SET pin_hash = $1 WHERE id = $2`, [currentHash, w.id]);
      } else {
        return next(apiError(401, 'PIN_INCORRECTO', 'PIN incorrecto'));
      }
    }
    res.json(walletDTO(w));
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/billetera/usuarios/buscar:
 *   get:
 *     summary: Busca usuarios por alias para transferir sin pegar UUIDs (RF-13)
 */
billetera.get('/usuarios/buscar', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    if (q.length < 2) return next(apiError(400, 'VALIDATION_ERROR', 'mínimo 2 letras para buscar'));
    const { rows } = await pool.query(
      `SELECT id, user_id, nombre FROM wallets WHERE user_id ILIKE $1 OR nombre ILIKE $1 ORDER BY user_id LIMIT 8`,
      [`%${q}%`],
    );
    res.json({ items: rows.map((r: Record<string, unknown>) => ({ id: r.id, user_id: r.user_id, nombre: r.nombre ?? null })) });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/billetera/usuarios/{userId}/wallet:
 *   get:
 *     summary: Busca billetera USD por user_id (RF-9)
 */
billetera.get('/usuarios/:userId/wallet', async (req, res, next) => {
  try {
    const userId = walletOwnerIdSchema.parse(req.params.userId);
    const { rows } = await pool.query(`SELECT id, user_id, nombre, balance, moneda FROM wallets WHERE user_id = $1`, [
      userId,
    ]);
    if (rows.length === 0) return next(apiError(404, 'NO_ENCONTRADA', 'billetera no encontrada'));
    res.json(walletDTO(rows[0]));
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/billetera/wallets/{id}:
 *   get:
 *     summary: Saldo de billetera USD (RF-9)
 */
billetera.get('/wallets/:id', async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { rows } = await pool.query(`SELECT id, user_id, nombre, balance, moneda FROM wallets WHERE id = $1`, [id]);
    if (rows.length === 0) return next(apiError(404, 'NO_ENCONTRADA', 'billetera no encontrada'));
    res.json(walletDTO(rows[0]));
  } catch (e) {
    next(e);
  }
});

async function operar(walletId: string, monto: string, tipo: 'deposito' | 'retiro'): Promise<{ movimiento_id: string; balance: string; moneda: 'USD' }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = await client.query(`SELECT id, balance FROM wallets WHERE id = $1 FOR UPDATE`, [walletId]);
    if (w.rows.length === 0) throw apiError(404, 'NO_ENCONTRADA', 'billetera no encontrada');
    // C2: cero floats — aritmética exacta en centavos vía money.ts
    const saldo = String(w.rows[0].balance);
    if (tipo === 'retiro' && !gte(saldo, monto)) throw apiError(422, 'FONDOS_INSUFICIENTES', 'fondos insuficientes');
    const nuevo = tipo === 'deposito' ? add(saldo, monto) : sub(saldo, monto);
    await client.query(`UPDATE wallets SET balance = $1 WHERE id = $2`, [nuevo, walletId]);
    const mov = await client.query(
      `INSERT INTO billetera_movimientos (wallet_id, tipo, monto, moneda, saldo_resultante) VALUES ($1, $2, $3, 'USD', $4) RETURNING id`,
      [walletId, tipo, monto, nuevo],
    );
    await client.query('COMMIT');
    return { movimiento_id: mov.rows[0].id, balance: nuevo, moneda: 'USD' };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * @openapi
 * /api/v1/billetera/wallets/{id}/depositos:
 *   post:
 *     summary: Deposita en billetera local (RF-10)
 */
billetera.post('/wallets/:id/depositos', async (req, res, next) => {
  try {
    const idResult = uuidSchema.safeParse(req.params.id);
    if (!idResult.success) return next(apiError(400, 'VALIDATION_ERROR', 'id de billetera inválido'));
    const { monto } = montoRequestSchema.parse(req.body);
    res.status(201).json(await operar(idResult.data, monto, 'deposito'));
  } catch (e) {
    if (e instanceof Error && e.name === 'ZodError') return next(apiError(400, 'MONTO_INVALIDO', 'monto inválido'));
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/billetera/wallets/{id}/retiros:
 *   post:
 *     summary: Retira de billetera local (RF-10)
 */
billetera.post('/wallets/:id/retiros', async (req, res, next) => {
  try {
    const idResult = uuidSchema.safeParse(req.params.id);
    if (!idResult.success) return next(apiError(400, 'VALIDATION_ERROR', 'id de billetera inválido'));
    const { monto } = montoRequestSchema.parse(req.body);
    res.status(201).json(await operar(idResult.data, monto, 'retiro'));
  } catch (e) {
    if (e instanceof Error && e.name === 'ZodError') return next(apiError(400, 'MONTO_INVALIDO', 'monto inválido'));
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/billetera/transferencias:
 *   post:
 *     summary: Transfiere entre billeteras locales, atómica e idempotente (RF-11)
 */
billetera.post('/transferencias', async (req, res, next) => {
  try {
    const key = req.header('Idempotency-Key');
    if (!key) return next(apiError(400, 'SIN_IDEMPOTENCIA', 'Idempotency-Key obligatorio'));
    if (!idempotencyKeySchema.safeParse(key).success) {
      return next(apiError(400, 'VALIDATION_ERROR', 'Idempotency-Key debe ser UUID v4'));
    }
    const parsed = transferenciaSchema.parse(req.body);
    const origen_id = await resolverWalletId(parsed.origen_id);
    const destino_id = await resolverWalletId(parsed.destino_id);
    const { monto } = parsed;
    if (!origen_id || !destino_id) return next(apiError(404, 'NO_ENCONTRADA', 'billetera origen o destino no encontrada'));
    if (origen_id === destino_id) return next(apiError(400, 'MISMA_BILLETERA', 'origen y destino deben diferir'));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa reintentos concurrentes de la misma operación.
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`transferencia:${key}`]);

      const prev = await client.query(
        `SELECT wallet_id, monto, referencia, saldo_resultante
           FROM billetera_movimientos
          WHERE idempotency_key = $1 AND tipo = 'transfer_out'
          LIMIT 1`,
        [key],
      );
      if (prev.rows.length > 0) {
        const anterior = prev.rows[0] as Record<string, unknown>;
        const entrada = await client.query(
          `SELECT wallet_id, saldo_resultante
             FROM billetera_movimientos
            WHERE referencia = $1 AND tipo = 'transfer_in'
            LIMIT 1`,
          [anterior.referencia],
        );
        if (
          String(anterior.wallet_id) !== origen_id ||
          String(anterior.monto) !== monto ||
          entrada.rows.length === 0 ||
          String(entrada.rows[0].wallet_id) !== destino_id
        ) {
          throw apiError(409, 'IDEMPOTENCY_CONFLICT', 'misma clave con datos diferentes');
        }
        await client.query('COMMIT');
        return res.status(200).json({
          referencia: anterior.referencia,
          origen_balance: String(anterior.saldo_resultante),
          destino_balance: String(entrada.rows[0].saldo_resultante),
          moneda: 'USD',
          replay: true,
        });
      }

      const [primero, segundo] = [origen_id, destino_id].sort();
      const w = await client.query(`SELECT id, balance FROM wallets WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [[primero, segundo]]);
      if (w.rows.length < 2) {
        throw apiError(404, 'NO_ENCONTRADA', 'billetera origen o destino no encontrada');
      }
      const saldos: Record<string, string> = {};
      for (const r of w.rows) saldos[r.id as string] = String(r.balance);
      if (!gte(saldos[origen_id], monto)) {
        throw apiError(422, 'FONDOS_INSUFICIENTES', 'fondos insuficientes');
      }
      const nuevoOrigen = sub(saldos[origen_id], monto);
      const nuevoDestino = add(saldos[destino_id], monto);
      const referencia = randomUUID();
      await client.query(`UPDATE wallets SET balance = $1 WHERE id = $2`, [nuevoOrigen, origen_id]);
      await client.query(`UPDATE wallets SET balance = $1 WHERE id = $2`, [nuevoDestino, destino_id]);
      await client.query(
        `INSERT INTO billetera_movimientos (wallet_id, tipo, monto, moneda, saldo_resultante, referencia, idempotency_key)
         VALUES ($1, 'transfer_out', $2, 'USD', $3, $4, $5)`,
        [origen_id, monto, nuevoOrigen, referencia, key],
      );
      await client.query(
        `INSERT INTO billetera_movimientos (wallet_id, tipo, monto, moneda, saldo_resultante, referencia)
         VALUES ($1, 'transfer_in', $2, 'USD', $3, $4)`,
        [destino_id, monto, nuevoDestino, referencia],
      );
      await client.query('COMMIT');
      res.status(201).json({ referencia, origen_balance: nuevoOrigen, destino_balance: nuevoDestino, moneda: 'USD', replay: false });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/billetera/wallets/{id}/movimientos:
 *   get:
 *     summary: Historial USD paginado (RF-12)
 */
billetera.get('/wallets/:id/movimientos', async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const page = paginationSchema.parse({ page: req.query.page, limit: req.query.limit });
    const w = await pool.query(`SELECT id FROM wallets WHERE id = $1`, [id]);
    if (w.rows.length === 0) return next(apiError(404, 'NO_ENCONTRADA', 'billetera no encontrada'));
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM billetera_movimientos WHERE wallet_id = $1`, [id]);
    const { rows } = await pool.query(
      `SELECT id, tipo, monto, moneda, saldo_resultante, referencia, creado_en FROM billetera_movimientos
       WHERE wallet_id = $1 ORDER BY creado_en DESC, id DESC LIMIT $2 OFFSET $3`,
      [id, page.limit, (page.page - 1) * page.limit],
    );
    res.json({
      items: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        tipo: r.tipo,
        monto: String(r.monto),
        moneda: 'USD',
        saldo_resultante: String(r.saldo_resultante),
        referencia: r.referencia,
        creado_en: new Date(r.creado_en as string).toISOString(),
      })),
      page: page.page,
      limit: page.limit,
      total: total.rows[0].c,
      moneda: 'USD',
    });
  } catch (e) {
    next(e);
  }
});
