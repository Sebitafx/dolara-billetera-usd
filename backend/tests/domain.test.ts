import { describe, it, expect } from 'vitest';
import { MoneyUsd, Deposit, DomainError } from '../src/domain/deposit.js';

describe('dominio depositos-usd', () => {
  it('UT-01 MoneyUsd válido normaliza a 2 decimales', () => {
    expect(MoneyUsd.crear('100.00').monto).toBe('100.00');
    expect(MoneyUsd.crear('150.5').monto).toBe('150.50');
  });

  it('UT-02/UT-03 rechaza cero y negativo', () => {
    expect(() => MoneyUsd.crear('0')).toThrow(DomainError);
    expect(() => MoneyUsd.crear('0.00')).toThrow(DomainError);
    expect(() => MoneyUsd.crear('-1')).toThrow(DomainError);
  });

  it('UT-04 rechaza formato inválido (3 decimales, texto)', () => {
    expect(() => MoneyUsd.crear('10.999')).toThrow(DomainError);
    expect(() => MoneyUsd.crear('abc')).toThrow(DomainError);
  });

  it('UT-05/UT-06 transiciones válidas', () => {
    const d = Deposit.nuevo('A', MoneyUsd.crear('10.00'));
    expect(d.estado).toBe('PENDIENTE');
    d.transicionarA('VALIDADO');
    d.transicionarA('COMPLETADO');
    expect(d.estado).toBe('COMPLETADO');
    const f = Deposit.nuevo('A', MoneyUsd.crear('10.00'));
    f.transicionarA('FALLIDO');
    expect(f.estado).toBe('FALLIDO');
  });

  it('UT-07 COMPLETADO -> PENDIENTE rechazado', () => {
    const d = Deposit.nuevo('A', MoneyUsd.crear('10.00'));
    d.transicionarA('VALIDADO');
    d.transicionarA('COMPLETADO');
    expect(() => d.transicionarA('PENDIENTE')).toThrow(DomainError);
    expect(() => d.transicionarA('FALLIDO')).toThrow(DomainError);
  });
});
