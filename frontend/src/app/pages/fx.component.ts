import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { ApiService } from '../api.service';

@Component({
  selector: 'app-fx',
  standalone: true,
  imports: [FormsModule, NgIf],
  template: `
    <div class="card">
      <h2>💱 Tipo de cambio <small class="hint">referencial</small></h2>
      <p class="hint">Solo informativo. Tu saldo siempre se guarda en <b>USD</b>, nunca se convierte ni se acredita en PEN.</p>
      <p *ngIf="t">USD → PEN: <span class="tasa-big">S/ {{ t.tasa }}</span> <span *ngIf="t.stale" class="stale-flag">(caché, última conocida)</span></p>
      <div *ngIf="!t" class="skel" style="height:36px"></div>
      <form (ngSubmit)="convertir()">
        <label>Monto <input [(ngModel)]="monto" name="monto" inputmode="decimal" /></label>
        <label>Dirección
          <select [(ngModel)]="dir" name="dir">
            <option value="USD_PEN">USD → PEN (cuánto me dan)</option>
            <option value="PEN_USD">PEN → USD (cuántos compro)</option>
          </select>
        </label>
        <button class="btn" type="submit">Calcular equivalencia</button>
      </form>
      <div *ngIf="res" class="fx-equiv">💵 <b>{{ api.usd(res.monto_origen) }}</b> ≈ <b>{{ res.monto_convertido }} {{ dir === 'USD_PEN' ? 'PEN' : 'USD' }}</b> <span class="mono">(tasa {{ res.tasa }})</span></div>
      <div *ngIf="err" class="err"><b>{{ err }}</b></div>
    </div>
  `,
})
export class FxComponent implements OnInit {
  api = inject(ApiService);
  t: { tasa: string; stale: boolean } | null = null;
  monto = '100.00';
  dir: 'USD_PEN' | 'PEN_USD' = 'USD_PEN';
  res: { monto_origen: string; monto_convertido: string; tasa: string } | null = null;
  err: string | null = null;

  ngOnInit() {
    this.api.tasa().subscribe({ next: (t) => (this.t = t), error: () => (this.err = 'Sin tasa disponible') });
  }

  convertir() {
    this.err = null;
    const de = this.dir === 'USD_PEN' ? 'USD' : 'PEN';
    const a = this.dir === 'USD_PEN' ? 'PEN' : 'USD';
    this.api.convertir(this.monto, de as 'USD', a as 'PEN').subscribe({
      next: (r) => (this.res = r),
      error: (e) => (this.err = e.error?.message || 'No se pudo convertir'),
    });
  }
}
