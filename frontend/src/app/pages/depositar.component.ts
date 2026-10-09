import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { ApiService, Deposito, ApiErrorBody } from '../api.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-depositar',
  standalone: true,
  imports: [FormsModule, NgIf],
  template: `
    <div class="card form-card">
      <h2>💵 Recarga auditada USD</h2>
      <p class="hint" *ngIf="auth.sesion() as s">Dinero con voucher del dueño externo del saldo (<b>&#64;{{ s.user_id }}</b> como cliente). <b>No mueve tu saldo de billetera</b>: tras el voucher puedes abonarlo abajo.</p>
      <form (ngSubmit)="enviar()">
        <label>Monto USD <input [(ngModel)]="monto" name="monto" inputmode="decimal" placeholder="150.50" required /></label>
        <label>Método
          <select [(ngModel)]="metodo_origen" name="metodo">
            <option>TRANSFERENCIA</option><option>EFECTIVO</option><option>TARJETA</option><option>OTRO</option>
          </select>
        </label>
        <button class="btn" type="submit" [disabled]="busy">{{ busy ? 'Procesando…' : 'Confirmar depósito USD' }}</button>
      </form>
      <div *ngIf="ok" class="ok">
        <span class="badge badge-{{ ok.estado }}">{{ ok.estado }}</span>
        <b>{{ api.usd(ok.monto) }} {{ ok.moneda }}</b> · voucher <span class="mono">{{ ok.movimiento_saldo_id }}</span><br />
        <small class="mono">deposito_id: {{ ok.deposito_id }}</small>
      </div>
      <div *ngIf="ok && ok.estado === 'COMPLETADO' && !abonado" style="margin-top:.7rem">
        <button class="btn secondary" (click)="abonar()" [disabled]="busyAbono">
          {{ busyAbono ? 'Abonando…' : '👛 Abonar ' + api.usd(ok.monto) + ' a mi saldo de billetera' }}
        </button>
      </div>
      <div *ngIf="abonado" class="ok">✅ Abonado a tu billetera · nuevo saldo <b>{{ api.usd(abonado) }}</b></div>
      <div *ngIf="err" class="err"><b>{{ err.code }}</b>: {{ err.message }}<br /><small class="mono" *ngIf="err.correlation_id">corr: {{ err.correlation_id }}</small></div>
    </div>
  `,
})
export class DepositarComponent {
  api = inject(ApiService);
  auth = inject(AuthService);
  monto = '150.50';
  metodo_origen = 'TRANSFERENCIA';
  ok: Deposito | null = null;
  err: ApiErrorBody | null = null;
  busy = false;
  busyAbono = false;
  abonado: string | null = null;

  enviar() {
    const s = this.auth.sesion();
    if (!s) return;
    this.ok = null; this.err = null; this.abonado = null; this.busy = true;
    // Sesión: el cliente_id es tu alias → tu historial de depósitos es solo tuyo.
    this.api.depositar({ cliente_id: s.user_id, monto: this.monto, metodo_origen: this.metodo_origen }).subscribe({
      next: (d) => { this.ok = d; this.busy = false; },
      error: (e) => { this.err = e.error as ApiErrorBody; this.busy = false; },
    });
  }

  /** Puente explícito auditado → billetera (dominios separados C11, lo une tu acción). */
  abonar() {
    const s = this.auth.sesion();
    if (!s || !this.ok) return;
    this.busyAbono = true;
    this.api.depositarBilletera(s.id, this.ok.monto).subscribe({
      next: (r) => { this.abonado = r.balance; this.busyAbono = false; this.auth.refrescar(); },
      error: (e) => { this.err = e.error as ApiErrorBody; this.busyAbono = false; },
    });
  }
}
