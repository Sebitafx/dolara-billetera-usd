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
  const cid = req.header('X-Correlation-Id') || randomUUID();
  (req as Request & { correlationId?: string }).correlationId = cid;
  res.setHeader('X-Correlation-Id', cid);
  next();
}

export function correlationId(req: Request): string {
  return (req as Request & { correlationId?: string }).correlationId ?? 'sin-correlacion';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const e = err as Partial<ApiError>;
  const status = e.status ?? 500;
  res.status(status).json({
    status,
    code: e.code ?? 'INTERNAL_ERROR',
    message: err.message ?? 'error interno',
    correlation_id: correlationId(req),
    timestamp: new Date().toISOString(),
  });
}
