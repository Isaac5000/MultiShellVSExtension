# Plan futuro: interfaz MultiShell y conexiones multIA

> **Estado:** navegación y clientes locales completados en 0.10.43–0.10.47; desde 0.10.48 existen pasarelas **locales autenticadas por perfil**, claves individuales, permisos por terminal y revocación. **Pendientes**: túnel HTTPS remoto, registro/autenticación propia de cada proveedor y pruebas reales. Propuesta inicial del 3 de noviembre de 2026; fase de seguridad iniciada por petición del usuario el 4 de noviembre.
> **Prioridad previa:** evitar que la consola de PowerShell aparezca automáticamente al iniciar VS Code. Mantener sin interrupciones el túnel y las terminales actuales.
> **Versión de referencia:** MultiShell MCP Server 0.10.57.

## Proveedores y superficies comprobadas en 0.10.46

La selección diferencia aplicaciones locales y nubes/API. En el panel se pueden guardar perfiles de Claude web/Cowork, Grok web, Gemini Interactions API, Mistral Work/Studio y Cursor remoto, ver los requisitos particulares y abrir las pantallas oficiales. Estos perfiles tienen estado «pendiente», no «conectado». No existe todavía un gateway remoto autorizado ni se permite copiar localhost como si fuera una URL pública.

Secuencia de hitos (estado tras 0.10.48):

1. Identidades y claves/tokens por conexión en SecretStorage, revocación y autorización **en el servidor MCP**, incluyendo shell_id, herramientas de escritura y terminales.
2. Gateway de entrada **en loopback** con autentificación fuerte, límites de carga y protección frente a replay, confusión de sesión y origen. Pruebas de acceso no autorizado.
3. Adaptador de túnel saliente gestionado por la extensión con HTTPS verificado, control de procesos y puertos por instancia. El usuario autoriza instalación del proveedor (Cloudflare/ngrok u otro), y la extensión nunca expone directamente el puerto 3000.
4. Conexión específica del proveedor: Claude custom connector (OAuth/headers), Grok custom connector, Gemini API mcp_server con headers y nombres snake_case, Mistral connector, Cursor remote. La cuenta y autorización externa pueden exigir una pantalla oficial; no inventar APIs de registro de conectores.
5. Confirmación de extremo a extremo por llamada MCP autorizada, no por disponibilidad de puerto o existencia de configuración.

**Estado:** paso 1 implementado para los nuevos endpoints y paso 2 implementado parcialmente en loopback (autenticación, rechazo de origen, separación de sesiones y permisos; los controles avanzados de abuso quedan pendientes). Los pasos 3 a 5 siguen pendientes. **No desplegar túneles públicos** hasta validar también la limitación de carga y la exposición HTTPS específica.

## Objetivo

Convertir MultiShell en un centro de control MCP para varios clientes de IA manteniendo un **único núcleo MCP** y **conexiones gestionadas por separado**. Cada IA podrá acceder solo a las ventanas, herramientas y terminales que se le autoricen. El diseño ha de funcionar en Windows, Linux y macOS y ser bilingüe ES/EN.

El Tunnel Client oficial de OpenAI **no es un transporte universal**. La arquitectura debe separar tres entidades:

- **Proveedor o cliente:** ChatGPT/Codex, Claude, Gemini CLI/API, GitHub Copilot, Cursor, Perplexity, Mistral, Grok/xAI, DeepSeek u otro cliente compatible.
- **Transporte o conexión:** túnel privado compatible, MCP HTTPS remoto autenticado o MCP local. No todas las combinaciones son posibles.
- **Perfil de permisos:** identidad propia, credenciales, visibilidad de herramientas, ámbitos de ventana/shell, confirmaciones y auditoría.

No anunciar compatibilidad completa con una IA únicamente porque declare soportar MCP; exigir pruebas reales de inicialización, negociación de protocolo, autenticación y ejecución autorizada.

## Diseño de navegación en la barra lateral

