# Instalación y distribución

[English](../en/installation.md) · [Índice](../../README.md)

Guía vigente para **MultiShell MCP Server 0.10.25**. Requiere **Visual Studio Code 1.99 o posterior**.

## Instalar o actualizar desde VSIX

El instalador es `multi-shell-mcp-server-0.10.25.vsix`. Se genera en la raíz del proyecto; un clon de Git **no lo contiene**, porque los paquetes generados están excluidos del repositorio.

Desde VS Code, ejecuta **Extensions: Install from VSIX...**, selecciona el archivo y después **Developer: Reload Window**. También puedes utilizar:

```powershell
code --install-extension .\multi-shell-mcp-server-0.10.25.vsix --force
```

La sintaxis anterior corresponde a PowerShell. En Linux, sustituye `.\` por `./`.

Tras actualizar, comprueba el panel **MultiShell MCP** y que el servidor esté ON. Las terminales conservadas después de la recarga pueden requerir que confirmes en el panel que su proceso anterior ha terminado; **no las desbloquees mientras haya tareas activas**.

Si ChatGPT sigue mostrando el esquema de herramientas antiguo, vuelve a conectar o actualiza el conector MCP para descubrir `create_user_shell_code`.

## Compilar desde el repositorio

Se necesita **Node.js 22 o posterior** y npm. Desde la raíz:

```bash
npm ci
npm run test:multishell
npm run lint
npm run package
```

El resultado es `multi-shell-mcp-server-0.10.25.vsix`. Para realizar la batería completa de validación de Windows, incluida auditoría de dependencias de producción e inspección del paquete:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-windows.ps1
```

El script `scripts/build-install.ps1` permite compilar y, opcionalmente con `-Install`, instalar la extensión. La instalación o recarga puede interrumpir brevemente el servidor local; evita hacerlo mientras haya tareas que dependan de la conexión MCP.

Un VSIX precompilado **no requiere Node.js ni Python** para instalarse.

## Configuración inicial

1. Abre una carpeta en VS Code y concede **Workspace Trust**; en modo restringido la extensión no inicia MCP.
2. Deshabilita otras extensiones MCP que intenten escuchar en el mismo puerto.
3. Abre el panel **MultiShell MCP** y pulsa **Iniciar** si está en OFF. El endpoint por defecto es `http://127.0.0.1:3000/mcp`.
4. Configura o reconecta por separado Tunnel Client y el conector de ChatGPT. Si cambias el puerto local, actualiza también el destino configurado en el túnel.
5. Después de **Reload Window**, la extensión intenta recuperar las sesiones libres. Solo si aparece una confirmación pendiente, comprueba que el proceso terminó antes de pulsar **Volver a habilitar MCP**.

El instalador **no contiene** perfiles de túnel, claves, credenciales ni sesiones activas. La extensión no añade OAuth propia al endpoint local; **no lo publiques directamente** sin protección externa.

Para crear terminales de usuario aprobadas y ejecutar tareas paralelas, continúa en [Guía de uso](uso.md). Para herramientas heredadas, consulta [Compatibilidad MCP](compatibilidad.md).

## ZIP portable para trasladar el proyecto

Después de ejecutar `npm run package`, con Python 3 puedes generar un archivo portable:

```bash
python scripts/make-portable.py
```

En Windows también funciona `py scripts/make-portable.py`. El ZIP `MultiShell-MCP-Server-0.10.25-portable.zip` contiene la carpeta `MultiShell-MCP-Server-0.10.25` con código fuente, pruebas, scripts, documentación, instalador VSIX y manifiesto de integridad SHA-256.

Se excluyen `node_modules`, `out`, `dist`, archivos de configuración privados, sesiones y datos del túnel. Verifica su contenido antes de compartirlo.

## Compatibilidad de plataformas

El VSIX incluye JavaScript autocontenido y recursos del panel, sin binarios nativos de Windows. La batería automatizada se ha validado en Windows, pero las pruebas de uso real en **Ubuntu siguen pendientes**. Véase [Validación](validacion.md).

La extensión mantiene la identidad `local-multishell.multi-shell-mcp-server` y la licencia MIT. El crédito a [juehang/vscode-mcp-server](https://github.com/juehang/vscode-mcp-server) figura en el [README](../../README.md).