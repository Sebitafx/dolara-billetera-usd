import { z } from 'zod';

// C2: montos como string "150.50", > 0, máximo 2 decimales. Cero floats.
export const montoSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'formato monto inválido (ej. "150.50")')
  .refine((s) => Number(s) > 0, 'monto debe ser mayor a 0')
  .refine((s) => Number(s) <= 9999999999.99, 'monto excede el máximo');

export const metodoOrigenSchema = z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'OTRO']);

export const monedaUsdSchema = z.enum(['USD'], { errorMap: () => ({ message: 'solo se soporta USD en v1' }) });

export const crearDepositoSchema = z.object({
  cliente_id: z.string().min(1).max(100),
  cuenta_destino_id: z.string().min(1).max(100).optional(),
  monto: montoSchema,
  // USD-only estricto: si el cliente envía moneda, debe ser USD. PEN u otra => 400.
  moneda: monedaUsdSchema.optional(),
  metodo_origen: metodoOrigenSchema,
  referencia_externa: z.string().max(120).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const convertirSchema = z.object({
  monto: montoSchema,
  de: z.enum(['USD', 'PEN']),
  a: z.enum(['USD', 'PEN']),
});