En una barra lateral estrecha, evitar seis o más pestañas horizontales comprimidas. Propuesta:

1. **Cabecera compacta:** nombre, estado general, recargar, ayuda.
2. **Estado de MCP:** activo/detenido, coordinador/trabajador, puerto, recuento de conexiones; acciones críticas con confirmación.
3. **Navegación principal vertical:** Resumen, Terminales, Ventanas, Solicitudes, Skills.
4. **Conexiones IA:** lista dinámica de conexiones existentes, estado, identidad/perfil, botón «Añadir conexión» y «Administrar conexiones»; **no una pestaña nueva por cada proveedor**.
5. **Administración:** Permisos y seguridad, Actividad/diagnósticos, Configuración.
6. **Pie:** Documentación, cómo vincular un chat, comandos y acerca de.

### Pantallas

- **Resumen:** servicio, ventana actual, conexiones, alertas y acciones rápidas; evitar duplicar ajustes extensos.
- **Terminales:** una tarjeta por shell con alias, origen (principal/usuario/temporal), estado y acciones secundarias agrupadas; preservar confirmaciones para terminales de usuario.
- **Ventanas:** nombre, rol, ruta, identificador y estado de cada ventana sin mezclar el coordinador con las otras.
- **Solicitudes:** aprobar/rechazar y detalle con trazabilidad de identidad; estado vacío explícito.
- **Skills:** búsqueda, filtro por ámbito (proyecto/global), descripción desplegable y ruta copiable; nunca ejecutar scripts de skills por descubrirlas.
- **Conexiones IA:** estado real verificable, transporte, proveedor, permisos, inicio automático, diagnóstico, historial de reconexión y gestión segura de secretos.
- **Configuración:** puerto MCP, salida automática de programas interactivos, política de arranque y ajustes avanzados.

### Asistente «Nueva conexión»

1. Selección del proveedor y de su capacidad MCP concreta (aplicación, CLI, API).
2. Selección del transporte realmente admitido: local, HTTPS remoto, túnel privado.
3. Identidad, credenciales en **VS Code SecretStorage**, URL o Tunnel ID y OAuth cuando corresponda.
4. Permisos mínimos por conexión: solo lectura por defecto; escritura y comandos por autorización independiente; lista de ventanas/shells.
5. Comprobaciones antes de activar: conectividad, TLS, autenticación, versión MCP, catálogo y herramienta de prueba permitida. Mostrar errores específicos y nunca fingir conexión.

## Estudio preliminar de proveedores

La disponibilidad depende del producto, plan, versión y autenticación del cliente. Revalidar en documentación oficial antes de cada adaptador.

| Proveedor | Vía preliminar | Advertencia |
|---|---|---|
| ChatGPT / Codex | Secure MCP Tunnel o MCP remoto autenticado | Conservar integración OpenAI actual sin cambios de inicio |
| Claude | Conector MCP remoto HTTPS/OAuth según cliente | Probar flujo de autorización concreto |
| Gemini | Gemini CLI o API con MCP | No atribuir funciones de CLI a la app web sin prueba |
| GitHub Copilot | MCP en VS Code o herramientas compatibles | Distinguir ejecución local y en nube |
| Cursor | MCP local y remoto | Verificar transporte y autenticación en versión instalada |
| Perplexity | Conectores MCP compatibles | Depende de plan y producto |
| Mistral | Clientes y entorno compatible con conectores MCP | No asumir que todas sus interfaces lo ofrecen |
| Grok / xAI | API/herramientas de desarrollo MCP | No equiparar con el chat web |
| DeepSeek | Integración mediante cliente/harness MCP | No asumir ejecución nativa en cualquier endpoint API |

## Arquitectura propuesta

```text
Cliente IA → Transporte/Adaptador → Gateway MCP autenticado
  → Identidad y control de acceso → Núcleo MultiShell MCP
  → Router local de ventanas → Terminales y herramientas VS Code
```

