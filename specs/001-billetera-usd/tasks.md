# TASKS 001 v2 — DOLARA Billetera USD-only (verificable)

> Reglas: referencia `RF-*` · orden estricto, no saltar sin test verde (C6) · `[x]` solo con evidencia.
> v2 2026-10-09: T12–T15 completadas + blindaje USD-only + frontend DOLARA banca móvil.

> Reglas: referencia `RF-*` · orden estricto, no saltar sin test verde (C6) · `[x]` solo con evidencia.

---

## Fase A — Dominio y base (Etapa A aislada)

- [x] **T1** Scaffold Express TS + `domain/deposit.ts` (MoneyUsd + estados) `RF-1, RF-2`
  - Aceptación: `npm run build` ok; transiciones válidas/inválidas según 01 §8.2
  - Test: `tests/domain.test.ts :: UT-01..UT-07`
- [x] **T2** Migraciones `depositos_usd` + `fake_ledger` + `fx_rates` `C4`
  - Aceptación: BD limpia migra; `UNIQUE(idempotency_key)`; `CHECK moneda='USD'`
  - Test: `tests/api.test.ts :: migraciones_restricciones`
- [x] **T3** Errores `{ status, code, message, correlation_id, timestamp }` + `X-Correlation-Id` + `/health/live|/ready` + `/docs` `RF-7, RNF-1, RNF-3`
  - Aceptación: error 404 trae `correlation_id`; ready informa `db` y `fakes`
  - Test: `tests/api.test.ts :: errores_formato + health_live_ready + docs_200`

## Fase B — Puertos y fakes

- [x] **T4** `ports.ts` + `adapters/fakes.ts` (clientes A/B/C + balance con ledger) `RF-3, RF-5`
  - Aceptación: fake-A valida USD; fake-B bloqueado; fake-C solo-PEN; doble `credit` misma referencia = 1 fila
  - Test: `tests/usecase.test.ts :: fakes_*`
- [x] **T5** `adapters/http.ts` (stubs contra `CUSTOMER_SERVICE_URL`/`BALANCE_SERVICE_URL`, timeout 3s) `RNF-2`
  - Aceptación: compilan y traducen 404/5xx/timeout a códigos 02 §2; sin uso con `USE_FAKES=true`
  - Test: `tests/usecase.test.ts :: http_adapter_traduce` (mock fetch)

## Fase C — Caso de uso + API (core)

- [x] **T6** `usecases/create-deposit.ts` (algoritmo plan §5) `RF-1..RF-5`
  - Aceptación: UC-01..UC-06 con puertos mock (04 §4)
  - Test: `tests/usecase.test.ts :: UC-01..UC-06`
- [x] **T7** `POST /api/v1/depositos/usd` + idempotencia (`409` payload distinto) `RF-1, RF-4, HU-1`
  - Aceptación: E2E-01 `201 COMPLETADO`; replay → original sin 2º abono; conflicto → `409 IDEMPOTENCY_CONFLICT`
  - Test: `tests/api.test.ts :: deposito_201 + replay_sin_doble_abono + conflicto_409`
- [x] **T8** Validaciones y fallos: `GET by id`, historial, negativas `RF-2, RF-3, RF-6, HU-2, HU-3`
  - Aceptación: monto 0/negativo→`400`; cliente inexistente→`404`; B/C→`422`; fake-saldo caído→`503`+`FALLIDO`; historial paginado
  - Test: `tests/api.test.ts :: negativas_* + get_by_id + historial_paginado`

## Fase D — FX aporte propio

- [x] **T9** `GET /api/v1/fx/tasa` + `POST /api/v1/fx/convertir` (reuso fx.ts/money.ts) `RF-8, HU-4`
  - Aceptación: tasa mockeada 3.5; `100 USD→350.00 PEN`; caché/stale/503
  - Test: `tests/fx.test.ts` + `tests/api.test.ts :: fx_*`

## Fase E — Frontend + demo

- [x] **T10** SPA Angular: Depositar, Consultar/Historial, FX + servicios + proxy `:3001`
  - Aceptación: deposita con `Idempotency-Key` uuid por envío; muestra `correlation_id` en errores
  - Test: manual guiado + `web :4200` en compose
- [x] **T11** Demo E2E + `docs/demo.md` (evidencia docente)
  - Aceptación: suite verde + compose + flujo HU-1→HU-4 con capturas
  - Test: suite completa verde

---

## Fase F — Módulo billetera USD (C11, HU-5…HU-7) — ✅ completada v2

