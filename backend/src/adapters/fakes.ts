import { pool } from '../db.js';
import type { BalancePort, CustomerAccountPort, CreditResult, CustomerValidation } from '../ports.js';

// Etapa A: desarrollo sin los otros MS (03 Fase 7/8).
//  Cliente A -> ACTIVE, cuenta USD ACTIVE · B -> BLOCKED · C -> ACTIVE solo PEN · resto -> NOT_FOUND.

export class FakeCustomerAccountAdapter implements CustomerAccountPort {
  async validateUsdDestination(input: { customerId: string; accountId?: string }): Promise<CustomerValidation> {
    const id = input.customerId;
    if (id === 'cliente-bloqueado' || id === 'B') {
      return { customerExists: true, customerStatus: 'BLOCKED', accountStatus: 'ACTIVE', enabledCurrencies: ['USD'] };
    }
    if (id === 'cliente-pen' || id === 'C') {
      return { customerExists: true, customerStatus: 'ACTIVE', accountStatus: 'ACTIVE', enabledCurrencies: ['PEN'] };
    }
    if (id === 'cliente-activo' || id === 'A' || id.startsWith('u-') || id.startsWith('test-')) {
      return { customerExists: true, customerStatus: 'ACTIVE', accountStatus: 'ACTIVE', enabledCurrencies: ['USD'] };
    }
    // Demo DOLARA: todo user_id registrado en wallets es cliente USD activo.
    // Así cada usuario logueado deposita con su propio cliente_id y ve solo su historial.
    try {
      const { rows } = await pool.query(`SELECT 1 FROM wallets WHERE user_id = $1 LIMIT 1`, [id]);
      if (rows.length > 0) {
        return { customerExists: true, customerStatus: 'ACTIVE', accountStatus: 'ACTIVE', enabledCurrencies: ['USD'] };
      }
    } catch {
      // sin BD o tabla legacy: cae al NOT_FOUND de abajo
    }
    return { customerExists: false, customerStatus: 'INACTIVE', accountStatus: 'NOT_FOUND', enabledCurrencies: [] };
  }
}

// FakeBalanceAdapter: acredita en ledger LOCAL demo (tabla fake_ledger).
// La referencia (= deposito_id) es UNIQUE: doble credit = idempotente lado saldo.
// Con FAIL_NEXT_BALANCE=true simula caída (para E2E-03). Se desecha al integrar Saldos real.
export class FakeBalanceAdapter implements BalancePort {
  async credit(input: {
    customerId: string;
    accountId?: string;
    amount: string;
    currency: 'USD';
    referenceId: string;
  }): Promise<CreditResult> {
    if (process.env.FAIL_NEXT_BALANCE === 'true') {
      process.env.FAIL_NEXT_BALANCE = 'false';
      throw new Error('BALANCE_SERVICE_UNAVAILABLE (fake)');
    }
    try {
      await pool.query(`INSERT INTO fake_ledger (referencia, cliente_id, monto) VALUES ($1, $2, $3)`, [
        input.referenceId,
        input.customerId,
        input.amount,
      ]);
      return { success: true, movementId: `FAKE-${input.referenceId}` };
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === '23505') {
        return { success: true, movementId: `FAKE-${input.referenceId}`, alreadyApplied: true };
      }
      throw e;
    }
  }
}
