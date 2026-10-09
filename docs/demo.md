# Demo E2E — Depósitos USD (evidencia T11)

Fecha: 2026-10-06 · Etapa A (fakes) · `docker compose up -d --build` (api :3001, db :5433, web :4200).

## Suite backend: 32/32 verde

`npm test` en `backend/`: `api.test.ts` (11) + `usecase.test.ts` (7) + `fx.test.ts` (4) + `domain.test.ts` (5) + `money.test.ts` (5).

## Flujo verificado contra contenedores

1. `GET /health/ready` → `{ status: "ready", db: "up", fakes: true }`.
2. `POST /api/v1/depositos/usd` (cliente A, `150.50`, `Idempotency-Key` nueva) → `201 COMPLETADO` + `movimiento_saldo_id: FAKE-…`.
3. Replay misma key → mismo depósito, sin segundo abono (`fake_ledger` con 1 fila por referencia).
4. Cliente C (solo-PEN) → `422 USD_ACCOUNT_NOT_ENABLED` con `correlation_id` y formato `{ status, code, message, correlation_id, timestamp }`.
5. `GET /api/v1/fx/tasa?par=USD_PEN` → `3.446500` en vivo desde exchangerate.host (`stale: false`).
6. `GET http://localhost:4200/` → `200` (SPA: Depositar / Historial / Tipo de cambio); `GET /docs/` → `200` (Swagger).

## Integración con la clase (pendiente, Etapas B/C)

- `USE_FAKES=false` + `CUSTOMER_SERVICE_URL=http://ms-clientes:3002` + `BALANCE_SERVICE_URL=http://ms-saldos:3003` activan los adaptadores HTTP ya programados.
- Red `wallet-network` creada y nombrada según 05 §3; puertos según 05 §4 (api 3001, db host 5433).
