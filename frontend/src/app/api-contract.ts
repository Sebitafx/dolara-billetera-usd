export type Currency = 'USD';
export type DepositStatus = 'PENDIENTE' | 'VALIDADO' | 'COMPLETADO' | 'FALLIDO';
export type MovementType = 'deposito' | 'retiro' | 'transfer_in' | 'transfer_out';

export interface ApiErrorBody {
  status: number;
  code: string;
  message: string;
  correlation_id: string;
  timestamp: string;
}

export interface Deposito {
  deposito_id: string;
  cliente_id: string;
  cuenta_destino_id: string | null;
  monto: string;
  moneda: Currency;
  estado: DepositStatus;
  movimiento_saldo_id: string | null;
  creado_en: string;
  completado_en: string | null;
}

export interface DepositoHistorialItem {
  deposito_id: string;
  monto: string;
  moneda: Currency;
  estado: DepositStatus;
  creado_en: string;
}

export interface Historial {
  items: DepositoHistorialItem[];
  page: number;
  limit: number;
  total: number;
  correlation_id: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  nombre: string | null;
  balance: string;
  moneda: Currency;
}

export interface WalletMovement {
  id: string;
  tipo: MovementType;
  monto: string;
  moneda: Currency;
  saldo_resultante: string;
  referencia: string | null;
  creado_en: string;
}

export interface WalletHistory {
  items: WalletMovement[];
  page: number;
  limit: number;
  total: number;
  moneda: Currency;
}

export interface WalletOperationResult {
  movimiento_id: string;
  balance: string;
  moneda: Currency;
}

export interface TransferResult {
  referencia: string;
  origen_balance: string;
  destino_balance: string;
  moneda: Currency;
  replay: boolean;
}

export interface ExchangeRate {
  par: 'USD_PEN' | 'PEN_USD';
  tasa: string;
  fuente: string;
  actualizada_en: string;
  proxima_actualizacion_en: string | null;
  stale: boolean;
}

export interface ConversionResult {
  monto_origen: string;
  moneda_origen: 'USD' | 'PEN';
  monto_convertido: string;
  moneda_destino: 'USD' | 'PEN';
  tasa: string;
  par: 'USD_PEN' | 'PEN_USD' | 'USD_USD' | 'PEN_PEN';
  fuente?: string;
  actualizada_en?: string;
  stale?: boolean;
}
