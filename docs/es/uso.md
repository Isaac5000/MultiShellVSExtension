# Guía de uso

[English](../en/usage.md) · [Índice](../../README.md)

Comportamiento de **MultiShell MCP Server 0.10.29**. Para instalar o actualizar, consulta [Instalación](instalacion.md); para parámetros de clientes antiguos, consulta [Compatibilidad MCP](compatibilidad.md).

## 1. Iniciar y seleccionar una terminal

1. Abre una carpeta en VS Code y concédele **Workspace Trust**.
2. Abre el panel **MultiShell MCP** y pulsa **Iniciar** si está detenido.
3. Copia el identificador o alias visible de la terminal. En ChatGPT indica, por ejemplo: `shell=mi_proyecto: ejecuta git status`.

La selección **no es global**: cada operación debe indicar su terminal. La extensión no puede deducir a qué conversación de ChatGPT pertenece una petición. Cuando haya varias ventanas, puedes copiar también el `window_id` desde la pestaña **Ventanas**.

El panel ofrece estado del coordinador o trabajador, puerto, ventana actual, lista de terminales, alias, actividad, cola de comandos, búsqueda y acciones de copia, apertura y cierre. Cada ventana activa tiene una terminal principal automática que no puede cerrarse por una llamada MCP.

## 2. Qué terminal crear

| Tipo | Herramienta o acción | Autorización y comportamiento |
| --- | --- | --- |
| Principal | Se crea automáticamente por ventana | Se protege frente a cierres MCP y se intenta recuperar al recargar |
| Temporal | `create_shell_code` | MCP puede crearla para trabajos auxiliares; su tipo siempre será `mcp` |
| De usuario | `create_user_shell_code` o botón **Nueva** del panel | Requiere aceptar la solicitud en la pestaña **Solicitudes** del panel; tipo `user`, con recuperación persistente |

### Solicitar a la IA una terminal de usuario

Pide expresamente, por ejemplo:

> Crea una terminal de usuario persistente llamada `pruebas` en un directorio independiente de este proyecto. Te autorizaré en VS Code. Después utiliza `shell=pruebas`.

La IA enviará una petición mediante `create_user_shell_code` con un `shell_id`, una ruta de trabajo opcional (`cwd`) y, si hay varias ventanas, un `window_id`. **Todavía no existe ninguna terminal** en ese momento. La petición aparece en **Solicitudes** del panel local con ID, directorio y opción de compartir carpeta. Solo se crea si pulsas **Autorizar creación**; rechazar, cancelar o agotar el plazo no crea ninguna terminal.

Crear desde el panel también muestra aprobación local. No puede omitirse mediante parámetros no documentados de `create_shell_code` ni mediante la API interna del coordinador. **La IA no puede aceptar el aviso en tu nombre.**

El cierre de una terminal de usuario solicitado mediante `close_shell_code` vuelve a pedir confirmación. El panel muestra una sola confirmación para el cierre, no dos. Las terminales de usuario se identifican como tales en la lista; las temporales no se convierten en persistentes por ejecutar comandos en ellas.

**Límite:** MultiShell no puede comprobar el contenido original de tu instrucción en ChatGPT. La aprobación local en **Solicitudes** es el control efectivo para peticiones remotas. Esta autorización no impide que un comando de terminal ya permitido arranque procesos externos; no es un sandbox del sistema operativo.

## 3. Ejecutar tareas simultáneas

Los comandos dirigidos a terminales **diferentes** se ejecutan en paralelo. Dentro de **la misma terminal** se mantiene una cola FIFO: una orden termina antes de iniciar la siguiente.

Ejemplo: asigna `shell=pruebas` a los tests y `shell=compilacion` a la compilación. Si ambas tareas escriben en el mismo repositorio, usa preferentemente **Git worktrees** separados.

Por defecto, MultiShell impide que una nueva terminal comparta exactamente el directorio de otra. `allow_shared_directory=true` permite esa coincidencia solo si se solicita; para terminales de usuario, el diálogo de aprobación muestra el riesgo. Compartir carpeta puede causar conflictos en Git, compilaciones y archivos temporales.

