import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { pool, migrate } from '../src/db.js';
import { createApp } from '../src/index.js';
import { http } from '../src/fx.js';

process.env.VITEST = 'true';
process.env.USE_FAKES = 'true';

describe('api depositos-usd', () => {
  const app = createApp();
  const realFetch = http.fetch;
  let depositoId = '';

  beforeAll(async () => {
    await migrate();
    await pool.query(`DELETE FROM depositos_usd`);
    await pool.query(`DELETE FROM fake_ledger`);
    await pool.query(`DELETE FROM fx_rates WHERE par = 'USD_PEN'`);
    http.fetch = (async () =>
      ({ json: async () => ({ success: true, source: 'USD', quotes: { USDPEN: 3.5 } }) }) as unknown as Response) as unknown as typeof fetch;
  });

  afterAll(async () => {
    http.fetch = realFetch;
    await pool.end();
  });

  it('health_live_ready', async () => {
    const live = await request(app).get('/health/live');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('alive');
    const ready = await request(app).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.db).toBe('up');
  });

  it('docs_200', async () => {
    const r = await request(app).get('/docs/');
    expect(r.status).toBe(200);
  });

  it('errores_formato: 404 trae status/code/message/correlation_id/timestamp', async () => {
    const r = await request(app).get(`/api/v1/depositos/usd/${randomUUID()}`);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(typeof r.body.message).toBe('string');
    expect(typeof r.body.correlation_id).toBe('string');
    expect(typeof r.body.timestamp).toBe('string');
    expect(r.headers['x-correlation-id']).toBe(r.body.correlation_id);
  });

  it('E2E-01 deposito_201 COMPLETADO', async () => {
    const r = await request(app)
      .post('/api/v1/depositos/usd')
      .set('Idempotency-Key', randomUUID())
      .send({ cliente_id: 'A', monto: '150.50', metodo_origen: 'TRANSFERENCIA', referencia_externa: 'TRX-EXT-1' });
    expect(r.status).toBe(201);
    expect(r.body.estado).toBe('COMPLETADO');
    expect(r.body.moneda).toBe('USD');
    expect(r.body.movimiento_saldo_id).toMatch(/^FAKE-/);
    depositoId = r.body.deposito_id;
  });

  it('E2E-02 replay misma key sin doble abono', async () => {
    const key = randomUUID();
    const body = { cliente_id: 'A', monto: '50.00', metodo_origen: 'EFECTIVO' };
    const r1 = await request(app).post('/api/v1/depositos/usd').set('Idempotency-Key', key).send(body);
    expect(r1.status).toBe(201);
    const r2 = await request(app).post('/api/v1/depositos/usd').set('Idempotency-Key', key).send(body);
    expect(r2.status).toBe(200);
    expect(r2.body.deposito_id).toBe(r1.body.deposito_id);
    const l = await pool.query(`SELECT COUNT(*)::int c FROM fake_ledger WHERE referencia = $1`, [r1.body.deposito_id]);
    expect(l.rows[0].c).toBe(1);
  });

  it('conflicto_409: misma key distinto payload', async () => {
    const key = randomUUID();
    await request(app).post('/api/v1/depositos/usd').set('Idempotency-Key', key).send({ cliente_id: 'A', monto: '10.00', metodo_origen: 'TARJETA' });
    const r = await request(app).post('/api/v1/depositos/usd').set('Idempotency-Key', key).send({ cliente_id: 'A', monto: '20.00', metodo_origen: 'TARJETA' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('negativas: monto 0/negativo/3decimales -> 400; sin key -> 400', async () => {
    for (const monto of ['0', '0.00', '-5', '10.999']) {
      const r = await request(app).post('/api/v1/depositos/usd').set('Idempotency-Key', randomUUID()).send({ cliente_id: 'A', monto, metodo_origen: 'OTRO' });
      expect(r.status).toBe(400);
    }
    const sin = await request(app).post('/api/v1/depositos/usd').send({ cliente_id: 'A', monto: '5.00', metodo_origen: 'OTRO' });
    expect(sin.status).toBe(400);
    expect(sin.body.code).toBe('VALIDATION_ERROR');
  });

  it('negativas: cliente inexistente 404, bloqueado 422, solo-PEN 422', async () => {
    const nf = await request(app).post('/api/v1/depositos/usd').set('Idempotency-Key', randomUUID()).send({ cliente_id: 'nadie-zzz', monto: '5.00', metodo_origen: 'OTRO' });
    expect(nf.status).toBe(404);
    expect(nf.body.code).toBe('CUSTOMER_NOT_FOUND');

    const bl = await request(app).post('/api/v1/depositos/usd').set('Idempotency-Key', randomUUID()).send({ cliente_id: 'B', monto: '5.00', metodo_origen: 'OTRO' });
    expect(bl.status).toBe(422);
    expect(bl.body.code).toBe('CUSTOMER_BLOCKED');

    const pen = await request(app).post('/api/v1/depositos/usd').set('Idempotency-Key', randomUUID()).send({ cliente_id: 'C', monto: '5.00', metodo_origen: 'OTRO' });
    expect(pen.status).toBe(422);
    expect(pen.body.code).toBe('USD_ACCOUNT_NOT_ENABLED');
  });

  it('E2E-03 saldo caído -> 503 + FALLIDO', async () => {
    process.env.FAIL_NEXT_BALANCE = 'true';
    const key = randomUUID();
    const r = await request(app).post('/api/v1/depositos/usd').set('Idempotency-Key', key).send({ cliente_id: 'A', monto: '5.00', metodo_origen: 'OTRO' });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('BALANCE_SERVICE_UNAVAILABLE');
    const { rows } = await pool.query(`SELECT estado FROM depositos_usd WHERE idempotency_key = $1`, [key]);
    expect(rows[0].estado).toBe('FALLIDO');
  });

  it('get_by_id + historial_paginado', async () => {
    const g = await request(app).get(`/api/v1/depositos/usd/${depositoId}`);
    expect(g.status).toBe(200);
    expect(g.body.monto).toBe('150.50');

    const h = await request(app).get('/api/v1/depositos/usd?cliente_id=A&page=1&limit=20');
    expect(h.status).toBe(200);
    expect(h.body.total).toBeGreaterThanOrEqual(2);
    expect(h.body.items[0].moneda).toBe('USD');
  });

  it('fx tasa + convertir', async () => {
    const t = await request(app).get('/api/v1/fx/tasa?par=USD_PEN');
    expect(t.status).toBe(200);
    expect(t.body.tasa).toBe('3.500000');
    const c = await request(app).post('/api/v1/fx/convertir').send({ monto: '100.00', de: 'USD', a: 'PEN' });
    expect(c.body.monto_convertido).toBe('350.00');
  });
});
