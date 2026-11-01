# Historial de cambios

[English version](../en/changelog.md) · [Índice del proyecto](../../README.md)

## 0.10.25 — Ejecución aislada y protección frente a paginadores

- Nueva herramienta MCP `execute_isolated_command_code` para comandos no interactivos en un subproceso independiente de la terminal integrada. Usa el directorio de la sesión indicada, incluso si esa terminal está ocupada o protegida por timeout.
- La ejecución aislada desactiva los paginadores de Git (`GIT_PAGER=cat`, `PAGER=cat`), impide solicitudes interactivas de Git (`GIT_TERMINAL_PROMPT=0`) y emplea entrada estándar cerrada. No envía `q` ni `Ctrl+C` a la terminal de usuario.
- Timeout y cancelación intentan terminar el árbol de procesos aislado; si no se confirma su terminación se devuelve un error. La salida está limitada a 1 MB, mantiene información de truncamiento y respeta caracteres UTF-8.
- Añadido `.gitattributes` para normalizar los archivos de texto a LF y eliminar los avisos de Git sobre conversiones LF/CRLF, sin modificar la configuración global del usuario.
- Pruebas de regresión para salida, ruta de trabajo, variables antipaginación, cancelación, timeout y truncamiento. **53/53 suites**, compilación TypeScript, ESLint sin advertencias y empaquetado VSIX de 23 archivos superados.
- La terminal integrada mantiene su ruta anterior y sus protecciones; no se altera de forma automática ningún comando compuesto o de procedencia desconocida.

## 0.10.24 — Salida interactiva basada en señales y drenaje limitado

- La salida automática ya no envía `q` por recibir cualquier texto. Para `more`, `less`, `man` y `top` exige indicios de paginación o pantalla interactiva; en `htop` y nuevos monitores exige entrada a la pantalla alternativa.
- Se descartan las opciones no interactivas de ayuda, versión, lotes, consultas de `man`, entre otras (`top -bn1`, `less --help`, `more /?`).
- Añadidos a la lista blanca condicional `btop`, `bpytop`, `nvtop`, `iftop`, `iotop` y `tig`. Sin señal de pantalla completa no se envía ninguna tecla. La compatibilidad real en Linux sigue pendiente de prueba.
- Eliminado el envío de `q` diferido 120 ms que podía ejecutarse después de que el programa saliera.
- Cuando VS Code confirma la finalización y el iterador de salida permanece abierto, se espera un máximo adicional de 750 ms. Si sigue abierto se libera la cola y se marca `output_incomplete=true` y `truncated=true`, sin dar por finalizado un proceso que no haya notificado su salida.
- Nueva batería específica de opciones, salidas simuladas y flujos retenidos: **51/51 suites**, seis repeticiones adicionales de la prueba interactiva, lint y empaquetado VSIX verificados. El riesgo de una notificación de finalización tardía no puede eliminarse completamente sin soporte adicional de VS Code.

## 0.10.23 — Creación desde el panel sin modal externo y empaquetado actualizado

- La creación de terminales de usuario iniciada mediante **Crear terminal** en el panel se autoriza dentro del propio formulario, sin abrir otro diálogo de Windows/VS Code.
- Cada autorización interna es temporal y de un solo uso; está vinculada al ID, al directorio canónico y al permiso de compartir carpeta. El endpoint HTTP no puede generar estas autorizaciones; las solicitudes remotas mantienen su confirmación en **Solicitudes**.
- Actualizado el empaquetador de `@vscode/vsce` 3.9.2 a 4.1.0, con Node.js 22 o posterior para tareas de compilación.
- Añadida una suite de regresión para el servidor principal, una ventana trabajadora y las autorizaciones inválidas o falsificadas. **50 suites automatizadas**.
- Auditoría: dependencias de producción sin vulnerabilidades conocidas; algunas dependencias de desarrollo aún tienen avisos moderados de `minimatch` sin corrección compatible disponible según `npm audit`.

## 0.10.22 — Protección frente a carreras y procesos activos

- Se impide ejecutar una orden MCP en una terminal con una ejecución manual activa detectada mediante integración de shell; no se envía `Ctrl+C`.
- La cancelación de órdenes en la cola FIFO mantiene cerrada la puerta a las siguientes hasta que todas las anteriores finalicen realmente.
- Un error de lectura de salida no libera la terminal mientras continúe activa; se exige la señal de finalización o confirmación manual.
- Las terminales de usuario restauradas deben tener un registro persistente de titularidad; los nombres y directorios de temporales no bastan para adoptarlas.
- Las solicitudes de creación canceladas durante autorización o persistencia se revierten; la creación de una temporal también se comprueba después de la respuesta del trabajador.
- Se añaden pruebas de regresión de carreras de ejecución y cancelación. **49/49 suites superadas**; ESLint, auditoría de dependencias y VSIX de 23 archivos verificados.

