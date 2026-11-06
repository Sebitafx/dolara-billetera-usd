import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Formato de errores de la clase (02 §1, C10).
export interface ApiError extends Error {
  status: number;
  code: string;
}

export function apiError(status: number, code: string, message: string): ApiError {
  const e = new Error(message) as ApiError;
  e.status = status;
  e.code = code;
  return e;
}

export function correlation(req: Request, res: Response, next: NextFunction): void {
  const supplied = req.header('X-Correlation-Id');
  const cid = supplied && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied)
    ? supplied
    : randomUUID();
  (req as Request & { correlationId?: string }).correlationId = cid;
  res.setHeader('X-Correlation-Id', cid);
  next();
}

export function correlationId(req: Request): string {
  return (req as Request & { correlationId?: string }).correlationId ?? 'sin-correlacion';
}

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(apiError(404, 'ROUTE_NOT_FOUND', `ruta no encontrada: ${req.method} ${req.path}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const e = err as Partial<ApiError>;
  const malformedJson = err instanceof SyntaxError && e.status === 400;
  const validationError = err.name === 'ZodError' || (e as { code?: string }).code === '22P02';
  const status = malformedJson || validationError ? 400 : (e.status ?? 500);
  const code = malformedJson ? 'INVALID_JSON' : validationError ? 'VALIDATION_ERROR' : (e.code ?? 'INTERNAL_ERROR');
  const message = malformedJson
    ? 'el cuerpo debe ser JSON válido'
    : validationError
      ? 'la petición no cumple el contrato'
      : status >= 500
        ? 'error interno'
        : (err.message || 'petición inválida');
  res.status(status).json({
    status,
    code,
    message,
    correlation_id: correlationId(req),
    timestamp: new Date().toISOString(),
  });
}
