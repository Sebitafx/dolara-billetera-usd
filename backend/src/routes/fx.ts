import { Router } from 'express';
import { obtenerTasa } from '../fx.js';
import { convertir, tasaInversa } from '../money.js';
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
    if (par !== 'USD_PEN' && par !== 'PEN_USD') {
      return next(apiError(400, 'VALIDATION_ERROR', 'par debe ser USD_PEN o PEN_USD'));
    }
    const quote = await obtenerTasa();
    res.json(par === 'USD_PEN' ? quote : { ...quote, par, tasa: tasaInversa(quote.tasa) });
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
      return res.json({
        monto_origen: monto,
        moneda_origen: de,
        monto_convertido: monto,
        moneda_destino: a,
        tasa: '1.000000',
        par: `${de}_${a}`,
      });
    }
    const t = await obtenerTasa();
    const invertir = de === 'PEN';
    res.json({
      monto_origen: monto,
      moneda_origen: de,
      monto_convertido: convertir(monto, t.tasa, invertir),
      moneda_destino: a,
      tasa: invertir ? tasaInversa(t.tasa) : t.tasa,
      par: `${de}_${a}`,
      fuente: t.fuente,
      actualizada_en: t.actualizada_en,
      stale: t.stale,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'ZodError') return next(apiError(400, 'VALIDATION_ERROR', 'cuerpo inválido'));
    next(e);
  }
});
