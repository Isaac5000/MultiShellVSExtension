# Pruebas, validación y diagnóstico

## Agente persistente y memoria SQLite (0.10.57)

- Pruebas específicas para almacenamiento SQLite, aislamiento de la memoria por objetivo, recuperación de contexto, búsquedas FTS5, checkpoints, propiedad de sesión, bloqueo entre procesos, importación de archivos y CLI.
- Validar cada paso con una IA ficticia, sin accesos a shells MCP ni llamadas de pago.
- Los fallos del controlador deben dejar el objetivo pausado o bloqueado. El reinicio no puede reanudar un trabajo sin autorización.
- El agente requiere **Node.js 24+ externo**; la extensión VS Code conserva sus requisitos de ejecución habituales.

## Continuación automática simulada y persistencia (0.10.56)

- Pruebas de motor, etapa ficticia, cierre y reapertura, traspaso de contexto, autorización explícita, presupuestos, idempotencia, identidad del chat y checkpoints manipulados.
- El almacenamiento local valida la estructura del objetivo, detecta modificaciones accidentales de sus parámetros y **nunca restaura una ejecución automáticamente**.
- Las conversaciones nuevas son **simuladas**, sin llamadas a Codex ni a ningún proveedor de IA; los permisos y controles MCP siguen sin ampliarse.
La persistencia entre chats se comprueba con test/test-chat-handoff-http.cjs y test/test-chat-handoff-store.cjs. No existe simulador de chats automaticos.

## Optimizaciones del panel y del protocolo (0.10.55)

- Pruebas superadas: `test-bounded-map`, `test-ai-provider-status-parallel`, `test-panel-config-status-parallel`, `test-panel-hidden-refresh` y `test-mcp-compact-responses`.
- Las comprobaciones independientes se limitan a seis perfiles simultáneos; conservan el orden y no almacenan secretos.
- El panel oculto deja de consultar periódicamente ventanas, archivos y SecretStorage, pero se actualiza al mostrarse.
- Las herramientas MCP de terminales, archivos y VS Code nativo devuelven JSON compacto sin alterar los datos.
- **144/144 suites automatizadas superadas en cinco tandas**, con compilación, bundle, ESLint y TypeScript estricto correctos.
- Pruebas gráficas reales pendientes: el instalador de VS Code sigue activo; no se ha forzado su cierre.

## Cachés e índice de Agent Skills (0.10.54)

- Pruebas de invalidación al editar, crear y eliminar skills y referencias; integridad SHA-256, límites de rutas, aislamiento de objetos, JSON compacto y transferencia UTF-8/Base64.
- Referencia sintética Windows, 180 skills/360 archivos, nueve páginas: ~6,99 s antes, ~0,87 s con caché caliente y ~1,28 s en la primera ejecución.
- No se omiten comprobaciones de acceso, symlinks o rutas; MCP Skills conserva `ttlMs: 0` para los clientes.
## Trabajos aislados asíncronos (0.10.53)

- Pruebas de gestor, MCP real en puertos de prueba, recuperación tras un nuevo coordinador, procesos paralelos con una terminal ocupada, permisos por IA, panel y revocación por cierre de terminal.
- La ejecución da un `job_id` y la consulta de estado permite leer salida parcial y resultado, sin repetir comandos. La cancelación solo afecta a los hijos aislados de MultiShell.
- **133/133 suites automatizadas correctas** en cinco tandas. Se han verificado la compilación, TypeScript estricto y ESLint. Las pruebas gráficas reales siguen pendientes cuando el actualizador de VS Code bloquea el host aislado.
- Límites de protección: 12 trabajos simultáneos, 96 registros, retención de 30 minutos, salida reciente de 16 KiB. No persisten al reiniciar la ventana propietaria.



## PowerShell 7 instalado y pruebas reales de VS Code (04/11/2026)

- **Entorno:** PowerShell 7.6.9 funciona en Windows. `pwsh.exe` se resuelve mediante un alias de WindowsApps que Node no reconoce con `fs.existsSync()`. Se corrigieron los lanzadores `test:vscode` y `test:windows` para validar el ejecutable mediante `pwsh --version`, con regresión `test-test-shell-resolver.cjs`.
- **Regresión completa:** **126/126 suites aprobadas** en cinco tandas, agregadas sin duplicados por `scripts/aggregate-test-reports.cjs`. ESLint, compilación, bundle y `git diff --check` correctos.
- **Pruebas gráficas reales:** se inició `test:vscode` con un perfil aislado, pero VS Code impidió abrirlo con `Code is currently being updated`; el instalador `CodeSetup-stable-...` seguía activo y la prueba agotó 180 segundos sin arrancar el host. No se detuvo el instalador ni ningún VS Code del usuario.
- **Pendiente:** finalizar la actualización de VS Code y repetir `npm run test:vscode` y `npm run test:windows`. No se han validado todavía la ventana adicional, los terminales integrados reales ni el failover de dos ventanas.

## Endurecimiento de pruebas y pasarelas (04/11/2026, sin publicar)

- **Pasarelas IA:** `stopOne()` conserva el servidor registrado hasta que `stop()` termina correctamente. Se ha probado el error de cierre y el reintento; un cierre fallido impide continuar con la rotación de credenciales.
- **VS Code real:** los bancos `test:vscode` y `test:windows` se han adaptado a la autenticación local obligatoria desde 0.10.51. Usan un archivo de token en un perfil aislado y no incorporan claves a registros. Las 80 operaciones de conexión se ejecutan por oleadas de 20.
- **GitHub Actions desactivado (06/11/2026):** eliminado `.github/workflows/ci.yml` por bloqueo de facturación. Las compilaciones, ESLint, regresiones y paquetes siguen disponibles mediante comandos `npm` locales; no se lanzan trabajos al hacer `push` o abrir una PR.
- **Ejecución por tandas:** `npm run bundle` seguido de `npm run test:batch -- --batch=1 --batches=5 --report=.vscode-test/test-results/batch-1.json` (repetir con 2–5). `node scripts/aggregate-test-reports.cjs .vscode-test/test-results` detecta fallos, pruebas duplicadas y tandas incompletas.
- **Panel:** el test comprueba identificadores, CSP, nonce y recursos locales sin exigir un SHA-256 fijo que bloquearía cambios legítimos.
- **Verificación actual:** **125/125 suites correctas** en cinco tandas de 25; compilación, bundling, ESLint y TypeScript estricto correctos. Los informes locales están en `.vscode-test/test-results`.
- **Pendiente:** las pruebas gráficas requieren PowerShell 7 (`pwsh`), no disponible en el entorno observado. Las pruebas locales reales en Linux/macOS, la conexión de clientes IA y el arranque sin ventana de Windows Terminal siguen pendientes; no se usan trabajos de GitHub Actions.

## Refactorización no publicada sobre el código 0.10.52 (04/11/2026)

- Se extrajo el HTML estático del panel a `src/panel-markup.ts` y se verificó inicialmente la equivalencia byte por byte. La regresión actual comprueba identificadores, CSP, nonce y recursos sin fijar un hash permanente.
- El registro de los ocho comandos del túnel se separó del procedimiento `activate()` mediante `registerTunnelCommands`, sin cambiar el orden ni los manejadores.
- Se eliminaron una importación sin uso y dos propiedades redundantes del coordinador; se conservaron los parámetros de compatibilidad de las interfaces existentes y se simplificó la ocultación de ventanas a clientes IA restringidos.
- **119 de 119 suites automatizadas superadas** en cinco tandas (24 + 24 + 24 + 24 + 23). Compilación, bundling, ESLint y TypeScript con `noUnusedLocals`/`noUnusedParameters` también correctos.
- Sin nuevo número de versión ni VSIX publicado. Las pruebas reales de interfaz, reconexión remota y ausencia de Windows Terminal en el equipo siguen requiriendo instalación y verificación manual.