## 0.10.21 — Recuperación automática más frecuente e iconos diferenciados

- **Reactiva MCP sin confirmación** cuando una terminal restaurada coincide con una prueba reciente de inactividad, su PID y su directorio, y no hay ejecuciones activas conocidas.
- La prueba de inactividad se actualiza tras eventos de ejecución y cada 15 segundos, además de guardarse al desactivar la extensión. Esto reduce los casos en los que Reload Window no llega a guardar el estado.
- La salida automática de paginadores utiliza un icono de **salida** y la recuperación MCP un icono de **escudo**.
- Se mantiene la confirmación manual en situaciones ambiguas, con procesos activos o sin una finalización verificable; nunca se envían comandos de sondeo.
- Compilación, pruebas y empaquetado finalizados: **48/48 suites**, ESLint y auditoría de producción superadas; VSIX de 23 archivos verificado.

## 0.10.20 — Recarga sin principales duplicadas y panel simplificado

- Los menús contextuales de las terminales se sitúan por encima de las acciones de filas posteriores.
- Eliminado el selector manual de idioma del panel: se utiliza el idioma de VS Code si es español y, en otro caso, inglés.
- Tras **Reload Window** se registra solo una principal por ventana y se prioriza el ID guardado. La principal original que reaparece tarde sustituye a la temporal de arranque únicamente si esta no se ha utilizado; los procesos que puedan seguir activos no se cierran.
- Se conserva evidencia de inactividad cuando termina una sesión limpia y se utiliza para reactivar automáticamente terminales restauradas con el mismo PID y directorio. Si la identidad o el estado es ambiguo, se mantiene la confirmación manual.
- Añadidas y actualizadas pruebas de recuperación y del panel. **48 suites definidas; no verificadas todavía en conjunto**. No se reinstaló la extensión ni se reinició el túnel.

## 0.10.19 — Recuperación automática segura de terminales restauradas

- Las terminales principales y de usuario restauradas se desbloquean automáticamente cuando VS Code notifica una finalización de comando inequívoca mediante la integración de shell, siempre que no haya otras ejecuciones observadas todavía activas.
- Se conservan las protecciones ante eventos ambiguos, ausencia de integración, terminales ajenas y falta de pruebas de inactividad. No se ejecutan comandos de sondeo que podrían interrumpir procesos.
- Añadida una suite de pruebas para finalizaciones durante y después de la restauración: 45 suites automatizadas en total. La confirmación manual sigue disponible si no hay evidencia suficiente.

## 0.10.18 — Herencia de preferencias para terminales temporales

- Las terminales temporales creadas por MCP heredan la preferencia de salida automática de su ventana y no las excepciones de la terminal solicitante.
- Los cambios de ventana afectan a las terminales que no tienen una excepción propia, incluidas las temporales existentes. Las excepciones individuales tienen prioridad.
- Reutilizar un ID de terminal temporal descarta cualquier excepción persistida de una sesión anterior.
- Nueva suite de regresión que comprueba ventanas independientes, cambios dinámicos, excepciones y reutilización de ID: **44 suites automatizadas**.

## 0.10.17 — Salida automática por terminal y bandeja de solicitudes

- Añadida la configuración global `multi-shell-mcp.interactiveAutoExit` (activada por defecto), con interruptor por ventana y excepciones por terminal desde el panel.
- Reconocimiento conservador de comandos independientes `less`, `more`, `top`, `htop` y `man`: intenta enviar `q` únicamente tras recibir salida y mientras la ejecución siga activa; evita intervenir en tuberías, órdenes compuestas o procesos desconocidos.
- Las peticiones de creación de terminales persistentes de la IA pasan a una cola **Solicitudes** en la ventana propietaria, con botones para autorizar o rechazar, caducidad y limpieza en caso de desconexión.
- La aprobación solo puede hacerse desde el panel local, no mediante herramientas MCP ni el endpoint interno.
- Dos suites nuevas de pruebas; 43 suites automatizadas en total. No cambia la configuración del túnel.

