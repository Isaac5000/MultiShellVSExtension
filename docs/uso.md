# Guía de uso de MultiShell MCP Server

Esta guía describe el comportamiento actual de la versión **0.10.10**. Para preparar el entorno consulta [Instalación](instalacion.md); para los cambios históricos, [CHANGELOG](../CHANGELOG.md).

## Uso rápido: shell=1

Escribe en ChatGPT `[$vscode] shell=1: ejecuta ls` o `[$vscode] shell=minecraft: compila`. El alias se asigna automáticamente desde el nombre del proyecto y aparece junto a cada terminal. Para personalizarlo, abre el menú de tres puntos de la terminal y elige **Cambiar alias**. El botón de copiar genera `shell=alias`; el menú también permite copiar una instrucción corta.

No es necesario un prompt largo ni cambiar de conector. Los alias son únicos entre ventanas; si dos proyectos tienen el mismo nombre, uno recibirá un sufijo como `1-2`. La elección se indica por operación o en las instrucciones del chat, nunca es una variable global compartida.

## Panel lateral de VSCode

Abre el icono **MultiShell MCP** de la barra de actividad. La vista utiliza los colores, fuentes y controles del tema activo de VSCode, tanto claro como oscuro.

La nueva interfaz está organizada en:

- **Estado de conexión:** indica *Coordinador*, *Trabajador* o *Desconectado*, el puerto MCP y un botón para iniciar/detener el servidor.
- **Ventana actual:** nombre y ruta del proyecto, identificador de ventana y botón para copiarlo.
- **Terminales:** lista compacta de shells, con estado *Disponible/Ocupada*, número de comandos pendientes y acciones rápidas. Al pulsar la fila se muestra la terminal. El botón de copia copia el ID y el menú de tres puntos permite copiar las instrucciones para ChatGPT y cerrar terminales auxiliares.
- **Nueva:** despliega el formulario para crear otro shell. Se puede cancelar y ocultar sin perder espacio permanentemente.
- **Ventanas:** pestaña independiente para consultar los VSCode conectados al coordinador y copiar sus IDs.
- **Buscar:** aparece automáticamente al tener al menos cinco terminales.
- **Idioma:** Automático (VSCode), Español o English.
- **Ayuda:** apartado desplegable que explica cómo asignar manualmente un shell a cada conversación ChatGPT.

### Shell principal por ventana

Al iniciar MultiShell MCP en una ventana, se crea su terminal principal con el identificador único `main-<window_id>`. El panel la destaca como **Principal** y permite abrirla o copiar su ID. No permite cerrarla desde el menú, aunque se cerrará si se detiene el servidor.

Si hay varios chats, utiliza el menú de la terminal **Copiar instrucciones para ChatGPT** y pega el texto en el chat correcto. La extensión no obtiene automáticamente el identificador de la conversación de ChatGPT.

## Rutas y gestión de terminales

- El campo directorio de una terminal nueva admite rutas relativas, por ejemplo src, mods o ..\otro-proyecto, que se interpretan desde el proyecto de la ventana de VSCode correspondiente. También admite rutas absolutas.
- Las terminales auxiliares incluyen un botón de cierre a la derecha y la opción de cierre en el menú. La terminal principal es permanente y se recrea si se cierra manualmente.
- Un cierre desde el panel o directamente desde VSCode libera el alias y limpia el registro del servidor.
- Los botones de copiar selector, copiar la instrucción corta y cerrar se mantienen a la derecha de los textos, aunque los IDs sean largos.
- El icono de MultiShell MCP es original y muestra dos terminales conectadas a un hub.

## Configuración del puerto MCP

En la barra lateral de MultiShell MCP, cambia el campo **Puerto MCP** (1024–65535) y pulsa **Aplicar**. El puerto se guarda como ajuste global de VSCode y las ventanas activas reinician su conexión para usarlo. El indicador inferior muestra **ON · puerto** cuando está activo y **OFF** cuando está detenido. Si el puerto nuevo está ocupado, la extensión intenta volver al anterior. El túnel externo no se modifica automáticamente: ajusta su puerto de destino para mantener la conexión de ChatGPT.

