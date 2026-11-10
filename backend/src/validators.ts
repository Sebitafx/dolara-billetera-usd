import { z } from 'zod';

const MAX_CENTS = 999_999_999_999n;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = /^\d+(\.\d{1,2})?$/;

function normalizeMoney(value: string): string {
  const [whole, decimals = ''] = value.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  return `${normalizedWhole}.${(decimals + '00').slice(0, 2)}`;
}

function cents(value: string): bigint | null {
  if (!MONEY.test(value)) return null;
  const [whole, decimals = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt((decimals + '00').slice(0, 2));
}

// Montos como string, positivos, con máximo 2 decimales y sin aritmética flotante.
export const montoSchema = z
  .string()
  .regex(MONEY, 'formato monto inválido (ej. "150.50")')
  .refine((value) => {
    const amount = cents(value);
    return amount !== null && amount > 0n;
  }, 'monto debe ser mayor a 0')
  .refine((value) => {
    const amount = cents(value);
    return amount !== null && amount <= MAX_CENTS;
  }, 'monto excede el máximo')
  .transform(normalizeMoney);

export const uuidSchema = z.string().uuid('UUID inválido');
export const idempotencyKeySchema = z.string().uuid('Idempotency-Key debe ser UUID v4').regex(UUID_V4, 'Idempotency-Key debe ser UUID v4');

export const aliasSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'alias inválido (minúsculas, números, - _)');
export const nombreSchema = z.string().trim().min(2).max(60);
export const pinSchema = z.string().regex(/^\d{4,6}$/, 'PIN de 4 a 6 dígitos');
export const walletOwnerIdSchema = z.string().trim().min(1).max(100);

export const metodoOrigenSchema = z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'OTRO']);
export const canalSchema = z.enum(['VENTANILLA', 'AGENTE', 'APP']);

export const monedaUsdSchema = z.enum(['USD'], { errorMap: () => ({ message: 'solo se soporta USD en v1' }) });

export const crearDepositoSchema = z
  .object({
    cliente_id: z.string().trim().min(1).max(100),
    cuenta_destino_id: z.string().trim().min(1).max(100).optional(),
    monto: montoSchema,
    // USD-only estricto: si el cliente envía moneda, debe ser USD. PEN u otra => 400.
    moneda: monedaUsdSchema.optional(),
    // Compatibilidad temporal v1.1: se infiere si falta, pero v1.2 debe enviarlo.
    canal: canalSchema.optional(),
    metodo_origen: metodoOrigenSchema,
    referencia_externa: z.string().trim().max(120).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.canal) return;
    const valido =
      ((value.canal === 'VENTANILLA' || value.canal === 'AGENTE') && value.metodo_origen === 'EFECTIVO') ||
      (value.canal === 'APP' && value.metodo_origen !== 'EFECTIVO');
    if (!valido) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['canal'],
        message: 'combinación canal/metodo_origen no permitida',
      });
    }
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const convertirSchema = z.object({
  monto: montoSchema,
  de: z.enum(['USD', 'PEN']),
  a: z.enum(['USD', 'PEN']),
}).strict();

export const registroSchema = z.object({ user_id: aliasSchema, nombre: nombreSchema, pin: pinSchema }).strict();
export const loginSchema = z.object({ user_id: aliasSchema, pin: pinSchema }).strict();
export const crearWalletSchema = z
  .object({ user_id: walletOwnerIdSchema, nombre: z.string().trim().min(1).max(60).nullable().optional() })
  .strict();
export const montoRequestSchema = z.object({ monto: montoSchema }).strict();
export const transferenciaSchema = z
  .object({ origen_id: z.string().trim().min(1).max(100), destino_id: z.string().trim().min(1).max(100), monto: montoSchema })
  .strict();
