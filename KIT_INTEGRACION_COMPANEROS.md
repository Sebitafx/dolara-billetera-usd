# 🚀 Kit de Integración Rápida: DOLARA (Billetera Digital USD)

Este documento está diseñado para compartirse directamente con los compañeros de los otros equipos (**Clientes, Saldos/Ledger, Depósitos PEN, Retiros y Gateway**) para que puedan conectarse y consumir la API de Billetera USD sin fricción.

---

## 📢 Mensaje para copiar y pegar en WhatsApp / Discord / Teams

> 📢 **¡Hola chicos! Ya está listo el Sandbox y la API de Billetera USD (DOLARA) en AWS.**
> 
> No necesitan instalar base de datos ni Docker; todo está corriendo público en la nube:
> * 🌐 **Base URL:** `http://54.167.69.62`
> * 📖 **Swagger interactivo:** `http://54.167.69.62/docs/`
> * 📄 **OpenAPI Spec (JSON):** `http://54.167.69.62/docs.json`
> 
> Tienen **3 formas súper fáciles de integrarse con nosotros**:
> 
> ---
> 
> ### 🔹 Opción 1: En 1 clic con Postman (Para probar a mano)
> 1. Abre Postman.
> 2. Dale al botón **Import** (arriba a la izquierda).
> 3. Pega este enlace directo de nuestra OpenAPI:
>    `http://54.167.69.62/docs.json`
> 4. ¡Listo! Se te importan automáticamente todos los endpoints con ejemplos y validaciones.
> 
> ---
> 
> ### 🔹 Opción 2: Conectar tu Agente de IA (Cursor / Antigravity / Claude / VS Code)
> Si programas con asistente de IA, agrega esta configuración a tu archivo `mcp.json` o configuración de MCP:
> ```json
> {
>   "mcpServers": {
>     "dolara-billetera-usd-sandbox": {
>       "command": "node",
>       "args": [
>         "<RUTA_A_TU_CARPETA>/ms-billetera-usd/backend/dist/mcp/index.js",
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
> *Luego solo le dices a tu IA en el chat:*
> > *"Conéctate al MCP de DOLARA y genérame el cliente HTTP en mi microservicio (NestJS/Spring/Express) para hacer depósitos y transferencias en dólares."*
> 
> ---
> 
> ### 🔹 Opción 3: Código directo para tu Backend (TypeScript / Axios)
> Si ya estás programando tu servicio, aquí tienes el snippet exacto para hacernos un depósito:
> ```typescript
> import axios from 'axios';
> import { randomUUID } from 'crypto';
> 
> const respuesta = await axios.post('http://54.167.69.62/api/v1/depositos/usd', {
>   cliente_id: 'cliente-activo', // En sandbox usa 'cliente-activo' o 'cliente-bloqueado'
>   monto: '50.00',               // Siempre string decimal con 2 posiciones
>   metodo_origen: 'TRANSFERENCIA'
> }, {
>   headers: {
>     'Idempotency-Key': randomUUID(), // Obligatorio UUID v4
>     'Content-Type': 'application/json'
>   }
> });
> 
> console.log('Depósito completado:', respuesta.data);
> ```
> 
> ---
> 
> ⚠️ **Reglas clave de nuestro microservicio para que no les dé error:**
> 1. **Moneda Exclusiva USD:** Si envían soles (`moneda: "PEN"`), el sistema responderá con error `400 VALIDATION_ERROR`.
> 2. **Idempotencia Obligatoria:** El header `Idempotency-Key` es requerido y debe ser un UUID v4. Si reintentan con la misma key, no se genera doble abono.
> 3. **Clientes de prueba listos en Sandbox:**
>    * `cliente-activo` (Simula cliente aprobado, retorna `201 COMPLETADO`).
>    * `cliente-bloqueado` (Simula rechazo por compliance/fraude, retorna `422 CUSTOMER_BLOCKED`).
>    * `cliente-pen` (Simula cuenta sin habilitación en dólares, retorna `422 USD_ACCOUNT_NOT_ENABLED`).

