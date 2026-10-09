import type { BalancePort, CustomerAccountPort, CreditResult, CustomerValidation } from '../ports.js';

// Etapa B/C: adaptadores HTTP reales (03 Fase 7/8). Inactivos con USE_FAKES=true.
// Traducen el contrato del otro equipo al modelo interno (02 §5-§6).

export const httpOut: { fetch: typeof fetch } = { fetch };

function timeoutMs(): number {
  return Number(process.env.HTTP_TIMEOUT_MS ?? 3000);
}

async function getJson(url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs());
  try {
    const r = await httpOut.fetch(url, { headers, signal: ctrl.signal });
    return { status: r.status, body: await r.json().catch(() => null) };
  } finally {
    clearTimeout(t);
  }
}

export class CustomerAccountHttpAdapter implements CustomerAccountPort {
  async validateUsdDestination(input: { customerId: string; accountId?: string }): Promise<CustomerValidation> {
    const base = process.env.CUSTOMER_SERVICE_URL ?? '';
    const account = input.accountId ? `/cuentas/${input.accountId}` : '';
    const { status, body } = await getJson(
      `${base}/api/v1/clientes/${input.customerId}${account}/validacion-deposito?moneda=USD`,
      { Accept: 'application/json' },
    );
    if (status === 404) {
      return { customerExists: false, customerStatus: 'INACTIVE', accountStatus: 'NOT_FOUND', enabledCurrencies: [] };
    }
    if (status !== 200 || typeof body !== 'object' || body === null) {
      throw new Error('CUSTOMER_SERVICE_UNAVAILABLE');
    }
    const b = body as Record<string, unknown>;
    return {
      customerExists: b.cliente_existe === true,
      customerStatus: (b.cliente_estado as CustomerValidation['customerStatus']) ?? 'INACTIVE',
      accountStatus: (b.cuenta_estado as CustomerValidation['accountStatus']) ?? 'NOT_FOUND',
      enabledCurrencies: Array.isArray(b.monedas_habilitadas) ? (b.monedas_habilitadas as string[]) : [],
    };
  }
}

export class BalanceHttpAdapter implements BalancePort {
  async credit(input: {
    customerId: string;
    accountId?: string;
    amount: string;
    currency: 'USD';
    referenceId: string;
  }): Promise<CreditResult> {
    const base = process.env.BALANCE_SERVICE_URL ?? '';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs());
    try {
      const r = await httpOut.fetch(`${base}/api/v1/saldos/movimientos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          cliente_id: input.customerId,
          cuenta_id: input.accountId,
          tipo: 'CREDIT',
          monto: input.amount,
          moneda: 'USD',
          referencia_id: input.referenceId,
          referencia_tipo: 'DEPOSITO_USD',
        }),
      });
      if (r.status === 409) {
        const b = (await r.json().catch(() => null)) as { movimiento_id?: string } | null;
        return { success: true, movementId: b?.movimiento_id, alreadyApplied: true };
      }
      if (!r.ok) throw new Error('BALANCE_SERVICE_UNAVAILABLE');
      const b = (await r.json()) as { movimiento_id?: string };
      return { success: true, movementId: b?.movimiento_id };
    } finally {
      clearTimeout(t);
    }
  }
}
