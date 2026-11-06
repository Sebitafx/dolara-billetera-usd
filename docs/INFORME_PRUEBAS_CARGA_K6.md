# 📊 Informe Técnico: Pruebas de Carga y Rendimiento k6 — DOLARA (Billetera Digital USD)

**Microservicio:** `ms-billetera-usd`  
**Entorno de Pruebas:** Kubernetes (K3s) sobre AWS EC2 (`http://54.167.69.62`)  
**Herramienta de Carga:** Grafana k6 v2.3.0 (Containerized via Docker)  
**Fecha:** Noviembre 2026  
**Autor:** Equipo de Desarrollo de Aplicaciones para la Nube  

---

## 🎯 1. Resumen Ejecutivo

El presente informe documenta la metodología, ejecución y resultados de las pruebas de carga, concurrencia y estrés aplicadas a la API canónica de **DOLARA (Billetera Digital USD)**. El objetivo principal consiste en certificar que el microservicio cumple con los Acuerdos de Nivel de Servicio (SLA) requeridos en producción:
- **Blindaje Moneda USD-only:** Rechazo categórico (HTTP 400) de cualquier transacción en moneda distinta a USD.
- **Idempotencia RFC:** Garantía de no duplicidad de dinero ante ráfagas concurrentes con el mismo `Idempotency-Key` (UUID v4).
- **Resiliencia y Disponibilidad en la Nube:** Latencias P95 controladas y tasa de fallos inferior al 1.0% bajo concurrencia moderada y sostenida.

---

## 🛠️ 2. Topología de Infraestructura y Red

El microservicio opera en una arquitectura nativa de contenedores desplegada en **AWS EC2** gestionada con K3s:

```
[ Cliente / k6 Load Engine ]
             │ HTTP (Puerto 80)
             ▼
   [ AWS Ingress Traefik ]
             │
             ▼
   [ Pod: web (Nginx + SPA) ]
     ├─ Reverse Proxy /api/* ──► [ Pod: ms-depositos-usd (Node.js 20 Express :3001) ]
     ├─ Reverse Proxy /docs  ──►               │
     └─ Archivos Estáticos                     ▼
                              [ Pod: db-depositos-usd (PostgreSQL 16 :5432) ]
                                 └─ Volumen Persistente (PVC SSD gp3)
```

### Configuración del Pool de Conexiones
- **Engine:** PostgreSQL 16 Alpine con extensión `pgcrypto`.
- **Pool pg:** 20 conexiones máximas, `connectionTimeoutMillis: 5000ms`, `idleTimeoutMillis: 30000ms`.
- **Concurrencia sin Deadlocks:** Resolución atómica mediante restricción UNIQUE a nivel de motor sobre `idempotency_key`, evitando bloqueos de contención a nivel de conexión y eliminando el riesgo de "Pool Starvation".

---

## 📋 3. Matriz de Escenarios Diseñados

| Escenario | Script | VUs (Usuarios Virtuales) | Duración | Propósito y SLAs |
| :--- | :--- | :--- | :--- | :--- |
| **1. Smoke Test** | `smoke.js` | 3 VUs constantes | 20 seg | Calibración de latencia base, `/health/ready`, `/fx/tasa`, depósito simple. `p95 < 800ms`, `fail < 1%`. |
| **2. Concurrencia e Idempotencia** | `concurrency-idempotency.js` | 10 VUs simultáneas | Ráfaga inmediata | 10 hilos disparan en el mismo milisegundo con la **misma Idempotency-Key**. Cero duplicidad contable (1 crédito real, 9 replays 200/201). |
| **3. Carga Sostenida** | `load-test.js` | Rampa hasta 50 VUs | 95 seg | Simula tráfico real de banca móvil: 40% FX, 35% Depósitos USD, 25% Health. `p95 < 600ms`, `fail < 1%`. |
| **4. Estrés Extremo (Breaking Point)** | `stress-test.js` | Rampa hasta 120 VUs | 90 seg | Saturación intencional de CPU/Red para medir punto de quiebre y recuperación automática. |

---

## 📈 4. Evidencia de Ejecución y Métricas Consolidadas

### Tabla de Resultados Comparativos por Escenario

| Escenario | VUs Máx | Peticiones Totales | Throughput (RPS) | Tasa de Error | Latencia Media | Latencia P95 | Cumplimiento SLA |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Smoke Test (`smoke.js`)** | 3 | 171 | 8.46 req/s | **0.00%** (0) | 20.25 ms | 49.04 ms | ✅ Aprobado (`p95 < 800ms`) |
| **2. Concurrencia e Idempotencia (`concurrency-idempotency.js`)** | 10 | 10 | 93.68 req/s | **0.00%** (0) | 65.83 ms | 88.40 ms | ✅ Aprobado (100% Replay seguro) |
| **3. Carga Sostenida (`load-test.js`)** | 50 | 4,643 | 48.82 req/s | **0.00%** (0) | 8.71 ms | 22.58 ms | ✅ Aprobado (`p95 < 600ms`) |
| **4. Estrés Máximo (`stress-test.js`)** | 120 | 22,652 | 251.13 req/s | **0.00%** (0) | 16.83 ms | 49.29 ms | ✅ Aprobado (`p95 < 1500ms`) |

---

