# Auditoría con skills — MultiShell MCP

Fecha: **5 de noviembre de 2026**. Código revisado sobre la rama `main`, referencia Git `951337b` y modificaciones locales sin publicar.

## Método y alcance

Se consultaron y aplicaron las skills locales `mcp-builder`, `systematic-debugging`, `test-driven-development`, `differential-review`, `verification-before-completion` y `node`. Se revisaron las rutas de autenticación, operaciones de archivos dentro del proyecto, checkpoints, registro de herramientas MCP y empaquetado. La comparación de riesgos priorizó accesos a disco, rutas y límites de recursos. La referencia Git **no contiene todos los cambios locales**: esta revisión no pretende equivaler a una auditoría integral de cada diferencia pendiente.

Las modificaciones se hicieron únicamente después de pruebas que reproducían el fallo. No se ejecutaron modelos externos ni API de pago.

## Hallazgos corregidos

### 1. Sustitución del archivo de checkpoint durante la lectura

**Impacto:** integridad de datos del traspaso entre chats. **Severidad:** moderada, con requisito de que otro proceso local pueda modificar el directorio de almacenamiento.

En `src/chat-handoff-store.ts`, la lectura comprobaba un nombre de archivo mediante `lstatSync` y luego abría la ruta nuevamente con `readFileSync`. Entre ambas operaciones un proceso local podía sustituir el archivo por otro JSON de identificador válido; la aplicación aceptaba el contenido reemplazado.

**Prueba roja:** `node test/test-chat-handoff-read-race.cjs` falló porque el checkpoint sustituido se aceptaba sin error.

**Corrección:** descriptor único, `O_NOFOLLOW` donde exista, comprobaciones de archivo regular e identidad `dev/ino` antes y después de leer, revisión de tamaño y modificación, y lectura acotada a 16 KiB. **Prueba verde:** el archivo sustituido se rechaza y el checkpoint original permanece íntegro.

### 2. Edición de archivos muy grandes sin límite de memoria

**Impacto:** disponibilidad del host de VS Code. **Severidad:** moderada.

En `src/tools/scoped-file-tools.ts`, `replace_lines_code` cargaba el archivo completo, dividía todas sus líneas y reconstruía todo el contenido. Un archivo disperso de **64 MiB** se procesaba para cambiar una sola línea.

**Prueba roja:** `node test/test-file-edit-size-limit.cjs` falló: la operación fue aceptada sin límite de tamaño.

**Corrección:** límite de **32 MiB** para edición completa con comprobación antes de leer y antes de publicar el contenido nuevo. `read_file_code` por rangos y `copy_file_code` conservan sus mecanismos propios y no están sujetos a este nuevo límite de edición. **Prueba verde:** la operación se rechaza sin modificar el archivo.

### 3. Metadatos de seguridad de herramientas MCP

**Impacto:** claridad y compatibilidad de permisos en clientes que utilizan anotaciones MCP. **Tipo:** mejora de contrato, no vulnerabilidad confirmada.

`src/tools/tool-registry.ts` admite ahora anotaciones `readOnlyHint`, `destructiveHint`, `idempotentHint` y `openWorldHint`. Se aplicaron explícitamente a lectura de archivos y checkpoints y a la escritura de checkpoints. No se infieren permisos de los nombres de herramientas.

**Prueba roja/verde:** `node test/test-mcp-http.cjs` falló sin las anotaciones y pasó cuando los metadatos llegaron al listado MCP real.

### 4. Empaquetado de metadatos de desarrollo

La nueva `skills-lock.json` permanece en el repositorio para trazabilidad, pero `.vscodeignore` la excluye del VSIX. La prueba `test/test-package-privacy.cjs` comprueba tanto la regla como el contenido final del paquete.

## Límites y riesgos no resueltos

- Un servidor MCP ejecuta operaciones bajo los **permisos de usuario** de VS Code; no constituye una sandbox del sistema operativo. Deben mantenerse Workspace Trust y la selección exacta de shell.
- Las protecciones frente a cambios simultáneos de directorios y enlaces simbólicos son defensivas; la garantía absoluta frente a renombrados adversarios de ancestros exige primitivas específicas del sistema operativo, como `openat2` en Linux.
- Los bloqueos locales de checkpoints se dejan sin desbloqueo automático tras un fallo abrupto: es una decisión de seguridad que puede exigir mantenimiento manual.
- No se ha auditado cada ruta del cliente de túnel, cada proveedor multiIA ni la seguridad de todos los scripts que las skills de terceros puedan incluir. **Las skills se leyeron, pero no se ejecutaron sus scripts auxiliares.**
- Las anotaciones MCP son metadatos para los clientes: **no sustituyen permisos del servidor**.

## Verificaciones

- Red/green de las dos regresiones nuevas; pruebas de edición atómica, lectura en flujo, persistencia de checkpoints y contrato HTTP MCP.
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilidades comunicadas** en el conjunto revisado.
- `npm run lint` y `npm run bundle`: **código de salida 0**.
- `node scripts/run-tests.cjs --batch=N --batches=3`: **51/51 + 50/50 + 50/50 = 151/151 suites superadas**.
- `npm run package:all`: **código de salida 0**; VSIX 0.10.65 generado como candidata; el archivo definitivo se verifica después de empaquetar este informe.
- `test/test-package-privacy.cjs` y `test/test-documentation.cjs`: superadas; la primera confirma que `skills-lock.json` y el agente facturable están ausentes del VSIX.
- `git diff --check`: **código de salida 0**.
- Túnel local `/readyz` y `/healthz`: **HTTP 200** sin reiniciar procesos.
- La instalación activa permanece en **0.10.64**; 0.10.65 es una candidata no instalada. No se ha hecho un ensayo en ejecución de la nueva instalación ni se han publicado cambios en GitHub.

**Criterio de publicación:** pasar todas las suites, comprobar contenido del VSIX, verificar la exclusión de archivos privados, confirmar que el túnel sigue operativo y realizar después una validación manual de la versión instalada.

Documentación compatible con 0.10.72.