**Resultado 0.10.51:** 116/116 suites automatizadas superadas en cinco tandas (24 + 23 + 23 + 23 + 23); compilación TypeScript, empaquetado VSIX/plugin, ESLint y `git diff --check` correctos. Auditoría npm de dependencias de producción: 0 vulnerabilidades notificadas. Pendientes las pruebas manuales de reinicio de VS Code, ventana de Windows Terminal y conexión ChatGPT mediante un túnel real tras instalar el VSIX.


## Validación 0.10.52 — Pasarelas de IA y listados protegidos

**Resultado de regresión:** 118/118 suites automatizadas superadas en cinco tandas (24 + 24 + 23 + 24 + 23), incluida la prueba nueva de intercambio de directorios y la detección de entradas MCP antiguas sin autenticación. El catálogo de proveedores ya no anuncia instalación automática para conexiones que requieren un gateway con clave.

Las pruebas `test-authenticated-local-config.cjs` y `test-ai-panel.cjs` verifican que no se aceptan entradas antiguas sin autenticación ni se escriben archivos de configuración inservibles. `test-ai-connection-render.cjs` verifica la retirada del botón antiguo y la recuperación de la opción **Desvincular** para instalaciones anteriores. `test-list-file-race.cjs` reproduce una lista de directorio externo durante una sustitución y exige su rechazo. El marcador de Bearer se copia sin revelar el secreto real.

**Pendiente:** comprobar en la instalación real que Gemini/Claude/Cursor/Copilot pueden usar sus respectivas pasarelas después de introducir la credencial por un método seguro; validar asimismo que no aparezca Windows Terminal al abrir VS Code con la nueva versión y que el túnel de ChatGPT siga funcionando. Las carreras del sistema de archivos se han mitigado, no eliminado con una garantía nativa formal.

## Validación 0.10.51 — Seguridad MCP y ventana de consola

Regresiones: `test-runtime-hardening.cjs` exige autenticación en el servidor principal, rechazo 401 previo al análisis del JSON y límite de 32 solicitudes con HTTP 429; `test-security-audit-probes.cjs` comprueba que una carrera simulada de enlaces simbólicos no devuelve ni reemplaza archivos señuelo externos; `test-native-shell-compat.cjs` verifica la resolución segura de terminal única y el rechazo de ambigüedad; `test-tunnel-lifecycle.cjs` valida las cabeceras inyectadas por entorno y el modo de arranque de Windows.

**Comprobación manual posterior a instalar:** detener e iniciar una vez el túnel administrado desde el panel y reiniciar VS Code. Confirmar que ya no aparece una ventana separada de Windows Terminal y que ChatGPT puede invocar herramientas mediante el mismo `tunnel_id`. No se ha cerrado ni terminado ninguna terminal de usuario durante estas pruebas.

**Límite técnico:** sin API nativa `openat2` / apertura relativa a descriptores no puede demostrarse ausencia total de carreras adversariales con antecesores renombrados entre operaciones. Se valida el rechazo de las condiciones de carrera reproducidas, no una garantía absoluta en todos los sistemas operativos.

## Validación 0.10.51 — Integración ChatGPT y limpieza de claves

`test-chatgpt-plugin-guide.cjs` comprueba que la ayuda de ChatGPT contiene los campos y pasos oficiales para crear un complemento **Add custom MCP server** mediante conexión **Tunnel**, asociando el mismo `tunnel_id` en Platform, MultiShell y ChatGPT. Valida los cuatro enlaces oficiales (Tunnels, claves de ejecución, ChatGPT y guía de plugins) y que el formulario del complemento **nunca solicita la API key de ejecución del túnel**. Las pruebas de onboarding verifican que Gemini CLI/Claude Code no ofrecen campos de API key innecesarios y que los secretos heredados solo se borran con una acción explícita.

**Regresión:** 113/113 suites en cuatro tandas (29 + 29 + 29 + 26), TypeScript y ESLint correctos. Esta validación comprueba instrucciones y comportamiento del panel, pero **no crea un complemento real dentro de una cuenta ChatGPT**, ni verifica que el túnel de esa cuenta esté asociado a un espacio de trabajo concreto.

## Validación 0.10.49 — Asistentes y secretos por proveedor

Corrección de regresión: la prueba del panel heredada simulaba `workspaceState` sin `globalState`. La lectura del nuevo gestor de credenciales ya admite esta configuración de pruebas, y `test-panel.cjs` espera el primer estado válido y libera los temporizadores incluso tras un error. El bloqueo en `node test/test-panel.cjs` quedó reproducido, diagnosticado y resuelto; se comprobó su finalización con código 0. Las **112 suites de regresión** superan las cuatro tandas (29 + 29 + 29 + 25).

`test-ai-provider-onboarding.cjs` valida que los 10 tipos de cliente tienen guías en español e inglés, comandos y enlaces oficiales HTTPS, campos adecuados por proveedor, validación de URL pública y aislamiento de claves en SecretStorage. Comprueba que las claves no entran en los metadatos ni en snapshots, rechaza URL HTTP/localhost/credenciales incrustadas, no permite campos de otro proveedor y confirma el borrado selectivo. `test-ai-panel.cjs` verifica guardar y borrar desde el panel, avisos de confianza, prohibición de URLs inseguras y apertura de enlaces desde un catálogo autorizado. `test-ai-connection-render.cjs` comprueba los desplegables **?**, comandos, inputs de contraseña vacíos tras guardar y ausencia de credenciales en HTML.

**Límite:** instalar un cliente local y verificar su conexión MCP requiere una prueba real en la aplicación del usuario. Estas guías no constituyen una prueba de funcionamiento con Claude web, Grok ni de OAuth/túneles públicos.

## Validación 0.10.48 — Identidades y aislamiento multIA

Pruebas nuevas: `test-ai-access.cjs` verifica comparación de secretos Bearer, exactitud del shell ID, rechazo de ejecución/edición ajena, límites globales y fallo seguro cuando la raíz original cambia. `test-ai-gateways.cjs` crea cinco servidores MCP reales independientes sobre loopback, con cinco identidades distintas, ejecuta peticiones concurrentes y verifica credenciales cruzadas (401), fallos de permisos, acceso a otra terminal, ausencia de rutas de administración, validación de origen (403), rotación/revocación individual, autostart opt-in y rechazo inmediato ante pérdida del hub (503). `test-ai-panel.cjs` verifica confirmaciones, estados de UI y que ningún secreto se envía al Webview.

Pruebas adicionales: `test-ai-gateway-limits.cjs` mantiene 32 peticiones MCP concurrentes bloqueadas, comprueba que la solicitud 33 recibe HTTP 429 con `Retry-After: 1` y que las credenciales inválidas obtienen 401 incluso bajo saturación. `test-package-privacy.cjs` inspecciona el VSIX para impedir que `.mcp.json`, respaldos locales y temporales de credenciales se distribuyan.

**Limitaciones:** clientes HTTP MCP simulados; no se ha iniciado ni configurado una conexión HTTPS desde Claude/Grok. La integración con las cuentas de proveedores y túneles externos sigue pendiente. El puerto 3000 anterior conserva su funcionamiento local habitual para OpenAI Tunnel Client; la política de esta versión se aplica a los nuevos endpoints protegidos, no a todo el MCP local preexistente.

