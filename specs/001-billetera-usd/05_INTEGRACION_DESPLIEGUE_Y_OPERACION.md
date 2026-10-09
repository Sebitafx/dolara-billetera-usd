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

