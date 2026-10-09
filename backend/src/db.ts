import 'dotenv/config';
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const MIGRATIONS = [
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto";
   CREATE TABLE IF NOT EXISTS depositos_usd (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     cliente_id TEXT NOT NULL,
     cuenta_destino_id TEXT,
     monto NUMERIC(18,2) NOT NULL CHECK (monto > 0),
     moneda CHAR(3) NOT NULL DEFAULT 'USD' CHECK (moneda = 'USD'),
     metodo_origen TEXT NOT NULL CHECK (metodo_origen IN ('EFECTIVO','TRANSFERENCIA','TARJETA','OTRO')),
     referencia_externa TEXT,
     idempotency_key TEXT NOT NULL UNIQUE,
     payload_hash TEXT NOT NULL,
     estado TEXT NOT NULL CHECK (estado IN ('PENDIENTE','VALIDADO','COMPLETADO','FALLIDO')),
     movimiento_saldo_id TEXT,
     failure_code TEXT,
     failure_detail TEXT,
     creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
     actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
     completado_en TIMESTAMPTZ
   );
   CREATE INDEX IF NOT EXISTS idx_depositos_usd_cliente_fecha ON depositos_usd(cliente_id, creado_en DESC);
   CREATE INDEX IF NOT EXISTS idx_depositos_usd_estado ON depositos_usd(estado);
   -- Ledger SOLO del FakeBalanceAdapter (Etapa A). Se desecha al integrar Saldos real.
   CREATE TABLE IF NOT EXISTS fake_ledger (
     referencia TEXT PRIMARY KEY,
     cliente_id TEXT NOT NULL,
     monto NUMERIC(18,2) NOT NULL CHECK (monto > 0),
     creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS fx_rates (
     par TEXT PRIMARY KEY,
     tasa NUMERIC(12,6) NOT NULL CHECK (tasa > 0),
     fuente TEXT NOT NULL,
     fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   -- Módulo billetera USD (antes "local"): billetera en dólares en todo su esplendor.
   -- Moneda USD explícita para blindaje USD-only (refactorización DOLARA v2).
   CREATE TABLE IF NOT EXISTS wallets (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id TEXT NOT NULL UNIQUE,
     balance NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
     moneda CHAR(3) NOT NULL DEFAULT 'USD' CHECK (moneda = 'USD'),
     creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE IF NOT EXISTS billetera_movimientos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     wallet_id UUID NOT NULL REFERENCES wallets(id),
     tipo TEXT NOT NULL CHECK (tipo IN ('deposito','retiro','transfer_in','transfer_out')),
     monto NUMERIC(18,2) NOT NULL CHECK (monto > 0),
     moneda CHAR(3) NOT NULL DEFAULT 'USD' CHECK (moneda = 'USD'),
     saldo_resultante NUMERIC(18,2) NOT NULL,
     referencia UUID,
     idempotency_key TEXT UNIQUE,
     creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_billetera_mov_wallet ON billetera_movimientos(wallet_id, creado_en DESC);`,
  // v2: blindaje USD-only en instalaciones existentes (ALTER idempotente).
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wallets' AND column_name='moneda') THEN
       ALTER TABLE wallets ADD COLUMN moneda CHAR(3) NOT NULL DEFAULT 'USD' CHECK (moneda = 'USD');
     END IF;
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='billetera_movimientos' AND column_name='moneda') THEN
       ALTER TABLE billetera_movimientos ADD COLUMN moneda CHAR(3) NOT NULL DEFAULT 'USD' CHECK (moneda = 'USD');
     END IF;
   END $$;`,
  // v3: acceso demo DOLARA — nombre visible + pin hash (sesión por usuario, sin auth real).
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wallets' AND column_name='nombre') THEN
       ALTER TABLE wallets ADD COLUMN nombre TEXT;
     END IF;
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='wallets' AND column_name='pin_hash') THEN
       ALTER TABLE wallets ADD COLUMN pin_hash TEXT;
     END IF;
   END $$;`,
];

export async function migrate(): Promise<void> {
  for (const sql of MIGRATIONS) await pool.query(sql);
}

export async function dbUp(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