## Validación 0.10.47 — Tarjetas IA y escapes seguros

Pruebas nuevas:
- `test-ai-connection-render.cjs`: todos los ID utilizados por el script existen en el HTML y dos perfiles (local y remoto) generan sus tarjetas completas.
- `test-interactive-escape-guards.cjs`: comillas sin cerrar, barras invertidas ambiguas, escapes y caracteres de control desactivan reconocimiento de paginador; comandos correctamente entrecomillados siguen admitidos. El prompt `>>` solo produce una indicación.
- `test-interactive-safety.cjs` ampliada con pantallas de paginador simuladas bajo comandos mal entrecomillados: no se envía `q` a esos procesos.

**Resultado de regresión:** 107 de 107 suites superadas en cuatro tandas; compilación TypeScript, ESLint y documentación bilingüe correctos. Quedan fuera del alcance de estas pruebas las sesiones reales de IAs externas y la fiabilidad absoluta de comandos arbitrarios mal escritos.

## Validación 0.10.46 — Proveedores específicos y límites de conexión cloud

`test-ai-provider-catalog.cjs` comprueba el catálogo de cinco modalidades remotas y cuatro configuraciones locales más cliente genérico, URLs oficiales HTTPS, modos de transporte, descripciones bilingües, persistencia sin secretos y rechazo de fragmentos `localhost` para proveedores cloud. `test-ai-panel.cjs` comprueba que los botones de la interfaz no intentan configurar el MCP local para Claude web, no declaran conexión remota y abren solo la página oficial almacenada en el catálogo.

**Límites:** las pruebas no implican conexiones reales con proveedores cloud. No existe un gateway HTTPS remoto integrado, tokens OAuth emitidos por MultiShell ni permisos separados por perfil. No hay acceso público añadido al puerto MCP local. Instalar o autenticar un proveedor externo sigue requiriendo su propia interfaz y método oficial.

## Validación 0.10.45 — Configuración automática desde Conexiones IA

Pruebas: `test-ai-client-config.cjs` verifica Copilot, Gemini CLI, Cursor y Claude Code con rutas de prueba temporales, conservación de configuraciones JSONC y comentarios, copia de seguridad de archivos existentes, instalación idempotente, desvinculación de entradas propias, recuperación tras cambios de puerto, rechazo de colisiones, enlaces simbólicos y bloqueos. `test-ai-panel.cjs` verifica las confirmaciones de configurar y desvincular, permisos de Workspace Trust y la imposibilidad de eliminar un perfil gestionado sin retirar antes su entrada MCP. `test-panel-layout.cjs` verifica la presencia de botones de configuración.

**Validación automatizada de Windows:** 104 de 104 suites superadas en cuatro tandas, TypeScript y ESLint correctos. Las pruebas de instalación se realizan exclusivamente sobre configuraciones de prueba; **no se han alterado perfiles reales** de Copilot, Gemini, Claude o Cursor.

**Limitaciones:** no se ha probado el inicio real de ninguna de esas aplicaciones ni su autenticación o descubrimiento de herramientas después de cargar los archivos. «Configurado» certifica únicamente la entrada MCP presente en el archivo, no una conexión de la IA. El servidor MCP sigue sin autenticar identidades por cliente ni restringir shells por proveedor.

## Validación 0.10.44 — Solicitudes, concurrencia y carga multIA

Pruebas `test-panel-layout.cjs` y `test-panel.cjs` actualizadas: «Solicitudes» ocupa una única pantalla, no contiene `<details>` interno y preserva la aprobación/rechazo. Navegación por teclado y otras páginas sin cambios.

Nuevas suites:
- `test-five-ai-clients.cjs`: cinco clientes HTTP MCP independientes, un coordinador y cinco trabajadores; 147 llamadas de prueba. Ejecución concurrente en shells distintos, FIFO al compartir un shell, eliminación de colas, verificación de respuestas y prueba negativa de falta de aislamiento de identidad.
- `test-five-ai-one-window.cjs`: cinco clientes, un coordinador y cinco terminales simuladas en una sola ventana; 207 llamadas, cinco directorios separados, bloqueo de uso compartido no autorizado y progreso de otras terminales cuando una está bloqueada.
- `MULTISHELL_SOAK_SECONDS=30 node --expose-gc test/connection-soak.cjs`: 6.756 comandos simulados en 30,1 s, p95 48 ms, lag del event loop p99 46,56 ms, cero errores inesperados, crecimiento de memoria dentro del límite del test.

**Verificación final de código:** la cancelación HTTP se propaga a las herramientas por solicitud mediante `AsyncLocalStorage`, combinando su señal con la del SDK cuando está disponible. La regresión de 100 peticiones y 80 cancelaciones superó **3 ejecuciones consecutivas**; el registro de `npm test` contiene el resultado **PASS: 103 test suites** tras la modificación. También pasaron ESLint y auditoría npm (0 vulnerabilidades conocidas). El canal de terminal MCP se recuperó durante el test integrado, por lo que la confirmación se obtuvo del registro, no de la respuesta de salida del comando.

Se había observado intermitencia antes de la corrección bajo saturación; no se afirma fiabilidad del 100 % en todos los escenarios. Un experimento de diagnóstico sin cierre correcto fue excluido de las suites. La conexión con cinco clientes reales y la validación en Linux/macOS siguen pendientes.

**Límites de la evidencia:** se utilizaron workers/terminales simulados, no cinco aplicaciones de IA reales. Las mediciones corresponden al equipo y a comandos muy ligeros. Las colas son independientes por `shell_id`, pero ninguna identidad de cliente impide llamar a otro shell ni existe un bloqueo general de edición de archivos por proveedor. Usar worktrees/directorios separados para tareas de escritura en paralelo. No exponer la URL MCP local en redes públicas.

## Validación 0.10.43 — Menú estructurado y conexiones locales

Nuevas pruebas `test-panel-navigation.cjs`, `test-ai-connections.cjs` y `test-ai-panel.cjs`: navegación y vista activa, persistencia local sin credenciales, ejemplos de configuración para clientes MCP, avisos explícitos de riesgo, rechazo en proyectos no confiables y no exposición de procesos remotos. Los cambios de diseño no alteran la ejecución ni los permisos de las terminales existentes.

No se afirma compatibilidad funcional con una IA hasta hacer pruebas de extremo a extremo desde su cliente real. Los perfiles locales comparten actualmente los permisos globales del servidor.

## Validación 0.10.42 — Seguridad de bloqueo, recuperación y puertos

**98 de 98 suites automatizadas superadas en Windows**, ejecutadas en cuatro tandas tras estabilizar las pruebas de reinicio de puerto y FIFO. TypeScript, ESLint y `npm audit --audit-level=low` correctos: cero vulnerabilidades conocidas. Las pruebas nuevas cubren varias ventanas compitiendo por el mismo bloqueo; sustitución durante una consulta; guardias de recuperación huérfanos; identidad de un proceso real en Windows; recarga y parada simuladas; cambio atómico del puerto y preservación del YAML. Se rechaza la adopción sin prueba suficiente.

El túnel actualmente activo no se modifica durante la validación; quedan pendientes las pruebas completas de conectividad remota y la ejecución física en Linux/macOS.

## Validación 0.10.41 — Pestaña Túnel integrada

