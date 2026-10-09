import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { ApiService, ApiErrorBody } from '../api.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-billetera',
  standalone: true,
  imports: [FormsModule, NgIf],
  template: `
    <section class="card hero-card">
      <div class="hero-label">Billetera USD</div>
      <div class="hero-balance">{{ api.usd(saldo()) }}</div>
      <div class="hero-sub" *ngIf="auth.sesion() as s">&#64;{{ s.user_id }} · cálculo exacto, cero floats</div>
    </section>

    <div class="card form-card">
      <h2>Operar saldo directo</h2>
      <p class="hint">Abono/retiro <b>directo de tu saldo local</b> (demo, sin voucher). Para dinero auditado con voucher usa <b>Recargar</b>.</p>
      <form (ngSubmit)="operar()">
        <label>Monto USD <input [(ngModel)]="monto" name="m" inputmode="decimal" placeholder="50.00" /></label>
        <label>Operación
          <select [(ngModel)]="tipo" name="t"><option value="deposito">Abono directo a mi saldo</option><option value="retiro">Retirar</option></select>
        </label>
        <button class="btn" type="submit" [disabled]="busy">{{ busy ? 'Procesando…' : tipo === 'deposito' ? '💵 Confirmar abono' : '🏧 Confirmar retiro' }}</button>
      </form>
      <div *ngIf="ok" class="ok">✅ <b>{{ api.usd(monto) }} USD</b> · nuevo saldo <b>{{ api.usd(ok.balance) }}</b><br /><small class="mono">{{ ok.movimiento_id }}</small></div>
      <div *ngIf="err" class="err"><b>{{ err.code }}</b>: {{ err.message }}</div>
    </div>
  `,
})
export class BilleteraComponent {
  api = inject(ApiService);
  auth = inject(AuthService);
  monto = '50.00';
  tipo: 'deposito' | 'retiro' = 'deposito';
  saldo = signal('0.00');
  ok: { movimiento_id: string; balance: string } | null = null;
  err: ApiErrorBody | null = null;
  busy = false;

  constructor() {
    const s = this.auth.sesion();
    if (s) this.api.billetera(s.id).subscribe({ next: (w) => this.saldo.set(w.balance) });
  }

  operar() {
    const s = this.auth.sesion();
    if (!s) return;
    this.ok = null; this.err = null;
    if (!/^\d+(\.\d{1,2})?$/.test(this.monto)) { this.err = { status: 400, code: 'MONTO_INVALIDO', message: 'Usa formato 0.00, ej. 50.00', correlation_id: '', timestamp: '' }; return; }
    this.busy = true;
    const call = this.tipo === 'deposito'
      ? this.api.depositarBilletera(s.id, this.monto)
      : this.api.retirarBilletera(s.id, this.monto);
    call.subscribe({
      next: (r) => { this.ok = r; this.saldo.set(r.balance); this.busy = false; this.auth.refrescar(); },
      error: (e) => { this.err = e.error as ApiErrorBody; this.busy = false; },
    });
  }
}