Los directorios relativos se resuelven desde la carpeta del proyecto en la ventana propietaria; también se admiten rutas absolutas válidas. Si hay varias ventanas conectadas, proporciona el `window_id` correcto para crear una terminal mediante MCP.

Para comprobaciones de Git, compilaciones y tests que no requieran interacción, utiliza `execute_isolated_command_code`. Ejecuta un proceso independiente en el directorio de la terminal seleccionada, sin escribir en ella, aunque la terminal tenga un proceso protegido tras un timeout. No hereda variables ni alias de la sesión. Git no abre un paginador ni solicita credenciales interactivas: `GIT_PAGER=cat`, `PAGER=cat` y `GIT_TERMINAL_PROMPT=0`. No uses esta herramienta para aplicaciones interactivas ni para escribir o compilar simultáneamente en el mismo árbol de trabajo.

Si una orden Git enviada a la terminal integrada entra en un paginador, sal de él manualmente con `q`. Para evitarlo, utiliza `git --no-pager diff --check` o, en PowerShell, `$env:GIT_PAGER='cat'; git diff --check`. Un timeout no significa que el proceso haya finalizado.

## 4. Alias e identificación

Cada terminal posee un ID único y puede tener un alias corto, como `pruebas`, `1` o `minecraft`. Los alias se muestran como `shell=alias`; pueden cambiarse desde el menú de tres puntos del panel. Se comprueban las colisiones entre ventanas y no se permite reutilizar un alias reservado.

Puedes copiar el selector o una instrucción para ChatGPT desde el panel. El alias determina el destino, **no la autorización ni la identidad de una conversación**.

## 5. Timeouts, bloqueos y recuperación

**Diagnóstico sin enviar comandos:** `external_busy`, `recovery_reason`, `execution_phase`, `input_wait_hint` y `output_silent_seconds` describen actividad y esperas. Un aviso o periodo de silencio no demuestra bloqueo. La recuperación automática contrasta el estado con el runspace real de PowerShell, incluido el prompt vacío de PSReadLine. Las contraseñas, los puntos de interrupción y las líneas sin enviar siguen protegidos.



**Recuperación automática segura:** los eventos de fin y las pruebas guardadas se complementan con una consulta de PowerShell en un runspace de diagnóstico separado. Solo se acepta el runspace principal abierto, disponible y fuera de un punto de interrupción. Un comando silencioso, un subshell o una espera de entrada siguen protegidos. Un evento de actividad durante la consulta invalida el resultado. No se envía ninguna orden al runspace de la terminal.

Las terminales **de usuario y las principales automáticas** conservan su proceso cuando una ejecución supera el tiempo de espera. Mientras la ejecución siga activa, MCP rechaza nuevos comandos en esa terminal para impedir solapamientos. Si VS Code comunica la finalización, se desbloquea automáticamente.

Si falta el evento de finalización, la terminal puede mostrar **Tiempo agotado · proceso conservado**. MultiShell comprueba automáticamente su disponibilidad y libera los registros antiguos solo cuando verifica que está libre. **Comprobar disponibilidad** repite esa consulta sin confirmación manual ni interrupciones.

Las terminales temporales de MCP tienen una política diferente: pueden cerrarse al agotar su timeout para evitar que una ejecución desconocida se solape con la siguiente. Si la integración con la terminal todavía no estaba disponible y el comando no comenzó, un timeout de la principal no debe destruirla.

### Después de recargar VS Code

Si VS Code conserva las terminales físicas, MultiShell reasocia sus identificadores y directorios sin crear duplicados. Reactiva las sesiones mediante eventos fiables, pruebas guardadas o inspección del runspace de PowerShell. Los procesos aún activos permanecen conservados.

Una terminal de otro proyecto, con identificador duplicado o metadatos contradictorios, no debe adoptarse. Si VS Code ha cerrado realmente el proceso, la extensión no puede recuperarlo.

**Cerrar manualmente** una terminal de usuario es distinto de recargar VS Code: el cierre elimina su registro persistente y no debe recrearla.

## 6. Varias ventanas y conexiones

Una ventana actúa como **Coordinador** y expone un único endpoint HTTP local. Las demás trabajan como **Trabajadores** en puertos locales auxiliares. El estado y los identificadores de las ventanas pueden consultarse en el panel.

