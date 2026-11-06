# Instalación y distribución

[English](../en/installation.md) · [Índice](../../README.md)

Guía vigente para **MultiShell MCP Server 0.10.69**. Requiere **Visual Studio Code 1.99 o posterior**.

## Instalar o actualizar desde VSIX

El instalador es `multi-shell-mcp-server-0.10.69-win32-x64.vsix`. Se genera en la raíz del proyecto; un clon de Git **no lo contiene**, porque los paquetes generados están excluidos del repositorio.

Desde VS Code, ejecuta **Extensions: Install from VSIX...**, selecciona el archivo y después **Developer: Reload Window**. También puedes utilizar:

```powershell
code --install-extension .\multi-shell-mcp-server-0.10.69-win32-x64.vsix --force
```

La sintaxis anterior corresponde a Windows x64. En Linux utiliza `./` y el VSIX correspondiente a tu plataforma (por ejemplo, `multi-shell-mcp-server-0.10.69-linux-x64.vsix`), nunca el instalador de Windows.

Tras actualizar, comprueba la versión y el estado ON. MultiShell verifica automáticamente las terminales de PowerShell conservadas; no pide confirmar manualmente que están libres. Si la inspección falla o el proceso sigue activo, la terminal permanece protegida.

Si ChatGPT sigue mostrando el esquema de herramientas antiguo, vuelve a conectar o actualiza el conector MCP para descubrir `create_user_shell_code`.

## Compilar desde el repositorio

Se necesita **Node.js 22.13 o posterior** y npm. Desde la raíz:

```bash
npm ci
npm run test:multishell
npm run lint
npm run package
```

El resultado es `multi-shell-mcp-server-0.10.69-win32-x64.vsix`. Para realizar la batería completa de validación de Windows, incluida auditoría de dependencias de producción e inspección del paquete:

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
5. Después de **Reload Window**, espera la verificación automática. **Comprobar disponibilidad** permite repetirla sin enviar comandos a la terminal.

El instalador **no contiene** perfiles de túnel, claves, credenciales ni sesiones activas. La extensión no añade OAuth propia al endpoint local; **no lo publiques directamente** sin protección externa.

Para crear terminales de usuario aprobadas y ejecutar tareas paralelas, continúa en [Guía de uso](uso.md). Para herramientas heredadas, consulta [Compatibilidad MCP](compatibilidad.md).

## ZIP portable para trasladar el proyecto

Después de ejecutar `npm run package`, con Python 3 puedes generar un archivo portable:

```bash
python scripts/make-portable.py
```

En Windows también funciona `py scripts/make-portable.py`. El ZIP `MultiShell-MCP-Server-0.10.69-portable.zip` contiene la carpeta `MultiShell-MCP-Server-0.10.69` con código fuente, pruebas, scripts, documentación, instalador VSIX y manifiesto de integridad SHA-256.

Se excluyen `node_modules`, `out`, `dist`, archivos de configuración privados, sesiones y datos del túnel. Verifica su contenido antes de compartirlo.

## Compatibilidad de plataformas

Cada compilación genera **un único VSIX para el sistema y la arquitectura seleccionados**, siempre con Tunnel Client oficial y cloudflared verificados por SHA-256. El archivo anterior es el ejemplo de Windows x64; para otros sistemas usa `npm run package -- --target=linux-x64` (o la plataforma correspondiente). Consulta [Túnel integrado](tunel-integrado.md). Las pruebas reales en Ubuntu y macOS siguen pendientes.

La extensión mantiene la identidad `local-multishell.multi-shell-mcp-server` y la licencia MIT. El crédito a [juehang/vscode-mcp-server](https://github.com/juehang/vscode-mcp-server) figura en el [README](../../README.md).

Documentación compatible con 0.10.69.

Compatible con 0.10.61.

Documentación compatible con 0.10.62.

Documentación compatible con 0.10.63.

Compatible con 0.10.64.
