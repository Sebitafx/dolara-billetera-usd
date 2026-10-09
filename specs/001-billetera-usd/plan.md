# PLAN 001 — Cómo se implementa Depósitos USD (Express + puertos/adaptadores)

> Lee primero `../constitution.md`, `spec.md` y los docs del equipo (`01`–`05`, `02` manda en contratos).
> Stack: Node 24 + TypeScript estricto + **Express** (decisión del equipo: sin NestJS) + PostgreSQL 16 + vitest/supertest + Angular 18 + Docker.

---

## 1. Stack y constantes

```ini
# backend/.env (NO versionado; ver .env.example)
PORT=3001
DATABASE_URL=postgres://deposit_usd:deposit_usd@db:5432/depositos_usd
CUSTOMER_SERVICE_URL=http://ms-clientes:3002   # Etapa B (ahora: fake)
BALANCE_SERVICE_URL=http://ms-saldos:3003       # Etapa C (ahora: fake)
USE_FAKES=true
HTTP_TIMEOUT_MS=3000
FX_API_KEY=<key exchangerate.host del equipo>
FX_TTL_MIN=60
FX_TIMEOUT_MS=5000
```

Puertos de clase (05 §4): api **3001**, Gateway 8080, Clientes 3002, Saldos 3003; Postgres host **5433**.

## 2. Estructura de carpetas objetivo

```text
backend/src/
├── index.ts                 # bootstrap + /health/live + /health/ready + /docs
├── db.ts                    # pool pg + migraciones (depositos_usd, fake_ledger, fx_rates)
├── errors.ts                # { status, code, message, correlation_id, timestamp } + X-Correlation-Id
├── validators.ts            # zod: monto, metodo_origen, paginación
├── money.ts                 # NUMERIC como string, half-up (reuso)
├── fx.ts                    # exchangerate.host + caché (reuso)
├── domain/deposit.ts        # entidad + máquina de estados + MoneyUsd VO
├── ports.ts                 # CustomerAccountPort, BalancePort (01 §12)
├── adapters/fakes.ts        # FakeCustomerAccountAdapter + FakeBalanceAdapter (03 Fase 7/8)
├── adapters/http.ts         # CustomerAccountHttpAdapter + BalanceHttpAdapter (Etapa B/C, stub con env URL)
├── usecases/create-deposit.ts  # algoritmo 01 §9.2 (1-15)
└── routes/
    ├── deposits.ts          # POST/GET /api/v1/depositos/usd (RF-1..RF-6)
    ├── health.ts            # /health/live + /health/ready (RF-7)
    └── fx.ts                # /api/v1/fx/tasa + /convertir (RF-8)
```

## 3. Modelo de datos

```sql
CREATE TABLE depositos_usd (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id TEXT NOT NULL,
  cuenta_destino_id TEXT,
  monto NUMERIC(18,2) NOT NULL CHECK (monto > 0),
  moneda CHAR(3) NOT NULL DEFAULT 'USD' CHECK (moneda = 'USD'),
  metodo_origen TEXT NOT NULL CHECK (metodo_origen IN ('EFECTIVO','TRANSFERENCIA','TARJETA','OTRO')),
  referencia_externa TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,               -- para 409 si misma key + distinto payload (01 §13.3)
  estado TEXT NOT NULL CHECK (estado IN ('PENDIENTE','VALIDADO','COMPLETADO','FALLIDO')),
  movimiento_saldo_id TEXT,
  failure_code TEXT, failure_detail TEXT,
  creado_en TIMESTAMPTZ DEFAULT now(), actualizado_en TIMESTAMPTZ DEFAULT now(),
  completado_en TIMESTAMPTZ
);
CREATE INDEX ON depositos_usd(cliente_id, creado_en DESC);
-- Ledger SOLO del fake (Etapa A, se desecha al integrar Saldos real):
CREATE TABLE fake_ledger (
  referencia TEXT PRIMARY KEY,              -- = deposito_id (idempotencia lado saldo)
  cliente_id TEXT NOT NULL, monto NUMERIC(18,2) NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now()
);
-- fx_rates igual que antes: (par PK, tasa NUMERIC(12,6), fuente, fetched_at)

-- Módulo billetera local (C11): tablas SEPARADAS del core, sin FKs cruzadas.
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  balance NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  creado_en TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE billetera_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('deposito','retiro','transfer_in','transfer_out')),
  monto NUMERIC(18,2) NOT NULL CHECK (monto > 0),
  saldo_resultante NUMERIC(18,2) NOT NULL,
  referencia UUID,                            -- parea transfer_in/out
  idempotency_key TEXT UNIQUE,                -- solo transferencias
  creado_en TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON billetera_movimientos(wallet_id, creado_en DESC);
```

## 4. Contratos de API (manda `02_CONTRATOS_API_E_INTEGRACION.md`; aquí el resumen)