### Desglose Detallado por Tipo de Operación (Carga Sostenida)

- **Lecturas Rápidas (Cache FX / Health check):**
  - Latencia media: **4.18 ms**
  - Latencia P95: **7.04 ms** (Umbral SLA: `< 300 ms` — Superado por un factor de 42x)
- **Escrituras Transaccionales ACID (`POST /api/v1/depositos/usd`):**
  - Latencia media: **17.23 ms**
  - Latencia P95: **28.67 ms** (Umbral SLA: `< 800 ms` — Superado por un factor de 27x)
  - Integridad de Moneda: 100% en dólares (`moneda = 'USD'`).
  - Estado: 100% de depósitos pasaron a estado `COMPLETADO`.

---

### Prueba de Fuego: Concurrencia Extrema y Anti-Doble Gasto

Para comprobar la robustez del microservicio frente a condiciones de carrera (Race Conditions), se ejecutó el escenario `concurrency-idempotency.js` disparando **10 peticiones simultáneas en el mismo milisegundo** con exactamente la misma clave de idempotencia (`Idempotency-Key` UUID v4) y un monto de **\$100.00 USD**.

**Resultado Observado:**
1. **Petición Ganadora:** Insertó el registro inicial en estado `PENDIENTE` y completó la acreditación retornando `HTTP 201 Created`.
2. **Peticiones Concurrentes (9 hilos):** Fueron interceptadas de forma atómica por la restricción `UNIQUE` en PostgreSQL, resolviendo la carrera sin bloqueos ni contención de conexiones, y retornando `HTTP 200 OK` con la información del depósito ya acreditado (`replay: true`).
3. **Auditoría Contable:**
   ```sql
   SELECT count(*), idempotency_key, estado, monto 
   FROM depositos_usd 
   WHERE idempotency_key = 'a0000000-0000-4000-8000-01a1b2cc5554'
   GROUP BY idempotency_key, estado, monto;
   ```
   *Resultado:* **Exactamente 1 registro** en base de datos. Se demostró de forma concluyente que no hubo doble gasto ni dinero inventado.

---

### 5. Análisis del Escenario de Estrés Máximo (Breaking Point)

En la prueba `stress-test.js`, se inyectaron **22,652 transacciones** escalando progresivamente hasta **120 VUs simultáneas**:
- **Throughput Máximo:** Alcanzó **251.13 peticiones por segundo sostenidas**, demostrando que la arquitectura ligera de Node.js 20 con pool optimizado de PostgreSQL procesa el tráfico bancario sin degradación.
- **Tasa de Errores:** **0.00%** (22,652/22,652 peticiones exitosas). Ni una sola desconexión, timeout o fallo 502/503.
- **Latencia:** P95 de apenas **49.29 ms**, muy por debajo de los 1,500 ms de tolerancia fijados para estrés extremo.

---

## 💻 6. Comandos para Replicar las Pruebas (Docker k6)

Cualquier evaluador o integrante del equipo puede reproducir exactamente estas mismas pruebas con un solo comando Docker (sin necesidad de instalar herramientas locales):

```bash
# 1. Smoke Test (Línea Base):
docker run --rm -v "${PWD}/load-tests:/scripts" -e TARGET_URL="http://localhost:3001" grafana/k6 run /scripts/smoke.js

# 2. Prueba de Concurrencia e Idempotencia (Anti-Doble Gasto):
docker run --rm -v "${PWD}/load-tests:/scripts" -e TARGET_URL="http://localhost:3001" grafana/k6 run /scripts/concurrency-idempotency.js

# 3. Prueba de Carga Sostenida (50 VUs):
docker run --rm -v "${PWD}/load-tests:/scripts" -e TARGET_URL="http://localhost:3001" grafana/k6 run /scripts/load-test.js

# 4. Prueba de Estrés Extremo (120 VUs):
docker run --rm -v "${PWD}/load-tests:/scripts" -e TARGET_URL="http://localhost:3001" grafana/k6 run /scripts/stress-test.js
```

> **Nota:** Para ejecutar contra la nube AWS, reemplace `-e TARGET_URL="http://localhost:3001"` por `-e TARGET_URL="http://54.167.69.62"`.

---

## 🛡️ 7. Conclusiones y Recomendaciones de Ingeniería

1. **Aislamiento de Moneda y Transaccionalidad:** La base de datos garantiza la consistencia financiera gracias a la regla `CHECK (moneda = 'USD')` y precisión en centavos enteros (`numeric(18,2)`), descartando imprecisiones por punto flotante IEEE 754.
2. **Eficiencia del Cache FX:** Las consultas al tipo de cambio `/api/v1/fx/tasa` responden en <10ms en lecturas cacheadas, protegiendo la cuota de la API externa.
3. **Resiliencia ante Concurrencia:** La eliminación de bloqueos a nivel de conexión en favor de restricciones declarativas `UNIQUE` en PostgreSQL evitó el agotamiento del pool y garantizó cero duplicidad con latencias inferiores a 90ms en colisiones simultáneas.
4. **Escalabilidad Horizontal:** Con K3s y HPA (Horizontal Pod Autoscaler), el Deployment `ms-depositos-usd` puede escalar automáticamente de 1 a 5 réplicas ante incrementos sostenidos de RPS.

