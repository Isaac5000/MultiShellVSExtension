# Guía de uso

[English](../en/usage.md) · [Índice](../../README.md)

## Lectura de skills optimizada (0.10.54)

El catálogo aprovecha índices y metadatos validados para responder a búsquedas y paginación sin procesar repetidamente los mismos archivos. Se siguen comprobando permisos y rutas y el contenido se lee únicamente cuando se solicita. Consulta [Agent Skills](skills.md).
## Comandos largos sin bloquear la terminal (0.10.53)

Para compilaciones o pruebas que tardan mucho, usa **`start_background_command_code`** con `shell_id`, `command` y opcionalmente `timeout` (milisegundos). Devuelve inmediatamente un `job_id`. Después consulta **`get_background_command_code`** con el mismo `shell_id` y `job_id`; muestra estado, duración, código de salida, salida parcial y posible indicio de espera. **`list_background_commands_code`** recupera trabajos recientes y permite localizar un ID si se perdió la respuesta; **`cancel_background_command_code`** interrumpe solo el proceso aislado correspondiente, nunca una terminal persistente ni un proceso ajeno.

Los trabajos se ejecutan en procesos aislados usando la carpeta de la terminal seleccionada, **sin heredar sus variables, alias o historial**, y pueden avanzar mientras la terminal integrada está ocupada. No se envían automáticamente `Ctrl+C`, `q`, `Enter` ni contraseñas. Los comandos interactivos reconocidos se rechazan; un posible prompt detectado en la salida es solo una pista, no prueba de bloqueo. Para operaciones Git la ejecución aislada desactiva paginadores y solicitudes interactivas de credenciales.

Cada ventana limita los trabajos simultáneos a 12 y conserva hasta 96 registros, con retención de 30 minutos y los últimos 16 KiB de salida por trabajo (se indica truncamiento). Los trabajos sobreviven a un cambio o reinicio del **coordinador** si sigue viva su ventana propietaria. **No se garantiza recuperación al reiniciar la ventana propietaria o VS Code**. Nunca repitas automáticamente una orden si se perdió la respuesta inicial: consulta primero `list_background_commands_code` y el estado real.

El panel muestra el número de trabajos activos, duración, comando reconocido sin argumentos sensibles y posibles pistas de espera. El botón local de cancelación exige confirmación explícita. Las pasarelas IA requieren permisos `shell` o `full` y acceso a la terminal exacta; solo lectura o edición no autorizan gestionar trabajos.



Comportamiento de **MultiShell MCP Server 0.10.68**. Para instalar o actualizar, consulta [Instalación](instalacion.md); para parámetros de clientes antiguos, consulta [Compatibilidad MCP](compatibilidad.md).

Abre **Ctrl+Mayús+P → MultiShell MCP: Mostrar skills disponibles** para consultar y copiar nombres, incluyendo las skills globales de Codex si autorizas su lectura. Por chat también puedes pedir `list_skill_names_code(shell_id="fallouttraduccion")` o, con el conector antiguo, `cwd="@mcp"` y `command="skills fallouttraduccion"`.

Para descubrir skills del proyecto, consulta [Agent Skills](skills.md) y usa `list_skills_code` con la terminal seleccionada.

En el panel, abre **Skills** para buscar por nombre o descripción en el proyecto de esta ventana. **Copiar para ChatGPT** prepara la instrucción con la ruta elegida y la terminal principal; pégala en tu chat conectado a MCP. Las solicitudes de creación de terminales están en la sección independiente **Solicitudes**, sin un segundo desplegable interior. Las skills personales requieren su permiso de lectura existente.

## Conectar ChatGPT: crear el complemento MCP además del túnel (0.10.52)

El apartado **ChatGPT → ? ¿Cómo conectar ChatGPT mediante MCP?** de **Conexiones IA** explica los tres pasos necesarios. No basta con instalar y arrancar `tunnel-client` desde VS Code.