## 0.10.16 — Terminales de usuario autorizadas y multitarea

- Nueva herramienta MCP `create_user_shell_code`: la IA puede solicitar una terminal de usuario persistente solo cuando la persona lo haya pedido; la creación exige confirmación modal en VS Code con ID, directorio y riesgo de compartir carpeta. La creación desde el panel también exige la misma aprobación, incluso si se intenta acceder directamente a la API interna. Rechazo, cancelación o caducidad impiden la creación.
- `create_shell_code` permanece reservado a terminales temporales con `origin=mcp` y no puede elevarse a `origin=user` por parámetros extra.
- El cierre MCP de terminales de usuario requiere confirmación; el cierre desde el panel conserva su confirmación existente.
- Se persisten las terminales creadas bajo aprobación incluso con el panel cerrado. Serialización de guardados simultáneos de sesiones, alias y eliminaciones.
- Pruebas de ejecución paralela en terminales de usuario distintas, FIFO dentro de cada terminal y reconexión tras la recarga sin duplicados.
- Tres suites de regresión nuevas; total 40 suites. Sin cambios en el túnel ni en su protocolo.

## 0.10.15 — Recuperación de conexiones y protección de la terminal principal

- Los timeouts de terminales principales automáticas conservan el proceso y bloquean nuevas órdenes hasta terminar, evitando cierres destructivos y comandos solapados.
- Si Shell Integration no está disponible y el comando no se inició, el timeout permite reintentar sin destruir ni bloquear la terminal.
- El listener HTTP mantiene un manejador permanente de errores y publica su estado de salud.
- El heartbeat detecta el cierre inesperado del hub, libera sus recursos y ejecuta una elección de coordinador controlada.
- El worker de cada ventana gestiona errores de su listener y puede recuperar su puerto efímero sin duplicar terminales.
- Se bloquean operaciones sobre los archivos de una ventana detectada como desconectada; la verificación o registro posterior restablece el acceso.
- Cobertura ampliada a 37 suites automatizadas; el protocolo, los puertos configurados y el cliente de túnel permanecen intactos.

## 0.10.14 — Arranque transaccional, reconciliación y protección de archivos

- Si falla la persistencia del ID principal después del arranque, se libera el servidor y se conserva la terminal para permitir reintentar sin recursos huérfanos.
- La reconciliación prepara y valida las asignaciones antes de publicarlas; si falla un cambio de alias posterior, intenta revertir los cambios de alias ya enviados y notifica errores de reversión.
- Se serializan las operaciones de modificación sobre rutas compartidas y se publican sustituciones completas desde archivos temporales.
- Creaciones y copias sin sobrescritura publicadas con un enlace exclusivo; movimientos/renombrados de archivos normales protegidos contra destinos creados simultáneamente.
- Añadidas tres suites de regresión (35 en total) para arranque tras fallo de almacenamiento, reconciliación parcial y operaciones destructivas simultáneas.
- Sin cambios en el perfil, credenciales, URL, protocolo ni ejecutable de Tunnel Client.

## 0.10.13 — Aislamiento, reinicios y lectura de archivos

- Una creación de terminal no puede utilizar un ID reservado por un cambio de alias todavía pendiente.
- La restauración de terminales principales rechaza directorios ajenos, duplicados físicos e identidades sin pruebas suficientes de pertenencia.
- El apagado espera los heartbeats pendientes y evita reelegir el coordinador después de detenerlo.
- Las ventanas sin respuesta se identifican como desconectadas hasta que se recupera la comunicación.
- Los cambios de configuración rápidos ya no se pierden durante un reinicio; el rollback respeta peticiones posteriores.
- Validación HTTP de Host además de Origin, manteniendo el contrato local de Tunnel Client 0.0.18.
- Lecturas UTF-8 por rangos con streaming y comprobación previa de tamaño de respuestas base64.
- Corregidos caracteres españoles mal codificados en el panel.
- 32 suites automatizadas, incluyendo nuevas pruebas de aislamiento, ciclo de vida y lectura incremental.

## 0.10.12 — Robustez de sesiones y alias

- Persistencia correcta del alias ante fallos de escritura y serialización de cambios simultáneos sobre una terminal.
- Validación previa del inventario de terminales de cada ventana para evitar reconciliaciones parciales ante IDs repetidos o conflictivos.
- Recuperación manual de terminales de usuario bloqueadas tras un timeout cuando VS Code omite el evento de finalización. Se exige confirmar que el proceso ha terminado; no se mata el proceso.
- Tres suites de regresión nuevas (29 en total), sin modificar la URL, el perfil o la autenticación del túnel.

