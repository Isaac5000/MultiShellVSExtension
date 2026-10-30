# Changelog

## 0.10.10 — Reparación del botón Cerrar terminal

- Sustituye la confirmación del webview mediante window.confirm por un diálogo modal nativo de VSCode.
- Cerrar desde el icono o el menú envía la solicitud al host, que dispone la terminal real tras confirmación.
- Cancelar no cierra ni elimina la terminal y libera el estado de cierre pendiente.
- Pruebas de cancelación, cierre, protección de la principal y vinculación de la interfaz.

## 0.10.9 — Recuperación tras Reload Window sin cwd

- Las terminales del usuario con ID y cwd guardados en el estado del proyecto se reconectan aunque VSCode pierda `creationOptions.cwd` al restaurarlas.
- Si VSCode conserva un cwd que no coincide con el guardado, se rechaza la asociación. Las sesiones sin identidad guardada siguen necesitando un cwd verificable dentro del proyecto.
- No se adopta ninguna terminal si aparecen identificadores físicos duplicados.
- Pruebas de regresión sobre recarga con metadatos incompletos, aislamiento, confirmación de terminal disponible y coordinador.

## 0.10.8 — Reconexión de terminales de usuario

- Reasociación segura de terminales creadas desde el panel al recargar VSCode, conservando identificador, directorio y alias.
- Migración de terminales `MCP [id]` antiguas solo cuando pertenecen al mismo proyecto; protección contra adopciones ajenas y duplicados.
- Confirmación explícita de terminal disponible antes de reactivar los comandos MCP tras una recarga, para proteger trabajos prolongados.
- Limpieza del registro persistente al cerrar voluntariamente la terminal, sin recrearla.
- Nuevas pruebas de recuperación del gestor, del coordinador y del panel.

## 0.10.8 — Proteccion de terminales del usuario frente a timeout

- Clasificación explícita de terminales por origen: `user`, `mcp`, `automatic`.
- Las terminales auxiliares creadas desde el panel conservan sus procesos si un comando MCP agota el tiempo; el error no cierra la terminal.
- Mientras el proceso sigue activo se rechazan nuevas órdenes y se cancelan órdenes pendientes, sin romper la cola FIFO ni provocar ejecuciones solapadas.
- Recuperación automática de la disponibilidad cuando termina la ejecución real; cierre tradicional para terminales MCP/automáticas.
- Indicador de origen y de timeout conservado en el panel bilingüe.
- Pruebas de preservación, aislamiento y reanudación.

## 0.10.6 — Limpieza y distribución portable

- Eliminada una importación sin uso detectada por TypeScript.
- Eliminados los metadatos que presentaban erróneamente el repositorio original como repositorio del proyecto derivado; se mantiene el crédito MIT en el README y la licencia.
- Retirada la documentación exclusivamente de desarrollo del instalador VSIX, conservándola en el proyecto fuente.
- Añadida una guía de instalación portable y un empaquetador por lista blanca para transferir el proyecto con su VSIX, archivos fuente, pruebas y scripts, sin node_modules ni datos locales.
- Actualizadas las instrucciones y las comprobaciones de portabilidad.

## 0.10.5 — Workspace Trust

- Inhabilita explícitamente la extensión en Restricted Mode mediante `capabilities.untrustedWorkspaces.supported=false`.
- Añade un guardia adicional en el arranque automático y manual para impedir activar el servidor MCP en proyectos no confiables, incluso si el usuario anula la restricción de VSCode para la extensión.
- Incorpora pruebas automatizadas de bloqueo y de arranque al conceder confianza.

## 0.10.4 — Recuperación de terminales restauradas

- Reconoce las terminales principales MCP restauradas por VSCode en el proyecto de cada ventana y evita crear una principal duplicada.
- Conserva el identificador de la terminal principal entre reinicios, con prioridad para el ID recordado y selección de la primera restaurada si todavía no existe un registro previo.
- Recupera las otras terminales principales antiguas como shells independientes, sin cerrarlas automáticamente.
- Protege las terminales normales y las de otros proyectos; espera brevemente por terminales restauradas con retraso.
- No destruye las terminales al recargar la extensión ni al cambiar de puerto; el apagado explícito mantiene el cierre habitual.
- Añade pruebas de recuperación, ejecución sobre sesiones restauradas, cierre seguro y ausencia de duplicados.

## 0.10.3 — Etiqueta y nombre de la extensión

- El indicador inferior incluye el nombre: `MultiShell MCP: ON · <puerto>` en verde o `MultiShell MCP: OFF` en amarillo.
- Conserva su acción de inicio/parada, sin cambios en el panel ni en la configuración.

## 0.10.2 — Puerto MCP configurable desde el panel

- Edita el puerto compartido desde MultiShell MCP → Puerto MCP y aplica el cambio a todas las ventanas mediante los ajustes globales de VSCode.
- Reinicio automático de las instancias activas; si el nuevo puerto falla, se intenta restaurar el anterior.
- El estado inferior muestra ON · <puerto real> en verde, y OFF en amarillo cuando está detenido.
- Cambiar el puerto local no reconfigura los túneles externos.


## 0.10.1 — Indicador compacto

- La barra inferior muestra únicamente ON en verde o OFF en amarillo. Se conserva el clic para iniciar/detener y los detalles siguen en el panel lateral.

## 0.10.0 — Windows hardening and bundled distribution

- Reintroduced native VSCode diagnostics, workspace symbols, document symbols, definitions and hover with explicit shell ownership.
- Kept compatible named parameters (symbol, maxDepth, severities, format) and legacy shell selectors.
- Added tests of owner-window routing, file-sandbox boundaries, 2-window workers, startup, alias failover and HTTP MCP behavior.
- Bundled the extension into a self-contained JavaScript runtime (no node_modules or native binaries in VSIX).
- Updated Zod to patched 4.x and verified zero production-dependency vulnerabilities.
- Added reproducible Windows QA commands and a post-reload manual checklist.

## 0.9.1 — Relative paths, terminal lifecycle and new icon

- Relative shell directories resolve against the owning VSCode workspace on Windows and Linux.
- Worker/router cleanup also handles terminals closed manually in VSCode and releases aliases.
- Sidebar action buttons have a fixed right-hand column; long shell IDs truncate safely.
- Separate copy-selector, copy-chat-instructions and close actions, with a guarded close operation.
- Original two-terminal/hub icon replaces the inherited extension logo and sidebar glyph.

## 0.9.0 — Short shell aliases

- Short numeric and named aliases accepted as explicit shell selectors for all MCP tools and legacy request paths.
- Auto-generated alias from each workspace; collisions automatically suffixed and manual conflicts rejected.
- Sidebar shows `shell=alias`, supports alias rename via native VSCode input and copies a one-line chat instruction.
- Main alias saved per VSCode workspace from panel; worker alias maps survive coordinator failover.
- No implicit/global active shell; full shell IDs remain valid.

## 0.8.1 — Source cleanup

- Removed inactive legacy file, edit, diagnostic and symbol modules and their obsolete VSCode tests.
- Retained HTTP and concurrent multi-window integration tests under test/.
- Pruned obsolete development dependencies and configuration fields.
- Cleaned generated output on each build and excluded tests/development resources from VSIX packages.
- No intentional changes to routing, legacy connector compatibility or bilingual panel.

## 0.8.0 — Visual panel

- Compact responsive Spanish/English UI, workspace/window tabs, terminal status and actions.

## 0.7.1 — Legacy connector compatibility

- Explicit @shell:<id> selectors and @mcp read-only discovery.

## 0.7.0 — Multi-window support

- Per-window primary shell, coordinator/worker routing and a single public port.