Se han añadido pruebas de regresión del panel para creación y selección de perfiles, instalación, conexión, desconexión confirmada, arranque automático, validación del host local y ausencia de la API key en los mensajes de vuelta. Las pruebas usan dobles del gestor; no implican una conexión de producción. **95 de 95 suites automatizadas superadas** en Windows, distribuidas en cuatro tandas para evitar los timeouts de la terminal MCP. TypeScript y ESLint también han finalizado correctamente. Las pruebas de aceptación manual del VSIX y de un túnel remoto real siguen pendientes.

## Validación 0.10.40 — Gestor de Tunnel Client v0.0.19

- **94 de 94 suites automatizadas superadas** en Windows, incluyendo pruebas adicionales de los comandos de la extensión, instalación de archivos ZIP, integridad SHA-256, bloqueo interproceso, reutilización de perfiles y simulación de arranque, reinicio y parada de Tunnel Client.
- TypeScript, ESLint, documentación bilingüe y `npm audit --audit-level=low`: correctos; la auditoría informa **0 vulnerabilidades conocidas**.
- El asistente utiliza `ExtensionContext.secrets` para la API key, crea perfiles aislados con `init` y no sobrescribe ni detiene un túnel que ya estaba ejecutándose.
- Compatibilidad del instalador configurada para Windows, Linux y macOS en x64 y ARM64. **Las pruebas ejecutadas no incluyen instalaciones físicas en Linux ni macOS.**
- **Pendiente:** prueba completa contra un túnel real iniciado por los comandos nuevos, con credenciales del usuario. No se ha realizado para preservar la sesión externa actual.


[English](../en/validation.md) · [Índice](../../README.md)

Estado de referencia: **MultiShell MCP Server 0.10.51**. La validación incluye compilación, ESLint, auditoría de npm, regresiones, carga HTTP y ventanas reales de VS Code con perfiles separados. Los resultados actuales y sus límites se detallan al final; las pruebas locales no acreditan la continuidad del túnel externo.

Las regresiones de skills comprueban la lectura de `SKILL.md`, metadatos YAML, aislamiento entre ventanas, protección de rutas, recursos `skill://index.json` y permisos de lectura. Véase [Agent Skills](skills.md).

## Pruebas automatizadas

Desde la raíz del repositorio, con Node.js 22.13 o posterior y dependencias instaladas:

```bash
npm run test:multishell
npm run lint
npm run package
```

