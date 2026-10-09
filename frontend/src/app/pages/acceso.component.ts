import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { ApiErrorBody } from '../api.service';

/** Acceso demo: formularios mínimos (alias + nombre + PIN 4-6). Sin auth real. */
@Component({
  selector: 'app-acceso',
  standalone: true,
  imports: [FormsModule, NgIf],
  template: `
    <div class="auth-layout">
    <section class="card hero-card">
      <div class="hero-label">DOLARA · Billetera en dólares</div>
      <div class="hero-balance">Hola 👋</div>
      <div class="hero-sub">Entra con tu alias y PIN demo. Cada usuario ve solo su saldo e historial.</div>
      <div class="hero-row">
        <span class="chip gold">USD-only ✓</span>
        <span class="chip">Sin correo · Sin DNI</span>
      </div>
    </section>

    <div class="card">
      <div class="btn-row" role="tablist">
        <button class="btn {{ modo()==='login' ? '' : 'ghost' }}" type="button" (click)="modo.set('login')">Entrar</button>
        <button class="btn {{ modo()==='registro' ? '' : 'ghost' }}" type="button" (click)="modo.set('registro')">Crear cuenta</button>
      </div>

      <form (ngSubmit)="enviar()" style="margin-top:.6rem">
        <label>Alias (minúsculas, 3-30)
          <input [(ngModel)]="user_id" name="u" placeholder="ej. josue-01" autocomplete="username" required />
        </label>
        <label *ngIf="modo()==='registro'">Tu nombre
          <input [(ngModel)]="nombre" name="n" placeholder="ej. Josué" autocomplete="given-name" />
        </label>
        <label>PIN demo (4-6 dígitos)
          <input [(ngModel)]="pin" name="p" inputmode="numeric" type="password" maxlength="6" placeholder="••••" required />
        </label>
        <button class="btn" type="submit" [disabled]="busy">
          {{ busy ? 'Verificando…' : modo()==='login' ? 'Entrar a mi billetera' : 'Crear mi billetera USD' }}
        </button>
      </form>
      <p class="hint">Demo: el PIN se guarda como hash, nunca en claro. Sin correo, sin DNI, sin burocracia.</p>
      <div *ngIf="err" class="err"><b>{{ err.code }}</b>: {{ err.message }}</div>
    </div>
    </div>
  `,
})
export class AccesoComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  modo = signal<'login' | 'registro'>('login');
  user_id = '';
  nombre = '';
  pin = '';
  busy = false;
  err: ApiErrorBody | null = null;

  enviar() {
    this.err = null;
    const alias = this.user_id.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(alias)) {
      this.err = { status: 400, code: 'VALIDATION_ERROR', message: 'Alias de 3-30: minúsculas, números, - _', correlation_id: '', timestamp: '' };
      return;
    }
    this.busy = true;
    const done = () => { this.busy = false; this.router.navigateByUrl('/inicio'); };
    const fail = (e: { error?: ApiErrorBody }) => { this.err = e.error ?? { status: 0, code: 'ERROR', message: 'No se pudo conectar', correlation_id: '', timestamp: '' }; this.busy = false; };
    if (this.modo() === 'login') this.auth.login({ user_id: alias, pin: this.pin }).subscribe({ next: done, error: fail });
    else this.auth.registro({ user_id: alias, nombre: this.nombre.trim(), pin: this.pin }).subscribe({ next: done, error: fail });
  }
}