1. En [OpenAI Platform — Tunnels](https://platform.openai.com/settings/organization/tunnels) crea o selecciona un túnel y copia su **`tunnel_id`**. Debe estar asociado al espacio de trabajo de ChatGPT en el que crearás el complemento. Crear un túnel requiere **Tunnels Read + Manage**.
2. En [Platform — API keys](https://platform.openai.com/settings/organization/api-keys) crea una **API key de ejecución restringida** con **Tunnels Read + Use**. No utilices una clave administrativa para el cliente que permanece activo.
3. En **MultiShell → Túnel OpenAI**, instala Tunnel Client, introduce el **mismo `tunnel_id`** y esa **API key de ejecución**, crea el perfil y pulsa **Conectar**. Mantén activo el MCP local.
4. En **ChatGPT → Plugins → + → Add custom MCP server** configura un complemento MCP propio: **nombre** (por ejemplo, MultiShell MCP), **descripción** opcional, **Connection: Tunnel** y elige tu túnel o pega el **mismo `tunnel_id`**. Configura la autenticación según el servidor MCP; el servidor local actual no implementa OAuth. **No pegues en ChatGPT la API key de ejecución del túnel**.
5. Lee la advertencia, marca **I understand and want to continue**, pulsa **Create as a plugin**, revisa las herramientas descubiertas y prueba el complemento en un chat. Si no aparece el túnel, revisa permisos **Tunnels Read + Use** y la asociación con el espacio de trabajo.

Este complemento MCP creado en ChatGPT **no equivale** al paquete local `multi-shell-mcp-plugin-*.zip` ni se genera automáticamente al arrancar Tunnel Client. Consulta la [guía oficial para conectar MCP personalizados](https://help.openai.com/es-es/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

**Información retirada:** Gemini CLI y Claude Code ya no presentan cajas de API key para sus flujos habituales de inicio de sesión, que se realizan en sus respectivas aplicaciones. Si se guardó una clave en versiones anteriores, la nueva ayuda permite **Borrar clave antigua** sin eliminar nada automáticamente. Los perfiles API separados pueden seguir mostrando campos relevantes.

## Asistentes por proveedor desde la interfaz gráfica (0.10.49)

En **Conexiones IA**, cada tarjeta tiene el apartado **? ¿Cómo conectarlo?**. Al desplegarlo se muestran instrucciones específicas según el cliente, comandos oficiales **para copiar** (nunca se ejecutan automáticamente), enlaces a las páginas de instalación o autenticación del proveedor y campos editables para guardar datos requeridos por esa modalidad.

**Gemini CLI**, por ejemplo: 1) instala Node.js 20+; 2) revisa y ejecuta el comando `npm install -g @google/gemini-cli` si hace falta; 3) ejecuta `gemini` e inicia sesión con Google; 4) pulsa **Configurar automáticamente** en la tarjeta para integrar el MCP local sin eliminar otros servidores; 5) verifica dentro de Gemini con `/mcp list` o en consola con `gemini mcp list`. Esta vía **no requiere una API key** si usas la autenticación normal de Google. Desde 0.10.52, Gemini CLI no ofrece ninguna caja de API key; el perfil **Gemini API** mantiene su campo independiente.

**Claude Code** muestra el instalador oficial según sistema, su flujo de inicio de sesión y `claude mcp list`. **Cursor y Copilot** muestran la configuración local en sus respectivos clientes. **Claude web, Grok, Gemini Interactions API y Mistral** muestran los requisitos de HTTPS público y enlaces a sus gestores de conectores; si un servicio requiere OAuth, su autorización sigue realizándose en la web/app oficial.

En las modalidades apropiadas aparecen campos para **URL HTTPS pública del MCP**, **ID de conector**, **API key del proveedor** o **token Bearer del conector MCP**. Los campos sensibles son de tipo contraseña y se guardan de manera independiente en **VS Code SecretStorage**. El panel indica solamente que están guardados, permite sustituirlos o borrarlos y no muestra ni recupera su contenido al actualizar. Las URL no secretas se guardan como metadatos tras validación (sin credenciales incrustadas, consultas ni localhost). Al eliminar un perfil se borran también sus datos del asistente.

La **API key del proveedor** no es la clave Bearer del MCP, ni sustituye el Tunnel ID de OpenAI. El recuadro **?** de ChatGPT explica también cómo crear el complemento MCP en ChatGPT, además de configurar el **Túnel OpenAI** (con Tunnel ID y clave de ejecución). **Guardar valores no crea un túnel HTTPS, ni los transmite a terceros, ni concede acceso remoto automáticamente**; el transporte seguro y las vinculaciones finales de proveedores web siguen pendientes.

## Pasarelas multIA independientes desde el panel (0.10.48)

Esta versión incorpora la **primera fase de seguridad necesaria antes de los túneles externos**. Cada conexión IA puede disponer de un servidor MCP autenticado propio, distinto de la instancia principal en el puerto 3000. No es un segundo coordinador: todas las pasarelas delegan en el mismo router MultiShell, con permisos restringidos en el servidor.

Flujo completamente gráfico para una conexión local protegida:

