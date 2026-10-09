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

