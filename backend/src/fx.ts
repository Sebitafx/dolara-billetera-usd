import { pool } from './db.js';
import { apiError } from './errors.js';

export interface Tasa {
  par: string;
  tasa: string;
  fuente: string;
  actualizada_en: string;
  stale: boolean;
}

const PAR = 'USD_PEN';
// Inyectable en tests para mockear la red (asignar http.fetch = mock).
export const http: { fetch: typeof fetch } = { fetch };

function ttlMin(): number {
  return Number(process.env.FX_TTL_MIN ?? 60);
}

function timeoutMs(): number {
  return Number(process.env.FX_TIMEOUT_MS ?? 5000);
}

async function live(): Promise<{ tasa: string; fetched_at: string }> {
  const key = process.env.FX_API_KEY;
  if (!key) throw apiError(503, 'FX_NO_DISPONIBLE', 'tasa no disponible (sin API key)');
  const url = `https://api.exchangerate.host/live?access_key=${key}&source=USD&currencies=PEN`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs());
  try {
    // 1 intento + 1 reintento (RNF-4)
    for (let intento = 0; intento < 2; intento++) {
      try {
        const r = await http.fetch(url, { signal: ctrl.signal });
        const j = (await r.json()) as { success?: boolean; source?: string; quotes?: { USDPEN?: number } };
        const tasa = j?.success === true ? j?.quotes?.USDPEN : undefined;
        if (typeof tasa === 'number' && tasa > 0) {
          const fetched_at = new Date().toISOString();
          await pool.query(
            `INSERT INTO fx_rates (par, tasa, fuente, fetched_at) VALUES ($1, $2, 'exchangerate.host', $3)
             ON CONFLICT (par) DO UPDATE SET tasa = EXCLUDED.tasa, fuente = EXCLUDED.fuente, fetched_at = EXCLUDED.fetched_at`,
            [PAR, tasa.toFixed(6), fetched_at],
          );
          return { tasa: tasa.toFixed(6), fetched_at };
        }
      } catch {
        if (intento === 1) throw new Error('fx caído');
      }
    }
    throw new Error('respuesta FX inválida');
  } finally {
    clearTimeout(t);
  }
}

export async function obtenerTasa(): Promise<Tasa> {
  const { rows } = await pool.query(`SELECT tasa, fuente, fetched_at FROM fx_rates WHERE par = $1`, [PAR]);
  const cache = rows[0] as { tasa: string; fuente: string; fetched_at: Date } | undefined;
  const fresca = cache && Date.now() - new Date(cache.fetched_at).getTime() < ttlMin() * 60_000;
  if (fresca && cache) {
    return { par: PAR, tasa: cache.tasa, fuente: cache.fuente, actualizada_en: new Date(cache.fetched_at).toISOString(), stale: false };
  }
  try {
    const { tasa, fetched_at } = await live();
    return { par: PAR, tasa, fuente: 'exchangerate.host', actualizada_en: fetched_at, stale: false };
  } catch {
    if (cache) {
      return { par: PAR, tasa: cache.tasa, fuente: cache.fuente, actualizada_en: new Date(cache.fetched_at).toISOString(), stale: true };
    }
    throw apiError(503, 'FX_NO_DISPONIBLE', 'tasa no disponible');
  }
}