1. Activa MultiShell en la **ventana coordinadora** y entra en **Conexiones IA**. Crea o selecciona un perfil de IA.
2. En **Acceso independiente · MCP**, selecciona una terminal existente y el nivel de permisos: **Solo lectura**, **Lectura y edición**, **Lectura y comandos** o **Completo**. Pulsa **Crear acceso aislado** y confirma el alcance. Sin una terminal autorizada no se crea la pasarela.
3. Pulsa **Activar pasarela**. La tarjeta muestra una URL como `http://127.0.0.1:38100/mcp`. Es solo local. Cada perfil recibe un puerto diferente.
4. **Copiar clave privada** recupera explícitamente el secreto individual de VS Code SecretStorage después de un aviso; la clave no aparece en el estado de Webview ni en los archivos del proyecto. El cliente MCP que soporte encabezados debe enviar `Authorization: Bearer <clave>` a la URL de ese perfil. No confundas esta clave MCP con las credenciales de la cuenta de la IA o las claves de proveedores de túnel.
5. **Rotar clave** invalida la anterior y detiene solo esa pasarela; copia la nueva y vuelve a iniciarla. **Revocar** elimina la clave y la política. **Arranque automático** es opt-in y solo arranca un gateway local cuando la ventana tiene el rol de hub.

**Límites de seguridad:** el ID de terminal debe coincidir exactamente, no se aceptan alias intercambiables. La raíz vinculada debe seguir siendo la misma. No se permite a clientes de esta pasarela crear/cerrar terminales o reconfigurar alias. Lectura incluye archivos, diagnósticos y skills permitidas dentro de la terminal. Los permisos siguen limitados también por los ajustes globales de MultiShell.

**IMPORTANTE:** ninguna URL `127.0.0.1` funciona por sí sola en Claude web, Grok u otra IA que se conecte desde la nube. **La versión 0.10.48 no inicia túneles HTTPS públicos ni configura OAuth automáticamente**. Para esos servicios falta incorporar un transporte de túnel verificado y completar el proceso oficial de conexión; no debes exponer directamente el puerto 3000 ni los puertos 38100–38199 mediante reglas de firewall.

## Seguridad de terminales y visibilidad de perfiles (0.10.47)

**Conexiones IA** vuelve a mostrar todas las tarjetas de perfiles guardados: el contador y la lista deben coincidir. La corrección no elimina ni migra perfiles existentes.

**Salir automáticamente** sigue siendo opcional por ventana o terminal. Solo envía `q` a paginadores/aplicaciones compatibles con sintaxis de comando reconocible y pantalla observada. Si el comando contiene comillas descompensadas, escapes de interpretación ambigua o un prompt secundario `>>`, MultiShell **no envía pulsaciones automáticas ni mata el programa**. Una terminal de usuario/principal que supere su tiempo de espera conserva el proceso y no se reutiliza hasta que se verifique su finalización. Corrige la orden en VS Code y verifica que esté inactiva.

Para pruebas y mantenimiento, evita `exit` y los comandos `node -e` con comillas anidadas en la terminal PowerShell integrada. Utiliza scripts temporales inspeccionables y consulta el código de salida sin cerrar PowerShell.

## Conexión personalizada según la IA (0.10.46)

**Conexiones IA → Nueva** ofrece dos grupos separados: **Local / Escritorio** (Copilot, Claude Code, Gemini CLI, Cursor y otros) y **Nube / API** (Claude web/Cowork, Grok web, Gemini Interactions API, Mistral Work/Studio y Cursor remoto). Elegir un proveedor cambia la explicación de su transporte y requisitos.

- **ChatGPT:** conservar Secure MCP Tunnel en su pestaña actual.
- **Copilot / Claude Code / Gemini CLI / Cursor local:** pueden recibir la configuración del MCP de la máquina automáticamente desde su tarjeta, sin terminal. «Configurado» refleja únicamente el archivo de configuración, no la aceptación ni una sesión activa.
- **Claude web/Cowork:** conectores personalizados se configuran en Claude; se conectan desde la nube y necesitan HTTPS público y autenticación OAuth o encabezados admitidos.
- **Grok web:** conector MCP Custom de Grok; necesita URL HTTPS pública y credenciales apropiadas; Grok no puede conectar directamente a localhost.
- **Gemini Interactions API:** acepta herramientas `mcp_server` sobre Streamable HTTP y nombres `snake_case`, con encabezados de autorización admitidos. No corresponde a Gemini web.
- **Mistral Work/Studio:** conectores MCP registrados por los mecanismos oficiales, sujetos a roles y estado del producto.
- **Cursor remoto:** Streamable HTTP a través de HTTPS, con autenticación adecuada.

