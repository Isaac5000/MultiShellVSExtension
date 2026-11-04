# Instrucciones para trabajar en MultiShell

Este proyecto es una extensión de VS Code escrita en TypeScript, con un servidor MCP y un panel web en JavaScript. Mantener la compatibilidad con Windows y Linux y la documentación en español e inglés.

## Skills disponibles y criterios de uso

Antes de trabajar, inspeccionar el catálogo de skills de esta ventana. Usar las
que realmente estén instaladas, sin dar por hecho que las skills de ECC están
disponibles:

- `investigate-first`: diagnosticar antes de cambiar un mecanismo incierto.
- `review-agent`: revisar los cambios y riesgos de corrección, seguridad y regresión.
- `surgical-patch`: realizar modificaciones pequeñas con anclas verificadas.
- `safe-refactor`: reorganizar solo cuando exista una necesidad demostrada.
- `verify-and-stop`: ejecutar y registrar las comprobaciones finales.
- `multishell-mcp`: seleccionar terminal explícita, respetar aislamiento de ventanas
  y preferir ejecuciones aisladas no interactivas.

Si más adelante se instalan `typescript-patterns`, `mcp-server-patterns`,
`security-review`, `error-handling`, `accessibility`, `verification-loop`
o `production-audit`, pueden añadirse como comprobaciones complementarias.
No instalar ni ejecutar una skill nueva sin revisar primero sus instrucciones.

## Seguridad de escapes, terminación y diagnóstico

- Evitar comandos complejos con varias capas de comillas dentro de `node -e` o de `powershell -Command`. Para lógica compleja, crear un script `.cjs`/`.ps1` temporal, inspeccionarlo y ejecutarlo directamente. Eliminarlo al acabar.
- **No ejecutar `exit` para comunicar el resultado de una prueba dentro de la terminal PowerShell integrada**: cerraría la sesión física. Consultar `$LASTEXITCODE` mediante `Write-Output`, sin terminar el runspace.
- Antes de cualquier orden que pueda cerrar o interrumpir procesos, comprobar PID, propietario, terminal objetivo e identidad. Nunca usar `taskkill`, `Stop-Process`, `kill` o Ctrl+C sobre procesos o shells ajenos basándose en el nombre, una coincidencia aproximada o un timeout.
- Un escape mal puesto, comillas desequilibradas, prompt `>>` o un comando incompleto **no autorizan pulsaciones automáticas**. El auto-exit solo puede enviar `q` a programas allowlisted con sintaxis inequívoca y pantalla reconocida. No inyectar Enter, Ctrl+C, `exit` ni respuestas especulativas.
- Si un comando queda bloqueado en una terminal persistente, conservarlo y comunicar el estado. No seguir enviando órdenes a esa terminal hasta recibir confirmación de inactividad o de intervención del usuario.
- Añadir pruebas con comillas mal equilibradas, secuencias de escape, comandos compuestos y prompt de continuación al modificar la lógica de salida automática.

## Criterios del proyecto

Preservar los cambios existentes del usuario y las convenciones del repositorio.

Mantener las autorizaciones de terminales y el aislamiento entre ventanas. No interrumpir procesos del usuario ni interpretar el silencio como prueba de bloqueo.

Usar las pruebas existentes en test/\*.cjs. Añadir pruebas de regresión cuando se corrijan fallos; conservar el sistema de pruebas actual.

Para validar cambios de código, ejecutar npm run lint y npm run test. Para cambios del panel, ejecutar también npm run test.

Distinguir las pruebas automatizadas de las comprobaciones manuales en VS Code. Informar de lo comprobado y de lo pendiente.