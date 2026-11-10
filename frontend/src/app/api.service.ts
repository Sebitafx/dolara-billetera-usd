import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  ConversionResult,
  Deposito,
  ExchangeRate,
  Historial,
  TransferResult,
  Wallet,
  WalletHistory,
  WalletOperationResult,
} from './api-contract';

export type { ApiErrorBody, Deposito, Historial, Wallet, WalletMovement as WalletMov, WalletHistory as WalletHistorial } from './api-contract';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = '/api/v1';

  // ---- Depósitos USD (recarga a saldo externo / voucher) ----
  depositar(cmd: { cliente_id: string; monto: string; metodo_origen: string; referencia_externa?: string }) {
    const headers = new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() });
    return this.http.post<Deposito>(`${this.base}/depositos/usd`, { ...cmd, moneda: 'USD', canal: 'APP' }, { headers });
  }

  consultar(id: string) {
    return this.http.get<Deposito>(`${this.base}/depositos/usd/${id}`);
  }

  historial(cliente_id: string, page = 1, limit = 20) {
    return this.http.get<Historial>(`${this.base}/depositos/usd`, { params: { cliente_id, page, limit } });
  }

  // ---- Billetera Digital USD (saldo propio) ----
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
    return this.http.get<Wallet>(`${this.base}/billetera/usuarios/${encodeURIComponent(user_id)}/wallet`);
  }

  depositarBilletera(id: string, monto: string) {
    return this.http.post<WalletOperationResult>(
      `${this.base}/billetera/wallets/${id}/depositos`,
      { monto },
    );
  }

  retirarBilletera(id: string, monto: string) {
    return this.http.post<WalletOperationResult>(
      `${this.base}/billetera/wallets/${id}/retiros`,
      { monto },
    );
  }

  transferir(origen_id: string, destino_id: string, monto: string) {
    const headers = new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() });
    return this.http.post<TransferResult>(
      `${this.base}/billetera/transferencias`,
      { origen_id, destino_id, monto },
      { headers },
    );
  }

  movimientosBilletera(id: string, page = 1, limit = 20) {
    return this.http.get<WalletHistory>(`${this.base}/billetera/wallets/${id}/movimientos`, {
      params: { page, limit },
    });
  }

  // ---- FX referencial (no acredita, solo informativo) ----
  tasa(par: 'USD_PEN' | 'PEN_USD' = 'USD_PEN') {
    return this.http.get<ExchangeRate>(
      `${this.base}/fx/tasa`,
      { params: { par } },
    );
  }

  convertir(monto: string, de: 'USD' | 'PEN', a: 'USD' | 'PEN') {
    return this.http.post<ConversionResult>(`${this.base}/fx/convertir`, {
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