En perfiles cloud/API, la tarjeta muestra **Pendiente: requiere HTTPS autenticado** y un botón **Ver configuración oficial**. No se envía ni copia `127.0.0.1` como URL pública. **Esta versión no habilita un gateway de entrada ni registra conectores directamente en cuentas de terceros.** El siguiente hito debe añadir identidad de conexión, autenticación y autorización por solicitud antes de que pueda activarse un túnel compatible con proveedores adicionales.

El MCP principal exige ahora credenciales de instalación para el túnel de ChatGPT; los clientes locales deben usar pasarelas autenticadas individuales. Cada pasarela puede limitarse a una terminal y un nivel de permisos.

## Conexión local segura por pasarela IA (0.10.52)

1. Abre **MultiShell → Conexiones IA** y crea o selecciona el perfil del cliente.
2. En la tarjeta configura una **pasarela individual** con el ID exacto de la terminal y el nivel de permisos. Iníciala y, si la necesitas después de reiniciar, activa expresamente su arranque automático.
3. Pulsa **Copiar configuración**. El ejemplo incluye la URL local de la pasarela (puertos 38100–38199) y `Authorization: Bearer YOUR_PER_CLIENT_GATEWAY_KEY`, que es **solo un marcador**.
4. Copia la **clave individual de la pasarela** mediante su control local y introdúcela en la configuración segura del cliente, sustituyendo el marcador. No la pegues en chats, repositorios ni archivos compartidos. Los ejemplos copiados no contienen secretos.
5. Comprueba la conexión en Gemini CLI, Claude Code, Cursor o Copilot. La extensión no puede verificar desde un archivo que la sesión de una IA está autenticada.
6. Si ya había una entrada local antigua que apuntaba directamente al puerto 3000, puede mostrarse como **obsoleta/no autenticada**. Puedes abrirla y retirar las entradas anteriores que MultiShell gestionaba mediante **Desvincular**; no se eliminan automáticamente.

**Cambio incompatible respecto a 0.10.45:** la opción antigua **Configurar automáticamente** no se ofrece; generaba una URL sin credenciales que dejó de funcionar cuando se protegió el servidor principal en 0.10.52. No se insertan claves internas en JSON de otros programas para ocultar el problema. Una integración totalmente automática necesitará un mecanismo seguro de entrega de credenciales específico de cada cliente. El archivo portable del plugin tampoco incluye claves.

## Solicitudes y cinco clientes MCP concurrentes (0.10.44)

«Solicitudes» tiene una única pantalla con título, contador, explicación y aprobaciones visibles. No hay un segundo desplegable. Cuando no existen solicitudes, aparece directamente el estado vacío.

**Un coordinador en el puerto 3000 basta para gestionar cinco clientes MCP locales** en las pruebas con comandos ligeros. En una misma ventana de VS Code se pueden usar cinco terminales diferentes o distribuirlas entre ventanas. Los comandos se ejecutan simultáneamente en terminales distintas; sobre una misma terminal `shell_id` se encolan en orden FIFO.

**Sin garantía de aislamiento por IA:** el servidor no autentica actualmente cada perfil de cliente y cualquiera que pueda invocar las herramientas MCP puede seleccionar shells conocidos. Para evitar conflictos al desarrollar simultáneamente, asigna un shell y directorio/worktree distintos a cada IA. No compartas archivos que se modifiquen en paralelo; los permisos y bloqueos de archivos no son todavía independientes por perfil. El puerto del servidor es un punto único de fallo y un túnel remoto puede imponer sus propios límites.

Las cifras de las pruebas internas son sintéticas: no constituyen un benchmark de cinco modelos externos reales ni validan un gateway multIA remoto.

## Navegación y perfiles locales multIA (0.10.43)

La barra lateral ahora utiliza **Resumen**, **Terminales**, **Ventanas**, **Solicitudes**, **Skills**, **Conexiones IA**, **Túnel** y **Configuración**. Pulsa **Menú** para desplegar la navegación; al elegir una sección, el menú se pliega para ahorrar espacio vertical. Puerto MCP y salida automática de programas interactivos están en **Configuración**, no en la cabecera.

