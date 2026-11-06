# 🚀 Actualización del Proyecto: Sandbox MCP DOLARA y Próximos Pasos

Hola compañero, aquí tienes el resumen claro de lo que se implementó, lo que debes actualizar en el servidor de AWS y lo que debemos compartir con los demás equipos de la clase y el docente.

---

## 📌 1. ¿Qué se implementó en este cambio?

Siguiendo la guía de especificaciones del docente (`specs/002-mcp-dolara/GUIA_SDD_MCP_Billetera_Digital_USD.md`):

1. **Servidor MCP Sidecar (`backend/src/mcp/`):**
   * Servidor oficial en TypeScript (`@modelcontextprotocol/sdk`) con **8 Herramientas (`Tools`)** y **3 Recursos (`Resources`)**.
   * Permite que los agentes de IA (Antigravity, Cursor, Claude Desktop, etc.) de los otros grupos interactúen con nuestra billetera sin tocar dinero real.
2. **Endpoints de Integración y Contrato Vivo:**
   * `GET /docs.json` y `GET /openapi.json`: Expone la especificación OpenAPI 3.0 viva en formato JSON para herramientas automáticas.
   * `POST /api/v1/sandbox/reset`: Endpoint seguro para limpiar fixtures de prueba entre sesiones.
   * `GET /api/v1/sandbox/scenarios`: Catálogo de escenarios de prueba para agentes.
3. **Validación Exhaustiva (48 Tests Automatizados 100% Verdes):**
   * Suite completa (`npm test`) que verifica: rechazo estricto de PEN (HTTP 400), idempotencia (1 llamada vs 10 repeticiones = 1 solo crédito), detección de conflicto 409 y transferencias atómicas.
4. **Verificación en Vivo contra AWS (`http://54.167.69.62`):**
   * Probamos directamente contra tu servidor en la nube y confirmamos que todas las reglas de negocio e idempotencia funcionan a la perfección.

---

## 🛠️ 2. Lo que debes hacer tú en el servidor AWS (1 minuto)

Como tienes acceso a la máquina donde está corriendo el microservicio (`54.167.69.62`), solo necesitas actualizar el contenedor con los nuevos endpoints:

```bash
# 1. Entrar a la carpeta del proyecto en el servidor AWS
cd ms-billetera-usd   # (o la ruta donde esté el repo)

# 2. Descargar los últimos cambios
git pull origin main

# 3. Recompilar y reiniciar el contenedor backend
docker compose up -d --build ms-depositos-usd
```

> **¿Qué ganamos con esto en AWS?**
> Habilitamos `GET /docs.json` y `/api/v1/sandbox/reset` en la IP pública para que los agentes externos puedan consultar el esquema vivo y resetear sus pruebas.

---

## 👥 3. Lo que debemos compartir con los otros grupos (Clientes, Saldos, etc.)

Los otros equipos **NO necesitan clonar el repositorio, ni levantar bases de datos ni Docker**. Su agente de IA puede conectarse directamente a nuestra IP de AWS.

### Mensaje listo para enviar a los compañeros / grupo de la clase:

> *"¡Hola equipo! Ya tenemos listo el **Sandbox MCP de la Billetera Digital USD (DOLARA)** para que sus agentes de IA puedan probar la integración y consumir nuestros endpoints sin dinero real.*
> 
> * **Documentación de Onboarding:** `specs/002-mcp-dolara/contracts/onboarding-equipos.md`
> * **API en vivo (AWS):** `http://54.167.69.62`
> * **Swagger UI:** `http://54.167.69.62/docs/`
> * **OpenAPI JSON vivo:** `http://54.167.69.62/docs.json`
> 
> *Para conectar su agente de IA (Antigravity, Cursor, Claude Desktop o VS Code), solo agreguen esta configuración a su cliente MCP:*
> ```json
> {
>   "mcpServers": {
>     "dolara-billetera-usd-sandbox": {
>       "command": "node",
>       "args": [
>         "<RUTA_A_TU_REPO>/backend/dist/mcp/index.js",
>         "--transport",
>         "stdio"
>       ],
>       "env": {
>         "SANDBOX_API_BASE_URL": "http://54.167.69.62"
>       }
>     }
>   }
> }
> ```
> *Con esto, su agente podrá simular depósitos con `Idempotency-Key`, consultar saldos, verificar que solo aceptamos USD (rechazo de PEN) y autogenerar sus clientes HTTP sin errores de integración."*

---

## 🎓 4. Lo que debemos presentar al docente

Para sustentar la entrega del hito ante el profesor tenemos toda la evidencia lista:

1. **Contrato Canónico OpenAPI y Resolución de Brechas:**
   * Archivo [`specs/002-mcp-dolara/contracts/gap-resuelto.md`](specs/002-mcp-dolara/contracts/gap-resuelto.md) donde justificamos que el borrador anterior proponía PEN y nosotros blindamos el sistema a USD-only.
2. **Puertas de Aceptación Cumplidas:**
   * Idempotencia estricta demostrada.
   * Rechazo de PEN con HTTP 400.
   * Manejo de conflictos 409.
3. **48/48 Pruebas Automatizadas Pasando:**
   * Ejecutables con `npm test` en `backend/`.
4. **Demostración Interactiva:**
   * Podemos mostrar el **MCP Inspector** oficial corriendo en vivo:
     ```bash
     cd backend
     npx @modelcontextprotocol/inspector tsx src/mcp/index.ts --transport stdio
     ```
     (Abre un panel web interactivo para ejecutar las herramientas de DOLARA frente al docente).
