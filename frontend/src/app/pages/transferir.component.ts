import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf, NgFor } from '@angular/common';
import { ApiService, ApiErrorBody } from '../api.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-transferir',
  standalone: true,
  imports: [FormsModule, NgIf, NgFor],
  template: `
    <div class="card form-card">
      <h2>🔀 Transferir dólares</h2>
      <p class="hint">Atómica e idempotente. Escribe el alias (usuario), no el UUID. Sin fondos → 422 sin mover nada.</p>
      <form (ngSubmit)="enviar()">
        <label>Para (alias o nombre)
          <input [(ngModel)]="destino" name="d" placeholder="ej. maria-02" autocomplete="off" (ngModelChange)="buscar()" />
        </label>
        <div *ngIf="sugerencias.length > 0" class="sug">
          <button type="button" *ngFor="let u of sugerencias" (click)="elegir(u)">
            <b>{{ u.nombre || u.user_id }}</b> <small class="mono">&#64;{{ u.user_id }}</small>
          </button>
        </div>
        <label>Monto USD <input [(ngModel)]="monto" name="m" inputmode="decimal" placeholder="30.00" /></label>
        <button class="btn" type="submit" [disabled]="busy">{{ busy ? 'Transfiriendo…' : 'Confirmar transferencia' }}</button>
      </form>
      <div *ngIf="ok" class="ok">
        ✅ Transferencia <b>{{ api.usd(monto) }}</b> a <b>&#64;{{ destino }}</b><br />
        Mi saldo: <b>{{ api.usd(ok.origen_balance) }}</b><br />
        <small class="mono">ref {{ ok.referencia }} {{ ok.replay ? '(replay idempotente)' : '' }}</small>
      </div>
      <div *ngIf="err" class="err"><b>{{ err.code }}</b>: {{ err.message }}</div>
    </div>
  `,
  styles: ['.sug{display:flex;flex-direction:column;gap:.35rem;margin:.4rem 0}.sug button{text-align:left;background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:.55rem .7rem;cursor:pointer}'],
})
export class TransferirComponent {
  api = inject(ApiService);
  auth = inject(AuthService);
  destino = '';
  monto = '30.00';
  sugerencias: { id: string; user_id: string; nombre: string | null }[] = [];
  ok: { referencia: string; origen_balance: string; destino_balance: string; replay: boolean } | null = null;
  err: ApiErrorBody | null = null;
  busy = false;
  private t: ReturnType<typeof setTimeout> | null = null;

  buscar() {
    if (this.t) clearTimeout(this.t);
    const q = this.destino.trim();
    if (q.length < 2) { this.sugerencias = []; return; }
    this.t = setTimeout(() => {
      this.api.buscarUsuarios(q).subscribe({ next: (r) => (this.sugerencias = r.items.filter((u) => u.user_id !== this.auth.sesion()?.user_id)), error: () => undefined });
    }, 250);
  }

  elegir(u: { user_id: string }) {
    this.destino = u.user_id;
    this.sugerencias = [];
  }

  enviar() {
    const s = this.auth.sesion();
    if (!s) return;
    this.ok = null; this.err = null; this.busy = true;
    this.api.transferir(s.id, this.destino.trim().toLowerCase(), this.monto).subscribe({
      next: (r) => { this.ok = r; this.busy = false; this.auth.refrescar(); },
      error: (e) => { this.err = e.error as ApiErrorBody; this.busy = false; },
    });
  }
}