En **Conexiones IA**, la tarjeta de ChatGPT abre la gestión privada del túnel OpenAI existente. El botón **Nueva** permite guardar perfiles **locales** para VS Code/GitHub Copilot, Claude Code, Gemini CLI, Cursor y otros clientes MCP compatibles. Se guarda únicamente el proveedor, nombre y fecha. **Copiar configuración** genera un ejemplo local para el puerto MCP activo y requiere confirmar el aviso. Después debes pegarlo manualmente en el cliente y comprobar que funciona.

**Seguridad y alcance:** los perfiles no establecen automáticamente una conexión ni se marcan como conectados, no guardan API keys y no crean túneles remotos. Los clientes locales comparten los permisos generales del servidor MCP y todavía no existe autenticación diferenciada por IA. No publiques la URL 127.0.0.1 ni abras el puerto 3000 a Internet. Si tienes habilitadas herramientas de escritura o shell, cualquier cliente local al que añadas el servidor podrá solicitarlas; verifica qué cliente autorizas.

Las configuraciones se copian como un fragmento para fusionar con el archivo del cliente, **no** sustituyas sus demás servidores MCP. Ejemplos: VS Code usa `.vscode/mcp.json` con `servers`, Gemini CLI usa `mcpServers` y `httpUrl`, Cursor usa `mcpServers` con `url`, Claude Code usa su comando `claude mcp add --transport http`. Los archivos de configuración externos **nunca se modifican automáticamente**.

## Túnel integrado desde el panel (0.10.41)

**Mejora 0.10.42:** el proceso del túnel creado por esta extensión puede recuperarse al recargar VS Code si existe una identidad verificable de su ejecución. En caso contrario se conserva como proceso externo o desacoplado y no se intenta detener. Para cambiar el puerto MCP, desconecta primero cualquier túnel gestionado: el perfil creado por MultiShell se actualizará con seguridad, mientras que los perfiles importados permanecerán inalterados.

Abre la pestaña **Túnel**. Pulsa **Instalar cliente** para descargar y verificar Tunnel Client v0.0.19. Introduce el **Tunnel ID** existente, un nombre nuevo de perfil y la **API key** en el campo de contraseña y pulsa **Crear perfil**. También puedes reutilizar un perfil compatible (con selección y entrada local de la clave) sin sobrescribir su YAML.

Después usa **Conectar** y, si deseas que se inicie en posteriores sesiones del coordinador, marca **Iniciar túnel automáticamente** y confirma el aviso. **Desconectar** pide confirmación, detiene únicamente el proceso propiedad de la extensión y desactiva el arranque automático; no mata túneles externos. **Actualizar clave** reemplaza el secreto guardado sin modificar el perfil.

El indicador de estado distingue proceso gestionado, túnel externo, proceso conservado tras recarga y error de reintentos. La clave se envía una sola vez al host local de VS Code y se guarda en SecretStorage; no se devuelve al panel ni se escribe en archivos del proyecto. La pestaña no crea túneles remotos en la plataforma: el Tunnel ID y la clave deben existir previamente.

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
| De usuario | `create_user_shell_code` o botón **Nueva** del panel | Requiere aceptar la solicitud en el desplegable **Solicitudes** del panel, bajo **Ventana actual**; tipo `user`, con recuperación persistente |

### Solicitar a la IA una terminal de usuario

Pide expresamente, por ejemplo:

> Crea una terminal de usuario persistente llamada `pruebas` en un directorio independiente de este proyecto. Te autorizaré en VS Code. Después utiliza `shell=pruebas`.

La IA enviará una petición mediante `create_user_shell_code` con un `shell_id`, una ruta de trabajo opcional (`cwd`) y, si hay varias ventanas, un `window_id`. **Todavía no existe ninguna terminal** en ese momento. La petición aparece en el desplegable **Solicitudes** del panel local con ID, directorio y opción de compartir carpeta. Solo se crea si pulsas **Autorizar creación**; rechazar, cancelar o agotar el plazo no crea ninguna terminal.

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

En lugar de una notificación modal inmediata, las peticiones de `create_user_shell_code` aparecen en el desplegable **Solicitudes** del panel, bajo **Ventana actual** de la ventana propietaria, con su identificador, directorio y opción de compartir carpeta. Pulsa **Autorizar creación** o **Rechazar**. La solicitud tiene una duración limitada, desaparece si el cliente cancela o se detiene el servidor y nunca crea una terminal antes de tu aprobación.

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

Edición compatible con 0.10.58.

Compatible con 0.10.59.

Documentación compatible con 0.10.72.

Compatible con 0.10.61.

Documentación compatible con 0.10.62.

Documentación compatible con 0.10.63.

Compatible con 0.10.64.