La extensión supervisa la disponibilidad de los servidores locales y procura recuperarlos tras cierres inesperados. Los trabajadores desconectados no permiten operaciones sobre sus archivos hasta volver a estar disponibles. El indicador ON demuestra que la extensión local está activa; **no confirma por sí solo que el túnel remoto siga conectado**.

El puerto predeterminado es **3000**, limitado a `127.0.0.1`. Puede cambiarse en el panel dentro del intervalo 1024–65535. **Cambiar el puerto local no reconfigura Tunnel Client**: tendrás que ajustar su destino externo si corresponde. No cambies el puerto durante tareas activas salvo necesidad.

Para usar conexiones antiguas con `cwd="@mcp"` y `cwd="@shell:<alias>"`, consulta [Compatibilidad MCP](compatibilidad.md).

## 7. Permisos y seguridad

La extensión exige un proyecto confiable mediante **Workspace Trust**. Los permisos de herramientas MCP pueden configurarse desde `multi-shell-mcp.enabledTools`: `shell`, `file` y `edit`.

El servidor MCP escucha en la interfaz local. Es compatible con Tunnel Client 0.0.18 y con el perfil externo `sample_mcp_remote_no_auth`: no añade OAuth propia ni encabezados obligatorios al endpoint `/mcp`. Los encabezados `Host` y `Origin` se validan, pero la conexión remota y sus credenciales dependen del túnel. Nunca expongas directamente este servidor local a Internet.

Todos los comandos se ejecutan con los permisos del usuario de VS Code; **no hay aislamiento por contenedores**. Para una comprobación paso a paso, consulta [Pruebas y diagnóstico](validacion.md).

## Salida automática de programas interactivos

La configuración `multi-shell-mcp.interactiveAutoExit` viene **activada por defecto**. En el panel MultiShell puedes cambiarla para la **ventana actual** mediante la casilla «Salir automáticamente de comandos interactivos». Desde el menú de tres puntos de cada terminal puedes activarla, desactivarla o volver a heredar el ajuste de su ventana.

**Orden de prioridad:** excepción de la terminal → preferencia de la ventana → configuración global. Una terminal temporal creada por la IA **hereda la preferencia de la ventana donde se crea, nunca la excepción de la terminal que solicitó su creación**. Si cambia el ajuste de la ventana, las temporales que no tengan una excepción propia lo reflejan inmediatamente en el panel y lo aplican a los siguientes comandos. Si se cierra y vuelve a crearse una terminal temporal con el mismo ID, no recupera una excepción obsoleta de la instancia anterior. Esta regla es independiente en cada ventana.

La extensión reconoce comandos independientes `less`, `more`, `top`, `htop`, `man`, `btop`, `bpytop`, `nvtop`, `iftop`, `iotop` y `tig`. Ya **no envía `q` con la primera salida**: exige un aviso de paginación (`-- Más --`, `(END)` o `:`), una cabecera interactiva de `top` o el inicio verificable de la pantalla alternativa en otros monitores. Ignora opciones como `--help`, `--version`, `man -w`, `top -b -n 1`, `more /?`, tuberías y órdenes compuestas. Es una lista blanca conservadora: no garantiza el control de todos los idiomas, paginadores, sistemas o configuraciones.

**Límite técnico:** la API de terminal no permite verificar de manera infalible si una aplicación está esperando teclado. Si el programa no produce salida reconocible o no puede confirmarse su estado, se conserva la protección habitual por timeout: la terminal de usuario no se destruye y la cola permanece bloqueada hasta finalizar.

## Cola de solicitudes de terminales de usuario

En lugar de una notificación modal inmediata, las peticiones de `create_user_shell_code` aparecen en la pestaña **Solicitudes** del panel de la ventana propietaria, con su identificador, directorio y opción de compartir carpeta. Pulsa **Autorizar creación** o **Rechazar**. La solicitud tiene una duración limitada, desaparece si el cliente cancela o se detiene el servidor y nunca crea una terminal antes de tu aprobación.

La creación desde el formulario del panel se autoriza al pulsar **Crear terminal**, sin abrir una ventana modal adicional. Se usa una autorización de un solo uso, ligada al ID, directorio y permiso de carpeta compartida. El cierre de terminales de usuario conserva su autorización independiente.
## Recuperación al recargar e idioma

