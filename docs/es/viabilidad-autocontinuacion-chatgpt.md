# Viabilidad de la continuación autónoma de ChatGPT mediante MultiShell MCP

**Revisión: 5 de noviembre de 2026.** Ámbito: conversaciones normales de ChatGPT
y un servidor MCP utilizado como herramienta, sin claves API facturables,
sin sustituir ChatGPT por otro cliente o modelo y sin automatización no oficial
del navegador.

## Dictamen

**No es posible garantizar la petición completa con las interfaces oficiales
actualmente documentadas para servidores MCP.** No es una limitación del código
de MultiShell, sino del control que el producto ChatGPT concede a sus herramientas:

1. El chat/cliente inicia una invocación de herramienta MCP. El servidor
   devuelve el resultado, pero no tiene una operación para iniciar por sí
   solo otro turno del modelo.
2. La especificación MCP 2026-07-28 utiliza POST del cliente al servidor
   y solicitudes adicionales *dentro* de una petición del cliente (MRTR).
   Ninguna de ellas equivale a crear una conversación de ChatGPT.
3. Las herramientas de una app/plugin no reciben facultades de gestión
   de conversaciones de ChatGPT: no existe una operación documentada
   para crear un nuevo chat de usuario ni para mover automáticamente
   el control a ese chat y reanudar la tarea.
4. El servidor MCP no conoce el presupuesto de contexto restante de la
   conversación de ChatGPT. Puede guardar progreso en cada hito, pero
   no detectar de manera fiable el último turno disponible.

Se trata de una **imposibilidad con las interfaces publicadas y las restricciones
exigidas**, no de una demostración de que OpenAI nunca pueda incorporar
estas capacidades.

## Matiz importante: widgets de ChatGPT

La interfaz Apps SDK sí describe `window.openai.sendFollowUpMessage({prompt})`
(y `ui/message`), que permite **a un componente visual mostrado dentro
de ChatGPT** enviar un mensaje de seguimiento en la conversación actual.
Eso es distinto de la API de herramientas MCP del servidor.

Puede servir para un botón `Continuar` de un clic, sujeto al funcionamiento
y permisos del cliente, pero:

- No ofrece un `createNewChat` oficial ni une una conversación nueva con el
  checkpoint antiguo.
- No expone un contador fiable de contexto restante.
- No promete enviar infinitos turnos de IA en segundo plano ni superar
  cuotas, revisión de seguridad, reconexiones o estados de error.
- No equivale a una capacidad del **servidor** para iniciar acciones mientras
  ChatGPT no tiene abierta una interacción con él.

No se ha hecho una prueba real del widget en ChatGPT: no se declara como
solución comprobada. Tampoco conviene implementarlo como bucle de mensajes
automáticos sin garantías oficiales de consentimiento, límites y ciclo de vida.

## Alternativas oficiales analizadas

| Producto o mecanismo | Qué permite | Por qué no cumple exactamente |
| --- | --- | --- |
| ChatGPT Chat + MCP | Conversación habitual y uso de herramientas MultiShell | Sin control MCP del siguiente turno ni de creación de chats |
| Proyectos de ChatGPT | Agrupar chats, archivos e instrucciones | El contexto compartido no crea nuevas conversaciones solo |
| ChatGPT Work | Delegar tareas largas que pueden continuar en segundo plano | Es otro modo de ejecución; no garantiza renovación indefinida de chats normales |
| Dots | Agente de ChatGPT con hilos nuevos y continuidad entre conversaciones | Despliegue limitado por plan/región; según la disponibilidad pública, los planes personales indicados se restringen a Pro fuera del EEE, Reino Unido y Suiza; no es la interfaz de chat convencional |
| Apps SDK `sendFollowUpMessage` | Mensaje desde un widget mostrado en el chat actual | No crea un nuevo chat ni garantiza operación indefinida |
| OpenAI API/Agents | Administrar conversaciones y ejecuciones por API | Uso independiente y potencialmente facturable: expresamente descartado |
| Automatizar interfaz web no oficial | Podría pulsar botones de ChatGPT | Frágil, inseguro, no constituye integración oficial y queda descartado |

**Work y Dots:** utilizar funcionalidades oficialmente incluidas en una
suscripción no significa disponibilidad ilimitada; se respetan los límites
del plan y nunca se permite comprar créditos o activar cobro adicional.

## Lo comprobado en MultiShell 0.10.63 instalado

Prueba directa del servidor local, sin modelo externo:

```powershell
node test/manual-chatgpt-host-boundary.cjs 19ce8934-64c9-4523-b3d8-3b45c2aa38f4
```

Resultado observado en la máquina de desarrollo:

- Conexión MCP local autenticada, **32 herramientas** anunciadas.
- Están disponibles `chat_handoff_list_code`, `chat_handoff_load_code`
  y `chat_handoff_save_code`.
- El checkpoint real indicado se ha localizado y recuperado en disco.
- Ninguna de las herramientas anunciadas por **este servidor** permite
  crear un chat de ChatGPT ni iniciar un turno del cliente.
- El contrato de capacidades del servidor declara `extensions`,
  `resources` y `tools`, no una operación de gestión de chats.

**Límite de la prueba:** la lista del servidor local no inspecciona las
funciones internas no públicas del cliente ChatGPT. La conclusión sobre
capacidad oficial procede de la documentación del protocolo y de OpenAI,
no únicamente de la ausencia de un nombre de herramienta local.

## Diseño final que MultiShell sí puede mantener sin cargos

1. Seguir usando ChatGPT como asistente y MultiShell como proveedor de
   herramientas, sin otro motor de inferencia ni API clave de pago.
2. Guardar checkpoints verificados tras cada hito importante con
   `chat_handoff_save_code`, de manera acotada y persistente.
3. Recuperar una tarea en otro chat con `list_shells_code`,
   `chat_handoff_list_code` y `chat_handoff_load_code`.
4. Rechazar resultados inciertos, tareas ambiguas y sobrescrituras de
   revisiones antiguas; verificar siempre el estado real antes de actuar.
5. Dejar abierta la integración de futuras capacidades oficiales de
   ChatGPT para crear hilos y enviar turnos sin intervención. No falsificar
   esas capacidades mediante simulaciones.

**Estado del objetivo:** bloqueado externamente para continuación ilimitada
de chats ordinarios; la persistencia y reanudación manual comprobables están
implementadas. No publicar versiones nuevas ni alterar el túnel para
representar una funcionalidad que el host no ofrece.

## Fuentes oficiales

- [Especificación MCP 2026-07-28: Streamable HTTP](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx).
- [Especificación MCP 2026-07-28: Multi Round-Trip Requests](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/patterns/mrtr.mdx).
- [OpenAI: Connecting custom MCP servers in ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).
- [OpenAI: Plugins UI reference, `sendFollowUpMessage`](https://developers.openai.com/plugins/reference).
- [OpenAI: Add UI to your MCP server](https://developers.openai.com/plugins/build/chatgpt-ui).
- [OpenAI: ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex).
- [OpenAI: Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt).
- [OpenAI: Dots, disponibilidad y hilos](https://learn.chatgpt.com/docs/dots).

Compatible con 0.10.64.

Documentación compatible con 0.10.69.
