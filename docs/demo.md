# Demo E2E — DOLARA Billetera USD (evidencia T19, v3)

Fecha: 2026-10-13 · Etapa A (fakes) · `docker compose up -d --build` (api :3001, db :5433, web :4200).

## Suite backend: 37/37 verde

`npm test` en `backend/`: `api.test.ts` (11) + `billetera.test.ts` (5) + `usecase.test.ts` (7) + `fx.test.ts` (4) + `domain.test.ts` (5) + `money.test.ts` (5). Migraciones v1+v2+v3 aplicadas (`moneda='USD'`, `nombre`+`pin_hash`).

## Flujo verificado contra contenedores

1. `GET /health/ready` → `{ status: "ready", db: "up", fakes: true }`.
2. `POST /api/v1/billetera/registro { user_id: "demo-01", nombre: "Demo", pin }` → `201 { balance: "0.00", moneda: "USD" }`; duplicado → `409 YA_EXISTE`.
3. `POST /api/v1/billetera/login` → `200` sesión; PIN mal → `401 PIN_INCORRECTO`.
4. `POST /api/v1/depositos/usd` (cliente `demo-01` — alias registrado, `150.50`, `Idempotency-Key` nueva) → `201 COMPLETADO` + `movimiento_saldo_id: FAKE-…`.
5. Replay misma key → mismo depósito, sin segundo abono (`fake_ledger` con 1 fila por referencia).
6. Cliente C (solo-PEN) → `422 USD_ACCOUNT_NOT_ENABLED`; `{ moneda: "PEN" }` → `400`; `POST /fx/convertir PEN→PEN` → `400`.
7. `POST /api/v1/billetera/wallets/:id/depositos { "50.00" }` → `201 balance: "50.00"` (puente voucher → saldo).
8. `POST /api/v1/billetera/transferencias` por alias + key → saldos pareados; replay → `replay: true` sin doble débito; sin fondos → `422` atómico.
9. `GET /api/v1/billetera/usuarios/buscar?q=demo` → alias sin saldos ni hashes.
10. `GET http://localhost:4200/` → `200` (DOLARA: `/acceso` alias+PIN, dashboard, operar, recarga auditada, transferir por alias, historial propio, FX); `GET /docs/` → `200` (Swagger v2).

Datos `demo-01` de prueba limpiados tras la verificación (`depositos_usd`, `fake_ledger`, `wallets`, movimientos).

## Integración con la clase (pendiente, Etapas B/C)

- `USE_FAKES=false` + `CUSTOMER_SERVICE_URL=http://ms-clientes:3002` + `BALANCE_SERVICE_URL=http://ms-saldos:3003` activan los adaptadores HTTP ya programados; el caso de uso no cambia (C9).
- Red `wallet-network` creada y nombrada según 05 §3; puertos según 05 §4 (api 3001, db host 5433).
- Nota de alcance: el grupo Depósitos es de otro equipo; RF-1..8 se consumen vía fake funcional hasta que publiquen su contrato (ver plan Fase 1 de separación).
