# Continuar una tarea de ChatGPT entre conversaciones

**MultiShell MCP 0.10.64:** guardado y recuperación del progreso desde los chats de ChatGPT mediante MCP. No utiliza Codex, modelos locales ni APIs de inferencia facturables.

## Lo que funciona

El usuario puede hablar con ChatGPT y trabajar mediante las herramientas MCP. ChatGPT guarda periódicamente el objetivo y sus hitos con `chat_handoff_save_code`. El registro contiene exclusivamente un resumen estructurado, no la conversación completa, y se conserva en el equipo. Al abrir otro chat del mismo Proyecto, ChatGPT puede recuperar ese estado con `chat_handoff_list_code` (si hay varias tareas) y `chat_handoff_load_code` y continuar tras verificar los archivos y procesos reales.

Los checkpoints incluyen objetivo, criterio de finalización, resumen, pasos completados y pendientes, artefactos, riesgos, siguiente operación segura y estado. El identificador único y su revisión evitan sobrescrituras accidentales cuando existen varios chats. La recuperación usa el `shell_id` exacto de una shell de la misma máquina y proyecto. Si VS Code se reinicia y cambia la shell, primero consulta `list_shells_code` para seleccionar el nuevo identificador.

### Uso en el primer chat

Pide a ChatGPT que guarde un checkpoint con `chat_handoff_save_code` al alcanzar cada hito importante y antes de agotar el contexto. El comando devuelve un `handoffId` y una sugerencia de mensaje para el siguiente chat. No guardes contraseñas, tokens ni transcripciones completas.

### Uso en el siguiente chat

Abre un chat nuevo dentro del mismo Proyecto y escribe:

> Continúa la tarea de MultiShell MCP donde quedó. Utiliza `list_shells_code` para identificar la shell de mi proyecto y `chat_handoff_load_code` para recuperar el último checkpoint. Verifica el estado real del código, las pruebas y los comandos antes de modificar nada; no vuelvas a ejecutar operaciones inciertas.

Si hay más de una tarea sin terminar, la recuperación automática del último checkpoint se rechaza: usa `chat_handoff_list_code` y selecciona expresamente el `handoffId` correcto. Si solo quedan tareas marcadas como terminadas, tampoco se reanudarán sin elegir un ID explícito. Una actualización del mismo checkpoint requiere `expected_revision` para evitar pérdida de progreso.

## Lo que todavía no funciona

**El servidor MCP no puede iniciar por su cuenta un nuevo turno de ChatGPT ni crear otro chat automáticamente**. El widget oficial de Apps SDK sí dispone de `sendFollowUpMessage` para solicitar un turno **dentro del chat actual**, pero no de una API documentada para crear otro chat o garantizar una cadena indefinida. ChatGPT Work admite tareas largas, aunque no garantiza la renovación automática de chats normales al agotarse el contexto. El checkpoint facilita el traspaso; por ahora el usuario debe abrir el chat siguiente.

Consulta el [informe de viabilidad y los límites oficiales](viabilidad-autocontinuacion-chatgpt.md).

El servidor tampoco puede conocer con precisión los tokens de contexto restantes del chat de ChatGPT. Por eso conviene guardar el estado tras cada hito, no esperar a que la conversación falle.

## Permisos, privacidad y límites

La lectura exige acceso MCP a archivos; guardar requiere además permisos de edición. El borrado no está expuesto como herramienta MCP. Los datos se conservan solo en el almacenamiento local de usuario `MultiShellMCP/chat-handoffs`, fuera del repositorio. El almacenamiento admite como máximo 24 checkpoints, cada uno de 16 KiB; no genera copias ilimitadas ni descarga modelos. Las operaciones están vinculadas a la huella de máquina/directorio, rechazan revisiones desactualizadas y no contienen autorizaciones para ejecutar comandos. El borrado remoto mediante MCP está desactivado: una IA no puede acreditar que el usuario ha pulsado una autorización real simplemente enviando `human_confirmed=true`. Para liberar espacio, hay que realizar mantenimiento local explícito; no se borran tareas automáticamente. No hay llamadas a servicios de inferencia ni cargos por este mecanismo.

La recuperación posterior a una recarga empieza siempre por `list_shells_code`; **no reutilices un `shell_id` antiguo** del mensaje guardado. El identificador `handoffId` sí permanece estable. El almacén dispone de un bloqueo entre procesos para impedir que dos guardados simultáneos superen el máximo de registros.

Documentación compatible con 0.10.69.
