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

