# MultiShell MCP Server

[Español](#español) · [English](#english)

---

## Español

**Código fuente 0.10.25 · VS Code 1.99 o posterior · Licencia MIT**

MultiShell MCP Server conecta varias ventanas y terminales de Visual Studio Code a un servidor MCP local. Los comandos siempre seleccionan una terminal por su ID o alias. Las terminales pueden trabajar simultáneamente, con una cola FIFO independiente para cada una.

### Terminales y permisos

`create_shell_code` crea terminales temporales. Las solicitudes de `create_user_shell_code` para crear terminales de usuario persistentes aparecen en la pestaña **Solicitudes** de la ventana correspondiente, con botones para autorizar o rechazar. Al pulsar **Crear terminal** en el propio panel, no se abre una segunda ventana de confirmación. La autorización es local y de un solo uso.

Las terminales de usuario y la principal conservan sus procesos ante un timeout. Las terminales temporales heredan los ajustes de su ventana, salvo que tengan una excepción individual. Las solicitudes y alias MCP no permiten saltarse las autorizaciones de VS Code.

### Recuperación y controles

Al recargar VS Code, la extensión intenta recuperar una sola terminal principal y las terminales de usuario originales. Puede reactivar automáticamente una sesión cuando recibe una finalización de comando confirmada o cuando los metadatos de inactividad guardados coinciden con el proceso y directorio restaurados.

**Limitación:** VS Code no proporciona una identidad de sesión inmutable ni un indicador universal de terminal libre. Si la restauración es ambigua o un comando puede seguir activo, se mantiene la confirmación manual, sin enviar comandos ni señales de sondeo. Las terminales principales residuales de versiones antiguas se conservan físicamente si no es seguro cerrarlas; no se muestran como principales adicionales.

Para reducir las confirmaciones tras recargar, el estado de inactividad se actualiza al empezar y terminar los comandos y cada 15 segundos mientras MultiShell está activo. Solo se reactiva automáticamente una sesión cuando se verifica la identidad del proceso y su directorio. Los casos ambiguos mantienen la protección manual.

El botón de recuperación y la opción de salida automática utilizan iconos diferentes. La creación de terminales desde el panel se completa dentro de VS Code sin diálogo externo; las peticiones remotas siguen necesitando autorización. Las órdenes MCP no interrumpen comandos manuales detectados por VS Code y la cola no adelanta órdenes tras cancelar una petición. Solo se restauran sesiones de usuario que consten como persistentes; las temporales desconocidas nunca se promueven a persistentes.

El panel utiliza automáticamente el idioma configurado en VS Code: español si está disponible, inglés en otros casos. Los flujos de salida que permanezcan abiertos después de una finalización confirmada tienen un drenaje limitado a 750 ms. Si no finaliza la lectura, la respuesta marca `output_incomplete=true` en lugar de bloquear la cola.

La salida automática reconoce `less`, `more`, `top`, `htop`, `man`, `btop`, `bpytop`, `nvtop`, `iftop`, `iotop` y `tig`, pero solo envía `q` al detectar señales reconocibles de paginación o pantalla completa. Las opciones de ayuda, versión y modo por lotes quedan excluidas; puede configurarse por ventana y terminal.

El repositorio incluye `.gitattributes` para mantener los archivos de texto con finales de línea LF en Windows y Linux, evitando los avisos de conversión LF/CRLF sin cambiar la configuración global de Git.

La herramienta `execute_isolated_command_code` ejecuta órdenes no interactivas en un proceso independiente, con el directorio de la terminal seleccionada y sin enviar teclas a esa terminal. No comparte alias, variables de sesión ni procesos persistentes. Esta vía evita los bloqueos de la integración de VS Code en comprobaciones y compilaciones.

### Instalación y compilación

Para compilar el código fuente necesitas Node.js 22 o posterior y npm. El empaquetador usado es `@vscode/vsce` 4.1.0:

```bash
npm ci
npm run test:multishell
npm run lint
npm run package
```

El instalador `multi-shell-mcp-server-0.10.25.vsix` ya se ha compilado y empaquetado. Se verifican 23 archivos incluidos. Se instala con **Extensions: Install from VSIX...**.

La dirección local predeterminada es `http://127.0.0.1:3000/mcp`.

### Seguridad y comprobaciones

Solo se inicia en espacios de trabajo de confianza. Los comandos se ejecutan con los permisos del usuario; el servidor local no es una zona aislada y no debe exponerse directamente a Internet. Tunnel Client y sus credenciales se administran por separado.

La versión 0.10.25 ha superado **53/53 suites automatizadas**, compilación TypeScript, ESLint sin advertencias y empaquetado VSIX de 23 archivos. Siguen pendientes la instalación de esta actualización en VS Code y pruebas reales de recarga y de los monitores Linux. Sigue pendiente una prueba real de recarga y la ejecución nativa de los monitores Linux.

### Documentación en español

- [Instalación y distribución](docs/es/instalacion.md)
- [Uso y terminales](docs/es/uso.md)
- [Compatibilidad con conectores MCP](docs/es/compatibilidad.md)
- [Pruebas y diagnóstico](docs/es/validacion.md)
- [Historial de cambios](docs/es/historial.md)

### Origen y licencia

Adaptación de [juehang/vscode-mcp-server](https://github.com/juehang/vscode-mcp-server), conforme a la [licencia MIT](LICENSE). El repositorio original no es el repositorio de publicación de esta adaptación.

---

## English

**Source code 0.10.25 · VS Code 1.99 or later · MIT license**

MultiShell MCP Server connects several Visual Studio Code windows and terminals to a local MCP server. Commands always target a terminal by ID or alias. Terminals can run in parallel, with an independent FIFO command queue per terminal.

### Terminals and permissions

`create_shell_code` creates temporary terminals. Requests from `create_user_shell_code` for persistent user-owned terminals appear in the owning window's **Requests** tab with approve and deny controls. Clicking **Create terminal** in the panel itself confirms that local operation without opening another modal window. Approval is single-use.

User-owned and primary terminals preserve running processes after a timeout. Temporary terminals inherit the policy of their owning window unless explicitly overridden. MCP requests and aliases cannot bypass VS Code authorization.

### Recovery and controls

On a VS Code window reload, the extension attempts to reattach one original primary terminal and the original user-owned terminals. It can automatically re-enable a session after receiving a verified command-completion event or matching saved idle evidence to the restored process and directory.

**Limitation:** VS Code does not expose an immutable terminal session ID or a universal reliable idle indicator. Ambiguous restoration or potentially active commands still require manual confirmation, without injecting probe commands or signals. Physical orphaned primary terminals left by older releases are preserved if closing them would be unsafe, but they are not exposed as additional managed primaries.

To reduce recovery prompts after reload, idle state is saved when commands start or finish and every 15 seconds while MultiShell is active. Automatic recovery still requires a matching process identity and working directory; ambiguous cases retain the manual safety guard.

The recovery button and automatic-exit action use distinct icons. Creating terminals from the panel no longer raises a second OS modal, while remote requests still require approval. MCP commands cannot interrupt manually started commands detected by VS Code; queue cancellations cannot overtake earlier work. Only persisted user-owned terminal records are restored: unknown temporary terminals are never promoted to persistent sessions.

The panel follows VS Code's configured language automatically: Spanish when available, English otherwise. Output streams that linger after a confirmed command completion are drained for up to 750 ms. The response marks `output_incomplete=true` instead of blocking the queue indefinitely.

Automatic exit recognizes `less`, `more`, `top`, `htop`, `man`, `btop`, `bpytop`, `nvtop`, `iftop`, `iotop` and `tig`, but sends `q` only after recognizable paging or full-screen output. Help, version and batch flags are excluded; preferences remain per-window and per-terminal.

The repository now includes `.gitattributes` to keep text files on LF across Windows and Linux, preventing LF/CRLF conversion warnings without changing global Git settings.

The `execute_isolated_command_code` tool runs non-interactive commands in a separate OS process using the selected shell's directory without writing to that terminal. It does not inherit terminal session variables, aliases or persistent processes. Use it for builds and checks that might confuse VS Code shell integration.

### Installation and building

Building from source requires Node.js 22 or later and npm, using `@vscode/vsce` 4.1.0:

```bash
npm ci
npm run test:multishell
npm run lint
npm run package
```

The `multi-shell-mcp-server-0.10.25.vsix` installer has been built and packaged. The archive contains 23 verified entries. Install it using **Extensions: Install from VSIX...**.

The default local endpoint is `http://127.0.0.1:3000/mcp`.

### Security and testing

The VS Code workspace must be trusted. Commands run with the operating system user's permissions; the local server is not a sandbox and must not be exposed directly to the internet. Tunnel Client and its credentials are managed separately.

Version 0.10.25 passed **53/53 automated suites**, TypeScript compilation, ESLint with zero warnings, and VSIX packaging (23 files). Installing this update in VS Code, real reload and native Linux monitor tests remain outstanding. Real-world reload and native Linux monitor tests remain outstanding.

### English documentation

- [Installation and distribution](docs/en/installation.md)
- [Usage and terminals](docs/en/usage.md)
- [MCP connector compatibility](docs/en/compatibility.md)
- [Testing and troubleshooting](docs/en/validation.md)
- [Release history](docs/en/changelog.md)

### Origin and license

Adapted from [juehang/vscode-mcp-server](https://github.com/juehang/vscode-mcp-server) under the [MIT license](LICENSE). The original repository is not this adaptation's publication repository.