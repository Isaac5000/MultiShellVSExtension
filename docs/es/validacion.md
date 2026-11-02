# Pruebas, validación y diagnóstico

[English](../en/validation.md) · [Índice](../../README.md)

Estado de referencia: **MultiShell MCP Server 0.10.29**. La validación incluye compilación, ESLint, auditoría de npm, regresiones, carga HTTP y ventanas reales de VS Code con perfiles separados. Los resultados actuales y sus límites se detallan al final; las pruebas locales no acreditan la continuidad del túnel externo.

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