En Windows, el procedimiento integral es:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-windows.ps1
```

El script ejecuta las pruebas y ESLint, comprueba vulnerabilidades conocidas de producción mediante `npm audit --omit=dev --audit-level=low`, empaqueta el VSIX y verifica su contenido. El paquete no debe incluir `node_modules`, código TypeScript no compilado, salidas `out`, ejecutables nativos ni el cliente del túnel.

Las suites automatizadas abarcan MCP HTTP, varias ventanas, enrutamiento, alias, permisos de lectura/edición, rutas y enlaces simbólicos, colas FIFO, ejecuciones simultáneas, cancelación y timeout, restauración de terminales, aprobación modal simulada, persistencia concurrente, panel bilingüe, Workspace Trust y recuperación de servidores.

## Pruebas con la extensión realmente instalada

Antes de ejecutar comandos comprueba que el panel indique **ON**, muestre el puerto y reconozca tu ventana. Usa **Ventanas** para verificar los identificadores.

Si una terminal restaurada espera verificación, MultiShell comprueba automáticamente el runspace de PowerShell. **Comprobar disponibilidad** repite la inspección sin diálogo manual. Una consulta fallida nunca demuestra inactividad; verifica también que exista integración de shell para ejecutar órdenes integradas.

Las consultas de control `windows` o `shells` con `cwd="@mcp"` confirman que responde el servicio MCP, **pero no prueban que la terminal pueda ejecutar comandos**.

### Lista de verificación manual

- [ ] Confirmar que la versión instalada corresponde al VSIX que se desea probar y que el panel refleja el puerto y el estado reales.
- [ ] Ejecutar una orden corta en la principal después de su recuperación automática.
- [ ] Comprobar con **dos ventanas reales** sus IDs y roles de coordinador/trabajador; ejecutar comandos simultáneos en terminales diferentes.
- [ ] Crear una terminal temporal con `create_shell_code` y comprobar que su origen es `mcp`.
- [ ] **Solo con autorización expresa del usuario**, solicitar una terminal persistente con `create_user_shell_code`; comprobar la bandeja de solicitudes, el rechazo sin creación y la aceptación con los datos correctos.
- [ ] Crear y cerrar terminales de usuario desde el panel, comprobando una sola confirmación y que el rechazo no interrumpe el proceso.
- [ ] Ejecutar dos tareas paralelas en terminales de usuario distintas y dos comandos sucesivos en una misma terminal; comprobar orden FIFO y ausencia de solapamientos.
- [ ] Recargar VS Code con terminales de usuario abiertas: recuperar sus IDs sin duplicarlas y reactivarlas automáticamente si la inactividad es verificable; conservar la protección si no se puede verificar su estado.
- [ ] Comprobar que una terminal principal o de usuario **conserva** su proceso tras timeout; las temporales pueden tener otra política.
- [ ] Probar cambio de coordinador, desconexión y recuperación de ventanas sin mezclar archivos ni terminales de proyectos distintos.
- [ ] Comprobar la recuperación del túnel después de recargar la extensión, sin cambiar su perfil ni credenciales.
- [ ] Confirmar que Workspace Trust bloquea el inicio en proyectos no confiables y que el panel español e inglés presenta correctamente los textos.

## Si la conexión o los comandos fallan

| Síntoma | Comprobación |
| --- | --- |
| Estado de recuperación pendiente | Verificación automática del runspace de PowerShell; ante un error se conserva la protección |
| `Command timed out ... preserved` | El proceso puede continuar; no envíes otro comando a esa terminal hasta que termine |
| `Window ... offline` | Comprueba que la ventana propietaria esté abierta y el worker reconectado |
| MCP responde a `windows`, pero no ejecuta comandos | Comprueba estado ocupado, integración de shell y verificación automática de recuperación |
| El panel dice ON, pero ChatGPT no conecta | Comprueba el endpoint local, el puerto de destino del túnel y el estado del conector externo |
| Falta `create_user_shell_code` | Actualiza el esquema o vuelve a conectar el conector MCP tras instalar el VSIX |

El panel ON indica disponibilidad de la extensión **local**, no acredita por sí mismo el funcionamiento del túnel remoto.

## Empaquetado y portabilidad

El VSIX debe contener `extension/dist/extension.js`, `media/`, `package.json`, este conjunto de guías y la licencia, sin secretos ni binarios específicos del sistema.

Después de generar el VSIX, `python scripts/make-portable.py` crea un ZIP para trasladar el proyecto con fuentes, tests, scripts, documentación y un manifiesto SHA-256. Debe excluir `node_modules`, `out`, `dist`, perfiles y credenciales.

## Ubuntu

**Pendiente de validación real:** Bash/Zsh, permisos, suspensión, restauración y conexión del túnel. El empaquetado en JavaScript evita dependencias nativas de Windows, pero eso no demuestra funcionamiento completo en Ubuntu.

Para las operaciones habituales consulta [Guía de uso](uso.md); para configuración, [Instalación](instalacion.md).

## Pruebas reales con terminales de usuario — 1 de noviembre de 2026

Estas pruebas se realizaron contra el servidor MCP **activo** de Windows. La terminal persistente `prueba` se creó mediante `create_user_shell_code` tras aprobación local en VS Code. Las terminales auxiliares `prueba_aux` y `prueba_http` son temporales, no de usuario.

| Prueba | Resultado observado |
| --- | --- |
| Comando bloqueante de 5 segundos en `prueba` | Finalizó normalmente (`exit_code=0`) y conservó la terminal |
| Bloqueo de 30 segundos en `prueba` + contador cada segundo en `prueba_aux` | **Paralelismo confirmado:** 30 ticks; duración conjunta 30,324 segundos; ambas salidas con código 0 |
| Dos comandos enviados a `prueba` durante una ejecución de 6 segundos | **FIFO confirmado:** el segundo comenzó 66 ms después de terminar el primero |
| Timeout de 1 segundo con proceso real de 6 segundos en `prueba` | Proceso conservado; nueva orden rechazada mientras seguía activo; recuperación automática al finalizar |

Los dos comandos de la prueba de 30 segundos comenzaron prácticamente a la vez: 17:31:31.167 y 17:31:31.164 (UTC). El bloqueo terminó a las 17:32:01.180.

**Limitación observada:** cuando se enviaron dos llamadas `execute_shell_command_code` simultáneamente a través de la capa heredada del conector de ChatGPT, en esta sesión se ejecutaron secuencialmente (dos tareas de 12 segundos consumieron unos 28 segundos). Las mismas operaciones enviadas directamente como dos peticiones MCP HTTP **sí se ejecutaron en paralelo**. Esto apunta a la ruta de invocación del conector, no a una limitación global del servidor.

**Otra incidencia a investigar:** al ejecutar un script Node.js largo desde una terminal MCP, la herramienta heredada devolvió en algunas ocasiones una salida parcial sin `exit_code`, aunque el script terminó y su informe JSON se generó correctamente.

### Repetir los diagnósticos

Desde una **tercera terminal** que no sea ninguno de los destinos, con los shells ya disponibles y el servidor activo:

```bash
node scripts/probe-live-concurrency.cjs prueba prueba_aux 30
node scripts/probe-live-fifo.cjs prueba 6
node scripts/probe-live-timeout.cjs prueba
```

Estos scripts no crean terminales ni las desbloquean. Los resultados locales se escriben en `scripts/probe-live-*-results.json` y se excluyen de Git. Nunca ejecutes el cliente de pruebas desde la misma terminal que debe recibir los comandos bloqueantes.

La terminal principal de este proyecto permanecía bloqueada por un timeout anterior durante las pruebas. **No fue desbloqueada ni terminada automáticamente**. Estas verificaciones tampoco sustituyen las pruebas de recarga de ventanas físicas, suspensión en Ubuntu o continuidad del túnel externo.

## Comprobaciones añadidas en 0.10.19

- Detección conservadora de `less`, `more`, `top`, `htop` y `man`; las tuberías, comandos compuestos y editores no reciben teclas automáticamente.
- Pruebas con salida de terminal simulada: envío de `q` sin Intro, ajuste de ventana desactivado y excepciones por terminal que tienen prioridad.
- Bandeja de solicitudes de usuario: aceptar, rechazar, cancelar por desconexión y vaciar al detener un trabajador.
- Prueba de que el endpoint de control no puede aprobar solicitudes sin la interacción local en el panel.
- Pruebas de controles de la interfaz: cambio de preferencia por ventana, excepción por terminal y rechazo desde la pestaña de solicitudes.

La detección y la interfaz se han comprobado con simulaciones de VS Code. El comportamiento con programas como `less` en una terminal real debe comprobarse tras instalar la versión nueva, sin interrumpir el túnel activo.
### Herencia de terminales temporales (0.10.19)

La suite `test/test-temporary-autoexit-inheritance.cjs` verifica que las temporales heredan de la ventana y no de la terminal creadora, siguen los cambios de ventana, respetan excepciones individuales, descartan preferencias obsoletas al reutilizar IDs y mantienen el aislamiento entre ventanas. La prueba utiliza una API simulada de VS Code; queda pendiente la validación con ventanas reales.
### Recuperación automática al restaurar terminales (0.10.19)

La suite `test/test-automatic-restored-recovery.cjs` cubre los eventos de fin inequívocos. `test/test-terminal-recovery-regressions.cjs` añade pérdida de eventos, runspaces ocupados, pruebas invalidadas por actividad nueva, cancelación previa al envío y lectores antiguos. `test/test-shell-readiness.cjs` consulta un proceso PowerShell propio para diferenciar inactividad, trabajo silencioso y espera de entrada.
## Regresiones añadidas al código fuente 0.10.22

- `test/test-restored-idle-proof.cjs`: recuperación automática mediante identidad del proceso, ruta y estado previo; rechazo de procesos sustituidos y situaciones ambiguas.
- `test/test-late-main-recovery.cjs`: la principal restaurada con retraso sustituye a la principal recién creada solo si esta no se ha utilizado.
- `test/test-busy-main-recovery.cjs`: si la principal nueva ya ha trabajado, no se destruye ni se registra una principal antigua como duplicado.
- `test/test-restored-controller.cjs` y `test/test-restored-shells.cjs`: una sola principal gestionada por ventana aunque existan restos físicos de versiones anteriores.
- `test/test-panel-layout.cjs` y `test/test-panel.cjs`: el menú abierto prevalece sobre los botones de otras filas; idioma deducido de VS Code sin desplegable manual.

**Validación automatizada completada:** las 49 suites se han ejecutado conjuntamente desde la terminal temporal `audit022` y el VSIX 0.10.22 se ha generado y verificado. Sigue pendiente la prueba de recarga con el instalador realmente activado. Las sesiones físicas residuales anteriores no se cierran automáticamente sin una comprobación suficiente de seguridad.
### Comprobaciones de recuperación añadidas a 0.10.22

Las pruebas se han ampliado para diferenciar los iconos de recuperación y salida automática, verificar las notificaciones de cambios de ejecución y evitar restauraciones inseguras. El estado de inactividad se guarda durante la actividad normal y no únicamente al desactivar la extensión. **La validación automatizada ha terminado correctamente; sigue pendiente comprobar la recarga real con la versión 0.10.22 instalada.**
### Nuevas regresiones en 0.10.22

- `test/test-execution-races.cjs`: cola FIFO y cancelación, comandos manuales activos, intercalado justo al finalizar, pérdida del flujo de salida y estados de finalización ambiguos.
- `test/test-restored-user-shells.cjs` y `test/test-restored-user-controller.cjs`: solo las sesiones `user` guardadas se reasocian; temporales y sesiones sin titularidad no son adoptadas.
- `test/test-user-shell-authorization.cjs`: desconexión durante la autorización o durante la persistencia no deja una terminal de usuario pendiente sin aceptar.
- La corrección no resuelve los casos en los que VS Code no notifica el inicio de un comando manual ni proporciona prueba fiable de inactividad.
### Regresión de salida interactiva 0.10.27

Se ha añadido `test/test-interactive-safety.cjs`, que distingue opciones no interactivas de sesiones paginadas, valida pantallas alternativas, comprueba que no se envía `q` en la salida normal y verifica un drenaje de 750 ms cuando la salida permanece abierta tras la finalización. Los monitores Linux adicionales solo se comprueban con simulaciones; para afirmar compatibilidad real deben probarse en Linux.
### Regresión de ejecución aislada (0.10.27)

Después de compilar, ejecuta `node test/test-isolated-command.cjs`. Comprueba la ruta de trabajo, la desactivación del paginador y de los prompts de Git, el límite de salida de 1 MB, el timeout y la cancelación. La ejecución aislada no inyecta teclas en la terminal integrada. Completa la validación con `npm run test:multishell`, `npm run lint` y `npm run package`; registra resultados solo después de ejecutarlos.
### Regresión de órdenes incompletas (0.10.27)

Después de compilar, ejecuta `node test/test-pending-interactive-commands.cjs` y `node test/test-recovery-reasons.cjs`. Comprueban paginadores y posibles prompts, periodos sin salida, cierre del flujo sin señal de finalización, pérdida de eventos de fin emitidos prematuramente y protección FIFO. Ninguna prueba debe enviar teclas a procesos reales. Confirma los resultados con `npm run test:multishell` y `npm run lint` antes de generar una nueva VSIX.

## Validación 0.10.27 — 2 de noviembre de 2026

- `npm run test`: **57/57 suites**; compilación y bundle incluidos.
- `npm run lint`: sin errores ni avisos. Diagnósticos nativos de VS Code: sin errores o advertencias.
- `npm audit`: **0 vulnerabilidades conocidas**, incluidas las dependencias de desarrollo. ESLint 10 y minimatch 11.0.1.
- `npm run test:vscode`: **12/12 comprobaciones reales**, con perfil, carpetas, puerto y terminales de prueba separados. Requiere PowerShell 7; `MULTISHELL_TEST_SHELL` permite indicar su ejecutable y `VSCODE_EXECUTABLE` el de VS Code.
- La prueba real verifica inicio, comandos, paralelismo, FIFO, ejecución aislada, timeout temporal, conservación del proceso, actividad manual, texto sin enviar, restauración libre, restauración ocupada y pérdida del evento de fin. Los tres últimos escenarios instancian el gestor compilado dentro de VS Code; no equivalen a un reinicio completo de la aplicación.
- El inspector reconoce tanto un runspace disponible como el prompt vacío de PSReadLine. Un runspace ocupado tiene prioridad sobre una prueba de inactividad guardada. Los resultados se invalidan si comienza otra ejecución durante la consulta.
- No se inventa un código de salida cuando solo puede verificarse que la terminal está libre.

Las pruebas reales se pueden repetir después de `npm run bundle` con `npm run test:vscode`. Los informes quedan en `.vscode-test/terminal-integration/`, excluidos de Git y del VSIX. Siguen pendientes la recarga de ventanas con sesiones persistentes, varias ventanas reales, el túnel y Linux. Si no es posible comprobar un shell, se conserva la protección y sigue disponible la ejecución aislada para tareas no interactivas.

## Validación de conexiones 0.10.28 — 2 de noviembre de 2026

| Comprobación | Resultado |
| --- | --- |
| `npm run test` | **63/63 suites**, compilación y bundle incluidos |
| `npm run lint`, diagnósticos nativos de VS Code | Sin errores ni advertencias |
| `npm audit --audit-level=low` | **0 vulnerabilidades conocidas**, incluidas dependencias de desarrollo |
| `npm run test:vscode` | **12/12 comprobaciones** con terminales PowerShell reales |
| `npm run test:windows` | **6/6 escenarios** con dos ventanas reales, perfiles nuevos y un puerto de prueba |
| `npm run test:connection` | **46.056 comandos en 180 segundos**, 12 peticiones concurrentes, 76 reconexiones de trabajadores y 30 reinicios del coordinador |

La carga sostenida usa HTTP y el servidor MCP reales con una API de terminal simulada. Verifica salida y destino de cada orden, colas vacías, limpieza de sesiones, peticiones y escuchadores. En la ejecución final no hubo errores inesperados; latencia p95 **42 ms**, p99 **52 ms**, máxima **102 ms**. El heap retenido creció **6.113.760 bytes** después de solicitar recolección de basura, por debajo del límite de 32 MB de esta prueba. Esto no acredita ausencia de fugas durante días de uso. El informe guarda los hashes de los módulos compilados utilizados.

Las pruebas de protocolo abren **40 clientes del SDK MCP oficial** y ejecutan 220 órdenes, incluidas 60 peticiones con el mismo ID JSON-RPC. Las regresiones adicionales cubren 30 reinicios de trabajadores, 20 reinicios del coordinador, 100 órdenes en cola con 80 cancelaciones, pérdida de conexión durante trabajo activo, registros caducados, respuestas obsoletas, JSON inválido, cabeceras incorrectas y cargas incompletas. Una orden válida y silenciosa de 17 segundos sobrevive a los límites de recepción HTTP.

Las seis pruebas de ventanas reales verifican: conexión de dos ventanas; 80 órdenes; cambio de coordinador sin repetir una escritura ni terminar el proceso de la otra ventana; reincorporación; recarga con una principal utilizada y libre; y recarga durante un comando de 30 segundos. En esta última se conserva el mismo PID, se rechaza una orden que solaparía trabajo y la terminal se recupera automáticamente al terminar. Las peticiones cortadas devuelven un error esperado; no se presenta como éxito ni se repite la orden.

Para repetir, ejecuta primero `npm run bundle`, después los tres scripts `test:vscode`, `test:windows` y `test:connection`. Los dos primeros requieren VS Code y PowerShell 7. El arnés de dos ventanas funciona actualmente en Windows; usa perfiles propios y solo cierra sus instancias. `MULTISHELL_SOAK_SECONDS` permite entre 30 y 1800 segundos de carga. Los informes se guardan bajo `.vscode-test/`, sin incluirlos en Git ni en el VSIX.

**Pendiente:** comprobación manual de todos los flujos del panel y sus autorizaciones, salida completa de la aplicación, suspensión/reanudación, shells nativos de Linux y cortes reales del túnel o del conector externo. Los resultados automatizados anteriores no constituyen garantía de cero bloqueos bajo cualquier entorno. La recuperación no interpreta el silencio como inactividad ni interrumpe procesos del usuario.

## Correcciones verificadas en 0.10.29 — 2 de noviembre de 2026

- `npm run test`: **66/66 suites**, con compilación y bundle. Se mantiene el sistema de pruebas existente.
- `npm run lint` y diagnósticos nativos de VS Code: sin errores ni advertencias. `npm audit --audit-level=low`: cero vulnerabilidades conocidas.
- `test/test-connection-mutation-cancellation.cjs`: reproduce y evita una terminal creada después de desconectar y un cierre de usuario aprobado con retraso después de cancelar la petición. Usa HTTP y MCP reales con una API de terminal simulada.
- `test/test-connection-stale-actions.cjs`: cinco escenarios de respuesta tardía, para alias, creación, cierre y descubrimiento fallido o correcto. Comprueba que la conexión nueva conserva sus rutas, alias y disponibilidad.
- `test/test-shell-manager-disposal.cjs`: libera peticiones activas y en cola, y todos sus escuchadores, tanto esperando integración como esperando un fin que no llega; conserva el terminal físico y no envía la orden en cola.
- `npm run test:vscode`: **12/12 comprobaciones** sobre terminales reales. `npm run test:windows`: **6/6 escenarios** con dos ventanas reales, incluidos cambio de coordinador y recargas con la principal libre y ocupada, con el mismo PID y recuperación automática.
- Carga adicional de esta revisión: **15.444 órdenes en 60 segundos**, 25 reconexiones de trabajadores y 10 reinicios del coordinador; sin errores inesperados, sin colas o controladores retenidos. Latencia p95 39 ms, p99 50 ms y máxima 86 ms. El heap retenido creció 5.696.824 bytes tras solicitar recolección de basura. Los módulos compilados coinciden con los hashes del informe.

Estas comprobaciones son automatizadas; las pruebas con VS Code real tampoco sustituyen la aceptación manual completa del panel. No se ha medido porcentaje de cobertura. Siguen pendientes Linux nativo, suspensión/reanudación y cortes reales del túnel externo. Las pruebas anteriores de 0.10.28 se conservan como historial y no se atribuyen a esta revisión.
## Verificación de Agent Skills en 0.10.30 — 2 de noviembre de 2026

- `npm run test:multishell`: **68/68 suites superadas**. Incluye el protocolo HTTP MCP real, `skill://index.json`, lectura de metadatos YAML, tres ubicaciones de skills, aislamiento de dos proyectos, traversal y límites.
- `npm run lint`: correcto, sin advertencias. `npm audit --audit-level=low`: **0 vulnerabilidades conocidas**.
- `npm run package`: `multi-shell-mcp-server-0.10.30.vsix` generado y revisado, **25 archivos** (incluidas las guías ES/EN y el bundle). Las carpetas `.agents/` de desarrollo y `node_modules` no se incluyen en el VSIX.
- `git --no-pager diff --check`: correcto. La skill propia `.agents/skills/multishell-mcp` se valida en las pruebas del repositorio.

