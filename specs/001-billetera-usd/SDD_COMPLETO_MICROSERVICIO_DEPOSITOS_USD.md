# SDD Completo — Microservicio de Depósitos USD [HISTÓRICO v1 CONGELADO — NO EDITAR]

> ⚠️ PLAN A: documento congelado en v1 (NestJS propuesto, previo a DOLARA). Se conserva solo como evidencia histórica.
> Fuente vigente: `spec.md v2` + `06_ARQUITECTURA_Y_FLUJOS.md` + `00_INDICE_Y_USO.md`.
> No regenerar ni usar como referencia de implementación. Última compilación v1: 01+02+03+04+05.

> Documento consolidado. Incluye diseño, contratos, implementación, pruebas e integración.


---

<!-- Fuente interna: 01_SDD_MICROSERVICIO_DEPOSITOS_USD.md -->

# Software Design Document (SDD)
## Microservicio de Depósitos USD

**Proyecto:** Billetera / Plataforma de microservicios financieros  
**Microservicio:** Depósitos en dólares estadounidenses (USD)  
**Versión del documento:** 1.0.0  
**Estado:** Propuesto para implementación  
**Arquitectura:** Microservicios + Arquitectura Hexagonal / Clean Architecture  
**Lenguaje:** TypeScript  
**Runtime:** Node.js 24 LTS  
**Framework:** NestJS  
**Base de datos:** PostgreSQL 16+  
**Contenedorización:** Docker / Docker Compose  
**Contrato:** REST/JSON + OpenAPI 3.x  
**Integración asíncrona opcional:** RabbitMQ mediante patrón Outbox

---

## 1. Propósito

Este documento especifica cómo diseñar, construir, probar, desplegar e integrar el **Microservicio de Depósitos USD** dentro de un sistema distribuido donde otros equipos desarrollan, de manera independiente, servicios como:

- Clientes.
- Depósitos PEN.
- Retiros PEN.
- Retiros USD.
- Cuentas / Saldos / Ledger, si existe como servicio independiente.
- API Gateway / Frontend, si forma parte de la arquitectura final.

El objetivo del microservicio es aceptar depósitos exclusivamente en **USD**, validar que el cliente y la cuenta destino sean aptos para recibir dólares, registrar la operación de forma segura, solicitar la acreditación del saldo al componente que sea dueño del balance y mantener trazabilidad completa de la transacción.

---

## 2. Alcance

### 2.1 Incluido

El microservicio será responsable de:

1. Recibir solicitudes de depósito USD.
2. Validar formato, monto y reglas de negocio.
3. Validar cliente y cuenta USD mediante otro microservicio.
4. Evitar depósitos duplicados mediante idempotencia.
5. Crear y persistir el registro de la transacción.
6. Solicitar el abono al servicio dueño del saldo.
7. Actualizar el estado final de la transacción.
8. Consultar una transacción por ID.
9. Consultar historial paginado por cliente.
10. Exponer health checks.
11. Registrar logs y métricas operativas.
12. Publicar eventos de dominio si la integración asíncrona se habilita.

### 2.2 Fuera de alcance

Este microservicio **no** debe:

- Crear o editar clientes.
- Autenticar usuarios directamente si existe Gateway/Auth.
- Gestionar depósitos PEN.
- Gestionar retiros PEN o USD.
- Convertir PEN a USD o USD a PEN.
- Modificar directamente la base de datos de otro microservicio.
- Ser la fuente de verdad del saldo si existe un servicio especializado de cuentas/saldos/ledger.

---

## 3. Principios de diseño

1. **Un microservicio, una responsabilidad principal.**
2. **Base de datos propia.** Ningún otro servicio accede directamente a sus tablas.
3. **Contratos explícitos.** La integración se realiza mediante APIs o eventos versionados.
4. **USD es una regla del dominio.** Nunca debe aceptarse una moneda distinta.
5. **Idempotencia obligatoria.** Repetir la misma solicitud no puede duplicar el depósito.
6. **Dinero sin punto flotante.** Internamente se usa `NUMERIC/DECIMAL`, nunca `float` o `double` para cálculos monetarios.
7. **Dependencias externas desacopladas.** Clientes y Saldos se consumen mediante puertos/adaptadores.
8. **Fallo explícito.** Un timeout no se convierte silenciosamente en éxito.
9. **Observabilidad desde el inicio.** Toda operación usa `correlation_id` y `transaction_id`.
10. **Integración progresiva.** El servicio debe poder desarrollarse con mocks aunque los demás equipos aún no hayan terminado.

---

## 4. Requisitos funcionales

| ID | Requisito |
|---|---|
| RF-01 | Crear un depósito únicamente en USD. |
| RF-02 | Validar que el monto sea mayor que 0.00. |
| RF-03 | Validar que el cliente exista y esté activo. |
| RF-04 | Validar que la cuenta destino soporte USD y esté activa. |
| RF-05 | Registrar toda solicitud aceptada en la base propia. |
| RF-06 | Evitar duplicados con `Idempotency-Key`. |
| RF-07 | Solicitar el abono al dueño del saldo. |
| RF-08 | Marcar la operación como `COMPLETADO` únicamente cuando el abono sea confirmado. |
| RF-09 | Marcar fallos externos con estado y motivo auditable. |
| RF-10 | Consultar el depósito por `deposito_id`. |
| RF-11 | Consultar historial por `cliente_id`. |
| RF-12 | Exponer `/health/live` y `/health/ready`. |

---

## 5. Requisitos no funcionales

| ID | Requisito | Meta inicial |
|---|---|---|
| RNF-01 | Disponibilidad | El proceso no debe bloquear indefinidamente por dependencias externas. |
| RNF-02 | Timeout HTTP | 3 s por llamada externa, configurable. |
| RNF-03 | Idempotencia | 100 % de duplicados con misma clave deben reutilizar el resultado original. |
| RNF-04 | Persistencia | PostgreSQL con restricciones e índices. |
| RNF-05 | Seguridad | JWT validado en Gateway o en el servicio; secretos solo por variables de entorno. |
| RNF-06 | Trazabilidad | `correlation_id`, `deposito_id` e `idempotency_key` en logs. |
| RNF-07 | Documentación | OpenAPI/Swagger disponible en entorno de desarrollo. |
| RNF-08 | Portabilidad | Ejecución local y conjunta mediante Docker. |
| RNF-09 | Testabilidad | Clientes externos sustituibles por mocks. |
| RNF-10 | Evolución | Contratos versionados bajo `/api/v1`. |

---

## 6. Arquitectura lógica