## Origen de las terminales y tiempo de espera

Las terminales auxiliares creadas desde el panel pertenecen al **usuario**; las creadas mediante `create_shell_code` son **MCP**, y las principales creadas automáticamente tienen origen **automático**.

Cuando una llamada MCP supera su tiempo de espera en una terminal de usuario, el proceso continúa y el panel muestra «Tiempo agotado · proceso conservado». Mientras continúa, se rechazan nuevos comandos MCP y se cancelan las llamadas pendientes. Tras recibir la finalización de VSCode, la terminal vuelve a estar disponible. Las terminales MCP y automáticas mantienen el cierre al superar el tiempo de espera; el servidor reconstruye la principal si sigue activo. El cierre manual de una terminal no es un timeout.

## Recuperación tras recargar VSCode

Al ejecutar `Developer: Reload Window`, VSCode puede conservar las terminales físicas. MultiShell intenta recuperar la terminal principal previa en lugar de crear otra. En actualizaciones antiguas, puede conservar otras principales detectadas como sesiones independientes. No garantiza recuperar procesos que el propio VSCode haya cerrado.

También recupera terminales auxiliares del usuario creadas desde el panel utilizando su identidad, alias y directorio registrados en el estado del proyecto. Si VSCode no proporciona `creationOptions.cwd`, puede utilizar el directorio guardado; si informa de un directorio diferente, rechaza la asociación. Los ID duplicados, las terminales de otros proyectos y las sesiones sin metadatos verificables no se adoptan. La compatibilidad con terminales antiguas `MCP [id]` se limita a las pertenecientes al proyecto.

**Una terminal de usuario restaurada no queda habilitada para MCP automáticamente.** Aparece como «Recuperada · confirma que está libre»: examina su proceso y selecciona «Volver a habilitar MCP» cuando haya terminado o lo hayas interrumpido. Hasta ese momento rechaza nuevas órdenes MCP. Si la cierras, no se recrea.

## Cierre de terminales

El botón y el menú de «Cerrar terminal» abren una confirmación modal nativa de VSCode. Confirmar cierra la terminal física y elimina su identidad guardada; cancelar no interrumpe el proceso ni elimina la sesión. La terminal principal no se puede cerrar desde el panel.

## Confianza del proyecto (Workspace Trust)

MultiShell MCP Server solo activa su servidor y sus herramientas MCP si VSCode considera **confiable el espacio de trabajo**. En modo restringido la extensión queda deshabilitada. Incluso si el usuario fuerza su activación mediante un ajuste de VSCode, una segunda comprobación de `workspace.isTrusted` impide iniciar el servidor o ejecutar sus comandos MCP. Para permitir su uso, autoriza el proyecto mediante `Workspaces: Manage Workspace Trust`. Se verifica la confianza de la **carpeta o proyecto**, no de cada archivo individual. Nunca se confía automáticamente en un directorio.

## Límites y seguridad

Cada terminal trabaja en una cola independiente; distintas terminales pueden ejecutar comandos simultáneamente. El puerto 3000 no obliga a serializar las llamadas. La velocidad real depende del túnel, el ordenador y los procesos ejecutados.

El identificador del shell evita errores accidentales de enrutamiento, pero **no autentica la conversación de origen**. Los comandos ejecutados en las terminales tampoco están aislados como en contenedores. Para editar un repositorio desde varios chats, usa directorios o Git worktrees distintos.

La verificación real en Ubuntu sigue pendiente; consulta [Validación](validacion.md).


## Compatibilidad con conexiones antiguas

Los selectores `cwd="@mcp"` y `cwd="@shell:<alias>"` permiten utilizar esquemas anteriores del conector. Las operaciones sobre archivos y diagnósticos requieren seleccionar la ventana o el shell adecuado. Consulta [Compatibilidad de conectores](compatibilidad.md) para los parámetros y ejemplos.
