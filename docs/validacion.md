# Validación y pruebas

Estado documentado para la versión **0.10.10**. El proyecto ha superado **22 baterías automatizadas en Windows**; las pruebas reales de Ubuntu y determinadas pruebas manuales de interfaz siguen pendientes. Los mocks no sustituyen a ejecutar dos ventanas reales de VSCode.

## Validación automatizada

Desde la raíz del proyecto:

```bash
npm ci
npm run test:multishell
npm run lint
npm run package
```

En Windows puede utilizarse la comprobación completa:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-windows.ps1
```

Este script ejecuta las pruebas, ESLint, `npm audit --omit=dev --audit-level=low`, crea el VSIX y comprueba su contenido.

Las pruebas automatizadas cubren la activación de la extensión, el panel bilingüe, las APIs MCP HTTP, el aislamiento de archivos por ventana, rutas y symlinks, autenticación del coordinador, failover, alias, FIFO por terminal, concurrencia entre terminales, diagnóstico/símbolos nativos, Workspace Trust, timeout de terminales de usuario, cierre y recuperación de sesiones simuladas. El bundle es JavaScript autocontenido, sin bibliotecas nativas en el VSIX.

## Pruebas manuales en Windows (pendientes de confirmar)

1. Instala `local-multishell.multi-shell-mcp-server@0.10.10`, deshabilita la extensión MCP original que pudiera ocupar el puerto 3000 y recarga VSCode.
2. Abre el panel y verifica visualmente iconos, estado, idiomas, acciones y terminal principal; repite en una segunda ventana y comprueba los papeles de Coordinador y Trabajador.
3. Crea terminales en rutas relativas (`src`, `..\otro-proyecto`) y absolutas válidas; asigna un alias, copia `shell=<alias>` y ejecuta un comando.
4. Verifica que no sea posible leer ni editar archivos de un proyecto distinto mediante herramientas scoped. Comprueba diagnósticos y símbolos nativos en la ventana propietaria.
5. Cierra un auxiliar desde el panel: comprueba el diálogo modal, cancelar sin alterar el proceso, confirmar el cierre de la terminal física y la liberación de su alias. Repite cerrándolo directamente desde VSCode. La terminal principal no debe ofrecer cierre desde el panel.
6. Cierra la ventana coordinadora y comprueba que otra pueda asumir el puerto y recuperar el enrutamiento.
7. Ejecuta `Developer: Reload Window` con principales y auxiliares abiertos. Confirma que no hay principales duplicadas, que conservan su identidad y que una auxiliar restaurada requiere confirmación de estar libre antes de aceptar órdenes MCP.
8. Prueba el timeout: la terminal auxiliar creada desde el panel debe mantener el proceso, bloquear solapamientos MCP y cancelar los trabajos pendientes. Tras su finalización real debe volver a aceptar comandos. Las terminales creadas por MCP y las automáticas mantienen el cierre por timeout.
9. Comprueba *Restricted Mode*: no debe arrancar MCP, incluso con un intento de activación manual; al conceder Workspace Trust debe funcionar normalmente.

## Empaquetado VSIX y distribución portable

El VSIX debe incluir `extension/dist/extension.js`, recursos `media/`, `package.json`, README y la documentación enlazada de `docs/`; no debe contener `node_modules`, `out`, el código TypeScript fuente, archivos temporales ni binarios específicos de un sistema operativo. La verificación por script comprueba estas condiciones esenciales.

Después de `npm run package`, ejecuta `python scripts/make-portable.py` y comprueba que el ZIP contiene un directorio superior, el VSIX vigente, todos los fuentes, scripts, pruebas, documentación y un `MANIFIESTO-SHA256.txt`. No debe incluir `node_modules`, `out`, `dist`, configuraciones privadas ni secretos. Sigue [Instalación y distribución](instalacion.md) para los detalles.

## Ubuntu (validación real pendiente)

La extensión se empaqueta con JavaScript, CSS, SVG y PNG, sin binarios nativos de Windows. **No se ha verificado todavía en una instalación real de Ubuntu** el funcionamiento de Bash/Zsh, permisos de archivo, recuperación tras suspensión, el panel y la apertura de terminales. No se deben presentar estos casos como completados.

## Seguridad y trabajo concurrente

El alias delimita el destino lógico de una operación, pero no es una barrera de autenticación entre chats. Si varios chats editan el mismo repositorio, utiliza directorios distintos o Git worktrees. Consulta [Guía de uso](uso.md) y [Compatibilidad](compatibilidad.md).
