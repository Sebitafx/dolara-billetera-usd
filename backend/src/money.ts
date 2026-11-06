// C2: dinero exacto. pg devuelve NUMERIC como string: jamás convertir a number para saldos.
// Solo se opera con enteros de centavos o strings con 2 decimales.

export function toCents(monto: string): number {
  const [ent, dec = ''] = monto.split('.');
  return Number(ent) * 100 + Number((dec + '00').slice(0, 2));
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function add(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

export function sub(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

export function gte(a: string, b: string): boolean {
  return toCents(a) >= toCents(b);
}

const RATE_SCALE = 1_000_000n;

function decimalToScaled(value: string, decimals: number): bigint {
  const match = value.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > decimals) throw new Error('decimal inválido');
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt((match[2] ?? '').padEnd(decimals, '0'));
}

function centsToMoney(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('divisor inválido');
  return (numerator + denominator / 2n) / denominator;
}

/** Tasa PEN/USD derivada de USD/PEN, con 6 decimales y redondeo half-up. */
export function tasaInversa(tasaUsdPen: string): string {
  const direct = decimalToScaled(tasaUsdPen, 6);
  const inverse = divideHalfUp(RATE_SCALE * RATE_SCALE, direct);
  return `${inverse / RATE_SCALE}.${(inverse % RATE_SCALE).toString().padStart(6, '0')}`;
}

/** Conversión exacta con BigInt y redondeo half-up a 2 decimales. */
export function convertir(monto: string, tasaUsdPen: string, invertir: boolean): string {
  const rate = decimalToScaled(tasaUsdPen, 6);
  const cents = decimalToScaled(monto, 2);
  const converted = invertir
    ? divideHalfUp(cents * RATE_SCALE, rate) // PEN -> USD
    : divideHalfUp(cents * rate, RATE_SCALE); // USD -> PEN
  return centsToMoney(converted);
}
