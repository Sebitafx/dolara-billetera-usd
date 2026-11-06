import { pool } from './db.js';
import { apiError } from './errors.js';

export interface Tasa {
  par: 'USD_PEN';
  tasa: string;
  fuente: string;
  actualizada_en: string;
  proxima_actualizacion_en: string | null;
  stale: boolean;
}

interface CachedRate {
  tasa: string;
  fuente: string;
  fetched_at: Date;
  provider_updated_at: Date | null;
  next_update_at: Date | null;
}

interface LiveRate {
  tasa: string;
  fuente: string;
  providerUpdatedAt: string;
  nextUpdateAt: string | null;
}

interface ExchangeRateApiResponse {
  result?: string;
  base_code?: string;
  time_last_update_unix?: number;
  time_next_update_unix?: number;
  rates?: { PEN?: number };
}

const PAR = 'USD_PEN';
const SOURCE = 'ExchangeRate-API';
const OPEN_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

// Inyectable en tests para simular la red.
export const http: { fetch: typeof fetch } = { fetch };
let refreshInFlight: Promise<LiveRate> | null = null;

function ttlMin(): number {
  const value = Number(process.env.FX_TTL_MIN ?? 1440);
  return Number.isFinite(value) && value > 0 ? value : 1440;
}

function timeoutMs(): number {
  const value = Number(process.env.FX_TIMEOUT_MS ?? 5000);
  return Number.isFinite(value) && value > 0 ? value : 5000;
}

function endpoint(): string {
  const configured = process.env.FX_PROVIDER_URL?.trim();
  if (configured) return configured;
  const key = process.env.FX_API_KEY?.trim();
  return key ? `https://v6.exchangerate-api.com/v6/${encodeURIComponent(key)}/latest/USD` : OPEN_ENDPOINT;
}

function unixToIso(value: number | undefined): string | null {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) return null;
  return new Date((value as number) * 1000).toISOString();
}

async function fetchProvider(): Promise<ExchangeRateApiResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs());
    try {
      const response = await http.fetch(endpoint(), {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      });
      if (response.ok === false) throw new Error(`proveedor FX respondió HTTP ${response.status}`);
      return (await response.json()) as ExchangeRateApiResponse;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('proveedor FX no disponible');
}

async function live(): Promise<LiveRate> {
  const body = await fetchProvider();
  const rate = body.result === 'success' && body.base_code === 'USD' ? body.rates?.PEN : undefined;
  const providerUpdatedAt = unixToIso(body.time_last_update_unix);
  const nextUpdateAt = unixToIso(body.time_next_update_unix);
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || !providerUpdatedAt) {
    throw new Error('respuesta FX inválida');
  }

  const fetchedAt = new Date().toISOString();
  const tasa = rate.toFixed(6);
  await pool.query(
    `INSERT INTO fx_rates (par, tasa, fuente, fetched_at, provider_updated_at, next_update_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (par) DO UPDATE SET tasa = EXCLUDED.tasa, fuente = EXCLUDED.fuente,
       fetched_at = EXCLUDED.fetched_at, provider_updated_at = EXCLUDED.provider_updated_at,
       next_update_at = EXCLUDED.next_update_at`,
    [PAR, tasa, SOURCE, fetchedAt, providerUpdatedAt, nextUpdateAt],
  );
  return { tasa, fuente: SOURCE, providerUpdatedAt, nextUpdateAt };
}

function refresh(): Promise<LiveRate> {
  if (!refreshInFlight) {
    refreshInFlight = live().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function fromCache(cache: CachedRate, stale: boolean): Tasa {
  return {
    par: PAR,
    tasa: cache.tasa,
    fuente: cache.fuente,
    actualizada_en: new Date(cache.provider_updated_at ?? cache.fetched_at).toISOString(),
    proxima_actualizacion_en: cache.next_update_at ? new Date(cache.next_update_at).toISOString() : null,
    stale,
  };
}

export async function obtenerTasa(): Promise<Tasa> {
  const { rows } = await pool.query(
    `SELECT tasa, fuente, fetched_at, provider_updated_at, next_update_at FROM fx_rates WHERE par = $1`,
    [PAR],
  );
  const cache = rows[0] as CachedRate | undefined;
  const freshUntil = cache?.next_update_at
    ? new Date(cache.next_update_at).getTime()
    : cache
      ? new Date(cache.fetched_at).getTime() + ttlMin() * 60_000
      : 0;
  if (cache && Date.now() < freshUntil) return fromCache(cache, false);

  try {
    const rate = await refresh();
    return {
      par: PAR,
      tasa: rate.tasa,
      fuente: rate.fuente,
      actualizada_en: rate.providerUpdatedAt,
      proxima_actualizacion_en: rate.nextUpdateAt,
      stale: false,
    };
  } catch {
    if (cache) return fromCache(cache, true);
    throw apiError(503, 'FX_NO_DISPONIBLE', 'tasa externa no disponible y no existe una cotización en caché');
  }
}