- [x] **T12** Migraciones `wallets` + `billetera_movimientos` con `moneda='USD'` CHECK + UNIQUEs `RF-9`
  - Aceptación: BD limpia migra v1+v2; `balance >= 0`; `moneda='USD'` en 3 tablas; `user_id` única; `idempotency_key` única
  - Test: `tests/billetera.test.ts :: migraciones_restricciones` + `backend/src/db.ts` v2
- [x] **T13** CRUD wallet + depósito/retiro USD con aritmética exacta `RF-9, RF-10, HU-5, HU-6`
  - Aceptación: crear → `201 {"0.00","USD"}`; duplicado → `409`; depósito suma + movimiento `moneda USD`; retiro sin fondos → `422` sin cambios; cero `Number()` (usa `add/sub/gte`)
  - Test: `tests/billetera.test.ts :: wallet_crud + deposito_201 + retiro_422_atomico`
- [x] **T14** Transferencia USD atómica + idempotencia `RF-11, HU-7`
  - Aceptación: A=100,B=0,monto=30 → A=70,B=30 par in/out `moneda USD`; replay sin 2º débito; sin fondos → `422` nada cambia; sin key → `400`
  - Test: `tests/billetera.test.ts :: transferencia_201 + replay + transferencia_422`
- [x] **T15** Historial USD + SPA DOLARA billetera + demo `RF-12`
  - Aceptación: historial paginado desc con `moneda:"USD"`; SPA `/billetera /transferir /inicio` opera contra `:3001`; `docs/demo.md` ampliado
  - Test: `tests/billetera.test.ts :: historial_paginado` + `ng build production OK`

---

## Fase G — Blindaje USD-only + DOLARA banca móvil (v2, 2026-10-09)

- [x] **T16** Blindaje USD-only estricto `RF-1, RF-2, RF-8, RF-10`
  - Aceptación: `{moneda:"PEN"}` en depósito → `400`; `POST /fx/convertir PEN→PEN` → `400`; `wallets/billetera_movimientos` con CHECK USD; grep `Number(balance)` en `billetera.ts` = 0
  - Test: manual `curl` + `tsc --noEmit OK` + unit `money/domain 10/10`
- [x] **T17** Frontend DOLARA estilo banca móvil (BCP-like, identidad propia) `HU-5…HU-7, RNF-1`
  - Aceptación: marca DOLARA + `es-PE` + bottom-nav 5 tabs + hero saldo + quick-grid + `Intl USD` + `ng build OK` (311kB main)
  - Test: build prod + navegación `/inicio /billetera /transferir /depositar /historial /fx`
- [x] **T18** Docs arquitectura visual + flujos `C5, C7`
  - Aceptación: `06_ARQUITECTURA_Y_FLUJOS.md` con diagramas + 4 flujos + esquema BD + matriz RF↔tests; `00_INDICE` actualizado
  - Test: lectura docente 5 min entiende el sistema

---

## Fase H — Acceso demo + sesión por usuario + desktop full-width (v3, 2026-10-09)

- [x] **T19** Registro/login demo + historial propio + layout desktop `RF-13, HU-0`
  - Aceptación: `/acceso` alias+nombre+PIN; guard `authGuard`; sin escribir UUID/cliente (sesión); transferencia por alias con buscador; desktop ≥960px sidebar + grid 2 col + tabbar solo móvil; suite 37/37 + `ng build OK`
  - Test: suite completa verde + migración v3 + `tsc --noEmit OK`

---

## Matriz trazabilidad

| Task | RF | Tests |
|------|----|-------|
| T1 | RF-1, RF-2 | domain.test UT-* |
| T2 | (C4) | api.test migraciones |
| T3 | RF-7 | api.test errores/health/docs |
| T4–T5 | RF-3, RF-5 | usecase.test fakes/http |
| T6–T8 | RF-1..RF-6 | usecase UC-*, api.test E2E/negativas |
| T9 | RF-8 | fx.test, api.test fx_* |
| T10–T11 | todos | suite + demo |
| T12–T15 | RF-9..RF-12 | billetera.test + SPA DOLARA + demo |
| T16 | RF-1, RF-2, RF-8, RF-10 | tsc + unit + curl PEN→400 |
| T17 | HU-5…HU-7, RNF-1 | ng build + navegación 6 rutas |
| T18 | (C5, C7) | 06_ARQUITECTURA_Y_FLUJOS.md |
| T19 | RF-13, HU-0 | suite 37/37 + migración v3 + ng build + guard sesión |

Siguiente paso: Etapa B/C integración real (solo adaptadores, C9) + auth JWT en Gateway.
