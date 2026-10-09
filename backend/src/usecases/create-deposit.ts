import { createHash, randomUUID } from 'crypto';
import { pool } from '../db.js';
import { DomainError, MoneyUsd } from '../domain/deposit.js';
import type { BalancePort, CustomerAccountPort } from '../ports.js';

export interface CrearDepositoCmd {
  cliente_id: string;
  cuenta_destino_id?: string;
  monto: string;
  metodo_origen: 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'OTRO';
  referencia_externa?: string;
  idempotencyKey: string;
}

export interface DepositoDTO {
  deposito_id: string;
  cliente_id: string;
  cuenta_destino_id?: string | null;
  monto: string;
  moneda: 'USD';
  estado: string;
  movimiento_saldo_id?: string | null;
  creado_en: string;
  completado_en?: string | null;
}

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function hashPayload(cmd: CrearDepositoCmd): string {
  return createHash('sha256')
    .update(JSON.stringify([cmd.cliente_id, cmd.cuenta_destino_id ?? '', cmd.monto, cmd.metodo_origen, cmd.referencia_externa ?? '']))
    .digest('hex');
}

function rowToDTO(r: Record<string, unknown>): DepositoDTO {
  return {
    deposito_id: r.id as string,
    cliente_id: r.cliente_id as string,
    cuenta_destino_id: (r.cuenta_destino_id as string | null) ?? null,
    monto: String(r.monto),
    moneda: 'USD',
    estado: r.estado as string,
    movimiento_saldo_id: (r.movimiento_saldo_id as string | null) ?? null,
    creado_en: new Date(r.creado_en as string).toISOString(),
    completado_en: r.completado_en ? new Date(r.completado_en as string).toISOString() : null,
  };
}

/** Caso de uso CreateUsdDeposit (01 §9.2). No conoce Express ni qué adaptador hay detrás. */
export async function crearDeposito(
  cmd: CrearDepositoCmd,
  deps: { customers: CustomerAccountPort; balance: BalancePort },
): Promise<{ deposito: DepositoDTO; replay: boolean }> {
  if (!cmd.idempotencyKey) throw new AppError(400, 'VALIDATION_ERROR', 'Idempotency-Key obligatorio');
  let money: MoneyUsd;
  try {
    money = MoneyUsd.crear(cmd.monto);
  } catch (e) {
    throw new AppError(400, 'INVALID_AMOUNT', (e as Error).message);
  }
  const payloadHash = hashPayload(cmd);

  // 5. Idempotencia: ¿clave ya procesada?
  const prev = await pool.query(`SELECT * FROM depositos_usd WHERE idempotency_key = $1`, [cmd.idempotencyKey]);
  if (prev.rows.length > 0) {
    const dto = rowToDTO(prev.rows[0]);
    if (prev.rows[0].payload_hash !== payloadHash) {
      throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'misma clave con datos diferentes');
    }
    return { deposito: dto, replay: true };
  }

  // 7. Validar cliente/cuenta (puerto).
  let v;
  try {
    v = await deps.customers.validateUsdDestination({ customerId: cmd.cliente_id, accountId: cmd.cuenta_destino_id });
  } catch {
    throw new AppError(503, 'CUSTOMER_SERVICE_UNAVAILABLE', 'no se pudo validar cliente/cuenta');
  }
  if (!v.customerExists || v.accountStatus === 'NOT_FOUND') {
    const esCuenta = v.customerExists && v.accountStatus === 'NOT_FOUND';
    throw new AppError(404, esCuenta ? 'ACCOUNT_NOT_FOUND' : 'CUSTOMER_NOT_FOUND', esCuenta ? 'cuenta destino no existe' : 'cliente no existe');
  }
  if (v.customerStatus !== 'ACTIVE') throw new AppError(422, 'CUSTOMER_BLOCKED', 'cliente no puede operar');
  if (v.accountStatus !== 'ACTIVE' || !v.enabledCurrencies.includes('USD')) {
    throw new AppError(422, 'USD_ACCOUNT_NOT_ENABLED', 'la cuenta destino no está habilitada para USD');
  }

  // 9-10. Persistir PENDIENTE -> VALIDADO.
  const id = randomUUID();
  await pool.query(
    `INSERT INTO depositos_usd (id, cliente_id, cuenta_destino_id, monto, moneda, metodo_origen, referencia_externa, idempotency_key, payload_hash, estado)
     VALUES ($1,$2,$3,$4,'USD',$5,$6,$7,$8,'PENDIENTE')`,
    [id, cmd.cliente_id, cmd.cuenta_destino_id ?? null, money.monto, cmd.metodo_origen, cmd.referencia_externa ?? null, cmd.idempotencyKey, payloadHash],
  );
  await pool.query(`UPDATE depositos_usd SET estado='VALIDADO', actualizado_en=now() WHERE id=$1`, [id]);

  // 11. Solicitar abono con referencia idempotente = deposito_id.
  try {
    const r = await deps.balance.credit({
      customerId: cmd.cliente_id,
      accountId: cmd.cuenta_destino_id,
      amount: money.monto,
      currency: 'USD',
      referenceId: id,
    });
    if (!r.success) throw new Error('abono no confirmado');
    // 12. COMPLETADO solo con confirmación explícita.
    const upd = await pool.query(
      `UPDATE depositos_usd SET estado='COMPLETADO', movimiento_saldo_id=$1, completado_en=now(), actualizado_en=now()
       WHERE id=$2 RETURNING *`,
      [r.movementId ?? null, id],
    );
    return { deposito: rowToDTO(upd.rows[0]), replay: false };
  } catch (e) {
    // 13-14. Fallo externo: FALLIDO auditable, nunca COMPLETADO inventado.
    const msg = e instanceof Error ? e.message : 'error';
    await pool.query(
      `UPDATE depositos_usd SET estado='FALLIDO', failure_code='BALANCE_SERVICE_UNAVAILABLE', failure_detail=$1, actualizado_en=now() WHERE id=$2`,
      [msg.slice(0, 255), id],
    );
    if (e instanceof DomainError) throw e;
    throw new AppError(503, 'BALANCE_SERVICE_UNAVAILABLE', 'no fue posible confirmar el abono');
  }
}
