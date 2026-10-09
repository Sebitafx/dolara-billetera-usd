import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf, NgFor, DatePipe } from '@angular/common';
import { ApiService, WalletMov } from '../api.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor, DatePipe],
  template: `
    <section class="card hero-card">
      <div class="hero-label">Saldo disponible · USD</div>
      <div class="hero-balance">{{ oculto ? '••••••' : api.usd(saldo()) }}</div>
      <div class="hero-sub" *ngIf="auth.sesion() as s">Hola, {{ s.nombre || s.user_id }} · &#64;{{ s.user_id }}</div>
      <div class="hero-row">
        <span class="chip gold">USD-only ✓</span>
        <span class="chip" *ngIf="tasa">T.C. ref S/ {{ tasa.tasa }}</span>
        <button class="eye-btn" (click)="oculto = !oculto">{{ oculto ? '👁 Ver' : '🙈 Ocultar' }}</button>
      </div>
    </section>

    <div class="quick-grid" style="margin-bottom:.95rem">
      <a class="quick" routerLink="/depositar"><span class="ic">💵</span>Recargar</a>
      <a class="quick" routerLink="/billetera"><span class="ic">🏧</span>Retirar</a>
      <a class="quick" routerLink="/transferir"><span class="ic">🔀</span>Transferir</a>
      <a class="quick" routerLink="/fx"><span class="ic">💱</span>T. cambio</a>
    </div>

    <div class="dash-grid">
      <div class="card">
        <h3>Últimos movimientos</h3>
        <div *ngIf="loading" class="skel" style="height:64px"></div>
        <div *ngIf="!loading && movs.length === 0" class="empty"><span class="big">🧾</span>Sin movimientos aún. Recarga tus primeros dólares.</div>
        <div class="mov" *ngFor="let m of movs.slice(0,8)">
          <div class="mov-ic" [class.in]="m.tipo==='deposito'||m.tipo==='transfer_in'" [class.out]="!(m.tipo==='deposito'||m.tipo==='transfer_in')">
            {{ m.tipo==='deposito' ? '💵' : m.tipo==='retiro' ? '🏧' : m.tipo==='transfer_in' ? '📥' : '📤' }}
          </div>
          <div class="mov-main">
            <div class="mov-title">{{ etiqueta(m.tipo) }}</div>
            <div class="mov-date">{{ m.creado_en | date:'short' }} · {{ m.moneda }}</div>
          </div>
          <div class="mov-amt" [class.pos]="m.tipo==='deposito'||m.tipo==='transfer_in'" [class.neg]="!(m.tipo==='deposito'||m.tipo==='transfer_in')">
            {{ (m.tipo==='deposito'||m.tipo==='transfer_in') ? '+' : '−' }}{{ api.usd(m.monto) }}
          </div>
        </div>
        <p class="hint" style="margin-bottom:0"><a routerLink="/historial">Ver todos →</a></p>
      </div>

      <div class="card">
        <h3>Tu cuenta</h3>
        <div *ngIf="auth.sesion() as s">
          <p style="margin:.2rem 0"><b>{{ s.nombre || s.user_id }}</b><br /><small class="mono">&#64;{{ s.user_id }}<br />{{ s.id }}</small></p>
          <p class="hint">Comparte tu alias (&#64;{{ s.user_id }}) para recibir dólares. Nadie ve tu saldo salvo tú.</p>
          <div class="btn-row">
            <a class="btn secondary" style="text-decoration:none;text-align:center" routerLink="/transferir">Transferir</a>
            <a class="btn ghost" style="text-decoration:none;text-align:center" routerLink="/historial">Historial</a>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  api = inject(ApiService);
  auth = inject(AuthService);
  movs: WalletMov[] = [];
  saldo = signal('0.00');
  oculto = false;
  loading = true;
  tasa: { tasa: string } | null = null;

  ngOnInit() {
    this.api.tasa().subscribe({ next: (t) => (this.tasa = t), error: () => undefined });
    const s = this.auth.sesion();
    if (!s) return;
    this.api.billetera(s.id).subscribe({
      next: (w) => {
        this.saldo.set(w.balance);
        this.api.movimientosBilletera(w.id, 1, 8).subscribe({
          next: (h) => { this.movs = h.items; this.loading = false; },
          error: () => (this.loading = false),
        });
      },
      error: () => (this.loading = false),
    });
  }

  etiqueta(t: string) {
    return t === 'deposito' ? 'Recarga' : t === 'retiro' ? 'Retiro' : t === 'transfer_in' ? 'Recibido' : 'Enviado';
  }
}