```mermaid
flowchart LR
    FE[Frontend / Cliente API] --> GW[API Gateway]
    GW --> DEP[MS Depósitos USD]
    DEP --> DB[(PostgreSQL Depósitos USD)]
    DEP --> CLI[MS Clientes / Cuentas]
    DEP --> BAL[MS Saldos / Ledger]
    DEP --> OUT[(Outbox Events)]
    OUT -. opcional .-> MQ[RabbitMQ]
    MQ -. eventos .-> CONS[Otros Microservicios]
```

### 6.1 Regla de propiedad del saldo

El microservicio de Depósitos USD **no debe asumir** que el microservicio Clientes será necesariamente dueño del saldo. Por ello se define el puerto lógico `BalancePort`.

- Si existe `ms-saldos` o `ms-ledger`, el adaptador HTTP apunta a ese servicio.
- Si la arquitectura final decide que `ms-clientes` administra cuentas y saldos, solo se cambia el adaptador/configuración.
- El caso de uso `CreateUsdDepositUseCase` no debe cambiar.

Esto permite integrar el trabajo de equipos independientes al final sin acoplar el dominio a una URL concreta.

---

## 7. Arquitectura interna

Se usará una variante de **Arquitectura Hexagonal / Clean Architecture**.

```text
src/
├── domain/
│   ├── entities/
│   │   └── deposit.entity.ts
│   ├── value-objects/
│   │   ├── money-usd.vo.ts
│   │   └── deposit-status.vo.ts
│   └── errors/
├── application/
│   ├── use-cases/
│   │   ├── create-usd-deposit.use-case.ts
│   │   ├── get-deposit.use-case.ts
│   │   └── list-client-deposits.use-case.ts
│   ├── dto/
│   └── ports/
│       ├── deposit-repository.port.ts
│       ├── customer-account.port.ts
│       ├── balance.port.ts
│       └── event-publisher.port.ts
├── infrastructure/
│   ├── persistence/
│   ├── http/
│   │   ├── customer-account-http.adapter.ts
│   │   └── balance-http.adapter.ts
│   ├── messaging/
│   ├── config/
│   └── observability/
├── interfaces/
│   └── http/
│       ├── deposits.controller.ts
│       ├── health.controller.ts
│       └── filters/
├── app.module.ts
└── main.ts
```

### 7.1 Responsabilidades por capa

**Domain** contiene reglas puras: dinero USD, estados permitidos, invariantes y errores de negocio. No conoce HTTP, PostgreSQL, NestJS ni RabbitMQ.

**Application** contiene los casos de uso y define puertos que necesita para ejecutar el negocio.

**Infrastructure** implementa los puertos: PostgreSQL, llamadas HTTP y mensajería.

**Interfaces** expone REST y transforma HTTP hacia los casos de uso.

---

## 8. Modelo de dominio

### 8.1 Entidad Deposit

Campos mínimos:

| Campo | Tipo lógico | Regla |
|---|---|---|
| `id` | UUID | Generado por el servicio. |
| `cliente_id` | UUID | Obligatorio. |
| `cuenta_destino_id` | UUID | Obligatorio si existe concepto de cuenta. |
| `amount` | Decimal(18,2) | `> 0`. |
| `currency` | string | Siempre `USD`. |
| `source_method` | enum | `EFECTIVO`, `TRANSFERENCIA`, `TARJETA`, `OTRO`. |
| `external_reference` | string nullable | Referencia del origen. |
| `idempotency_key` | UUID/string | Único. |
| `status` | enum | Estado de la transacción. |
| `failure_code` | string nullable | Motivo técnico/negocio. |
| `created_at` | timestamp UTC | Auditoría. |
| `updated_at` | timestamp UTC | Auditoría. |
| `completed_at` | timestamp UTC nullable | Fin exitoso. |

### 8.2 Estados

```mermaid
stateDiagram-v2
    [*] --> PENDIENTE
    PENDIENTE --> VALIDADO
    VALIDADO --> COMPLETADO
    PENDIENTE --> FALLIDO
    VALIDADO --> FALLIDO
    FALLIDO --> [*]
    COMPLETADO --> [*]
```

No se permite pasar de `COMPLETADO` a `PENDIENTE`.

---

## 9. Caso de uso principal: crear depósito USD

### 9.1 Entrada

- `cliente_id`
- `cuenta_destino_id`
- `monto`
- `metodo_origen`
- `referencia_externa` opcional
- `Idempotency-Key`
- `Correlation-Id` opcional

### 9.2 Algoritmo

1. Validar formato del request.
2. Normalizar `monto` como decimal de dos posiciones.
3. Rechazar `monto <= 0`.
4. Forzar moneda `USD`.
5. Buscar `Idempotency-Key`.
6. Si existe, devolver la transacción existente sin crear otra.
7. Consultar el puerto `CustomerAccountPort`.
8. Rechazar si el cliente no existe, está bloqueado o la cuenta no admite USD.
9. Crear depósito `PENDIENTE` en base local.
10. Cambiar a `VALIDADO`.
11. Ejecutar `BalancePort.credit(...)` usando `deposito_id` como referencia única.
12. Si el dueño del saldo confirma el abono, marcar `COMPLETADO`.
13. Escribir evento Outbox `deposit.usd.completed.v1` en la misma transacción de BD que el cambio de estado.
14. Responder `201 Created`.
15. Si el servicio de saldo falla o expira, marcar `FALLIDO` con código auditable y responder `503`.

### 9.3 Secuencia

```mermaid
sequenceDiagram
    autonumber
    actor U as Frontend / Consumidor
    participant D as MS Depósitos USD
    participant DB as PostgreSQL
    participant C as MS Clientes/Cuentas
    participant B as MS Saldos/Ledger
    participant MQ as RabbitMQ opcional

    U->>D: POST /api/v1/depositos/usd + Idempotency-Key
    D->>DB: Buscar Idempotency-Key
    alt Ya procesada
        DB-->>D: Transacción existente
        D-->>U: 200/201 Resultado original
    else Nueva
        D->>C: Validar cliente/cuenta USD
        C-->>D: ACTIVA + USD habilitado
        D->>DB: INSERT PENDIENTE
        D->>DB: UPDATE VALIDADO
        D->>B: credit USD + deposito_id
        alt Abono confirmado
            B-->>D: OK + movimiento_id
            D->>DB: UPDATE COMPLETADO + INSERT OUTBOX
            D-->>U: 201 Created
            D-->>MQ: Publicación eventual desde Outbox
        else Timeout/error
            B-->>D: Error
            D->>DB: UPDATE FALLIDO
            D-->>U: 503 Service Unavailable
        end
    end
```

---

## 10. Persistencia

### 10.1 Tabla principal

