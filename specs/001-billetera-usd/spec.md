# SPEC 001 v2 — DOLARA · Billetera en Dólares (USD-only)

> Estado: `spec` = QUÉ y POR QUÉ (el CÓMO vive en `plan.md` + `06_ARQUITECTURA_Y_FLUJOS.md`).
> v2 DOLARA (2026-10-09): refactorización masiva a billetera 100% en dólares. Marca frontend **DOLARA**, backend USD-only estricto, aritmética exacta en `money.ts` en todos los flujos.
> Base: diseño del equipo (`01_SDD…05_…` en esta misma carpeta) adaptado a Express + puertos/adaptadores.
> Alcance v2 USD-only: billetera en dólares en todo su esplendor (saldo propio `wallets` + depósitos auditados `depositos_usd` + transferencias + FX referencial). Cero acreditación/debito en otra moneda.

## Changelog v1 → v2

| Cambio | Detalle | Código |
|--------|---------|--------|
| Blindaje USD en BD | `wallets.moneda` + `billetera_movimientos.moneda` `CHAR(3) DEFAULT 'USD' CHECK='USD'` (migración v2) | `backend/src/db.ts` |
| Cero floats | `operar()` y transferencias usan `add/sub/gte` (centavos enteros), antes `Number()+toFixed()` | `backend/src/routes/billetera.ts` |
| Validación moneda | `moneda?: enum(['USD'])` — enviar `PEN` → `400 VALIDATION_ERROR` | `backend/src/validators.ts`, `routes/deposits.ts` |
| FX estricto | `PEN→PEN` → `400`; solo eco `USD→USD`; resto requiere tasa | `backend/src/routes/fx.ts` |
| Marca | Swagger `DOLARA v2`, SPA `DOLARA — Tu billetera en dólares`, `lang es-PE` | `index.ts`, `frontend/src` |
| Frontend banca móvil | Dashboard saldo + bottom-nav 5 tabs + movimientos + formato `Intl USD` | `frontend/src/app` |

---

## 1. Contexto del problema

La clase construye un sistema de pagos por microservicios (Clientes, Depósitos PEN/USD, Retiros PEN/USD, Saldos/Ledger, Gateway). A este equipo le toca **Depósitos USD**: aceptar depósitos solo en dólares, validar cliente/cuenta contra el MS de Clientes, evitar duplicados por idempotencia, pedir el abono al dueño del saldo y exponer trazabilidad completa. Mientras los otros equipos terminan, se desarrolla con fakes tras puertos (C9).

## 2. Supuestos de dominio (fuente explícita)

| ID | Supuesto | Valor / fuente |
|----|----------|----------------|
| S-1 | Moneda | Solo USD estricto v2; `moneda='USD'` con CHECK en `depositos_usd`, `wallets`, `billetera_movimientos`; campo `moneda` opcional en contratos pero si viene debe ser `USD` (PEN → `400`); nunca convertir dentro del depósito/billetera |
| S-2 | Precisión | `NUMERIC(18,2)`, string `"150.50"` en contratos; cero floats — `money.ts toCents/add/sub/gte` obligatorio en billetera (bug bloqueante C2) |
| S-3 | Dueño del saldo | Externo (`BalancePort`); Etapa A = `FakeBalanceAdapter` con ledger local demo |
| S-4 | Clientes/cuentas | Externo (`CustomerAccountPort`); Etapa A = fake (A activo-USD, B bloqueado, C solo-PEN) |
| S-5 | Idempotencia | `Idempotency-Key` obligatoria UNIQUE; misma key + mismo payload → resultado original; distinto payload → `409 IDEMPOTENCY_CONFLICT` |
| S-6 | Estados | `PENDIENTE → VALIDADO → COMPLETADO`, `PENDIENTE/VALIDADO → FALLIDO`; `COMPLETADO` solo con abono confirmado; terminal sin salida |
| S-7 | FX referencial | exchangerate.host `live source=USD quotes.USDPEN`, caché 60 min + fallback `stale`, aporte propio fuera del core; v2: `PEN→PEN` rechazado (`400`), solo display — jamás acredita ni debita |
| S-8 | Auth | JWT en Gateway (futuro); v3 acceso demo local (alias+PIN, sesión `localStorage`, sin auth real) |
| S-9 | Marca v2 | Frontend **DOLARA — Tu billetera en dólares** (`es-PE`, bottom-nav banca móvil, formato `Intl USD`); Swagger `DOLARA v2` |
| S-10 | Sesión demo v3 | Registro/login con alias+nombre+PIN (hash SHA-256, migración v3 `nombre/pin_hash`); cada usuario opera con su `user_id` como `cliente_id` (fake acepta wallets registradas); transferencia por alias con buscador; desktop ≥960px sidebar + grid, móvil tabbar |

## 3. Usuarios objetivo

