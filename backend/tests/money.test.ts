import { describe, it, expect } from 'vitest';
import { add, sub, gte, convertir, toCents, fromCents } from '../src/money.js';

describe('money', () => {
  it('suma y resta con centavos exactos', () => {
    expect(add('100.00', '50.00')).toBe('150.00');
    expect(sub('100.00', '30.00')).toBe('70.00');
    expect(gte('100.00', '100.00')).toBe(true);
    expect(gte('99.99', '100.00')).toBe(false);
  });

  it('convierte USD->PEN con half-up', () => {
    // 100.00 * 3.446502 = 344.6502 -> 344.65
    expect(convertir('100.00', '3.446502', false)).toBe('344.65');
  });

  it('convierte PEN->USD', () => {
    // 344.65 / 3.446502 ≈ 100.00
    expect(convertir('344.65', '3.446502', true)).toBe('100.00');
  });

  it('redondeo half-up hacia arriba', () => {
    // 1.00 * 1.005 = 1.005 -> 1.01 (half-up)
    expect(convertir('1.00', '1.005000', false)).toBe('1.01');
  });

  it('centavos ida y vuelta', () => {
    expect(fromCents(toCents('123.45'))).toBe('123.45');
  });
});