## 0.10.11 — Seguridad, recuperación y compatibilidad con el túnel

- Permisos de lectura y edición MCP independientes; los errores de archivos se comunican con `isError`.
- Cancelación HTTP propagada a los comandos MCP en cola, preservando los procesos de usuario ya iniciados.
- Filtrado de `Origin` sin cambiar la URL ni el perfil sin OAuth de Tunnel Client 0.0.18.
- Limpieza de coordinadores parcialmente iniciados, protección del cierre de la principal y confirmación de principales restauradas.
- Reserva de alias durante cambios simultáneos y persistencia de alias modificados desde MCP.
- Recarga de permisos en caliente con rollback; panel con actualización periódica solo si cambia el estado.
- Versión del servidor sincronizada con el paquete, 26 suites de prueba y lint estricto de la interfaz.
- Distribución externa del túnel excluida de Git y del instalador VSIX; sin cambios en sus credenciales o perfil.

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

## 0.10.8 — Reconexión y protección de terminales de usuario

- Reasociación segura de terminales creadas desde el panel al recargar VSCode, conservando identificador, directorio y alias.
- Migración de terminales `MCP [id]` antiguas solo cuando pertenecen al mismo proyecto; protección contra adopciones ajenas y duplicados.
- Confirmación explícita de terminal disponible antes de reactivar los comandos MCP tras una recarga, para proteger trabajos prolongados.
- Limpieza del registro persistente al cerrar voluntariamente la terminal, sin recrearla.
- Nuevas pruebas de recuperación del gestor, del coordinador y del panel.

### Protección frente a tiempos de espera

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

## 0.10.0 — Refuerzo en Windows y distribución autocontenida

- Recuperadas las herramientas nativas de diagnósticos, símbolos del proyecto y del documento, definiciones e información contextual, con destino explícito de terminal.
- Conservados parámetros compatibles (`symbol`, `maxDepth`, `severities`, `format`) y selectores heredados.
- Incorporadas pruebas de enrutamiento por ventana, límites de archivos, dos trabajadores, arranque, recuperación de alias y HTTP MCP.
- Distribución JavaScript autocontenida, sin `node_modules` ni binarios nativos en el VSIX.
- Actualizada Zod a la versión 4 corregida, con cero vulnerabilidades conocidas de producción en la validación.
- Añadidos comandos reproducibles de validación para Windows y una lista de comprobación tras recargas.

## 0.9.1 — Rutas relativas, ciclo de terminales e icono nuevo

- Las rutas relativas se resuelven desde el proyecto propietario en Windows y Linux.
- La limpieza del trabajador y del coordinador libera alias y registros tras cierres manuales.
- Botones del panel alineados a la derecha, con truncamiento de IDs largos.
- Acciones diferenciadas para copiar selector, copiar instrucciones y cerrar con protección.
- Icono original de dos terminales conectado a un coordinador.

## 0.9.0 — Alias cortos

- Alias numéricos o con nombres como selectores explícitos en herramientas y rutas heredadas.
- Alias generados desde el proyecto; colisiones resueltas mediante sufijos y rechazos adecuados.
- El panel muestra `shell=alias`, permite renombrar con un diálogo nativo y copiar instrucciones.
- El alias principal se conserva por proyecto; los alias sobreviven a cambios de coordinador.
- No existe una terminal activa global implícita: los IDs completos siguen siendo válidos.

## 0.8.1 — Limpieza del código fuente

- Eliminados módulos y pruebas obsoletos de archivos, edición, diagnósticos y símbolos.
- Conservadas las pruebas de integración HTTP y multiventana.
- Retiradas dependencias de desarrollo y opciones de configuración innecesarias.
- Las compilaciones limpian salidas generadas y excluyen pruebas y archivos de desarrollo del VSIX.
- Sin cambios intencionados en compatibilidad heredada, enrutamiento o interfaz bilingüe.

## 0.8.0 — Panel visual

- Panel adaptable en español e inglés, con pestañas de proyectos y ventanas, estado de terminales y acciones.

## 0.7.1 — Compatibilidad con conectores antiguos

- Selectores explícitos `@shell:<id>` y consultas de descubrimiento `@mcp` de solo lectura.

## 0.7.0 — Compatibilidad multiventana

- Una terminal principal por ventana, coordinación entre ventanas y un único puerto MCP público.