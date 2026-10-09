// Puertos lógicos (01 §12, C9). El caso de uso solo conoce estas interfaces.

export type CustomerStatus = 'ACTIVE' | 'BLOCKED' | 'INACTIVE';
export type AccountStatus = 'ACTIVE' | 'BLOCKED' | 'NOT_FOUND';

export interface CustomerValidation {
  customerExists: boolean;
  customerStatus: CustomerStatus;
  accountStatus: AccountStatus;
  enabledCurrencies: string[];
}

export interface CustomerAccountPort {
  validateUsdDestination(input: { customerId: string; accountId?: string }): Promise<CustomerValidation>;
}

export interface CreditResult {
  success: boolean;
  movementId?: string;
  alreadyApplied?: boolean;
}

export interface BalancePort {
  credit(input: {
    customerId: string;
    accountId?: string;
    amount: string;
    currency: 'USD';
    referenceId: string;
  }): Promise<CreditResult>;
}
