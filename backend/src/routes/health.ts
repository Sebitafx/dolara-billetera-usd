import { Router } from 'express';
import { dbUp } from '../db.js';

export const health = Router();

/**
 * @openapi
 * /health/live:
 *   get:
 *     summary: Proceso vivo (RF-7)
 */
health.get('/live', (_req, res) => {
  res.json({ status: 'alive' });
});

/**
 * @openapi
 * /health/ready:
 *   get:
 *     summary: Listo para operar (RF-7; no exige MS externos)
 */
health.get('/ready', async (_req, res) => {
  const db = await dbUp();
  const body = { status: db ? 'ready' : 'not-ready', db: db ? 'up' : 'down', fakes: (process.env.USE_FAKES ?? 'true') === 'true' };
  res.status(db ? 200 : 503).json(body);
});