- Mantener el servidor MCP actual como núcleo y los mecanismos de `shell_id`/`window_id`/`machine_id`.
- Separar el `TunnelManager` especializado de OpenAI mediante **adaptadores de transporte**. No copiar el gestor y los bloqueos para cada IA.
- El puerto de salud 8080 y el bloqueo único actuales **no escalan** directamente a N túneles: introducir identidad de instancia, puertos de salud y bloqueos exclusivos por conexión cuando haya varios transportes.
- Un gateway HTTPS autenticado puede servir a varias IAs y evitar N servidores o N túneles. Mantener túneles privados aislados cuando el proveedor o el perfil de seguridad los exija.
- Claves independientes por conexión, nunca en HTML, panel state, CLI ni logs; permitir rotación y revocación.
- Identidad y autorización en **cada solicitud del servidor**, no solo en la interfaz ni por headers declarativos del cliente.
- Diferenciar exposición de MCP local vs público: la configuración actual de host/origen no sustituye OAuth 2.1 ni una política de autorización.
- Preservar Workspace Trust, los permisos de creación/cierre de terminales de usuario, colas por shell y protección de comandos bloqueados.
- Recuperación tras recarga segura con comprobación de propietario y proceso. No matar procesos externos o de identidad ambigua.
- No duplicar proyectos, terminales, sesiones ni partidas/archivos por proveedor.

## Secuencia acordada (sin ejecutar aún)

**Fase 0 — pendiente de comprobar al siguiente arranque:** ocultar la consola automática de PowerShell sin impedir trabajo en segundo plano ni modificar procesos MCP.

**Fase 1 — UI:** estructura vertical, pantalla Resumen y agrupación «Conexiones IA», conservando la pestaña y flujos de túnel OpenAI hasta completar la migración.

**Fase 2 — Seguridad:** identidades, credenciales separadas, perfiles de permisos, revocación, pruebas de aislamiento y registro sin secretos.

**Fase 3 — Transporte:** gateway MCP HTTPS seguro y adaptadores local/HTTPS/túnel privado. Comenzar con un cliente adicional real, preferiblemente Claude o Gemini CLI, sin romper ChatGPT.

**Fase 4 — Ampliación:** incorporar el resto solo después de pruebas reales de autenticación, interoperabilidad, cargas simultáneas y recuperación en Windows, Linux y macOS.

## Criterios de aceptación

- Instalación actual y configuración del túnel OpenAI siguen funcionando sin migraciones destructivas.
- Las IAs permitidas pueden usar una o varias conexiones, con credenciales y permisos independientes.
- Una IA sin permiso de escritura/ejecución no puede invocar esas operaciones incluso manipulando llamadas MCP.
- Concurrencia de varios clientes no altera el orden FIFO de cada shell ni interrumpe trabajos activos.
- Estado «Conectado» basado en comprobaciones verificables, no simplemente en un puerto abierto.
- Pruebas unitarias de adapter/identity/policy, integración de dos clientes, regresiones existentes, arranque/recarga y pruebas en los tres SO.

## Decisiones que NO están tomadas

- Proveedor definitivo del gateway HTTPS (Cloudflare, ngrok, infraestructura propia u otra).
- Cantidad de conexiones simultáneas admitidas y coste de servicio.
- Compatibilidad exacta con todas las aplicaciones y planes de cada IA.
- OAuth/identidad concretos del gateway y política final de acceso remoto.

**Alcance autorizado:** el usuario pidió comenzar esta implementación el 4 de noviembre de 2026. La versión 0.10.48 entrega la primera fase de seguridad local; la publicación remota y la integración con cuentas externas no se presumen completadas.

Edición compatible con 0.10.58.

Compatible con 0.10.59.

Documentación compatible con 0.10.69.

Compatible con 0.10.61.

Documentación compatible con 0.10.62.

Documentación compatible con 0.10.63.

Compatible con 0.10.64.