**Limitación:** las pruebas de instalaciones reales de esta nueva versión (recarga de ventanas, clientes nativos de skills y túnel externo) no se han repetido todavía. Los resultados de VS Code real indicados en apartados históricos pertenecen a versiones anteriores.

## Validación de 0.10.31 — MCP Skills oficial y plugin portable

- `npm run test:multishell`: **72/72 suites superadas**, con compilación TypeScript y bundle. Incluye negociación `2026-07-28` con cliente oficial MCP v2, `server/discover`, `skills/list`, `skills/get`, `resources/read`, paginación, SHA-256, límites de recursos y aislamiento entre ventanas.
- Se mantiene la compatibilidad de inicialización de clientes MCP antiguos; las pruebas de regresión originales de shells, permisos, colas, cancelación y recuperación siguen pasando.
- `npm run lint`: **sin errores ni advertencias**; `npm audit --audit-level=low`: **0 vulnerabilidades conocidas**.
- El plugin portable contiene sus manifiestos, el marketplace local, la skill de configuración y la skill operativa de MultiShell. La instalación requiere autorización del usuario.
- `npm run package:all` genera el instalador VSIX y un ZIP separado para el plugin; se verifica que no se incluyan carpetas de desarrollo ni dependencias sueltas.

**Pendiente de comprobación manual:** funcionamiento tras instalar 0.10.31 en una ventana de VS Code real, reconocimiento y activación dentro de una cuenta ChatGPT/Codex, acceso mediante túnel externo y pruebas en Linux. El endpoint local `127.0.0.1` no es accesible desde ChatGPT Work alojado en la nube.

