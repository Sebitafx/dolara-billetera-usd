// Dominio puro: sin HTTP, sin pg, sin Express (01 §7). Testeable sin BD.

export type MetodoOrigen = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'OTRO';
export type EstadoDeposito = 'PENDIENTE' | 'VALIDADO' | 'COMPLETADO' | 'FALLIDO';

const TRANSICIONES: Record<EstadoDeposito, EstadoDeposito[]> = {
  PENDIENTE: ['VALIDADO', 'FALLIDO'],
  VALIDADO: ['COMPLETADO', 'FALLIDO'],
  COMPLETADO: [],
  FALLIDO: [],
};

export class DomainError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Value Object MoneyUsd (01 Fase 3.1): solo USD, > 0, 2 decimales, string. */
export class MoneyUsd {
  private constructor(public readonly monto: string) {}

  static crear(monto: unknown): MoneyUsd {
    if (typeof monto !== 'string' || !/^\d+(\.\d{1,2})?$/.test(monto)) {
      throw new DomainError('INVALID_AMOUNT', 'monto debe ser string decimal con máximo 2 decimales');
    }
    if (Number(monto) <= 0) throw new DomainError('INVALID_AMOUNT', 'monto debe ser mayor a 0');
    const [, dec] = monto.split('.');
    const normalizado = dec ? `${monto.split('.')[0]}.${(dec + '00').slice(0, 2)}` : `${monto}.00`;
    return new MoneyUsd(normalizado);
  }
}

/** Entidad Deposit: protege sus transiciones de estado (01 §8). */
export class Deposit {
  private constructor(
    public readonly id: string | null,
    public readonly clienteId: string,
    public readonly monto: MoneyUsd,
    public estado: EstadoDeposito,
  ) {}

  static nuevo(clienteId: string, monto: MoneyUsd): Deposit {
    if (!clienteId) throw new DomainError('VALIDATION_ERROR', 'cliente_id obligatorio');
    return new Deposit(null, clienteId, monto, 'PENDIENTE');
  }

  transicionarA(siguiente: EstadoDeposito): void {
    if (!TRANSICIONES[this.estado].includes(siguiente)) {
      throw new DomainError('INVALID_TRANSITION', `${this.estado} -> ${siguiente} no permitido`);
    }
    this.estado = siguiente;
  }
}