```sql
CREATE TABLE depositos_usd (
    id UUID PRIMARY KEY,
    cliente_id UUID NOT NULL,
    cuenta_destino_id UUID,
    monto NUMERIC(18,2) NOT NULL CHECK (monto > 0),
    moneda CHAR(3) NOT NULL DEFAULT 'USD' CHECK (moneda = 'USD'),
    metodo_origen VARCHAR(30) NOT NULL,
    referencia_externa VARCHAR(120),
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    estado VARCHAR(20) NOT NULL,
    movimiento_saldo_id VARCHAR(100),
    failure_code VARCHAR(80),
    failure_detail VARCHAR(255),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completado_en TIMESTAMPTZ
);

CREATE INDEX idx_depositos_usd_cliente_fecha
    ON depositos_usd(cliente_id, creado_en DESC);

CREATE INDEX idx_depositos_usd_estado
    ON depositos_usd(estado);
```

### 10.2 Outbox opcional recomendado

```sql
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    publicado_en TIMESTAMPTZ
);
```

El evento se inserta dentro de la misma transacción local que marca el depósito como `COMPLETADO`. Un proceso publicador lo envía posteriormente a RabbitMQ.

---

## 11. API expuesta

Endpoints mínimos:

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/v1/depositos/usd` | Crear depósito USD. |
| GET | `/api/v1/depositos/usd/{depositoId}` | Consultar una operación. |
| GET | `/api/v1/depositos/usd?cliente_id={id}&page=1&limit=20` | Historial paginado. |
| GET | `/health/live` | Proceso vivo. |
| GET | `/health/ready` | App y dependencias mínimas listas. |
| GET | `/docs` | Swagger solo en entornos autorizados. |

El contrato detallado se encuentra en `02_CONTRATOS_API_E_INTEGRACION.md`.

---

## 12. Dependencias externas

### 12.1 Clientes / Cuentas

Puerto lógico:

```ts
interface CustomerAccountPort {
  validateUsdDestination(input: {
    customerId: string;
    accountId?: string;
  }): Promise<{
    customerExists: boolean;
    customerStatus: 'ACTIVE' | 'BLOCKED' | 'INACTIVE';
    accountStatus: 'ACTIVE' | 'BLOCKED' | 'NOT_FOUND';
    enabledCurrencies: string[];
  }>;
}
```

### 12.2 Saldos / Ledger

Puerto lógico:

```ts
interface BalancePort {
  credit(input: {
    customerId: string;
    accountId?: string;
    amount: string;
    currency: 'USD';
    referenceId: string;
  }): Promise<{
    success: boolean;
    movementId?: string;
  }>;
}
```

El uso de interfaces permite sustituir HTTP por RabbitMQ u otra tecnología sin modificar el dominio.

---

## 13. Idempotencia

Toda creación requiere:

```http
Idempotency-Key: 8efb09d4-2cd1-4b85-ae67-741248833303
```

Reglas:

1. La clave se guarda con restricción `UNIQUE`.
2. Si llega la misma clave con el mismo payload, se devuelve el resultado existente.
3. Si llega la misma clave con un payload distinto, se devuelve `409 Conflict`.
4. El servicio de saldos también debe recibir `referenceId = deposito_id` y tratarlo idempotentemente.

La idempotencia en ambos lados evita doble acreditación incluso si existe un reintento tras un timeout.

---

## 14. Manejo de fallos

### 14.1 Tipos

- Error de validación local → `400`.
- Cliente/cuenta inexistente → `404`.
- Cuenta bloqueada/no permite USD → `422` o `409`, según acuerdo global.
- Idempotency-Key reutilizada con datos distintos → `409`.
- Dependencia externa no disponible → `503`.
- Timeout → `503`.
- Error inesperado interno → `500`.

### 14.2 Reintentos

No se recomienda reintentar ciegamente una operación de crédito desde el request HTTP.

Si se implementan reintentos:

- Máximo 2 intentos adicionales.
- Backoff corto.
- Siempre con la misma referencia idempotente.
- Solo para errores transitorios.
- Nunca para errores 4xx de negocio.

---

## 15. Seguridad

1. JWT preferentemente validado en API Gateway; opcionalmente doble validación en el servicio.
2. No almacenar tokens en BD.
3. No registrar credenciales ni JWT completos en logs.
4. Variables sensibles mediante `.env` local y secretos del entorno en despliegue.
5. Validación estricta de DTO con whitelist.
6. Límite de tamaño de request.
7. CORS centralizado en Gateway cuando sea posible.
8. Usuario PostgreSQL exclusivo con permisos sobre su propia base.
9. Comunicación interna por red privada de Docker o red de infraestructura.

---

## 16. Observabilidad

Cada request debe producir logs estructurados con:

- `timestamp`
- `level`
- `service=ms-depositos-usd`
- `correlation_id`
- `deposito_id`
- `cliente_id`
- `estado`
- `duration_ms`
- `error_code`, si aplica

Métricas recomendadas:

- `deposit_usd_requests_total`
- `deposit_usd_completed_total`
- `deposit_usd_failed_total`
- `deposit_usd_dependency_timeout_total`
- `deposit_usd_duration_ms`
- `deposit_usd_idempotent_hits_total`

---

## 17. Configuración

Variables esperadas:

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://deposit_usd:password@db-depositos-usd:5432/depositos_usd
CUSTOMER_SERVICE_URL=http://ms-clientes:3002
BALANCE_SERVICE_URL=http://ms-saldos:3003
HTTP_TIMEOUT_MS=3000
JWT_ISSUER=
JWT_AUDIENCE=
RABBITMQ_URL=amqp://rabbitmq:5672
ENABLE_EVENTS=false
LOG_LEVEL=info
```

Ninguna URL de otro equipo debe quedar escrita directamente en el código.

---

## 18. Estrategia de desarrollo independiente

Mientras los otros microservicios no estén listos:

1. Implementar `FakeCustomerAccountAdapter`.
2. Implementar `FakeBalanceAdapter`.
3. Desarrollar el caso de uso completo usando esos adaptadores.
4. Crear pruebas unitarias.
5. Crear mocks HTTP con WireMock/MockServer cuando se quiera probar el adaptador real.
6. Al recibir los contratos definitivos de los otros equipos, ajustar únicamente los adaptadores.
7. Ejecutar pruebas contractuales y E2E conjuntas.

---

## 19. Estrategia de integración final

Orden recomendado:

