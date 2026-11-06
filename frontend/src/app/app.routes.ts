import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { AccesoComponent } from './pages/acceso.component';
import { DashboardComponent } from './pages/dashboard.component';
import { BilleteraComponent } from './pages/billetera.component';
import { TransferirComponent } from './pages/transferir.component';
import { DepositarComponent } from './pages/depositar.component';
import { HistorialComponent } from './pages/historial.component';
import { FxComponent } from './pages/fx.component';

export const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },
  { path: 'acceso', component: AccesoComponent, title: 'Billetera Digital USD · Acceso demo' },
  { path: 'inicio', component: DashboardComponent, canActivate: [authGuard], title: 'Billetera Digital USD · Inicio' },
  { path: 'billetera', component: BilleteraComponent, canActivate: [authGuard], title: 'Billetera Digital USD · Mi billetera' },
  { path: 'transferir', component: TransferirComponent, canActivate: [authGuard], title: 'Billetera Digital USD · Transferir' },
  { path: 'depositar', component: DepositarComponent, canActivate: [authGuard], title: 'Billetera Digital USD · Recargar USD' },
  { path: 'historial', component: HistorialComponent, canActivate: [authGuard], title: 'Billetera Digital USD · Movimientos' },
  { path: 'fx', component: FxComponent, canActivate: [authGuard], title: 'Billetera Digital USD · Tipo de cambio' },
  { path: '**', redirectTo: 'inicio' },
];
