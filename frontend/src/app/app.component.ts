import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { NgIf } from '@angular/common';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIf],
  template: `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-row">
          <div class="brand-mark">$</div>
          <div class="brand-name">DOLARA<small>Tu billetera en dólares · USD-only</small></div>
          <span class="topbar-badge">USD ● $</span>
          <span class="topbar-user" *ngIf="auth.sesion() as s">{{ s.nombre || s.user_id }}</span>
          <button class="eye-btn" *ngIf="auth.logueado()" (click)="auth.salir()">Salir</button>
        </div>
      </header>
      <div class="app-body" [class.with-sidebar]="auth.logueado()">
        <aside class="sidebar" *ngIf="auth.logueado()">
          <nav aria-label="Navegación escritorio">
            <a routerLink="/inicio" routerLinkActive="active"><span class="ic">🏠</span>Inicio</a>
            <a routerLink="/billetera" routerLinkActive="active"><span class="ic">👛</span>Billetera</a>
            <a routerLink="/depositar" routerLinkActive="active"><span class="ic">💵</span>Recargar</a>
            <a routerLink="/transferir" routerLinkActive="active"><span class="ic">🔀</span>Transferir</a>
            <a routerLink="/historial" routerLinkActive="active"><span class="ic">🧾</span>Movimientos</a>
            <a routerLink="/fx" routerLinkActive="active"><span class="ic">💱</span>T. cambio</a>
          </nav>
          <div class="sidebar-card" *ngIf="auth.sesion() as s">
            <b>{{ apiNombre(s) }}</b><br /><small class="mono">&#64;{{ s.user_id }} · USD</small>
          </div>
        </aside>
        <main class="app-main"><router-outlet /></main>
      </div>
      <nav class="tabbar" *ngIf="auth.logueado()" aria-label="Navegación principal">
        <div class="tabbar-inner">
          <a routerLink="/inicio" routerLinkActive="active"><span class="ic">🏠</span>Inicio</a>
          <a routerLink="/billetera" routerLinkActive="active"><span class="ic">👛</span>Billetera</a>
          <a routerLink="/depositar" routerLinkActive="active"><span class="ic">💵</span>Recargar</a>
          <a routerLink="/historial" routerLinkActive="active"><span class="ic">🧾</span>Movimientos</a>
          <a routerLink="/fx" routerLinkActive="active"><span class="ic">💱</span>T. cambio</a>
        </div>
      </nav>
    </div>
  `,
})
export class AppComponent {
  auth = inject(AuthService);
  title = 'DOLARA — Billetera en Dólares';
  apiNombre(s: { nombre: string | null; user_id: string }) {
    return s.nombre || s.user_id;
  }
}
