# MultiShell MCP Server

[Español](#español) · [English](#english)

---

## Español

**Código fuente 0.10.39 · VS Code 1.99 o posterior · Licencia MIT**

MultiShell MCP Server conecta varias ventanas y terminales de Visual Studio Code a un servidor MCP local. Los comandos siempre seleccionan una terminal por su ID o alias. Las terminales pueden trabajar simultáneamente, con una cola FIFO independiente para cada una.

### Terminales y permisos

`create_shell_code` crea terminales temporales. Las solicitudes de `create_user_shell_code` para crear terminales de usuario persistentes aparecen en la pestaña **Solicitudes** de la ventana correspondiente, con botones para autorizar o rechazar. Al pulsar **Crear terminal** en el propio panel, no se abre una segunda ventana de confirmación. La autorización es local y de un solo uso.

Las terminales de usuario y la principal conservan sus procesos ante un timeout. Las terminales temporales heredan los ajustes de su ventana, salvo que tengan una excepción individual. Las solicitudes y alias MCP no permiten saltarse las autorizaciones de VS Code.

### Diagnóstico de bloqueos

La lista distingue **comandos MCP**, **actividad externa** y **verificación de recuperación**. Las fases de ejecución, posibles solicitudes de entrada y segundos sin salida ayudan al diagnóstico; el silencio no demuestra bloqueo. En PowerShell, MultiShell verifica automáticamente el estado real mediante un runspace de diagnóstico separado, sin enviar texto, Enter ni Ctrl+C a la terminal.

### Recuperación y controles

Al recargar VS Code, la extensión intenta recuperar una sola terminal principal y las terminales de usuario originales. Puede reactivar automáticamente una sesión cuando recibe una finalización de comando confirmada o cuando los metadatos de inactividad guardados coinciden con el proceso y directorio restaurados.

**Limitación:** PowerShell se recupera automáticamente cuando se confirma que su runspace principal está disponible. Otros shells siguen usando eventos de finalización y pruebas de inactividad guardadas. Si el sistema no permite verificar el estado, se mantiene la protección y puede utilizarse la ejecución aislada para tareas no interactivas. No se cierra ni sustituye una terminal con trabajo posiblemente activo.

La verificación se repite aproximadamente cada 3 segundos y antes de reintentar una orden protegida. El estado de inactividad también se guarda al cambiar la actividad y cada 15 segundos. El botón **Comprobar disponibilidad** solicita otra comprobación automática; no pide declarar manualmente que la terminal está libre.

El botón de recuperación y la opción de salida automática utilizan iconos diferentes. La creación de terminales desde el panel se completa dentro de VS Code sin diálogo externo; las peticiones remotas siguen necesitando autorización. Las órdenes MCP no interrumpen comandos manuales detectados por VS Code y la cola no adelanta órdenes tras cancelar una petición. Solo se restauran sesiones de usuario que consten como persistentes; las temporales desconocidas nunca se promueven a persistentes.

El panel utiliza automáticamente el idioma configurado en VS Code: español si está disponible, inglés en otros casos. Los flujos de salida que permanezcan abiertos después de una finalización confirmada tienen un drenaje limitado a 750 ms. Si no finaliza la lectura, la respuesta marca `output_incomplete=true` en lugar de bloquear la cola.

La salida automática reconoce `less`, `more`, `top`, `htop`, `man`, `btop`, `bpytop`, `nvtop`, `iftop`, `iotop` y `tig`, pero solo envía `q` al detectar señales reconocibles de paginación o pantalla completa. Las opciones de ayuda, versión y modo por lotes quedan excluidas; puede configurarse por ventana y terminal.

El repositorio incluye `.gitattributes` para mantener los archivos de texto con finales de línea LF en Windows y Linux, evitando los avisos de conversión LF/CRLF sin cambiar la configuración global de Git.

La herramienta `execute_isolated_command_code` ejecuta órdenes no interactivas en un proceso independiente, con el directorio de la terminal seleccionada y sin enviar teclas a esa terminal. No comparte alias, variables de sesión ni procesos persistentes. Esta vía evita los bloqueos de la integración de VS Code en comprobaciones y compilaciones.

### Agent Skills

MultiShell puede descubrir y leer skills de proyecto en `.agents/skills/`, `.github/skills/` y `.claude/skills/`. Las herramientas `list_skills_code`, `read_skill_code` y `read_skill_file_code` requieren un `shell_id` explícito, respetan el ámbito del proyecto y **nunca ejecutan scripts automáticamente**. Los clientes compatibles también pueden utilizar el recurso `skill://index.json`. Se incluye una skill propia para Codex en `.agents/skills/multishell-mcp/`. Esta capacidad necesita el permiso de lectura de archivos y no instala skills nativas en ChatGPT por sí sola.

Ahora también lee **skills globales de Codex** (previa autorización) sin copiarlas al repositorio. La lista de nombres está disponible en **Ctrl+Mayús+P → MultiShell MCP: Mostrar skills disponibles**, en la herramienta `list_skill_names_code`, o desde el conector heredado con `cwd="@mcp"` y `command="skills fallouttraduccion"`. El acceso global está desactivado por defecto en `multi-shell-mcp.globalCodexSkills` porque también puede exponer los archivos a clientes remotos conectados.

**Desde 0.10.33, las skills se leen en la ventana propietaria**, no en el disco del coordinador. `list_windows_code` identifica el `machine_id` y el `window_id`; las skills iguales en distintas ventanas se mantienen separadas. La conexión entre ventanas sigue siendo local a cada máquina: para usar varios equipos desde ChatGPT, conecta cada servidor MCP de forma independiente y segura.

**Mejora 0.10.37:** el selector de la paleta recorre todas las páginas, muestra las descripciones y copia rutas específicas cuando dos skills comparten nombre. La consulta `list_skill_names_code` filtra por nombre antes de paginar, sin perder coincidencias por descripciones ajenas. El selector necesita una carpeta de proyecto abierta.

**Nuevo en 0.10.39:** toda la lógica MCP utiliza exclusivamente el SDK oficial v2. Una única instancia por solicitud admite clientes antiguos (`initialize`, protocolos 2025) y modernos (`server/discover`, protocolo 2026) sin instalar el SDK v1. Se conservan `127.0.0.1:3000/mcp`, los permisos, el túnel externo y los comportamientos de la interfaz. La compatibilidad de protocolos no implica activar automáticamente un plugin en ChatGPT. Consulta [Compatibilidad MCP](docs/es/compatibilidad.md).

**Nuevo en 0.10.38:** en la pestaña **Skills**, cada fila muestra el nombre y su ruta justo debajo, siempre visibles. El botón de copiar queda a la derecha del nombre; el desplegable **Descripción**, situado debajo de la ruta, comienza cerrado. Los detalles abiertos se conservan al cargar más resultados.

Consulta la [guía de Agent Skills](docs/es/skills.md).

**Nuevo en 0.10.33:** soporte oficial del protocolo MCP `2026-07-28`, con `server/discover`, `skills/list`, `skills/get` y recursos verificables por SHA-256. Los clientes antiguos siguen funcionando. La distribución también incluye un [plugin portable de ChatGPT y Codex](docs/es/skills.md) con marketplace local; la instalación se autoriza por separado.

### Instalación y compilación

Para compilar el código fuente necesitas Node.js 22.13 o posterior y npm. El empaquetador usado es `@vscode/vsce` 4.1.0:

```bash
npm ci
npm run test:multishell
npm run lint
npm run package
npm run package:plugin
```

Genera `multi-shell-mcp-server-0.10.39.vsix` con `npm run package`. Se instala mediante **Extensions: Install from VSIX...**. Compilar o empaquetar no actualiza la extensión ya instalada.

La dirección local predeterminada es `http://127.0.0.1:3000/mcp`.

### Seguridad y comprobaciones

Solo se inicia en espacios de trabajo de confianza. Los comandos se ejecutan con los permisos del usuario; el servidor local no es una zona aislada y no debe exponerse directamente a Internet. Tunnel Client y sus credenciales se administran por separado.

La versión 0.10.36 limita los archivos al interior de la skill seleccionada, verifica las lecturas concurrentes y calcula solo los manifiestos de la página solicitada. Evita catálogos repetidos para terminales de una misma carpeta y ventana. Consulta [Validación](docs/es/validacion.md) para resultados y límites.

### Documentación en español

- [Instalación y distribución](docs/es/instalacion.md)
- [Uso y terminales](docs/es/uso.md)
- [Compatibilidad con conectores MCP](docs/es/compatibilidad.md)
- [Pruebas y diagnóstico](docs/es/validacion.md)
- [Uso de Agent Skills](docs/es/skills.md)
- [Historial de cambios](docs/es/historial.md)

### Origen y licencia

Adaptación de [juehang/vscode-mcp-server](https://github.com/juehang/vscode-mcp-server), conforme a la [licencia MIT](LICENSE). El repositorio original no es el repositorio de publicación de esta adaptación.

---

## English

**Source code 0.10.39 · VS Code 1.99 or later · MIT license**

MultiShell MCP Server connects several Visual Studio Code windows and terminals to a local MCP server. Commands always target a terminal by ID or alias. Terminals can run in parallel, with an independent FIFO command queue per terminal.

### Terminals and permissions

`create_shell_code` creates temporary terminals. Requests from `create_user_shell_code` for persistent user-owned terminals appear in the owning window's **Requests** tab with approve and deny controls. Clicking **Create terminal** in the panel itself confirms that local operation without opening another modal window. Approval is single-use.

User-owned and primary terminals preserve running processes after a timeout. Temporary terminals inherit the policy of their owning window unless explicitly overridden. MCP requests and aliases cannot bypass VS Code authorization.

### Blocked-terminal diagnostics

Terminal lists distinguish **MCP commands**, **external activity**, and **recovery verification**. Execution phases, possible input prompts, and output silence help diagnostics; silence does not prove a deadlock. For PowerShell, MultiShell automatically inspects actual readiness through a separate diagnostic runspace without sending terminal text, Enter, or Ctrl+C.

### Recovery and controls

On a VS Code window reload, the extension attempts to reattach one original primary terminal and the original user-owned terminals. It can automatically re-enable a session after receiving a verified command-completion event or matching saved idle evidence to the restored process and directory.

**Limitation:** PowerShell recovers automatically when its foreground runspace is confirmed available. Other shells retain completion-event and saved-idle-evidence recovery. If readiness cannot be verified, protection remains; isolated execution is available for non-interactive work. Terminals with potentially active work are neither closed nor replaced.

Verification repeats approximately every 3 seconds and before retrying a guarded command. Idle evidence is also saved on activity changes and every 15 seconds. **Check availability** requests another automatic inspection; it does not ask the user to declare the terminal idle.

The recovery button and automatic-exit action use distinct icons. Creating terminals from the panel no longer raises a second OS modal, while remote requests still require approval. MCP commands cannot interrupt manually started commands detected by VS Code; queue cancellations cannot overtake earlier work. Only persisted user-owned terminal records are restored: unknown temporary terminals are never promoted to persistent sessions.

The panel follows VS Code's configured language automatically: Spanish when available, English otherwise. Output streams that linger after a confirmed command completion are drained for up to 750 ms. The response marks `output_incomplete=true` instead of blocking the queue indefinitely.

Automatic exit recognizes `less`, `more`, `top`, `htop`, `man`, `btop`, `bpytop`, `nvtop`, `iftop`, `iotop` and `tig`, but sends `q` only after recognizable paging or full-screen output. Help, version and batch flags are excluded; preferences remain per-window and per-terminal.

The repository now includes `.gitattributes` to keep text files on LF across Windows and Linux, preventing LF/CRLF conversion warnings without changing global Git settings.

The `execute_isolated_command_code` tool runs non-interactive commands in a separate OS process using the selected shell's directory without writing to that terminal. It does not inherit terminal session variables, aliases or persistent processes. Use it for builds and checks that might confuse VS Code shell integration.

### Agent Skills

MultiShell can discover and read workspace skills from `.agents/skills/`, `.github/skills/`, and `.claude/skills/`. The `list_skills_code`, `read_skill_code`, and `read_skill_file_code` tools require an explicit `shell_id`, stay within its workspace, and **never execute bundled scripts automatically**. Compatible clients can also consume `skill://index.json`. A dedicated Codex skill is provided at `.agents/skills/multishell-mcp/`. File-read permission is required; this does not automatically install native ChatGPT skills.

MultiShell can also read **global Codex skills** in place after explicit approval. Find their names using **Ctrl+Shift+P → MultiShell MCP: List available skills**, `list_skill_names_code`, or the legacy `cwd="@mcp"`, `command="skills fallouttraduccion"` control query. Global access is off by default through `multi-shell-mcp.globalCodexSkills`, since remote MCP clients could otherwise read those files.

**Since 0.10.33, skill reads run in the owning VS Code worker**, not on the hub machine. `list_windows_code` exposes the installation `machine_id` and `window_id`, and same-named skills in different windows are kept distinct. Window networking remains local to each machine; connect each machine's MCP server separately and securely for multi-computer workflows.

**Improved in 0.10.37:** the Command Palette picker scans every catalog page, shows descriptions and copies exact paths for duplicate names. `list_skill_names_code` filters by name before pagination, avoiding false empty pages caused by matching descriptions. The picker requires an open workspace folder.

**New in 0.10.39:** all MCP implementation code uses only the official SDK v2. One server factory handles older clients (`initialize`, 2025 protocols) and modern clients (`server/discover`, 2026 protocol) without installing SDK v1. The `127.0.0.1:3000/mcp` endpoint, permissions, external tunnel contract, and interface remain unchanged. Protocol compatibility does not automatically activate a ChatGPT plugin. See [MCP compatibility](docs/en/compatibility.md).

**New in 0.10.38:** each **Skills** row shows the name and the path immediately below it, both always visible. The copy icon stays to the right of the name; the **Description** disclosure below the path starts collapsed. Expanded descriptions remain open when additional results load.

See the [Agent Skills guide](docs/en/skills.md).

**New in 0.10.33:** official MCP `2026-07-28` support with `server/discover`, `skills/list`, `skills/get`, and SHA-256-verifiable skill resources. Older MCP clients remain supported. A [portable ChatGPT/Codex plugin](docs/en/skills.md) with a repo-local marketplace is provided for user-approved installation.

### Installation and building

Building from source requires Node.js 22.13 or later and npm, using `@vscode/vsce` 4.1.0:

```bash
npm ci
npm run test:multishell
npm run lint
npm run package
npm run package:plugin
```

Generate `multi-shell-mcp-server-0.10.39.vsix` with `npm run package`. Install it using **Extensions: Install from VSIX...**. Building or packaging does not update the installed extension.

The default local endpoint is `http://127.0.0.1:3000/mcp`.

### Security and testing

The VS Code workspace must be trusted. Commands run with the operating system user's permissions; the local server is not a sandbox and must not be exposed directly to the internet. Tunnel Client and its credentials are managed separately.

Version 0.10.36 confines files to the selected skill, checks concurrent reads, and builds manifests only for the requested page. It avoids duplicate catalogs for terminals sharing a root in the same window. See [Validation](docs/en/validation.md) for results and limits.

### English documentation

- [Installation and distribution](docs/en/installation.md)
- [Usage and terminals](docs/en/usage.md)
- [MCP connector compatibility](docs/en/compatibility.md)
- [Testing and troubleshooting](docs/en/validation.md)
- [Using Agent Skills](docs/en/skills.md)
- [Release history](docs/en/changelog.md)

### Origin and license

Adapted from [juehang/vscode-mcp-server](https://github.com/juehang/vscode-mcp-server) under the [MIT license](LICENSE). The original repository is not this adaptation's publication repository.