En 0.10.22, después de **Reload Window**, MultiShell gestiona una sola terminal `main` por ventana y puede reactivar automáticamente las sesiones que estaban libres si su identidad física se mantiene. No registra las principales antiguas como sesiones adicionales; tampoco cierra procesos residuales sin garantías de seguridad.

El idioma sigue automáticamente la configuración de VS Code: español si está seleccionado y, para los demás idiomas, inglés. No hay selector manual en el panel.
## Recuperación automática mejorada en 0.10.22

La extensión guarda evidencia de inactividad y comprueba el estado de PowerShell automáticamente al restaurar o reintentar sesiones protegidas. El botón con escudo repite la comprobación; no autoriza un desbloqueo a ciegas. Si no puede verificarse el estado de un shell, se conserva la protección. Para tareas no interactivas puede emplearse `execute_isolated_command_code`, con variables y alias independientes.
## Protección de ejecución y restauración (0.10.22)

- El estado de ejecución detectado por integración de shell impide enviar nuevas órdenes MCP a una terminal que tenga un comando manual activo; no se envía `Ctrl+C`.
- Cancelar un elemento en cola no deja pasar órdenes posteriores hasta que terminen todas las anteriores.
- Si falla la lectura, la terminal sigue reservada hasta obtener un evento de fin o una comprobación automática fiable de inactividad.
- Solo se restauran terminales de usuario con datos persistentes de titularidad guardados. Las temporales no se convierten en `user` porque su nombre y directorio coincidan; sesiones heredadas sin datos suficientes quedan sin adoptar.
- Una solicitud de creación desconectada se revierte siempre que pueda comprobarse que sigue siendo la operación pendiente; no se cierran terminales de usuario activas arbitrariamente.
## Drenaje de salida tras finalización (0.10.27)

Si VS Code confirma que el comando terminó pero su lectura de salida no se cierra, MultiShell intenta drenarla durante **750 ms**. Si continúa abierta, libera la cola y devuelve `output_incomplete=true` junto con `truncated=true`. No libera una ejecución sin aviso de finalización ni interrumpe el proceso. Este cambio reduce timeouts causados por flujos de salida retenidos, pero no sustituye la validación real en Linux ni todas las configuraciones de PowerShell.

## Conexión y recarga (0.10.28)

Al recargar una ventana, el coordinador puede conservar su registro anterior durante un máximo de 12 segundos. La nueva instancia espera automáticamente a que caduque ese registro y vuelve a asociar la terminal original. Este reintento de registro está limitado a 15 segundos; una ventana que sigue activa conserva su titularidad.

Si se corta la conexión durante una orden, la petición original puede devolver un error aunque el proceso continúe. Las órdenes en espera se cancelan y **las órdenes ya enviadas no se repiten automáticamente**. Comprueba el estado y el resultado antes de volver a solicitar una operación que modifique datos. La terminal principal o de usuario se reactiva cuando puede verificarse que su proceso está libre.

Una consulta de descubrimiento a una ventana que no responde caduca en dos segundos; las otras ventanas continúan disponibles. Las cabeceras HTTP incompletas tienen un límite de diez segundos y los cuerpos de quince, con una comprobación cada segundo. Estos límites afectan a la recepción de la petición, no a la duración de una orden legítima ni al tiempo sin salida del proceso.

## Operaciones canceladas y reconexión (0.10.29)

La cancelación de una petición se propaga también a la creación temporal, al cierre y al cambio de alias. Antes de aplicar una operación pendiente se comprueba su cancelación; una aprobación de cierre que llega después de desconectar no cierra la terminal de usuario. Las autorizaciones locales siguen siendo obligatorias.

Después de una reconexión, una respuesta de la conexión anterior se descarta: no debe cambiar el alias de una terminal nueva, borrar su registro ni hacerla aparecer desconectada. Si la conexión cambia durante una operación, consulta el estado actual antes de repetirla; una pérdida de respuesta no permite deducir si la operación llegó a ejecutarse.

Cuando la extensión reinicia su gestor, las peticiones anteriores terminan y se retiran sus escuchadores. Conservar el proceso de una terminal no conserva las esperas del gestor anterior. Las órdenes que estaban en cola no se envían al reiniciar.
