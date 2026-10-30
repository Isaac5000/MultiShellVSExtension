# MultiShell MCP Server

Extensión de Visual Studio Code para controlar **varias ventanas y terminales independientes** desde un servidor MCP, mediante IDs o alias explícitos. Incluye panel bilingüe (español/inglés), comandos y operaciones de archivos, diagnósticos y símbolos de VSCode, enrutamiento por ventana y compatibilidad con conectores anteriores.

**Versión:** 0.10.10 · **Requisito:** Visual Studio Code 1.99 o superior · **Puerto predeterminado:** `127.0.0.1:3000` (configurable).

## Inicio rápido

Para **compilar desde el repositorio**, instala Node.js 20 o posterior y npm. En la raíz del proyecto ejecuta:

```bash
npm ci
npm run test:multishell
npm run lint
npm run package
```

Se genera `multi-shell-mcp-server-0.10.10.vsix`. Para instalarlo desde la misma carpeta:

```bash
code --install-extension ./multi-shell-mcp-server-0.10.10.vsix --force
```

También puedes utilizar **Extensions: Install from VSIX...**. Los archivos `.vsix` y `*-portable.zip` no se incluyen en Git; se generan localmente o se distribuyen por separado.

Una vez instalado, autoriza el espacio de trabajo con **Workspaces: Manage Workspace Trust** y abre el panel **MultiShell MCP**. Deshabilita otra extensión que escuche simultáneamente en el mismo puerto.

## Documentación

La documentación está organizada en el siguiente orden:

1. [Instalación y distribución](docs/instalacion.md) — VSIX, compilación, ZIP portable y configuración inicial.
2. [Guía de uso](docs/uso.md) — ventanas, alias, terminales, timeouts, reconexión y cierre.
3. [Compatibilidad MCP](docs/compatibilidad.md) — selectores heredados `@mcp` y `@shell`.
4. [Validación y pruebas](docs/validacion.md) — cobertura automatizada, verificaciones manuales y estado de Ubuntu.

El [historial de versiones](CHANGELOG.md) se mantiene aparte. La ejecución real en Ubuntu aún no se ha validado; no debe inferirse compatibilidad probada a partir de los tests de Windows.

## Seguridad

MultiShell MCP solo se activa en espacios de trabajo confiables. El servidor se vincula a `127.0.0.1` y los comandos se ejecutan con los permisos del usuario: **no son procesos aislados en contenedores**. Los alias delimitan el destino, pero no identifican ni autentican una conversación de ChatGPT. Configura por separado los túneles externos y evita compartir la misma carpeta con agentes que editen simultáneamente; utiliza directorios o Git worktrees independientes.

## Origen y licencia

Adaptación bajo licencia **MIT** de [juehang/vscode-mcp-server](https://github.com/juehang/vscode-mcp-server), que incorpora sesiones independientes y gestión multiventana. Se conserva [LICENSE](LICENSE). El identificador técnico `local-multishell.multi-shell-mcp-server` se mantiene para permitir actualizaciones; el repositorio original no representa el de publicación de esta adaptación.
