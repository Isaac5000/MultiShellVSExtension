# Instrucciones para trabajar en MultiShell

Este proyecto es una extensión de VS Code escrita en TypeScript, con un servidor MCP y un panel web en JavaScript. Mantener la compatibilidad con Windows y Linux y la documentación en español e inglés.

## Skills de ECC

Utilizar las skills pertinentes según la tarea:

- typescript-patterns para cambios en TypeScript y JavaScript.
- mcp-server-patterns para herramientas, validación y transporte MCP.
- security-review para cambios en permisos, comandos, rutas y acceso a archivos.
- error-handling para errores, cancelaciones, timeouts y recuperación.
- accessibility para cambios de interacción en el panel.
- verification-loop al terminar cambios de código.
- production-audit antes de preparar una distribución.

## Criterios del proyecto

Preservar los cambios existentes del usuario y las convenciones del repositorio.

Mantener las autorizaciones de terminales y el aislamiento entre ventanas. No interrumpir procesos del usuario ni interpretar el silencio como prueba de bloqueo.

Usar las pruebas existentes en test/\*.cjs. Añadir pruebas de regresión cuando se corrijan fallos; conservar el sistema de pruebas actual.

Para validar cambios de código, ejecutar npm run lint y npm run test. Para cambios del panel, ejecutar también npm run test.

Distinguir las pruebas automatizadas de las comprobaciones manuales en VS Code. Informar de lo comprobado y de lo pendiente.
