# Aviso de Billetera Digital USD al integrador

El identificador de este equipo en `abigailDurand/Deposito-integrador-` es **`billetera-usd`**. El workflow de esta billetera valida, despliega, publica la imagen de la API en GHCR y entonces envía `repository_dispatch` con el evento `servicio-actualizado`. El receptor fija `services-config/billetera-usd/version.env`.

## Configuración de acceso

1. La propietaria de `abigailDurand/Deposito-integrador-` crea un fine-grained PAT limitado a ese repositorio, con `Contents: Read and write` y vencimiento definido. El token debe poder crear eventos `repository_dispatch` en el repositorio receptor.
2. Una persona con permisos administrativos sobre `Sebitafx/dolara-billetera-usd` guarda ese valor en **Settings → Secrets and variables → Actions → New repository secret**, con nombre exacto `ORQUESTADOR_TOKEN`. No se comparte el valor por chat ni se incorpora al repositorio.
3. El equipo habilita acceso de lectura a `ghcr.io/sebitafx/billetera-usd` para el despliegue del integrador. Si el integrador usa `docker pull` sin autenticación, el paquete de GHCR debe marcarse público; si se conserva privado, su despliegue necesita credenciales de lectura con alcance mínimo.
4. La rama `main` debe contener el workflow. Ejecutar **Actions → CI/CD Pipeline → Run workflow** o publicar un commit en `main`.

El workflow usa `GITHUB_TOKEN` con `packages: write` para publicar la imagen. El PAT del integrador sirve solo para notificar al otro repositorio. Son permisos distintos.

## Verificación

- En Actions de la billetera, `test` y `deploy` deben pasar, `Publicar API USD y avisar al integrador` debe publicar `ghcr.io/sebitafx/billetera-usd:<SHA completo>` y terminar con HTTP 204.
- En Actions del integrador, `Recibir actualizacion` debe recibir `servicio=billetera-usd`, `imagen`, `tag` y `commit` y crear `services-config/billetera-usd/version.env`.
- Verificar que la imagen y etiqueta existan y que el integrador pueda descargarlas. HTTP 204 solo demuestra que GitHub aceptó el aviso; no confirma un despliegue en la nube.

El receptor actualmente fija la versión, pero su workflow deja el despliegue a la nube pendiente. La comunicación HTTP entre microservicios, HTTPS y OAuth M2M requieren configuración adicional; este aviso de imágenes no los sustituye. Mantener saldo y operaciones PEN fuera de la Billetera Digital USD.