- **U1** Usuario DOLARA / Frontend: crea billetera USD, recarga, retira, transfiere, consulta saldo/movimientos, ve equivalencia PEN referencial.
- **U2** Otros microservicios: consumen `/api/v1/depositos/usd`, `/api/v1/billetera/*` y (a futuro) eventos `deposit.usd.completed.v1`.
- **U3** Docente: evalúa specs del equipo, tests verdes, Swagger `/docs`, integración por etapas, blindaje USD-only.

## 4. Historias de usuario (Given/When/Then)

### HU-0 — Acceso demo y sesión propia (v3)

> Como usuario, quiero entrar con alias+PIN y ver solo lo mío, sin escribir UUIDs ni IDs ajenos.

- **When** `POST /api/v1/billetera/registro { user_id, nombre, pin }` → `201` billetera USD; duplicado → `409`
- **When** `POST /api/v1/billetera/login { user_id, pin }` → `200` sesión; PIN mal → `401`; inexistente → `404`
- **Then** SPA guarda sesión (`localStorage`); `/inicio /billetera /transferir /depositar /historial` usan la sesión (guard `authGuard`, sin sesión → `/acceso`); transferencia por alias con `GET /usuarios/buscar?q=`; desktop ≥960px sidebar + 2 columnas, móvil bottom-nav.

### HU-1 — Depositar USD

> Como usuario, quiero depositar dólares para que se acrediten en mi cuenta.

- **Given** cliente A activo con cuenta USD activa (fake Etapa A)
- **When** `POST /api/v1/depositos/usd { cliente_id, monto: "150.50", metodo_origen: "TRANSFERENCIA" }` con `Idempotency-Key`
- **Then** `201` con `estado: "COMPLETADO"` + `movimiento_saldo_id`
- **Y** repetir la misma key → mismo cuerpo, un solo abono

### HU-2 — Validaciones que rechazan antes del abono

> Como sistema, quiero rechazar lo inválido sin tocar el saldo.

- **Given** cualquier request
- **When** monto ≤ 0 / cliente inexistente / cuenta bloqueada o solo-PEN / dependencia caída
- **Then** `400` / `404` / `422` / `503` respectivamente, sin llamar al abono (o con `FALLIDO` auditable si el abono falló)

### HU-3 — Consultar operación e historial

> Como usuario, quiero ver mi depósito y mi historial.

- **When** `GET /api/v1/depositos/usd/{id}` → `200` con el modelo completo; inexistente → `404`
- **When** `GET /api/v1/depositos/usd?cliente_id=…&page=1&limit=20` → `200` paginado desc

### HU-4 — Tasa informativa (aporte propio)

> Como usuario, quiero saber a cuántos soles equivale mi depósito.

- **When** `GET /api/v1/fx/tasa?par=USD_PEN` → tasa vigente o `stale`
- **When** `POST /api/v1/fx/convertir { monto, de, a }` → conversión half-up

### HU-5 — Billetera USD: crear y ver saldo (corazón DOLARA, C11)

> Como usuario, quiero una billetera en dólares con saldo para operar todo.

- **When** `POST /api/v1/billetera/wallets { user_id }` → `201` con `balance: "0.00", moneda: "USD"`; duplicado → `409`
- **When** `GET /api/v1/billetera/wallets/:id` → saldo actual + `moneda: "USD"`; inexistente → `404`

### HU-6 — Billetera USD: depósito y retiro

> Como usuario, quiero cargar y retirar dólares de mi billetera.

- **When** `POST …/depositos { monto: "50.00" }` → `201`, saldo suma con aritmética exacta, movimiento `deposito` con `moneda: "USD"`
- **When** `POST …/retiros { monto }` con fondos → `201`; sin fondos → `422` atómico (saldo intacto, sin movimiento)

### HU-7 — Billetera USD: transferencia idempotente

> Como usuario, quiero enviar USD entre billeteras sin doble cobro.

- **Given** A con `100.00`, B con `0.00`
- **When** `POST /api/v1/billetera/transferencias { origen_id, destino_id, monto: "30.00" }` con `Idempotency-Key`
- **Then** A=`70.00`, B=`30.00`, movimientos pareados `transfer_out/in` con `moneda: "USD"`; replay misma key sin segundo débito; sin fondos → `422` atómico

## 5. Requisitos funcionales