- `POST /api/v1/depositos/usd` + `Idempotency-Key` (+ `X-Correlation-Id` opcional) → `201 { deposito_id, cliente_id, monto, moneda:"USD", estado:"COMPLETADO", movimiento_saldo_id, creado_en, completado_en }`; errores 02 §2 (VALIDATION_ERROR/INVALID_AMOUNT 400, CUSTOMER_NOT_FOUND 404, CUSTOMER_BLOCKED / USD_ACCOUNT_NOT_ENABLED 422, IDEMPOTENCY_CONFLICT 409, *_UNAVAILABLE 503).
- `GET /api/v1/depositos/usd/{id}` → `200` modelo / `404`.
- `GET /api/v1/depositos/usd?cliente_id=&page=&limit=` → `200 { items, page, limit, total }`.
- `GET /health/live` → `{ status:"alive" }`; `GET /health/ready` → `{ status, db, fakes }` (ready NO exige MS externos, 01 Fase 11).
- `GET /docs` Swagger. Extra propio: `GET /api/v1/fx/tasa?par=USD_PEN`, `POST /api/v1/fx/convertir`.

## 4.11–4.16 Módulo billetera local (C11, RF-9…RF-12; montos string, errores C10)

- `POST /api/v1/billetera/wallets { user_id }` → `201 { id, user_id, balance:"0.00" }`; duplicado → `409 YA_EXISTE`.
- `GET /api/v1/billetera/wallets/:id` → `200 { id, user_id, balance }`; inexistente → `404 NO_ENCONTRADA`.
- `POST /api/v1/billetera/wallets/:id/depositos { monto }` → `201 { movimiento_id, balance }`; monto inválido → `400 MONTO_INVALIDO`.
- `POST /api/v1/billetera/wallets/:id/retiros { monto }` → `201`; sin fondos → `422 FONDOS_INSUFICIENTES` atómico.
- `POST /api/v1/billetera/transferencias { origen_id, destino_id, monto }` + `Idempotency-Key` → `201 { referencia, origen_balance, destino_balance, replay:false }`; replay → mismo cuerpo `replay:true`; sin key → `400 SIN_IDEMPOTENCIA`; misma wallet → `400`; sin fondos → `422` atómico. Locks `FOR UPDATE` ordenados por id asc (anti-deadlock).
- `GET /api/v1/billetera/wallets/:id/movimientos?page&limit` → `200 { items, page, limit, total }` desc, inmutable.

## 5. create-deposit use-case (01 §9.2 en Express)

1. zod request → 2. normalizar monto string 2dec → 3. `monto>0` → 4. moneda forzada USD → 5. buscar `idempotency_key`: existe + `payload_hash` igual → devolver original (200); distinto → `409` → 6. `CustomerAccountPort.validateUsdDestination` → reglas 02 §5 → 7. `INSERT PENDIENTE` → 8. `UPDATE VALIDADO` → 9. `BalancePort.credit({…, referenceId: deposito_id})` (timeout 3s, reintentos solo transitorios) → 10a. OK → `COMPLETADO` + `movimiento_saldo_id`, `201` / 10b. fallo → `FALLIDO` + `failure_code`, `503`.

## 6. Fakes Etapa A (03 Fase 7/8)

- `FakeCustomerAccountAdapter`: A→`ACTIVE/ACTIVE/[USD]`; B→`BLOCKED`; C→`ACTIVE/ACTIVE/[PEN]`; resto→`NOT_FOUND`.
- `FakeBalanceAdapter`: `INSERT INTO fake_ledger(referencia=deposito_id…)`; si referencia existe → `{ success:true, movementId: 'FAKE-'+ref }` (idempotente lado saldo); flag `FAIL_NEXT` por env para simular caída en tests E2E.
- `USE_FAKES=true` selecciona fakes; `CustomerAccountHttpAdapter`/`BalanceHttpAdapter` ya programados contra env URLs para Etapa B/C.

## 7. Testing (04 adaptado)

| Archivo | Cubre |
|---------|-------|
| `tests/domain.test.ts` | MoneyUsd (UT-01..UT-04), transiciones (UT-05..UT-07) |
| `tests/usecase.test.ts` | UC-01..UC-06 con puertos mockeados |
| `tests/api.test.ts` | E2E-01..E2E-03: 201→COMPLETADO, replay sin doble fila, Saldos caído→503+FALLIDO; + 14 negativas clave (04 §10) |
| `tests/fx.test.ts` | caché/stale/503 (reuso) |

## 8. Decisiones descartadas

| Decisión | Por qué no |
|----------|------------|
| NestJS | Equipo eligió Express; puertos/adaptadores dan el desacoplamiento sin reescritura |
| Saldo propio (wallets/transfers v1 anterior) | El saldo lo posee otro MS; chocaría en integración (05 §9) |
| Outbox/RabbitMQ en v1 | Opcional del equipo; diseño reservado, no implementado |
| `ready` exigiendo MS externos | Cascadas de indisponibilidad (01 Fase 11); ready = proceso + PG + config |
| Mezclar billetera local con core depósitos | C11: tablas y rutas separadas; el core de la clase no se contamina |
