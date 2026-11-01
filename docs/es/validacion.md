# Pruebas, validación y diagnóstico

[English](../en/validation.md) · [Índice](../../README.md)

Estado de referencia: **MultiShell MCP Server 0.10.25**. Validación completa en Windows: **51/51 suites automatizadas superadas**, ESLint sin errores, auditoría de dependencias de producción sin vulnerabilidades conocidas y VSIX de 23 archivos verificado. Esto no sustituye una comprobación con el VSIX instalado, varias ventanas reales o el túnel conectado.

## Pruebas automatizadas

Desde la raíz del repositorio, con Node.js 22 o posterior y dependencias instaladas:

```bash
npm run test:multishell
npm run lint
npm run package
```

En Windows, el procedimiento integral es:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-windows.ps1
```

El script ejecuta las pruebas y ESLint, comprueba vulnerabilidades conocidas de producción mediante `npm audit --omit=dev --audit-level=low`, empaqueta el VSIX y verifica su contenido. El paquete no debe incluir `node_modules`, código TypeScript no compilado, salidas `out`, ejecutables nativos ni el cliente del túnel.

Las suites automatizadas abarcan MCP HTTP, varias ventanas, enrutamiento, alias, permisos de lectura/edición, rutas y enlaces simbólicos, colas FIFO, ejecuciones simultáneas, cancelación y timeout, restauración de terminales, aprobación modal simulada, persistencia concurrente, panel bilingüe, Workspace Trust y recuperación de servidores.

## Pruebas con la extensión realmente instalada

Antes de ejecutar comandos comprueba que el panel indique **ON**, muestre el puerto y reconozca tu ventana. Usa **Ventanas** para verificar los identificadores.

Si aparece `Restored shell ... requires confirmation`, la extensión ha protegido la terminal restaurada. **Comprueba en VS Code que su proceso terminó** y pulsa **Volver a habilitar MCP**. No fuerces el desbloqueo mientras un comando continúe ejecutándose. A continuación prueba una orden corta, como `git status --short`.

Las consultas de control `windows` o `shells` con `cwd="@mcp"` confirman que responde el servicio MCP, **pero no prueban que la terminal pueda ejecutar comandos**.

### Lista de verificación manual

- [ ] Confirmar que la versión instalada corresponde al VSIX que se desea probar y que el panel refleja el puerto y el estado reales.
- [ ] Ejecutar una orden corta en la terminal principal después de resolver cualquier confirmación de restauración.
- [ ] Comprobar con **dos ventanas reales** sus IDs y roles de coordinador/trabajador; ejecutar comandos simultáneos en terminales diferentes.
- [ ] Crear una terminal temporal con `create_shell_code` y comprobar que su origen es `mcp`.
- [ ] **Solo con autorización expresa del usuario**, solicitar una terminal persistente con `create_user_shell_code`; comprobar la bandeja de solicitudes, el rechazo sin creación y la aceptación con los datos correctos.
- [ ] Crear y cerrar terminales de usuario desde el panel, comprobando una sola confirmación y que el rechazo no interrumpe el proceso.
- [ ] Ejecutar dos tareas paralelas en terminales de usuario distintas y dos comandos sucesivos en una misma terminal; comprobar orden FIFO y ausencia de solapamientos.
- [ ] Recargar VS Code con terminales de usuario abiertas: recuperar sus IDs sin duplicarlas y reactivarlas automáticamente si la inactividad es verificable; exigir confirmación solo ante dudas.
- [ ] Comprobar que una terminal principal o de usuario **conserva** su proceso tras timeout; las temporales pueden tener otra política.
- [ ] Probar cambio de coordinador, desconexión y recuperación de ventanas sin mezclar archivos ni terminales de proyectos distintos.
- [ ] Comprobar la recuperación del túnel después de recargar la extensión, sin cambiar su perfil ni credenciales.
- [ ] Confirmar que Workspace Trust bloquea el inicio en proyectos no confiables y que el panel español e inglés presenta correctamente los textos.

## Si la conexión o los comandos fallan

| Síntoma | Comprobación |
| --- | --- |
| `Restored shell ... requires confirmation` | La terminal está conservada y espera confirmación manual de que no hay procesos activos |
| `Command timed out ... preserved` | El proceso puede continuar; no envíes otro comando a esa terminal hasta que termine |
| `Window ... offline` | Comprueba que la ventana propietaria esté abierta y el worker reconectado |
| MCP responde a `windows`, pero no ejecuta comandos | Comprueba estado ocupado, integración de shell y confirmación de recuperación |
| El panel dice ON, pero ChatGPT no conecta | Comprueba el endpoint local, el puerto de destino del túnel y el estado del conector externo |
| Falta `create_user_shell_code` | Actualiza el esquema o vuelve a conectar el conector MCP tras instalar el VSIX |

El panel ON indica disponibilidad de la extensión **local**, no acredita por sí mismo el funcionamiento del túnel remoto.

## Empaquetado y portabilidad

El VSIX debe contener `extension/dist/extension.js`, `media/`, `package.json`, este conjunto de guías y la licencia, sin secretos ni binarios específicos del sistema.

Después de generar el VSIX, `python scripts/make-portable.py` crea un ZIP para trasladar el proyecto con fuentes, tests, scripts, documentación y un manifiesto SHA-256. Debe excluir `node_modules`, `out`, `dist`, perfiles y credenciales.

## Ubuntu

**Pendiente de validación real:** Bash/Zsh, permisos, suspensión, restauración y conexión del túnel. El empaquetado en JavaScript evita dependencias nativas de Windows, pero eso no demuestra funcionamiento completo en Ubuntu.

Para las operaciones habituales consulta [Guía de uso](uso.md); para configuración, [Instalación](instalacion.md).

## Pruebas reales con terminales de usuario — 1 de noviembre de 2026

Estas pruebas se realizaron contra el servidor MCP **activo** de Windows. La terminal persistente `prueba` se creó mediante `create_user_shell_code` tras aprobación local en VS Code. Las terminales auxiliares `prueba_aux` y `prueba_http` son temporales, no de usuario.

| Prueba | Resultado observado |
| --- | --- |
| Comando bloqueante de 5 segundos en `prueba` | Finalizó normalmente (`exit_code=0`) y conservó la terminal |
| Bloqueo de 30 segundos en `prueba` + contador cada segundo en `prueba_aux` | **Paralelismo confirmado:** 30 ticks; duración conjunta 30,324 segundos; ambas salidas con código 0 |
| Dos comandos enviados a `prueba` durante una ejecución de 6 segundos | **FIFO confirmado:** el segundo comenzó 66 ms después de terminar el primero |
| Timeout de 1 segundo con proceso real de 6 segundos en `prueba` | Proceso conservado; nueva orden rechazada mientras seguía activo; recuperación automática al finalizar |

Los dos comandos de la prueba de 30 segundos comenzaron prácticamente a la vez: 17:31:31.167 y 17:31:31.164 (UTC). El bloqueo terminó a las 17:32:01.180.

**Limitación observada:** cuando se enviaron dos llamadas `execute_shell_command_code` simultáneamente a través de la capa heredada del conector de ChatGPT, en esta sesión se ejecutaron secuencialmente (dos tareas de 12 segundos consumieron unos 28 segundos). Las mismas operaciones enviadas directamente como dos peticiones MCP HTTP **sí se ejecutaron en paralelo**. Esto apunta a la ruta de invocación del conector, no a una limitación global del servidor.

**Otra incidencia a investigar:** al ejecutar un script Node.js largo desde una terminal MCP, la herramienta heredada devolvió en algunas ocasiones una salida parcial sin `exit_code`, aunque el script terminó y su informe JSON se generó correctamente.

### Repetir los diagnósticos

Desde una **tercera terminal** que no sea ninguno de los destinos, con los shells ya disponibles y el servidor activo:

```bash
node scripts/probe-live-concurrency.cjs prueba prueba_aux 30
node scripts/probe-live-fifo.cjs prueba 6
node scripts/probe-live-timeout.cjs prueba
```

Estos scripts no crean terminales ni las desbloquean. Los resultados locales se escriben en `scripts/probe-live-*-results.json` y se excluyen de Git. Nunca ejecutes el cliente de pruebas desde la misma terminal que debe recibir los comandos bloqueantes.

La terminal principal de este proyecto permanecía bloqueada por un timeout anterior durante las pruebas. **No fue desbloqueada ni terminada automáticamente**. Estas verificaciones tampoco sustituyen las pruebas de recarga de ventanas físicas, suspensión en Ubuntu o continuidad del túnel externo.

## Comprobaciones añadidas en 0.10.19

- Detección conservadora de `less`, `more`, `top`, `htop` y `man`; las tuberías, comandos compuestos y editores no reciben teclas automáticamente.
- Pruebas con salida de terminal simulada: envío de `q` sin Intro, ajuste de ventana desactivado y excepciones por terminal que tienen prioridad.
- Bandeja de solicitudes de usuario: aceptar, rechazar, cancelar por desconexión y vaciar al detener un trabajador.
- Prueba de que el endpoint de control no puede aprobar solicitudes sin la interacción local en el panel.
- Pruebas de controles de la interfaz: cambio de preferencia por ventana, excepción por terminal y rechazo desde la pestaña de solicitudes.

La detección y la interfaz se han comprobado con simulaciones de VS Code. El comportamiento con programas como `less` en una terminal real debe comprobarse tras instalar la versión nueva, sin interrumpir el túnel activo.
### Herencia de terminales temporales (0.10.19)

La suite `test/test-temporary-autoexit-inheritance.cjs` verifica que las temporales heredan de la ventana y no de la terminal creadora, siguen los cambios de ventana, respetan excepciones individuales, descartan preferencias obsoletas al reutilizar IDs y mantienen el aislamiento entre ventanas. La prueba utiliza una API simulada de VS Code; queda pendiente la validación con ventanas reales.
### Recuperación automática al restaurar terminales (0.10.19)

La suite `test/test-automatic-restored-recovery.cjs` comprueba que un evento de finalización inequívoco de la integración de shell libera automáticamente terminales principales y de usuario, incluso cuando el evento ocurre durante su reasociación. También verifica que se ignoren eventos de terminales ajenas, códigos de salida ambiguos y ejecuciones aún activas, sin enviar comandos de prueba a los procesos conservados. Si no aparece un evento verificable, continúa siendo obligatoria la confirmación manual. Prueba simulada: queda pendiente validarla tras instalar la nueva versión en VS Code.
## Regresiones añadidas al código fuente 0.10.22

- `test/test-restored-idle-proof.cjs`: recuperación automática mediante identidad del proceso, ruta y estado previo; rechazo de procesos sustituidos y situaciones ambiguas.
- `test/test-late-main-recovery.cjs`: la principal restaurada con retraso sustituye a la principal recién creada solo si esta no se ha utilizado.
- `test/test-busy-main-recovery.cjs`: si la principal nueva ya ha trabajado, no se destruye ni se registra una principal antigua como duplicado.
- `test/test-restored-controller.cjs` y `test/test-restored-shells.cjs`: una sola principal gestionada por ventana aunque existan restos físicos de versiones anteriores.
- `test/test-panel-layout.cjs` y `test/test-panel.cjs`: el menú abierto prevalece sobre los botones de otras filas; idioma deducido de VS Code sin desplegable manual.

**Validación automatizada completada:** las 49 suites se han ejecutado conjuntamente desde la terminal temporal `audit022` y el VSIX 0.10.22 se ha generado y verificado. Sigue pendiente la prueba de recarga con el instalador realmente activado. Las sesiones físicas residuales anteriores no se cierran automáticamente sin una comprobación suficiente de seguridad.
### Comprobaciones de recuperación añadidas a 0.10.22

Las pruebas se han ampliado para diferenciar los iconos de recuperación y salida automática, verificar las notificaciones de cambios de ejecución y evitar restauraciones inseguras. El estado de inactividad se guarda durante la actividad normal y no únicamente al desactivar la extensión. **La validación automatizada ha terminado correctamente; sigue pendiente comprobar la recarga real con la versión 0.10.22 instalada.**
### Nuevas regresiones en 0.10.22

- `test/test-execution-races.cjs`: cola FIFO y cancelación, comandos manuales activos, intercalado justo al finalizar, pérdida del flujo de salida y estados de finalización ambiguos.
- `test/test-restored-user-shells.cjs` y `test/test-restored-user-controller.cjs`: solo las sesiones `user` guardadas se reasocian; temporales y sesiones sin titularidad no son adoptadas.
- `test/test-user-shell-authorization.cjs`: desconexión durante la autorización o durante la persistencia no deja una terminal de usuario pendiente sin aceptar.
- La corrección no resuelve los casos en los que VS Code no notifica el inicio de un comando manual ni proporciona prueba fiable de inactividad.
### Regresión de salida interactiva 0.10.25

Se ha añadido `test/test-interactive-safety.cjs`, que distingue opciones no interactivas de sesiones paginadas, valida pantallas alternativas, comprueba que no se envía `q` en la salida normal y verifica un drenaje de 750 ms cuando la salida permanece abierta tras la finalización. Los monitores Linux adicionales solo se comprueban con simulaciones; para afirmar compatibilidad real deben probarse en Linux.
### Regresión de ejecución aislada (0.10.25)

Después de compilar, ejecuta `node test/test-isolated-command.cjs`. Comprueba la ruta de trabajo, la desactivación del paginador y de los prompts de Git, el límite de salida de 1 MB, el timeout y la cancelación. La ejecución aislada no inyecta teclas en la terminal integrada. Completa la validación con `npm run test:multishell`, `npm run lint` y `npm run package`; registra resultados solo después de ejecutarlos.
