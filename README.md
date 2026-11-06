# 💵 DOLARA — Tu billetera en dólares

![Billetera Digital USD](https://img.shields.io/badge/Billetera%20Digital%20USD-v3-f59e0b?style=for-the-badge&logo=dollar&logoColor=white)
![USD-only](https://img.shields.io/badge/moneda-USD--only-16a34a?style=for-the-badge)
![API](https://img.shields.io/badge/api-1.0.0-1d4ed8?style=for-the-badge)
![Node](https://img.shields.io/badge/node-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Angular](https://img.shields.io/badge/angular-18-dd0031?style=for-the-badge&logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-estricto-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-16-4169e1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/docker-compose-2496ed?style=for-the-badge&logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/tests-38%2F38-16a34a?style=for-the-badge)
![Académico](https://img.shields.io/badge/uso-acad%C3%A9mico-64748b?style=for-the-badge)

Billetera digital **100 % en dólares**: recargas auditadas con voucher, saldo propio, transferencias idempotentes y tipo de cambio referencial. Dinero como texto `"150.50"`, `NUMERIC(18,2)` y **cero floats**.

> ⚠️ Proyecto académico (sin auth real: acceso demo alias + PIN; JWT real vivirá en el futuro Gateway).

---

## 🚀 Demo en 2 minutos

```powershell
docker compose up -d --build
```

| Pieza | URL |
|-------|-----|
| 📱 SPA Billetera Digital USD | http://localhost:4200/ |
| 🟩 API + Swagger | http://localhost:3001/docs |
| 📥 Contrato OpenAPI YAML | http://localhost:3001/openapi.yaml |
| 🟦 Postgres | `localhost:5434` · BD `depositos_usd` |

**Entra en `/acceso`:** crea tu cuenta (alias + nombre + PIN 4-6) o usa un alias existente. Cada usuario ve **solo** su saldo e historial. Para transferir escribe el **alias** (`maria-02`), no UUIDs.

**Flujo demo coherente:** Recargar `150.50` → voucher `COMPLETADO` → *Abonar a mi billetera* → saldo sube → Transferir por alias.

---

## 🧠 Dos "recargas", dos dominios (C11)

| | 💵 Recarga auditada | 👛 Operar saldo directo |
|---|---|---|
| Endpoint | `POST /api/v1/depositos/usd` | `POST /api/v1/billetera/wallets/:id/depositos` |
| Dinero contra | Dueño **externo** (`BalancePort`; `fake_ledger` en Etapa A) | Tu saldo **propio** (`wallets`) |
| Validación | Cliente/cuenta, estados `PENDIENTE→VALIDADO→COMPLETADO`, voucher `movimiento_saldo_id` | Efecto inmediato + movimiento, sin voucher |
| Mueve `wallets.balance` | ❌ No (se abona con el botón puente) | ✅ Sí |

---

## 🏗️ Arquitectura

```mermaid
flowchart LR
  U[👤 SPA Billetera Digital USD :4200] --> API[🟩 Express :3001<br/>deposits · billetera · fx · /docs]
  API --> DB[(🟦 Postgres 16 :5434)]
  API -.->|Etapa A fakes| FAKE[🎭 A=USD B=Bloq C=PEN<br/>+ wallets registradas]
  API -.->|Etapa B/C HTTP| EXT[🏦 Clientes :3002<br/>Saldos :3003]
  API --> FX[💱 ExchangeRate-API<br/>caché según próxima actualización]
```

* **Sandbox MCP para Agentes (Fase M):** Servidor MCP sidecar (@modelcontextprotocol/sdk) para integración autónoma entre equipos. Ver [onboarding-equipos.md](specs/002-mcp-dolara/contracts/onboarding-equipos.md).

Para usar el sandbox local con Docker Compose, ejecuta en PowerShell:

```powershell
$env:SANDBOX_MODE='true'
docker compose up -d --build ms-depositos-usd mcp-sandbox
```

El transporte MCP SSE queda en `http://localhost:3005/sse`; la API expone `/docs.json`, `/api/v1/sandbox/scenarios` y `/api/v1/sandbox/reset`. El reinicio solo funciona con `SANDBOX_MODE=true` fuera de producción y elimina registros con prefijos `sandbox-` o `test-`. Sin esa variable, el reinicio responde 403.
* **Hexagonal (C9):** `usecases/create-deposit.ts` solo habla con `CustomerAccountPort` / `BalancePort`; `USE_FAKES=false` conecta los MS reales sin tocar el caso de uso.
* **UML completo:** [`docs/arquitectura.puml`](docs/arquitectura.puml) (contenedores + componentes hexagonales — ábrelo con la extensión PlantUML de VS Code o en plantuml.com).
* **Diagramas en imagen (`docs/*.png` + fuente `.svg` editable):** arquitectura (2 niveles) · arquitectura por capas · módulos por RF · estados del depósito · tablas BD (ER + versión simple) · flujo general.
* **Mapa visual 5 min:** [`specs/001-billetera-usd/06_ARQUITECTURA_Y_FLUJOS.md`](specs/001-billetera-usd/06_ARQUITECTURA_Y_FLUJOS.md).

---

## 🧰 Stack

| Capa | Tech |
|------|------|
| Frontend | Angular 18 standalone, CSS propio mobile-first + sidebar desktop ≥960px, `Intl USD`, `es-PE` |
| Backend | Node 20 + Express + TypeScript estricto, zod, `pg`, Swagger (`/docs`), vitest + supertest |
| Datos | PostgreSQL 16 (`NUMERIC(18,2)` dinero, `NUMERIC(12,6)` tasa; `CHECK moneda='USD'`) |
| Infra | Docker Compose, red `wallet-network` |

## 📁 Estructura

```text
backend/src/          # index, db (migraciones v1+v2+v3), money, fx, ports,
                      # domain/, usecases/, adapters/ (fakes|http), routes/
frontend/src/app/     # api.service, auth.service, auth.guard, app.routes,
                      # pages/ (acceso, dashboard, billetera, transferir, depositar, historial, fx)
specs/001-billetera-usd/  # spec v2/v3, plan, tasks, 00 índice, 01–05 SDD, 06 arquitectura visual
docs/                 # openapi.yaml (contrato canónico), demo.md, arquitectura.puml
```

---

## 🔌 Endpoints principales

```text
POST /api/v1/billetera/registro        {user_id, nombre, pin} → 201 | 409 YA_EXISTE
POST /api/v1/billetera/login           {user_id, pin} → 200 | 401 PIN_INCORRECTO | 404
GET  /api/v1/billetera/usuarios/buscar?q=   alias para transferir
GET  /api/v1/billetera/usuarios/:u/wallet   | GET /wallets/:id
POST /api/v1/billetera/wallets/:id/depositos|/retiros   {monto} (422 sin fondos)
POST /api/v1/billetera/transferencias  {origen_id, destino_id|alias, monto} + Idempotency-Key
GET  /api/v1/billetera/wallets/:id/movimientos?page&limit
POST /api/v1/depositos/usd             {cliente_id(= tu alias), monto, metodo_origen} + Idempotency-Key → 201 COMPLETADO
GET  /api/v1/depositos/usd?cliente_id= · GET /api/v1/depositos/usd/:id
GET  /api/v1/fx/tasa?par=USD_PEN|PEN_USD · POST /api/v1/fx/convertir (USD↔PEN e identidades)
GET  /health/live · GET /health/ready
```

Los errores de API usan `{ status, code, message, correlation_id, timestamp }` + `X-Correlation-Id`; `/health/ready` usa su estado operacional.

## ⚙️ Entorno (`backend/.env`, ver `.env.example`)

```ini
PORT=3001
DATABASE_URL=postgres://deposit_usd:deposit_usd@localhost:5434/depositos_usd
CUSTOMER_SERVICE_URL=http://ms-clientes:3002   # Etapa B (hoy: fake)
BALANCE_SERVICE_URL=http://ms-saldos:3003       # Etapa C (hoy: fake)
USE_FAKES=true
HTTP_TIMEOUT_MS=3000
FX_PROVIDER_URL=https://open.er-api.com/v6/latest/USD
FX_API_KEY=                   # opcional; el endpoint abierto no la necesita
FX_TTL_MIN=1440
FX_TIMEOUT_MS=5000
```

## ✅ Tests y reglas de dinero

```powershell
cd backend; npm test    # 37/37 (api + billetera + usecase + fx + domain + money)
cd frontend; npx ng build --configuration production
```

* Montos `NUMERIC(18,2)` como texto, aritmética en centavos (`money.ts`), saldo nunca negativo, `SELECT … FOR UPDATE` con orden fijo, transferencias `422` atómicas, movimientos inmutables (solo `INSERT`).
* Trazabilidad: cada `RF-*` en [`specs/001-billetera-usd/spec.md`](specs/001-billetera-usd/spec.md) tiene task en `tasks.md` y test (C7).

## 📚 Docs

* [`specs/001-billetera-usd/00_INDICE_Y_USO.md`](specs/001-billetera-usd/00_INDICE_Y_USO.md) — puerta de entrada
* [`specs/001-billetera-usd/06_ARQUITECTURA_Y_FLUJOS.md`](specs/001-billetera-usd/06_ARQUITECTURA_Y_FLUJOS.md) — diagramas + 4 flujos + trazabilidad
* [`docs/demo.md`](docs/demo.md) — evidencia E2E · `SDD_COMPLETO…` = histórico v1 congelado (Plan A)
