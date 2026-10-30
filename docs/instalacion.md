# Instalación y distribución

Versión documentada: **0.10.10**. Requiere **Visual Studio Code 1.99 o superior**. Puedes instalar un VSIX ya construido o generar uno a partir del código fuente.

## Instalar un VSIX existente

El archivo se llama `multi-shell-mcp-server-0.10.10.vsix`. Debes haberlo generado localmente, recibido dentro del ZIP portable o descargado de una versión publicada en Releases (si existe). **Un clon del repositorio no incluye VSIX ni ZIP generados**: ambos formatos están excluidos en `.gitignore`.

En Windows (PowerShell), desde la carpeta que contiene el VSIX:

```powershell
code --install-extension .\multi-shell-mcp-server-0.10.10.vsix --force
```

En Ubuntu/Linux:

```bash
code --install-extension ./multi-shell-mcp-server-0.10.10.vsix --force
```

También puedes utilizar `Extensions: Install from VSIX...` desde VSCode. Después, ejecuta `Developer: Reload Window`. No necesitas Node.js ni Python para instalar un VSIX ya preparado.

## Compilar desde GitHub o una copia del proyecto

Instala Node.js **20 o posterior** y npm, abre la raíz del proyecto y ejecuta:

```bash
npm ci
npm run test:multishell
npm run lint
npm run package
```

El último comando genera `multi-shell-mcp-server-0.10.10.vsix` en la raíz. Los scripts NPM están planteados para Windows y Linux, pero la **validación real en Ubuntu está pendiente**. Consulta [Validación](validacion.md).

En Windows también puedes usar `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-install.ps1 -Install` para ejecutar pruebas, empaquetar e instalar en un paso. La validación completa sin instalar se ejecuta con `scripts/validate-windows.ps1`.

## Trasladar el proyecto completo en un ZIP portable

Primero genera el VSIX con `npm run package`. Después, con Python 3:

```bash
python scripts/make-portable.py
```

En Windows, si tienes el lanzador de Python: `py scripts/make-portable.py`.

El script crea `MultiShell-MCP-Server-0.10.10-portable.zip`. Al descomprimirlo, abre la carpeta `MultiShell-MCP-Server-0.10.10`. Contiene el código fuente, las pruebas, scripts, documentación, `package-lock.json`, el instalador VSIX y un manifiesto de integridad SHA-256. No incluye `node_modules`, `out`, `dist`, configuraciones de VSCode, secretos, sesiones activas ni configuración de túneles. El script utiliza una lista explícita de archivos admitidos.

## Configuración inicial

1. Abre un proyecto en VSCode y autoriza `Workspaces: Manage Workspace Trust`. En *Restricted Mode* el servidor permanece inactivo.
2. Deshabilita cualquier extensión MCP original que intente ocupar el mismo puerto, recarga las ventanas y abre el panel **MultiShell MCP**.
3. Pulsa **Iniciar**. Por defecto escucha en `127.0.0.1:3000`; puedes cambiar el puerto en el panel.
4. Configura por separado cualquier túnel y conector externo. **La API key, los tokens y las sesiones de otros equipos no forman parte de la distribución.**

Para utilizar shells, asignar alias o entender la recuperación de terminales, consulta [Guía de uso](uso.md). Para el conector antiguo, consulta [Compatibilidad](compatibilidad.md).

## Distribución y licencia

La identidad técnica de la extensión es `local-multishell.multi-shell-mcp-server`, conservada para permitir actualizaciones. El código mantiene la licencia MIT y el crédito a [juehang/vscode-mcp-server](https://github.com/juehang/vscode-mcp-server), del que procede la adaptación. El repositorio original no representa el repositorio de publicación de este proyecto.