1. Congelar contratos API v1 entre equipos.
2. Integrar primero Clientes/Cuentas.
3. Integrar luego Saldos/Ledger.
4. Probar idempotencia entre Depósitos USD y Saldos.
5. Añadir Gateway.
6. Añadir Frontend.
7. Ejecutar flujo conjunto: cliente → depósito USD → saldo → consulta.
8. Ejecutar casos de error y timeouts.
9. Integrar RabbitMQ solo si forma parte del alcance de la clase.
10. Crear un `docker-compose.integration.yml` que una todos los servicios en una misma red.

---

## 20. Criterios de terminado (Definition of Done)

El microservicio se considera terminado cuando:

- [ ] Compila sin errores.
- [ ] Arranca mediante Docker.
- [ ] Tiene migraciones reproducibles.
- [ ] `POST /api/v1/depositos/usd` funciona.
- [ ] No admite montos <= 0.
- [ ] No admite cuentas sin USD.
- [ ] No duplica depósitos con igual `Idempotency-Key`.
- [ ] La BD es privada del servicio.
- [ ] Existe Swagger/OpenAPI.
- [ ] Pruebas unitarias de dominio y casos de uso pasan.
- [ ] Pruebas de integración con PostgreSQL pasan.
- [ ] Pruebas contractuales con Clientes y Saldos pasan.
- [ ] Prueba E2E del flujo principal pasa.
- [ ] Health checks responden correctamente.
- [ ] Logs incluyen correlación.
- [ ] La documentación de integración está actualizada.

---

## 21. Decisiones clave

1. Se utiliza **Node.js 24 LTS + TypeScript + NestJS** para mantener tipado, modularidad y una base actual de soporte.
2. PostgreSQL se usa por consistencia transaccional y soporte decimal.
3. El servicio no comparte base de datos con Clientes, PEN ni Retiros.
4. El saldo se abstrae mediante `BalancePort` para evitar dependencia de la arquitectura final de otros equipos.
5. La integración base será REST porque facilita el trabajo colaborativo; RabbitMQ queda preparado como evolución.
6. La idempotencia es obligatoria por tratarse de una operación monetaria.
7. El estado `COMPLETADO` solo se alcanza después de una confirmación explícita del abono.



---

<!-- Fuente interna: 02_CONTRATOS_API_E_INTEGRACION.md -->

# Contratos API e Integración
## Microservicio de Depósitos USD

Este documento contiene los contratos que deben compartir los equipos antes de la integración final.

---

## 1. Convenciones generales

- Base path: `/api/v1`
- Formato: `application/json`
- Fechas: ISO-8601 en UTC.
- IDs: UUID cuando el sistema global lo permita.
- Moneda: ISO 4217, siempre `USD` en este microservicio.
- Dinero en contratos: cadena decimal con dos posiciones, por ejemplo `"150.50"`.
- Autenticación: `Authorization: Bearer <JWT>` cuando corresponda.
- Correlación: `X-Correlation-Id` opcional; si no llega, el servicio lo genera.
- Idempotencia: `Idempotency-Key` obligatorio para crear depósitos.

---

## 2. Crear depósito

### `POST /api/v1/depositos/usd`

### Headers

```http
Content-Type: application/json
Authorization: Bearer <token>
Idempotency-Key: 8efb09d4-2cd1-4b85-ae67-741248833303
X-Correlation-Id: 321eb9db-aeba-492a-a069-bff43b4fdd74
```

### Request

```json
{
  "cliente_id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  "cuenta_destino_id": "ef65515b-f0a5-4c2e-a0df-7cd55b822166",
  "monto": "150.50",
  "metodo_origen": "TRANSFERENCIA",
  "referencia_externa": "TRX-EXT-000123"
}
```

### Validaciones

- `cliente_id`: obligatorio.
- `cuenta_destino_id`: obligatorio si el dominio global distingue cuentas.
- `monto`: decimal > `0.00`, máximo dos decimales.
- `metodo_origen`: valor permitido.
- La moneda no viene del cliente o, si se decide incluirla, debe ser exactamente `USD`.
- `Idempotency-Key`: obligatorio y no vacío.

### `201 Created`

```json
{
  "deposito_id": "68253825-30a4-4db2-8266-00cf37f1dd0c",
  "cliente_id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  "cuenta_destino_id": "ef65515b-f0a5-4c2e-a0df-7cd55b822166",
  "monto": "150.50",
  "moneda": "USD",
  "estado": "COMPLETADO",
  "movimiento_saldo_id": "MOV-389011",
  "creado_en": "2026-10-06T19:55:00.000Z",
  "completado_en": "2026-10-06T19:55:00.340Z"
}
```

### Idempotencia repetida

Si la misma clave ya fue procesada con el mismo contenido, se devuelve el recurso ya existente, sin efectuar un segundo abono.

### Errores normalizados

```json
{
  "status": 422,
  "code": "USD_ACCOUNT_NOT_ENABLED",
  "message": "La cuenta destino no está habilitada para USD",
  "correlation_id": "321eb9db-aeba-492a-a069-bff43b4fdd74",
  "timestamp": "2026-10-06T19:55:00.100Z"
}
```

| HTTP | `code` | Significado |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Payload inválido. |
| 400 | `INVALID_AMOUNT` | Monto cero, negativo o formato inválido. |
| 401 | `UNAUTHORIZED` | Token ausente/inválido. |
| 404 | `CUSTOMER_NOT_FOUND` | Cliente no existe. |
| 404 | `ACCOUNT_NOT_FOUND` | Cuenta destino no existe. |
| 409 | `IDEMPOTENCY_CONFLICT` | Misma clave con datos diferentes. |
| 422 | `CUSTOMER_BLOCKED` | Cliente no puede operar. |
| 422 | `USD_ACCOUNT_NOT_ENABLED` | Cuenta no admite USD. |
| 503 | `CUSTOMER_SERVICE_UNAVAILABLE` | No se pudo validar cliente/cuenta. |
| 503 | `BALANCE_SERVICE_UNAVAILABLE` | No se pudo confirmar el abono. |
| 500 | `INTERNAL_ERROR` | Error no controlado. |

---

## 3. Consultar depósito

### `GET /api/v1/depositos/usd/{depositoId}`

`200 OK` devuelve el mismo modelo de respuesta del depósito.

`404 Not Found` si el ID no existe.

---

## 4. Historial de depósitos

### `GET /api/v1/depositos/usd?cliente_id={uuid}&page=1&limit=20`

### Respuesta

