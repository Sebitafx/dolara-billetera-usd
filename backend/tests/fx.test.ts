import { describe, it, expect, beforeAll, vi, afterAll } from 'vitest';
import { pool, migrate } from '../src/db.js';
import { obtenerTasa, http } from '../src/fx.js';

describe('fx', () => {
  const realFetch = http.fetch;

  beforeAll(async () => {
    await migrate();
    await pool.query(`DELETE FROM fx_rates WHERE par = 'USD_PEN'`);
  });

  afterAll(() => {
    http.fetch = realFetch;
  });

  it('usa caché vigente sin llamar a la API', async () => {
    await pool.query(
      `INSERT INTO fx_rates (par, tasa, fuente, fetched_at) VALUES ('USD_PEN', 3.500000, 'test', now())
       ON CONFLICT (par) DO UPDATE SET tasa = 3.500000, fuente = 'test', fetched_at = now()`,
    );
    const spy = vi.fn(async () => {
      throw new Error('no debería llamarse');
    });
    http.fetch = spy as unknown as typeof fetch;
    const t = await obtenerTasa();
    expect(t.tasa).toBe('3.500000');
    expect(t.stale).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('API caída con caché vencida -> stale:true', async () => {
    await pool.query(`UPDATE fx_rates SET fetched_at = now() - INTERVAL '2 hours' WHERE par = 'USD_PEN'`);
    http.fetch = (async () => {
      throw new Error('red caída');
    }) as unknown as typeof fetch;
    const t = await obtenerTasa();
    expect(t.tasa).toBe('3.500000');
    expect(t.stale).toBe(true);
  });

  it('success:false se trata como fallo -> usa caché stale', async () => {
    http.fetch = (async () =>
      ({ json: async () => ({ success: false }) }) as unknown as Response) as unknown as typeof fetch;
    const t = await obtenerTasa();
    expect(t.stale).toBe(true);
  });

  it('sin caché ni API -> 503 FX_NO_DISPONIBLE', async () => {
    await pool.query(`DELETE FROM fx_rates WHERE par = 'USD_PEN'`);
    http.fetch = (async () => {
      throw new Error('red caída');
    }) as unknown as typeof fetch;
    try {
      await obtenerTasa();
      expect.unreachable('debió rechazar');
    } catch (e) {
      const err = e as { status?: number; code?: string };
      expect(err.code).toBe('FX_NO_DISPONIBLE');
      expect(err.status).toBe(503);
    }
  });
});
