import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface Deposito {
  deposito_id: string;
  cliente_id: string;
  cuenta_destino_id?: string | null;
  monto: string;
  moneda: 'USD';
  estado: string;
  movimiento_saldo_id?: string | null;
  creado_en: string;
  completado_en?: string | null;
}

export interface Historial {
  items: Deposito[];
  page: number;
  limit: number;
  total: number;
}

export interface ApiErrorBody {
  status: number;
  code: string;
  message: string;
  correlation_id: string;
  timestamp: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  nombre: string | null;
  balance: string;
  moneda: 'USD';
}

export interface WalletMov {
  id: string;
  tipo: 'deposito' | 'retiro' | 'transfer_in' | 'transfer_out';
  monto: string;
  moneda: 'USD';
  saldo_resultante: string;
  referencia: string | null;
  creado_en: string;
}

export interface WalletHistorial {
  items: WalletMov[];
  page: number;
  limit: number;
  total: number;
  moneda: 'USD';
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = '/api/v1';

  // ---- Depósitos USD (recarga a saldo externo / voucher) ----
  depositar(cmd: { cliente_id: string; monto: string; metodo_origen: string; referencia_externa?: string }) {
    const headers = new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() });
    return this.http.post<Deposito>(`${this.base}/depositos/usd`, { ...cmd, moneda: 'USD' }, { headers });
  }

  consultar(id: string) {
    return this.http.get<Deposito>(`${this.base}/depositos/usd/${id}`);
  }

  historial(cliente_id: string, page = 1, limit = 20) {
    return this.http.get<Historial>(`${this.base}/depositos/usd`, { params: { cliente_id, page, limit } });
  }

  // ---- Billetera USD (saldo propio, corazón de DOLARA) ----
  registro(cmd: { user_id: string; nombre: string; pin: string }) {
    return this.http.post<Wallet>(`${this.base}/billetera/registro`, cmd);
  }

  login(cmd: { user_id: string; pin: string }) {
    return this.http.post<Wallet>(`${this.base}/billetera/login`, cmd);
  }

  buscarUsuarios(q: string) {
    return this.http.get<{ items: { id: string; user_id: string; nombre: string | null }[] }>(
      `${this.base}/billetera/usuarios/buscar`,
      { params: { q } },
    );
  }

  crearBilletera(user_id: string) {
    return this.http.post<Wallet>(`${this.base}/billetera/wallets`, { user_id });
  }

  billetera(id: string) {
    return this.http.get<Wallet>(`${this.base}/billetera/wallets/${id}`);
  }

  billeteraPorUsuario(user_id: string) {
    return this.http.get<Wallet>(`${this.base}/billetera/wallets/by-user/${encodeURIComponent(user_id)}`);
  }

  depositarBilletera(id: string, monto: string) {
    return this.http.post<{ movimiento_id: string; balance: string; moneda: 'USD' }>(
      `${this.base}/billetera/wallets/${id}/depositos`,
      { monto },
    );
  }

  retirarBilletera(id: string, monto: string) {
    return this.http.post<{ movimiento_id: string; balance: string; moneda: 'USD' }>(
      `${this.base}/billetera/wallets/${id}/retiros`,
      { monto },
    );
  }

  transferir(origen_id: string, destino_id: string, monto: string) {
    const headers = new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() });
    return this.http.post<{ referencia: string; origen_balance: string; destino_balance: string; moneda: 'USD'; replay: boolean }>(
      `${this.base}/billetera/transferencias`,
      { origen_id, destino_id, monto },
      { headers },
    );
  }

  movimientosBilletera(id: string, page = 1, limit = 20) {
    return this.http.get<WalletHistorial>(`${this.base}/billetera/wallets/${id}/movimientos`, {
      params: { page, limit },
    });
  }

  // ---- FX referencial (no acredita, solo informativo) ----
  tasa() {
    return this.http.get<{ par: string; tasa: string; fuente: string; actualizada_en: string; stale: boolean }>(
      `${this.base}/fx/tasa`,
      { params: { par: 'USD_PEN' } },
    );
  }

  convertir(monto: string, de: 'USD' | 'PEN', a: 'USD' | 'PEN') {
    return this.http.post<{ monto_origen: string; monto_convertido: string; tasa: string }>(`${this.base}/fx/convertir`, {
      monto,
      de,
      a,
    });
  }

  // ---- helpers UI ----
  usd(monto: string): string {
    const n = Number(monto);
    if (!Number.isFinite(n)) return '$ 0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }
}