```json
{
  "items": [
    {
      "deposito_id": "68253825-30a4-4db2-8266-00cf37f1dd0c",
      "monto": "150.50",
      "moneda": "USD",
      "estado": "COMPLETADO",
      "creado_en": "2026-10-06T19:55:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

---

## 5. Contrato requerido al equipo Clientes / Cuentas

### Opción recomendada

`GET /api/v1/clientes/{clienteId}/cuentas/{accountId}/validacion-deposito?moneda=USD`

### Respuesta esperada

```json
{
  "cliente_id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  "cliente_existe": true,
  "cliente_estado": "ACTIVE",
  "cuenta_id": "ef65515b-f0a5-4c2e-a0df-7cd55b822166",
  "cuenta_estado": "ACTIVE",
  "monedas_habilitadas": ["USD"]
}
```

### Regla

Depósitos USD solo continúa si:

```text
cliente_existe == true
AND cliente_estado == ACTIVE
AND cuenta_estado == ACTIVE
AND USD ∈ monedas_habilitadas
```

### Si el equipo Clientes ya tiene otro endpoint

No es necesario obligarlo a copiar exactamente esta URL. El equipo de Depósitos USD implementará un `CustomerAccountHttpAdapter` que convierta el contrato real al modelo interno anterior.

Lo importante es acordar semántica y campos, no acoplar el dominio a la URL.

---

## 6. Contrato requerido al dueño del saldo

### Opción recomendada

`POST /api/v1/saldos/movimientos`

### Request emitido por Depósitos USD

```json
{
  "cliente_id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  "cuenta_id": "ef65515b-f0a5-4c2e-a0df-7cd55b822166",
  "tipo": "CREDIT",
  "monto": "150.50",
  "moneda": "USD",
  "referencia_id": "68253825-30a4-4db2-8266-00cf37f1dd0c",
  "referencia_tipo": "DEPOSITO_USD"
}
```

### Respuesta esperada

```json
{
  "movimiento_id": "MOV-389011",
  "estado": "APPLIED",
  "referencia_id": "68253825-30a4-4db2-8266-00cf37f1dd0c"
}
```

### Condición crítica

`referencia_id` debe ser única en el servicio de saldos. Si el request se repite, Saldos debe devolver el mismo movimiento y no acreditar nuevamente.

---

## 7. Si no existe MS Saldos

Si el equipo decidió que Clientes administra también el saldo:

- Se conserva `BalancePort`.
- `BalanceHttpAdapter` apunta al endpoint del equipo Clientes.
- No se modifica el caso de uso ni el controlador.

Ejemplo de URL alternativa:

```text
POST /api/v1/clientes/{clienteId}/cuentas/{accountId}/movimientos
```

---

## 8. Eventos opcionales

### Evento completado

Routing key sugerida:

```text
deposit.usd.completed.v1
```

Payload:

```json
{
  "event_id": "90d24be0-2258-4091-9945-a9bd92817159",
  "event_type": "deposit.usd.completed.v1",
  "occurred_at": "2026-10-06T19:55:00.340Z",
  "deposito_id": "68253825-30a4-4db2-8266-00cf37f1dd0c",
  "cliente_id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  "cuenta_id": "ef65515b-f0a5-4c2e-a0df-7cd55b822166",
  "monto": "150.50",
  "moneda": "USD"
}
```

Posibles consumidores: notificaciones, auditoría, reportes o analítica.

---

## 9. Compatibilidad con API Gateway

Ruta externa sugerida:

```text
/api/v1/depositos/usd/**  ->  ms-depositos-usd:3001
```

El Gateway puede encargarse de:

- autenticación JWT;
- rate limiting;
- CORS;
- logging de entrada;
- enrutamiento;
- propagación de `X-Correlation-Id`.

El Gateway no debe implementar reglas monetarias del depósito.

---

## 10. Contrato de integración que todos deben acordar

Antes del merge final, cada equipo debe entregar:

1. Nombre DNS/container de su servicio.
2. Puerto interno.
3. Base path de API.
4. Swagger/OpenAPI.
5. Códigos de error.
6. Formato de IDs.
7. Estados válidos.
8. Política de autenticación interna.
9. Timeout esperado.
10. Health endpoint.
11. Responsabilidad exacta sobre saldo/cuenta.
12. Estrategia de idempotencia.



---

<!-- Fuente interna: 03_PLAN_IMPLEMENTACION_PASO_A_PASO.md -->

# Plan de Implementación Paso a Paso
## Microservicio de Depósitos USD

Este documento transforma el SDD en tareas ejecutables.

---

## Fase 0 — Alinear contratos

### Objetivo
No comenzar por controladores; comenzar por los acuerdos que permiten integrar el sistema.

### Tareas

- [ ] Confirmar formato de `cliente_id`.
- [ ] Confirmar si existe `cuenta_destino_id`.
- [ ] Definir quién es dueño del saldo.
- [ ] Obtener contrato del MS Clientes.
- [ ] Obtener contrato del MS Saldos/Ledger, si existe.
- [ ] Acordar `Idempotency-Key`.
- [ ] Acordar puertos de ejecución.
- [ ] Acordar red Docker compartida.
- [ ] Acordar estrategia JWT/Gateway.

### Resultado
Documento `02_CONTRATOS_API_E_INTEGRACION.md` aprobado por los equipos implicados.

---

## Fase 1 — Crear el proyecto

### Stack

- Node.js 24 LTS.
- TypeScript.
- NestJS.
- PostgreSQL.
- ORM: Prisma o TypeORM; elegir uno y mantenerlo en todo el servicio.
- Jest/Vitest según configuración elegida del proyecto.
- Docker.

### Creación

```bash
npm i -g @nestjs/cli
nest new ms-depositos-usd
cd ms-depositos-usd
```

Instalar paquetes según la opción de persistencia elegida. No mezclar dos ORM.

### Estructura inicial

Crear módulos separados para dominio, aplicación, infraestructura e interfaz HTTP.

---

## Fase 2 — Configuración y validación

Crear un módulo de configuración que valide al iniciar:

- `PORT`
- `DATABASE_URL`
- `CUSTOMER_SERVICE_URL`
- `BALANCE_SERVICE_URL`
- `HTTP_TIMEOUT_MS`
- `ENABLE_EVENTS`

Si falta una variable obligatoria, el servicio debe fallar rápido al arrancar.

Crear `.env.example`, nunca subir `.env` real.

---

## Fase 3 — Implementar dominio

### 3.1 MoneyUsd Value Object

Reglas:

- Solo USD.
- Monto mayor que cero.
- Dos decimales.
- No usar `number` para cálculos financieros internos si puede introducir precisión binaria.

### 3.2 Deposit Entity

Debe proteger transiciones de estado.

Ejemplos válidos:

```text
PENDIENTE -> VALIDADO
VALIDADO -> COMPLETADO
PENDIENTE -> FALLIDO
VALIDADO -> FALLIDO
```

Ejemplo inválido:

```text
COMPLETADO -> PENDIENTE
```

Crear pruebas unitarias del dominio antes de conectar PostgreSQL.

---

## Fase 4 — Definir puertos

Crear interfaces:

- `DepositRepositoryPort`
- `CustomerAccountPort`
- `BalancePort`
- `EventPublisherPort`

Estas interfaces permiten implementar el negocio sin que los otros equipos estén disponibles.

---

## Fase 5 — Caso de uso CreateUsdDeposit

Implementar la lógica en este orden:

1. Validar comando.
2. Buscar por idempotencia.
3. Validar cliente/cuenta.
4. Persistir `PENDIENTE`.
5. Pasar a `VALIDADO`.
6. Solicitar crédito al `BalancePort`.
7. Guardar `movimiento_saldo_id`.
8. Marcar `COMPLETADO`.
9. Guardar evento Outbox si se habilita.
10. Retornar DTO.

En excepción transitoria del saldo:

1. Capturar el error.
2. Marcar `FALLIDO` con código explícito.
3. No inventar que el saldo fue actualizado.
4. Propagar error de aplicación convertido a HTTP 503.

---

## Fase 6 — Base de datos

Crear migración para:

- `depositos_usd`.
- índices.
- restricción `UNIQUE(idempotency_key)`.
- restricción `moneda = 'USD'`.
- `outbox_events` si aplica.

Verificar manualmente:

```sql
SELECT * FROM depositos_usd ORDER BY creado_en DESC;
```

La BD debe pertenecer exclusivamente al servicio.

---

## Fase 7 — Adaptador Clientes

Implementar `CustomerAccountHttpAdapter`.

Responsabilidades:

- construir URL desde variable de entorno;
- timeout;
- mapear respuesta externa al modelo interno;
- traducir 404, 409, 5xx y timeout;
- nunca filtrar detalles técnicos innecesarios al cliente final.

### Desarrollo sin Clientes real

Crear un fake:

```text
Cliente A -> ACTIVE, cuenta USD ACTIVE
Cliente B -> BLOCKED
Cliente C -> ACTIVE, solo PEN
```

De esta manera el microservicio se termina aunque el otro equipo aún programe su API.

---

## Fase 8 — Adaptador de Saldos

Implementar `BalanceHttpAdapter`.

Debe enviar:

- cliente;
- cuenta;
- `CREDIT`;
- monto;
- `USD`;
- `deposito_id` como referencia única.

No se debe usar un endpoint que acepte simplemente `nuevoSaldo`, porque dos servicios podrían sobrescribirse entre sí. Es preferible solicitar un **movimiento** de crédito.

---

## Fase 9 — Controller REST

Implementar:

```text
POST /api/v1/depositos/usd
GET  /api/v1/depositos/usd/:id
GET  /api/v1/depositos/usd?cliente_id=...
```

El controller solo debe:

- validar DTO;
- extraer headers;
- invocar use case;
- mapear respuesta.

No debe contener consultas SQL ni lógica de negocio.

---

## Fase 10 — OpenAPI / Swagger

Documentar:

- request;
- headers;
- respuestas;
- códigos de error;
- ejemplos;
- esquemas.

El Swagger generado debe coincidir con el contrato compartido.

---

## Fase 11 — Health checks

### `/health/live`

Confirma que el proceso NestJS está vivo.

### `/health/ready`

Confirma al menos:

- conexión a PostgreSQL;
- configuración válida.

No es obligatorio que `ready` dependa de todos los microservicios externos si eso provoca cascadas de indisponibilidad; documentar la decisión.

---

## Fase 12 — Logging y errores

Crear un filtro global de errores.

Ejemplo de salida homogénea:

```json
{
  "status": 503,
  "code": "BALANCE_SERVICE_UNAVAILABLE",
  "message": "No fue posible confirmar el abono",
  "correlation_id": "...",
  "timestamp": "..."
}
```

Agregar interceptor/middleware de correlación.

---

## Fase 13 — Docker

Crear `Dockerfile` multi-stage.

Ejemplo conceptual:

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
CMD ["node", "dist/main.js"]
```

No copiar `.env` al contenedor.

---

## Fase 14 — Docker Compose local

Levantar al menos:

- `ms-depositos-usd`;
- `db-depositos-usd`;
- mocks de Clientes/Saldos opcionales.

Ejecutar:

```bash
docker compose up -d --build
```

Probar con curl/Postman.

---

## Fase 15 — Pruebas

Orden recomendado:

1. Unitarias de dominio.
2. Unitarias del caso de uso.
3. Integración con PostgreSQL.
4. Integración de adaptadores HTTP contra mocks.
5. Contract tests.
6. E2E del servicio.
7. E2E conjunto con Clientes y Saldos.
8. Prueba de concurrencia/idempotencia.

Consultar `04_PRUEBAS_Y_CRITERIOS_DE_ACEPTACION.md`.

---

## Fase 16 — Integración con los demás

### Paso 1
Crear una red compartida:

```text
wallet-network
```

### Paso 2
Todos deben referenciar servicios por nombre DNS de Docker:

```text
http://ms-clientes:3002
http://ms-saldos:3003
http://ms-depositos-usd:3001
```

### Paso 3
Eliminar dependencias de `localhost` entre contenedores.

### Paso 4
Ejecutar flujo real.

### Paso 5
Provocar fallos deliberados:

- Clientes apagado.
- Saldos apagado.
- cuenta bloqueada.
- doble POST.
- monto inválido.

---

## Fase 17 — CI

Pipeline mínimo en GitHub Actions:

```text
checkout
-> setup Node 24
-> npm ci
-> lint
-> test
-> build
-> pruebas integración
-> docker build
```

No desplegar si falla cualquiera de estas etapas.

---

## Fase 18 — Entrega

Entregar en el repositorio:

```text
README.md
Dockerfile
docker-compose.yml
.env.example
src/
test/
migrations/
docs/
  01_SDD_MICROSERVICIO_DEPOSITOS_USD.md
  02_CONTRATOS_API_E_INTEGRACION.md
  03_PLAN_IMPLEMENTACION_PASO_A_PASO.md
  04_PRUEBAS_Y_CRITERIOS_DE_ACEPTACION.md
  05_INTEGRACION_DESPLIEGUE_Y_OPERACION.md
```



---

<!-- Fuente interna: 04_PRUEBAS_Y_CRITERIOS_DE_ACEPTACION.md -->

# Estrategia de Pruebas y Criterios de Aceptación
## Microservicio de Depósitos USD

---

## 1. Objetivo

Demostrar que el servicio procesa depósitos USD correctamente, no duplica dinero y se comporta de manera controlada cuando fallan otros microservicios.

---

## 2. Pirámide de pruebas

```text
              E2E conjunto
           Contract / E2E API
        Integración PostgreSQL/HTTP
      Unitarias casos de uso
   Unitarias dominio / value objects
```

---

## 3. Pruebas unitarias de dominio

| ID | Escenario | Resultado esperado |
|---|---|---|
| UT-01 | Crear MoneyUsd con 100.00 | válido |
| UT-02 | Crear MoneyUsd con 0 | rechazo |
| UT-03 | Crear MoneyUsd con -1 | rechazo |
| UT-04 | Intentar moneda PEN | rechazo |
| UT-05 | PENDIENTE → VALIDADO | permitido |
| UT-06 | VALIDADO → COMPLETADO | permitido |
| UT-07 | COMPLETADO → PENDIENTE | rechazo |

---

## 4. Pruebas unitarias del caso de uso

Usar mocks de los puertos.

### UC-01 Depósito correcto

**Given** cliente y cuenta USD válidos.  
**And** BalancePort confirma crédito.  
**When** se solicita depósito de 150.50 USD.  
**Then** se guarda `COMPLETADO` y se retorna éxito.

### UC-02 Cliente inexistente

No debe crear crédito ni operación completada.

### UC-03 Cuenta solo PEN

Debe rechazar la operación antes de solicitar el crédito.

### UC-04 Servicio de saldo falla

Debe quedar `FALLIDO`; nunca `COMPLETADO`.

### UC-05 Idempotencia

Dos invocaciones con misma clave deben producir un único depósito.

### UC-06 Conflicto de idempotencia

Misma clave + distinto monto → `IDEMPOTENCY_CONFLICT`.

---

## 5. Integración con PostgreSQL

Validar:

- migraciones;
- restricciones;
- índices;
- unicidad de idempotencia;
- transacciones;
- escritura y lectura;
- rollback ante error local.

Caso de concurrencia:

Lanzar dos requests simultáneos con la misma `Idempotency-Key`; la base debe impedir dos filas.

---

## 6. Integración HTTP contra mocks

Mock Clientes:

- `200 ACTIVE USD`.
- `404`.
- `200 BLOCKED`.
- `500`.
- timeout > 3 s.

Mock Saldos:

- `200 APPLIED`.
- `409 referencia ya aplicada`, tratado idempotentemente.
- `500`.
- timeout.

---

## 7. Contract testing

Cada equipo debe verificar que los contratos reales conservan:

### Clientes

- estado del cliente;
- estado de cuenta;
- monedas habilitadas;
- códigos de error acordados.

### Saldos

- movimiento `CREDIT`;
- moneda;
- monto decimal;
- referencia idempotente;
- movimiento resultante.

Si el proveedor cambia nombres de campos, el adaptador puede traducirlos; si cambia la semántica, debe versionarse el contrato.

---

## 8. E2E del microservicio

Levantar:

- Depósitos USD.
- PostgreSQL.
- Mock Clientes.
- Mock Saldos.

Probar endpoints desde HTTP real.

### E2E-01

```text
POST válido -> 201 -> GET devuelve COMPLETADO
```

### E2E-02

```text
POST repetido -> no incrementa número de transacciones
```

### E2E-03

```text
Saldos timeout -> 503 + estado FALLIDO
```

---

## 9. E2E conjunto con la clase

Escenario mínimo de integración:

1. Crear/usar cliente activo.
2. Asegurar cuenta USD activa.
3. Consultar saldo inicial.
4. Depositar USD 100.00.
5. Obtener `deposito_id`.
6. Consultar saldo final.
7. Verificar incremento exactamente 100.00.
8. Repetir el mismo request con la misma Idempotency-Key.
9. Verificar que el saldo no vuelve a incrementarse.

---

## 10. Pruebas negativas obligatorias

- monto `0`;
- monto negativo;
- monto con más decimales de los permitidos;
- cliente inexistente;
- cliente bloqueado;
- cuenta inexistente;
- cuenta PEN;
- JSON incompleto;
- token inválido;
- Idempotency-Key faltante;
- Idempotency-Key conflictiva;
- Clientes no disponible;
- Saldos no disponible;
- PostgreSQL no disponible;
- request duplicado concurrente.

---

## 11. Criterios de aceptación

### CA-01

**Dado** un cliente activo con cuenta USD activa  
**Cuando** deposita 50.00 USD  
**Entonces** la operación finaliza `COMPLETADO` y el saldo se acredita una sola vez.

### CA-02

**Dado** un cliente con cuenta solo PEN  
**Cuando** intenta usar Depósitos USD  
**Entonces** el servicio rechaza la operación y no llama al servicio de saldos.

### CA-03

**Dado** un depósito ya procesado  
**Cuando** se repite la petición con la misma clave  
**Entonces** se devuelve el resultado original y no se crea un nuevo movimiento.

### CA-04

**Dado** que Saldos no responde  
**Cuando** se procesa un depósito  
**Entonces** no debe declararse `COMPLETADO`.

### CA-05

**Dado** un depósito completado  
**Cuando** otro servicio consulta su información  
**Entonces** debe hacerlo por API, no por conexión directa a la BD.

---

## 12. Quality Gate sugerido

Antes de integrar:

- Lint: 0 errores.
- Build: exitoso.
- Unit tests: 100 % verdes.
- Integration tests: 100 % verdes.
- Contract tests: verdes.
- Flujo E2E crítico: verde.
- Sin secretos en Git.
- Swagger actualizado.
- Docker build exitoso.

No se requiere perseguir un porcentaje de cobertura arbitrario; priorizar cobertura de reglas monetarias, estados, idempotencia y errores.



---

<!-- Fuente interna: 05_INTEGRACION_DESPLIEGUE_Y_OPERACION.md -->

# Integración, Despliegue y Operación
## Microservicio de Depósitos USD

---

## 1. Objetivo

Definir cómo pasar del desarrollo aislado del equipo de Depósitos USD a la ejecución coordinada con los microservicios del resto de la clase.

---

## 2. Integración por etapas

### Etapa A — Servicio aislado

```text
Frontend/Postman
      |
MS Depósitos USD
  |          |
Postgres   Fakes
```

Permite completar el desarrollo sin esperar a los demás.

### Etapa B — Integración con Clientes

```text
MS Depósitos USD -> MS Clientes
       |
    Postgres
```

### Etapa C — Integración con Saldos

```text
MS Depósitos USD -> MS Clientes
       |
       +---------> MS Saldos/Ledger
       |
    Postgres
```

### Etapa D — Plataforma completa

```text
Frontend -> API Gateway -> MS Depósitos USD
                         -> MS Depósitos PEN
                         -> MS Retiros USD
                         -> MS Retiros PEN
                         -> MS Clientes
                         -> MS Saldos/Ledger
```

---

## 3. Regla de red

Dentro de Docker, **no usar `localhost` para llamar a otro contenedor**.

Correcto:

```text
http://ms-clientes:3002
```

Incorrecto:

```text
http://localhost:3002
```

Todos los servicios se conectan a una red compartida, por ejemplo:

```yaml
networks:
  wallet-network:
    name: wallet-network
```

---

## 4. Puertos sugeridos

Los puertos son convenciones y pueden cambiar si la clase ya definió otros.

| Servicio | Puerto sugerido |
|---|---:|
| API Gateway | 8080 |
| Depósitos USD | 3001 |
| Clientes | 3002 |
| Saldos/Ledger | 3003 |
| Depósitos PEN | 3004 |
| Retiros USD | 3005 |
| Retiros PEN | 3006 |
| PostgreSQL Depósitos USD host | 5433 |

Los puertos internos deben quedar documentados y libres de colisiones.

---

## 5. Docker Compose de integración

El repositorio integrador de la clase debería contener un compose que no copie código entre equipos, sino que construya o consuma cada servicio.

Ejemplo conceptual:

```yaml
services:
  ms-depositos-usd:
    build: ./ms-depositos-usd
    environment:
      PORT: 3001
      DATABASE_URL: postgresql://deposit_usd:secret@db-depositos-usd:5432/depositos_usd
      CUSTOMER_SERVICE_URL: http://ms-clientes:3002
      BALANCE_SERVICE_URL: http://ms-saldos:3003
      HTTP_TIMEOUT_MS: 3000
    depends_on:
      db-depositos-usd:
        condition: service_healthy
    networks: [wallet-network]

  db-depositos-usd:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: deposit_usd
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: depositos_usd
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U deposit_usd -d depositos_usd"]
      interval: 5s
      timeout: 3s
      retries: 10
    networks: [wallet-network]

networks:
  wallet-network:
    name: wallet-network
```

En un entorno real las credenciales no deben quedar escritas en el compose del repositorio.

---

## 6. Integración con Gateway

### Ruta sugerida

```text
POST /api/v1/depositos/usd
GET  /api/v1/depositos/usd/**
```

El Gateway enruta al contenedor `ms-depositos-usd`.

Responsabilidades del Gateway:

- autenticación;
- CORS;
- rate limit;
- routing;
- propagación de correlation ID.

Responsabilidades que se mantienen en Depósitos USD:

- reglas de monto;
- USD;
- idempotencia;
- validación de cuenta;
- estado de transacción;
- persistencia.

---

## 7. Contratos antes del merge

No fusionar los equipos simplemente porque "todos los endpoints responden". Verificar:

- mismo formato de UUID;
- mismo concepto de cuenta;
- misma semántica de ACTIVE/BLOCKED;
- monto decimal;
- `USD` exacto;
- errores predecibles;
- timeout;
- idempotencia;
- propagación de token si se requiere.

---

## 8. Compatibilidad con Depósitos PEN

Depósitos PEN y Depósitos USD pueden tener una estructura arquitectónica similar, pero deben permanecer independientes si esa es la división definida por el proyecto.

No copiar reglas USD a PEN mediante condicionales improvisados.

Se recomienda compartir **convenciones**:

- estructura de errores;
- headers;
- logging;
- health checks;
- formato OpenAPI;
- idempotencia;

pero no compartir la misma tabla de transacciones.

---

## 9. Compatibilidad con Retiros USD

Depósitos USD incrementa saldo; Retiros USD decrementa saldo.

Ambos deben operar contra el mismo dueño autoritativo del saldo y usar referencias idempotentes.

Esto evita que cada microservicio mantenga una copia distinta del balance real.

---

## 10. RabbitMQ opcional

No es obligatorio para completar la primera integración.

Puede añadirse para eventos como:

```text
deposit.usd.completed.v1
```

No publicar directamente después de actualizar la BD sin protección, porque si la aplicación cae entre ambas operaciones se puede perder el evento.

Usar patrón **Transactional Outbox**:

```text
Transacción DB:
  actualizar depósito COMPLETADO
  + insertar outbox event
COMMIT

Worker:
  leer outbox pendiente
  publicar RabbitMQ
  marcar publicado
```

---

## 11. CI/CD sugerido

### CI por cada Pull Request

```text
npm ci
npm run lint
npm run test
npm run build
npm run test:integration
Docker build
```

### Integración conjunta

Al hacer merge a rama de integración:

```text
levantar docker compose completo
esperar health checks
ejecutar smoke tests
Ejecutar E2E financiero crítico
```

### CD

Solo después de que CI e integración conjunta sean verdes.

---

## 12. Smoke tests post-despliegue

1. `/health/live` → 200.
2. `/health/ready` → 200.
3. Swagger accesible solo si corresponde.
4. Validar comunicación DNS con Clientes.
5. Validar comunicación DNS con Saldos.
6. Ejecutar depósito de prueba controlado en entorno no productivo.

---

## 13. Operación y diagnóstico

### Si falla Clientes

Síntoma:

```text
CUSTOMER_SERVICE_UNAVAILABLE
```

Revisar:

- URL;
- DNS de Docker;
- puerto;
- health;
- timeout;
- contrato.

### Si falla Saldos

No cambiar manualmente el depósito a `COMPLETADO`.

Revisar primero si el servicio remoto aplicó o no la referencia. La referencia idempotente permite reconsultar/reintentar sin duplicar el crédito.

### Si PostgreSQL falla

El servicio debe considerarse no listo para procesar depósitos.

---

## 14. Checklist de integración final

- [ ] Todos los servicios están en la misma red o tienen conectividad definida.
- [ ] No existen URLs internas con localhost.
- [ ] Clientes valida cuenta USD.
- [ ] Saldos acepta CREDIT USD.
- [ ] Saldos es idempotente por referencia.
- [ ] Depósitos USD es idempotente por header.
- [ ] Gateway enruta correctamente.
- [ ] JWT llega o se valida según acuerdo.
- [ ] OpenAPI coincide con implementación.
- [ ] Migraciones aplicadas.
- [ ] Health checks verdes.
- [ ] E2E de saldo antes/después correcto.
- [ ] Doble request no duplica dinero.
- [ ] Logs permiten rastrear una operación de extremo a extremo.

---

## 15. Resultado esperado

Al finalizar, Depósitos USD debe ser un servicio autónomo, desplegable de manera independiente y acoplable al ecosistema mediante contratos. Cambios en las URLs o incluso en la tecnología de comunicación de Clientes/Saldos deben concentrarse en adaptadores y configuración, no obligar a reescribir el dominio financiero.