## Validación de 0.10.32 — Skills globales de Codex

- Compilación TypeScript y empaquetado: correctos. `node scripts/run-tests.cjs`: **74/74 suites superadas**, incluyendo pruebas nuevas de skills globales, controles de acceso y consulta rápida por nombre.
- `test/test-global-codex-skills.cjs` verifica los tres directorios de Codex, filtros, nombres duplicados, autorización, lectura de recursos, vínculos contenidos y rechazo de rutas peligrosas.
- `test/test-global-skills-mcp.cjs` verifica `list_skill_names_code`, el acceso heredado `cwd="@mcp"`, los permisos de lectura y la ausencia de una shell predeterminada.
- La comprobación de la extensión empaquetada verifica el comando de paleta de VS Code y la copia del nombre de una skill.
- La consulta real al directorio personal de esta instalación detectó **14 skills válidas, sin advertencias**. No se incluyeron en la extensión ni se copiaron a otros proyectos.

**Pendiente:** confirmación de la interfaz tras instalar la nueva versión y prueba de conexión desde un cliente ChatGPT remoto. Las pruebas integrales de PowerShell 7 requieren `pwsh.exe`, que no estaba disponible en el último arnés de integración real.

## Validación 0.10.33 — Skills por ventana y origen de máquina

- `node scripts/run-tests.cjs`: **75 de 75 suites superadas** tras compilar TypeScript. Incluye la nueva prueba `test/test-skills-window-routing.cjs`.
- La nueva prueba utiliza dos ventanas con distintas raíces de proyecto, dos carpetas personales simuladas, autorizaciones globales distintas y skills con idénticos nombres. Comprueba herramientas MCP y recursos v1/v2, así como el rechazo de una ventana desconectada.
- Los directorios que el coordinador conoce se sustituyen deliberadamente por rutas inexistentes para demostrar que la lectura se hace en el worker y nunca se resuelve desde el disco local del coordinador.
- Se confirma que cada ventana muestra su `window_id` y el identificador `machine_id` registrado; no se eliminan skills iguales de ventanas distintas.

**Importante:** son pruebas de separación lógica y simulación de dos hogares de máquina, no conexiones de red reales entre dos ordenadores. El transporte actual sigue usando `127.0.0.1`. La federación remota y el plugin instalado en una cuenta real requieren validación independiente.

## Auditoría de skills 0.10.33 y correcciones 0.10.34 — 2 de noviembre de 2026

La referencia 0.10.33 superó sus **75/75 suites**, pero las regresiones nuevas reprodujeron cinco debilidades en el acceso y descubrimiento: enlaces internos de skills globales fuera de la skill seleccionada, crecimiento de archivos tras validar su tamaño, metadatos antiguos en un manifiesto nuevo, cálculo de manifiestos fuera de la página solicitada y catálogos repetidos para terminales de la misma carpeta y ventana.

En 0.10.34, `npm run test` supera **81/81 suites**, con compilación y bundle. `npm run lint` y la auditoría completa de npm terminan sin errores ni vulnerabilidades conocidas. Las seis regresiones nuevas fallaban antes de corregir el código y pasan después.

- La prueba de privacidad usa un hogar ficticio y un enlace de directorio de Windows: no lee credenciales reales. Mantiene los enlaces de instalación autorizados dentro del hogar y rechaza los enlaces internos que salen de la skill.
- La prueba de crecimiento cambia un archivo después de comprobar su tamaño y verifica rechazo y cierre de descriptores. La de coherencia cambia `SKILL.md` entre sus metadatos y el manifiesto.
- Con 45 skills instrumentadas, la primera página construye **20 manifiestos en lugar de 45**. Tres páginas construyen 20, 20 y 5; los cursores inválidos no calculan ninguno. Es una medida de trabajo realizado, no una comparación de latencia entre máquinas.
- Cuatro terminales que representan tres pares distintos de ventana y carpeta producen tres consultas y tres entradas; otra ventana con la misma ruta sigue separada.
- `npm run test:vscode`: **15/15 comprobaciones** en VS Code real. Dos de las nuevas verifican descubrimiento y lectura en el worker propietario, acceso global desactivado y manifiestos MCP modernos cuyos dos recursos coinciden en SHA-256 y tamaño.
- La tercera comprobación nueva en VS Code real y `test-modern-legacy-selectors` verifican el esquema heredado mediante el cliente oficial MCP moderno: diagnósticos `@shell:`, consultas `@mcp`, ausencia de ejecución para consultas de control, permisos y rechazo de cabeceras de enrutamiento incorrectas. Este fallo también se observó en el conector activo de la versión 33.
- `npm run test:windows`: **6/6 escenarios** con dos ventanas reales, incluidas recargas con la principal libre y ocupada, conservación del PID y recuperación automática.

