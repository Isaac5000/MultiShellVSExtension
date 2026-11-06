# Túnel oficial integrado en el VSIX

**MultiShell MCP 0.10.72.** Una sola implementación de la extensión en **TypeScript/JavaScript**, ejecutada por Node.js de VS Code en Windows, Linux y macOS. El túnel oficial sigue siendo código nativo (OpenAI Tunnel Client v0.0.19 + cloudflared), sin reescribir su autenticación, protocolos ni supervisión.

## Distribución por plataforma

Para no incluir seis arquitecturas en un mismo instalador, cada VSIX integrado contiene **exactamente un** conjunto oficial de binarios y licencias. VS Code admite paquetes `--target` específicos para Windows, Linux y macOS.

| Plataforma | Argumento de construcción | Estado |
| --- | --- | --- |
| Windows x64 | `win32-x64` | VSIX generado e inspeccionado en Windows |
| Windows ARM64 | `win32-arm64` | Empaquetador disponible; requiere ensayo real ARM64 |
| Linux x64 | `linux-x64` | Empaquetador disponible; requiere ensayo real Linux |
| Linux ARM64 | `linux-arm64` | Empaquetador disponible; requiere ensayo real Linux ARM64 |
| macOS Intel | `darwin-x64` | Empaquetador disponible; **no se garantiza ejecución por Gatekeeper** |
| macOS Apple Silicon | `darwin-arm64` | Empaquetador disponible; **no se garantiza ejecución por Gatekeeper** |

**macOS:** OpenAI indica expresamente que sus ZIP oficiales descargados directamente no están notarizados y recomienda instalar el cliente desde Homebrew (`brew install openai/tools/tunnel-client`). El VSIX específico de macOS todavía necesita pruebas reales de firma/notarización; no se debe eludir Gatekeeper para hacerlo funcionar.

## Empaquetar

En una consola de desarrollo del repositorio:

```powershell
npm run package
```

Esto genera **un único VSIX integrado** en Windows x64:

- `multi-shell-mcp-server-0.10.72-win32-x64.vsix`
El plugin MCP, cuando se necesite, se genera por separado mediante `npm run package:plugin` o junto al VSIX mediante `npm run package:all`.

Para otra plataforma:

```powershell
npm run package -- --target=linux-x64
```

El empaquetador, `scripts/package-platform-tunnel.cjs`, descarga el archivo oficial solo durante la **compilación**, comprueba su SHA-256 fijado en el código, extrae exclusivamente los ficheros permitidos y construye un VSIX acotado al sistema. La descarga validada se almacena en `.vscode-test/official-tunnel-archives` para reutilizarse durante el desarrollo. Para compilar sin conexión después de obtener el ZIP oficial:

```powershell
npm run bundle
node scripts/package-platform-tunnel.cjs --target=win32-x64 --archive=RUTA_DEL_ZIP_OFICIAL
```

`npm run package:all` genera **el mismo VSIX integrado** y, por separado, el ZIP opcional del plugin MCP. No crea un segundo VSIX.

## Arranque y espacio

Cuando el paquete específico se instala por primera vez, la extensión valida `verified.json`, los hashes de los ejecutables y su plataforma, y usa los binarios desde **la propia instalación VSIX**. No descarga otro ZIP ni crea una copia de 67 MB en `globalStorage`. Los perfiles, claves y bloqueos continúan en sus ubicaciones seguras existentes y **nunca** dentro del VSIX.

Si existe un túnel antiguo todavía en ejecución, solo se recupera cuando su ejecutable e identidad verificadas coinciden con el bloqueo de propiedad. En los demás casos tiene prioridad el ejecutable integrado. No se migra ni se elimina mientras esté activo. Tras detenerlo y comprobar que el VSIX nuevo funciona, el usuario puede decidir retirar esa instalación antigua en una operación separada.

## Qué se ha reducido

El bundle JavaScript pasa de **3.559.546 bytes** en 0.10.65 a unos **2,07 MB** con `esbuild` minificando sintaxis, espacios e identificadores. Se conserva el código fuente TypeScript, la selección de shells y el protocolo MCP. La reducción no afecta significativamente a los **~66,9 MB** que ocupan los binarios nativos del túnel y su documentación. Comprimir más el VSIX no reduce ese espacio una vez descomprimido; portar el túnel de Go a JavaScript sin equivalencia verificable sería una reimplementación arriesgada.

El VSIX integrado Windows x64 ocupa alrededor de **31 MB comprimidos**, en lugar de ~1 MB del VSIX ligero. El tamaño de ejecución total en una instalación nueva es del mismo orden que antes (extensión más binarios), pero sin paso de descarga ni segunda copia en el almacenamiento global.

## Validación y restricciones

Se comprueban los hashes oficiales, el comportamiento con binario integrado y con instalación previa, la selección de arquitectura, el contenido real del VSIX, el arranque de la extensión y el aislamiento de datos privados. La construcción por sí sola no verifica la ejecución en otros sistemas operativos. La instalación final, el reinicio o cierre del túnel y la publicación GitHub se reservan al usuario.

Fuentes:

- [OpenAI Tunnel Client v0.0.19](https://github.com/openai/tunnel-client/releases/tag/v0.0.19)
- [OpenAI Tunnel Client: restricciones de macOS](https://github.com/openai/tunnel-client/blob/master/README.md)
- [VS Code: extensiones específicas por plataforma](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

## Selección del ejecutable (0.10.72)

En un **arranque nuevo**, incluido el inicio automático, se usa primero el ejecutable nativo verificado incluido en la extensión. La copia de globalStorage solo se selecciona para adoptar con seguridad un proceso legacy todavía en ejecución cuando su PID, hora de inicio, ejecutable y argumentos coinciden con el bloqueo verificado. Un bloqueo obsoleto o una copia antigua inactiva no altera esa prioridad. Ahora únicamente se distribuyen instaladores con el túnel integrado.

## Recuperación verificada tras actualizar la extensión

Puede recuperarse un túnel de una versión anterior si su directorio de extensión sigue disponible, el binario oficial supera las comprobaciones de integridad y el bloqueo de propiedad coincide con su PID, fecha de inicio, ejecutable y argumentos. Los bloqueos antiguos, versiones ya desinstaladas y procesos ajenos permanecen intactos. Un arranque nuevo usa la versión integrada actual. Instalar o recargar la extensión puede interrumpir la conexión MCP, por lo que conviene actualizar de forma controlada.

## Requisito de integridad (0.10.72)

Un arranque nuevo requiere los binarios oficiales **incluidos en el propio VSIX** y verificados por SHA-256. Ni el botón de verificación ni el arranque automático descargan ejecutables a globalStorage. Un archivo ausente o manipulado requiere reinstalar el VSIX correcto. Las copias anteriores se conservan exclusivamente para adoptar un proceso todavía activo con huella de propiedad coincidente; ninguna copia inactiva puede iniciar un túnel nuevo. Los perfiles, claves y procesos ajenos permanecen intactos.
