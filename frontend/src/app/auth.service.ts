import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { ApiService, Wallet } from './api.service';

const KEY = 'dolara_session';

export interface Sesion extends Wallet {}

/** Sesión demo (sin auth real, C3/S-8): alias + PIN, guardada en localStorage. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);
  private _sesion = signal<Sesion | null>(AuthService.leer());

  sesion = this._sesion.asReadonly();
  logueado = computed(() => this._sesion() !== null);

  private static leer(): Sesion | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Sesion) : null;
    } catch {
      return null;
    }
  }

  private guardar(w: Wallet) {
    const s: Sesion = { ...w };
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem('dolara_wallet', w.id); // compat con pantallas antiguas
    this._sesion.set(s);
  }

  registro(cmd: { user_id: string; nombre: string; pin: string }) {
    return this.api.registro(cmd).pipe(tap((w) => this.guardar(w)));
  }

  login(cmd: { user_id: string; pin: string }) {
    return this.api.login(cmd).pipe(tap((w) => this.guardar(w)));
  }

  /** Refresca saldo/nombre desde el backend (tras operar). */
  refrescar() {
    const s = this._sesion();
    if (!s) return;
    this.api.billetera(s.id).subscribe({ next: (w) => this.guardar(w), error: () => undefined });
  }

  salir() {
    localStorage.removeItem(KEY);
    localStorage.removeItem('dolara_wallet');
    this._sesion.set(null);
    this.router.navigateByUrl('/acceso');
  }
}
