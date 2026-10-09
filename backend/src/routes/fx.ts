import { Router } from 'express';
import { obtenerTasa } from '../fx.js';
import { convertir } from '../money.js';
import { apiError } from '../errors.js';
import { convertirSchema } from '../validators.js';

export const fx = Router();

/**
 * @openapi
 * /api/v1/fx/tasa:
 *   get:
 *     summary: Tasa USD_PEN vigente, aporte propio (RF-8)
 */
fx.get('/tasa', async (req, res, next) => {
  try {
    const par = String(req.query.par ?? 'USD_PEN');
    if (par !== 'USD_PEN') return next(apiError(400, 'VALIDATION_ERROR', 'solo se soporta USD_PEN en v1'));
    res.json(await obtenerTasa());
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /api/v1/fx/convertir:
 *   post:
 *     summary: Conversión referencial USD<->PEN con tasa vigente (RF-8, solo informativo, no acredita)
 */
fx.post('/convertir', async (req, res, next) => {
  try {
    const { monto, de, a } = convertirSchema.parse(req.body);
    if (de === a) {
      // USD-only estricto: solo se permite eco USD->USD. PEN->PEN se rechaza.
      if (de !== 'USD') return next(apiError(400, 'VALIDATION_ERROR', 'billetera USD-only: solo se permite USD->USD como eco'));
      return res.json({ monto_origen: monto, moneda_origen: de, monto_convertido: monto, moneda_destino: a, tasa: '1.000000' });
    }
    const t = await obtenerTasa();
    res.json({
      monto_origen: monto,
      moneda_origen: de,
      monto_convertido: convertir(monto, t.tasa, de === 'PEN'),
      moneda_destino: a,
      tasa: t.tasa,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'ZodError') return next(apiError(400, 'VALIDATION_ERROR', 'cuerpo inválido'));
    next(e);
  }
});
