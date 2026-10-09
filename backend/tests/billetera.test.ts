import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { pool, migrate } from '../src/db.js';
import { createApp } from '../src/index.js';

process.env.VITEST = 'true';
process.env.USE_FAKES = 'true';

describe('api billetera local (C11)', () => {
  const app = createApp();
  let aId = '';
  let bId = '';

  beforeAll(async () => {
    await migrate();
    await pool.query(`DELETE FROM billetera_movimientos`);
    await pool.query(`DELETE FROM wallets`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('migraciones_restricciones: balance >= 0 y user_id única', async () => {
    await expect(pool.query(`INSERT INTO wallets (user_id, balance) VALUES ('x-t12', -1)`)).rejects.toThrow();
    await pool.query(`INSERT INTO wallets (user_id) VALUES ('x-t12')`);
    await expect(pool.query(`INSERT INTO wallets (user_id) VALUES ('x-t12')`)).rejects.toThrow();
    await pool.query(`DELETE FROM wallets WHERE user_id = 'x-t12'`);
  });

  it('wallet_crud: crear 201, duplicado 409, inexistente 404', async () => {
    const uid = `u-bil-${Date.now()}`;
    const c = await request(app).post('/api/v1/billetera/wallets').send({ user_id: uid });
    expect(c.status).toBe(201);
    expect(c.body.balance).toBe('0.00');
    aId = c.body.id;

    const dup = await request(app).post('/api/v1/billetera/wallets').send({ user_id: uid });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('YA_EXISTE');

    const b = await request(app).post('/api/v1/billetera/wallets').send({ user_id: `${uid}-b` });
    expect(b.status).toBe(201);
    bId = b.body.id;

    const nf = await request(app).get(`/api/v1/billetera/wallets/${randomUUID()}`);
    expect(nf.status).toBe(404);
  });

  it('deposito_201 + retiro_422_atomico', async () => {
    const d = await request(app).post(`/api/v1/billetera/wallets/${aId}/depositos`).send({ monto: '100.00' });
    expect(d.status).toBe(201);
    expect(d.body.balance).toBe('100.00');

    const r = await request(app).post(`/api/v1/billetera/wallets/${aId}/retiros`).send({ monto: '30.00' });
    expect(r.status).toBe(201);
    expect(r.body.balance).toBe('70.00');

    const sin = await request(app).post(`/api/v1/billetera/wallets/${aId}/retiros`).send({ monto: '999.00' });
    expect(sin.status).toBe(422);
    expect(sin.body.code).toBe('FONDOS_INSUFICIENTES');

    const g = await request(app).get(`/api/v1/billetera/wallets/${aId}`);
    expect(g.body.balance).toBe('70.00');
  });

  it('transferencia_201 + replay sin doble débito + 422 atómico', async () => {
    const key = randomUUID();
    const body = { origen_id: aId, destino_id: bId, monto: '20.00' };
    const t = await request(app).post('/api/v1/billetera/transferencias').set('Idempotency-Key', key).send(body);
    expect(t.status).toBe(201);
    expect(t.body.origen_balance).toBe('50.00');
    expect(t.body.destino_balance).toBe('20.00');

    const r2 = await request(app).post('/api/v1/billetera/transferencias').set('Idempotency-Key', key).send(body);
    expect(r2.status).toBe(200);
    expect(r2.body.replay).toBe(true);

    const g = await request(app).get(`/api/v1/billetera/wallets/${aId}`);
    expect(g.body.balance).toBe('50.00');

    const pobre = await request(app)
      .post('/api/v1/billetera/transferencias')
      .set('Idempotency-Key', randomUUID())
      .send({ origen_id: aId, destino_id: bId, monto: '9999.00' });
    expect(pobre.status).toBe(422);

    const sin = await request(app).post('/api/v1/billetera/transferencias').send(body);
    expect(sin.status).toBe(400);
    expect(sin.body.code).toBe('SIN_IDEMPOTENCIA');
  });

  it('historial_paginado', async () => {
    const h = await request(app).get(`/api/v1/billetera/wallets/${aId}/movimientos?page=1&limit=20`);
    expect(h.status).toBe(200);
    expect(h.body.total).toBeGreaterThanOrEqual(3);
    const tipos = h.body.items.map((i: { tipo: string }) => i.tipo);
    expect(tipos).toContain('deposito');
    expect(tipos).toContain('transfer_out');
  });
});