El plugin y la skill del repositorio siguen sincronizados. Las pruebas son automatizadas, incluidas las que abren VS Code real; no acreditan instalación o activación nativa del plugin en una cuenta de ChatGPT/Codex. Siguen pendientes Linux nativo, túnel externo, unidades de red lentas y aceptación manual completa. No se ha medido porcentaje de cobertura.

## Panel de skills 0.10.36 — 2 de noviembre de 2026

- `npm run lint`: sin errores ni advertencias. `npm run test`: **83/83 suites**, con compilación y bundle. La nueva suite del panel cubre 84 entradas, búsquedas por descripción, páginas, duplicados, rutas exactas, catálogo sin servidor, permisos retirados y ausencia de ejecución de terminal.
- Interfaz en Chromium con datos de prueba: **15 comprobaciones** de interacción, incluidas respuestas obsoletas, conservación del foco, teclado y autorización de terminales. También se comprobaron los textos en inglés y la ausencia de desbordamiento horizontal a 240, 280 y 330 píxeles.
- `npm run test:vscode`: **15/15 comprobaciones** automatizadas en VS Code real con perfil aislado, incluida la recuperación de terminales y la integridad de skills MCP. Esto no equivale a comprobar manualmente el nuevo panel dentro de tu ventana habitual.
- `npm audit --audit-level=low`: 0 vulnerabilidades conocidas. No se midió cobertura. Pendientes: aceptación visual en una ventana habitual de VS Code, portapapeles y carga desde ChatGPT remoto, túnel y Linux nativo.

## Flujo sencillo de skills 0.10.35

La regresión `test-skill-easy-workflow` usa HTTP real, el worker propietario y clientes MCP v1/v2. Crea un catálogo de 121 skills y comprueba búsqueda por descripción después de la entrada 100, páginas sin duplicados, lectura por nombre, candidatos ante nombres repetidos, selección por ruta, rechazo de acceso global y ausencia de órdenes de terminal. Comprueba también que el protocolo moderno enumera las entradas posteriores a 100.

Las pruebas con VS Code real se distinguen de esta prueba de API con terminales simuladas. Linux, unidades de red y activación nativa en un cliente remoto siguen pendientes.

## Validación 0.10.37 — Auditoría de skills y selector de VS Code

- Graphify auditó 18 archivos de `src/` (310 nodos y 897 relaciones) mediante extracción estructural sin LLM. El grafo se generó en una carpeta temporal ajena al repositorio.
- `node scripts/run-tests.cjs`: **84 de 84 suites superadas** después de compilar y actualizar `dist/extension.js`. Incluye la nueva prueba `test-skill-name-filter.cjs` con más de 100 coincidencias por descripción y una coincidencia posterior por nombre, atravesando el enrutamiento real al worker y la herramienta HTTP MCP.
- `test-bundled-startup.cjs` verifica la carga del catálogo después de las primeras 100 entradas, la copia de rutas distintas cuando el nombre se repite, la descripción y el idioma del selector, y que no se explore el directorio del proceso sin proyecto abierto.
- ESLint: sin errores. `npm audit --audit-level=low`: **0 vulnerabilidades conocidas**. `git diff --check`: sin problemas.
- La guía activa de skills comprueba ahora las referencias a los paquetes de la versión vigente, evitando instaladores obsoletos en la documentación.

**Pendiente:** instalar manualmente la versión nueva en VS Code y comprobar el selector con ventanas reales, otros equipos y Linux. Las pruebas de regresión no acreditan compatibilidad del plugin nativo con todos los clientes ni la fiabilidad absoluta de las terminales.

## Validación 0.10.38 — Disposición compacta de Skills

- `npm run test`: **85 de 85 suites superadas**, incluida la nueva regresión del desplegable. ESLint correcto y auditoría npm con 0 vulnerabilidades conocidas.

- `test/test-panel-skill-disclosure.cjs`: ejecuta el renderizado del panel con un DOM simulado y comprueba que la ruta se muestra debajo del nombre incluso con la descripción plegada, que los botones de copia están a la derecha y no activan el desplegable, y que los detalles abiertos sobreviven a nuevas páginas.
- `test/test-panel-layout.cjs` y `test/test-panel-skills.cjs`: validan la estructura accesible, búsqueda, paginación, permisos y contenido copiado con el identificador de terminal correcto.
- Los controles utilizan `details/summary` nativos, con uso por teclado, iconografía en el idioma de VS Code y texto insertado mediante `textContent` en lugar de HTML sin depurar.

**Pendiente:** aceptación visual manual en VS Code instalado, en paneles muy estrechos y en Linux.

## Validación 0.10.39 — SDK MCP v2 único

- `node scripts/run-tests.cjs`: **88/88 suites superadas** en la batería final, incluidos los clientes MCP antiguos y modernos, cancelaciones, reconexiones, permisos y Skills.
- ESLint y compilación TypeScript: correctos. `npm audit --audit-level=low`: 0 vulnerabilidades conocidas. Se comprobó también `git diff --check`.
- La cancelación de solicitudes comprueba el cierre de la respuesta HTTP y de la conexión TCP antes de ejecutar operaciones pendientes.

- El servidor usa exclusivamente `@modelcontextprotocol/server`, sin `@modelcontextprotocol/sdk` entre sus dependencias directas o imports de código.
- `test/test-sdk-v2-migration.cjs` prueba clientes oficiales MCP de ambas eras, recursos y herramientas equivalentes, el campo obligatorio `resultType` en respuestas modernas, restricción de origen HTTP, permisos y cierre de solicitudes.
- `test/test-connection-protocol.cjs` comprueba el modo de inicialización antiguo con 40 conexiones, 220 operaciones, solicitudes inválidas y la limpieza de solicitudes; el protocolo moderno mantiene `server/discover` y las skills verificables por SHA-256.
- Se mantiene `127.0.0.1:3000/mcp` con `legacy: 'stateless'`. El script y ejecutable del túnel no se han alterado.
- Las pruebas `test-global-skills-mcp.cjs` contemplan la denegación de herramientas no registradas mediante errores JSON-RPC de SDK v2. El aislamiento de ventanas y las autorizaciones locales siguen operativos.

**Pendiente de aceptación:** prueba completa de uso desde el túnel real y verificación manual tras instalar el VSIX en VS Code. Una suite automatizada no sustituye a esa aceptación.

Edición compatible con 0.10.58.

Compatible con 0.10.59.

Documentación compatible con 0.10.72.

Compatible con 0.10.61.

Documentación compatible con 0.10.62.

Documentación compatible con 0.10.63.

Compatible con 0.10.64.

## Mantenimiento seguro de disco (0.10.72)

La limpieza es conservadora. npm run storage:cleanup solo informa de perfiles aislados antiguos y copias verificadas del túnel; npm run storage:cleanup -- --apply los elimina tras verificar procesos y rutas. Los procesos activos, las carpetas recientes y los archivos desconocidos se conservan. Se retiene temporalmente el último perfil de pruebas fallido. No elimina versiones instaladas que administra VS Code.

Cada terminal acepta como máximo 16 comandos esperando turno; las llamadas adicionales se rechazan sin enviar comandos a la terminal. Los límites de 32 peticiones HTTP concurrentes y 1 MB de salida de comandos aislados siguen vigentes.
