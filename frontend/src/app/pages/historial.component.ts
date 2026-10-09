import { Component, inject, OnInit } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { ApiService, Historial, WalletHistorial } from '../api.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [NgIf, NgFor],
  template: `
    <div class="card">
      <h2>🧾 Mis movimientos</h2>
      <p class="hint" *ngIf="auth.sesion() as s">Todo lo tuyo, &#64;{{ s.user_id }}. Sin buscar IDs ajenos.</p>
      <div *ngIf="loading" class="skel" style="height:64px"></div>
    </div>

    <div class="card" *ngIf="wh">
      <h3>Billetera · {{ wh.total }} movimientos (USD)</h3>
      <div *ngIf="wh.items.length===0" class="empty"><span class="big">👛</span>Sin movimientos.</div>
      <div class="mov" *ngFor="let m of wh.items">
        <div class="mov-ic" [class.in]="m.tipo==='deposito'||m.tipo==='transfer_in'" [class.out]="!(m.tipo==='deposito'||m.tipo==='transfer_in')">
          {{ m.tipo==='deposito' ? '💵' : m.tipo==='retiro' ? '🏧' : m.tipo==='transfer_in' ? '📥' : '📤' }}
        </div>
        <div class="mov-main">
          <div class="mov-title">{{ m.tipo.replace('_',' ') }} · {{ m.moneda }}</div>
          <div class="mov-date">{{ m.creado_en }}<br /><span class="mono">saldo {{ api.usd(m.saldo_resultante) }}</span></div>
        </div>
        <div class="mov-amt" [class.pos]="m.tipo==='deposito'||m.tipo==='transfer_in'">{{ (m.tipo==='deposito'||m.tipo==='transfer_in') ? '+' : '−' }}{{ api.usd(m.monto) }}</div>
      </div>
    </div>

    <div class="card" *ngIf="h">
      <h3>Mis recargas auditadas · {{ h.total }}</h3>
      <div *ngIf="h.items.length===0" class="empty"><span class="big">🧾</span>Sin recargas.</div>
      <table class="mov-table" *ngIf="h.items.length>0">
        <tr><th>Fecha</th><th>Monto</th><th>Estado</th><th>ID</th></tr>
        <tr *ngFor="let d of h.items">
          <td>{{ d.creado_en }}</td>
          <td>{{ api.usd(d.monto) }} {{ d.moneda }}</td>
          <td><span class="badge badge-{{ d.estado }}">{{ d.estado }}</span></td>
          <td><small class="mono">{{ d.deposito_id.slice(0, 8) }}…</small></td>
        </tr>
      </table>
    </div>
  `,
})
export class HistorialComponent implements OnInit {
  api = inject(ApiService);
  auth = inject(AuthService);
  h: Historial | null = null;
  wh: WalletHistorial | null = null;
  loading = true;

  ngOnInit() {
    const s = this.auth.sesion();
    if (!s) return;
    this.api.movimientosBilletera(s.id).subscribe({ next: (w) => { this.wh = w; this.loading = false; }, error: () => (this.loading = false) });
    this.api.historial(s.user_id).subscribe({ next: (x) => (this.h = x), error: () => undefined });
  }
}