| ID | Requisito | Origen |
|----|-----------|--------|
| RF-1 | Crear depósito solo USD con `Idempotency-Key` (estados PENDIENTE→VALIDADO→COMPLETADO/FALLIDO); `moneda=PEN` → `400` | 01 §4 RF-01..RF-09 |
| RF-2 | Validar monto > 0, ≤2 decimales, `metodo_origen` en enum, `moneda` ausente o `USD` | 01 §4 RF-02 |
| RF-3 | Validar cliente/cuenta vía `CustomerAccountPort` (fake Etapa A) | 01 §4 RF-03/RF-04 |
| RF-4 | Idempotencia: replay devuelve original; payload distinto → `409` | 01 §13 |
| RF-5 | Solicitar abono vía `BalancePort` con `deposito_id` como referencia; solo `COMPLETADO` con confirmación | 01 §4 RF-07/RF-08 |
| RF-6 | Consultar depósito por id + historial paginado por `cliente_id` | 01 §4 RF-10/RF-11 |
| RF-7 | `/health/live`, `/health/ready`, Swagger `/docs` (título DOLARA v2) | 01 §4 RF-12 |
| RF-8 | Tasa USD_PEN referencial + conversión (aporte propio, fuera del core); `PEN→PEN` → `400` | S-7 |
| RF-9 | Alta de billetera USD por `user_id` (única) + consulta de saldo, `moneda: "USD"` siempre | HU-5, C11 |
| RF-10 | Depósito/retiro USD con `422` atómico sin fondos + aritmética exacta `money.ts` | HU-6, C11, C2 |
| RF-11 | Transferencia USD atómica con `Idempotency-Key` y movimientos pareados `moneda: "USD"` | HU-7, C11 |
| RF-12 | Historial USD paginado por billetera, inmutable, con `moneda: "USD"` | HU-5, C11 |
| RF-13 | Acceso demo + sesión por usuario (registro/login alias+PIN, buscador alias, transferencia por alias, guard SPA, responsive desktop) | HU-0, S-10 |

## 6. Requisitos no funcionales

| ID | Requisito | Origen |
|----|-----------|--------|
| RNF-1 | TS estricto, REST `/api/v1`, errores `{ status, code, message, correlation_id, timestamp }` | 02 §1, C10 |
| RNF-2 | Timeout 3s a dependencias externas, configurable (`HTTP_TIMEOUT_MS`) | 01 §5 RNF-02 |
| RNF-3 | Observabilidad: `correlation_id` + `deposito_id` en cada log | 01 §16 |
| RNF-4 | FX resiliente: timeout 5s + 1 reintento, caché 60 min, fallback `stale`, `503` sin tasa | plan propio |
| RNF-5 | Key FX solo en backend; resto de secretos por entorno | C3 |
| RNF-6 | Docker reproducible (api 3001 + db), red `wallet-network` lista para integración | 05 §3–§5 |
| RNF-7 | Tests: dominio + caso de uso con mocks + integración PG + idempotencia concurrente | 04 |

## 7. Fuera de alcance (v2 explícito)

- Depósitos/acreditaciones en PEN o cualquier moneda ≠ USD (incluso `PEN→PEN` se rechaza en FX).
- Multi-moneda base: solo USD persiste; PEN solo aparece como equivalencia display o rechazo `422/400`.
- Auth/JWT, Gateway, RabbitMQ/outbox (diseño dejado, no implementado).
- Convertir moneda dentro del depósito/billetera (la FX es solo informativa).
- El módulo billetera USD no integra con Saldos/Clientes en v2 local ni forma parte del contrato de la clase más allá de `depositos_usd` (C11).

## 8. Criterios de aceptación global

- [x] `npm test` verde (32/32: dominio + use-case + integración + FX).
- [x] `/docs` Swagger DOLARA v2 (4 depósitos/billetera + 2 health + 2 FX + 6 billetera).
- [x] Demo: fake-A deposita 150.50 → `COMPLETADO`; replay misma key sin doble abono (ledger fake con 1 fila); cliente C (solo-PEN) → `422`; B bloqueado → `422`; monto 0 → `400`; `{moneda:"PEN"}` → `400`; key distinta payload → `409`.
- [x] `docker compose up --build` levanta api `:3001` + db + web `:4200` (evidencia en `docs/demo.md`).
- [x] Sin `.env` ni key real commiteados (sin git por ahora; `.gitignore` + `.env.example` listos).
- [x] Billetera USD: crear 2 wallets → depositar → transferir con replay sin doble débito → retiro `422` sin fondos → historial con `moneda:"USD"` (T12–T15).
- [x] Blindaje USD-only v2: CHECK `moneda='USD'` en 3 tablas, cero `Number()` en dinero, `PEN→PEN` → `400`.
- [x] Frontend DOLARA banca móvil: dashboard saldo + bottom-nav + formato USD + `es-PE` (build prod OK).

## 9. Riesgos conocidos

- Contratos reales de Clientes/Saldos difieren de los fakes → solo se reescriben adaptadores (C9).
- Saldos aplica el crédito pero responde timeout → `FALLIDO` con referencia re-consultable; el `409` de Saldos se trata idempotentemente.
- Rate limit de la key gratuita de FX → caché + `stale` (no afecta depósitos).
