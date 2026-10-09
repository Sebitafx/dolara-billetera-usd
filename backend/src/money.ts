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

/** Conversión con redondeo half-up a 2 decimales (S-3). tasa con hasta 6 decimales. */
export function convertir(monto: string, tasa: string, invertir: boolean): string {
  const scale = 1_000_000;
  const tasaInt = Math.round(Number(tasa) * scale);
  const cents = toCents(monto);
  const resultado = invertir
    ? Math.round((cents * scale) / tasaInt) // PEN -> USD (centavos de USD)
    : Math.round((cents * tasaInt) / scale); // USD -> PEN (centavos de PEN)
  return fromCents(resultado);
}
