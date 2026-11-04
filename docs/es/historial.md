# Historial de cambios

[English version](../en/changelog.md) · [Índice del proyecto](../../README.md)

## 0.10.52 — Conexiones locales autenticadas y protección de listados

- Detectado y corregido que la configuración automática heredada guardaba una URL sin autorización pese a que el puerto principal ya exige autenticación. Ahora se rechaza esa instalación y los perfiles anteriores se marcan como no verificados, conservando la posibilidad de desvincularlos sin borrar otras entradas.
- **Copiar configuración** utiliza la URL de la pasarela individual vinculada al perfil de IA y un marcador de Bearer, sin exportar la clave interna del coordinador ni las claves de SecretStorage. Se necesita introducir la clave en el cliente por una vía segura; no se afirma que el proceso sea automático.
- El panel deja de ofrecer el botón de instalación automática incompatible. La documentación y la skill del plugin describen el flujo de pasarela local y su limitación.
- Añadido un caso adversarial de sustitución de directorios: `list_files_code` podía revelar nombres de archivos externos al reordenarse un directorio durante `readdir`. Ahora revalida cada entrada y el directorio antes de devolver el listado.
- Se mantienen las restricciones de seguridad y pruebas de 0.10.51. Esta revisión sigue sin demostrar ausencia absoluta de carreras del sistema de archivos; tampoco constituye prueba manual de que Windows Terminal no se abra tras instalar el VSIX.

## 0.10.51 — Protección MCP y arranque de túnel sin consola independiente

- El servidor MCP principal exige el token local de la instalación en las peticiones HTTP de producción. El Tunnel Client inyecta la cabecera privada desde variables de entorno solo en su conexión local; no se almacena en YAML ni se entrega a ChatGPT.
- Las peticiones no autenticadas se rechazan antes de analizar su JSON. El límite de 32 solicitudes activas (HTTP 429) se aplica también al puerto principal.
- Las lecturas usan un descriptor abierto, comprueban identidad y contención antes de devolver datos, y rechazan archivos especiales. Las escrituras atómicas vuelven a verificar rutas antes de publicar; las copias también se comprueban después del copiado. Pruebas de sustitución de enlaces simbólicos incluidas.
- Los comandos nativos aceptan omitir `shell_id` exclusivamente cuando solo hay una terminal; con varias, no eligen ninguna de forma implícita.
- En Windows el Tunnel Client deja de lanzarse como proceso `detached` con consola independiente, evitando el patrón observado de aparición de Windows Terminal al iniciar Codex App Server.
- Tras instalar esta versión, **reinicia el túnel administrado una vez desde el panel**, ya que un proceso antiguo no puede recibir las nuevas cabeceras en su entorno después de arrancar.
- La seguridad de rutas ante cambios adversariales continuos requiere primitivas nativas de apertura relativa a descriptores para una garantía absoluta; las comprobaciones añadidas detectan las carreras reproducidas, sin afirmar que todas las carreras posibles estén eliminadas.

## 0.10.50 — Complemento MCP de ChatGPT y limpieza de guías

- La ayuda de ChatGPT en **Conexiones IA** describe el paso necesario de crear un complemento **Add custom MCP server → Create as a plugin** dentro de ChatGPT, adicional al Secure MCP Tunnel de MultiShell.
- Datos identificados: `tunnel_id` desde Platform Tunnels, asociación con el espacio de trabajo, clave de ejecución separada con Tunnels Read + Use, nombre del complemento, descripción opcional, conexión **Tunnel**, autenticación soportada, consentimiento de riesgos y comprobación de herramientas.
- Enlaces específicos a la gestión de túneles, las claves de ejecución, ChatGPT y la guía oficial de complementos MCP. La API key del túnel solo se introduce en **Túnel OpenAI**, nunca como credencial del complemento.
- Eliminados los campos opcionales de API key que no utilizan los flujos normales de Gemini CLI y Claude Code. Los secretos ya guardados se conservan hasta que el usuario pulse **Borrar clave antigua**; no hay eliminación silenciosa.
- Mensajes y títulos del panel actualizados para diferenciar clientes locales y conectores en la nube; documentación y skill del plugin corregidas en ambos idiomas.

## 0.10.49 — Guías por IA y campos seguros en el panel

- Reparada una incompatibilidad con la prueba heredada del panel que dejaba activo el temporizador de Node después de fallar el estado inicial. Lectura compatible con `workspaceState`, espera verificable del primer snapshot y limpieza garantizada al fallar una aserción.

- Cada perfil en **Conexiones IA** tiene un desplegable **?** con instrucciones específicas, comandos oficiales para copiar sin ejecución, enlaces a guías de los proveedores y advertencias de compatibilidad/autenticación.
- Gemini CLI: requisitos Node.js 20+, instalación npm, inicio de sesión Google, configuración automática MCP existente y verificación con `gemini mcp list`. Se distingue expresamente de Gemini web y Gemini API.
- Datos por proveedor: URL HTTPS pública, ID de conector, clave API opcional o token Bearer opcional según la modalidad. API keys y tokens se guardan en VS Code SecretStorage, nunca en Memento/HTML/snapshots/configuración MCP; se pueden borrar individualmente.
- ChatGPT conserva su pestaña Túnel OpenAI y añade ayuda contextual y enlaces oficiales. Ninguna orden de instalación se ejecuta desde la guía.
- Validación de URLs HTTPS sin usuario, contraseña, parámetros sensibles ni direcciones privadas. Guardar datos no abre puertos, ejecuta túneles ni registra proveedores remotos.
- Pruebas para el catálogo de 10 guías, almacenamiento seguro y aislamiento por perfil, campos enmascarados, enlaces/acciones del panel y protección frente a borrado accidental.

## 0.10.48 — Pasarelas MCP autenticadas e independientes

- Primera implementación de pasarelas MCP independientes por IA: servidor MCP con autenticación Bearer obligatoria en cada solicitud, clave aleatoria individual de 256 bits en SecretStorage, puertos localhost estables 38100–38199 y rechazo de administradores MCP internos desde la pasarela.
- Políticas en el servidor por perfil y por ID exacto de terminal, raíz original y permiso de lectura, edición, ejecución o completo. No se permite crear/cerrar terminales, cambiar alias ni acceder a otras ventanas mediante una pasarela de IA.
- En el panel: configurar acceso aislado, iniciar/detener, copiar URL local, copiar clave con aviso, rotar, revocar y activar arranque automático. El panel nunca recibe la clave en su estado serializado.
- Ante pérdida del rol de coordinador o del Workspace Trust, se rechazan solicitudes a la pasarela; la revocación no afecta las otras IAs.
- Límite de 32 peticiones MCP simultáneas por pasarela autenticada, con HTTP 429 y reintento indicado; no afecta al coordinador principal o túnel OpenAI.
- Exclusión de `.mcp.json`, respaldos y temporales de conexión del VSIX y Git.
- Pruebas de cinco pasarelas reales con clientes MCP HTTP independientes, claves diferentes, llamadas simultáneas y denegación de accesos cruzados.
- **Pendiente**: transporte HTTPS público gestionado, compatibilidad con encabezados/OAuth particulares de cada IA y comprobaciones reales desde Claude web, Grok y demás plataformas.

## 0.10.47 — Renderizado de conexiones IA y escapes de terminación

- Solucionado el fallo por el que el contador reconocía perfiles de IA guardados pero las tarjetas no aparecían: el campo de ayuda carecía de `id="aiFormHelp"` y el renderizado se interrumpía por una referencia nula.
- Pruebas de concordancia de identificadores HTML/JS y simulación del renderizado de tarjetas locales y remotas.
- Protección adicional de «Salir automáticamente»: comillas no cerradas y secuencias de escape ambiguas desactivan cualquier envío de `q`. No se intenta «reparar» el comando enviando Enter o Ctrl+C; los procesos permanecen bajo control del usuario.
- Detección informativa del prompt secundario de PowerShell `>>` como posible continuación por comando incompleto.
- Reglas del proyecto para evitar `node -e` con comillas complejas y `exit` en terminales PowerShell integradas.

## 0.10.46 — Conexiones IA por proveedor y superficie

- «Conexiones IA» distingue clientes locales de modalidades cloud/API. Cada proveedor presenta su mecanismo MCP, los requisitos concretos y el enlace oficial.
- Nuevos perfiles: Claude web/Cowork, Grok web, Gemini Interactions API, Mistral Work/Studio y Cursor MCP remoto. Se conserva la configuración local existente de Copilot, Claude Code, Gemini CLI y Cursor, así como Secure MCP Tunnel para ChatGPT.
- Los perfiles remotos permanecen en **pendiente de gateway autenticado** y no aceptan configuraciones `127.0.0.1`, ni ejecutan túneles ni almacenan credenciales arbitrarias. La conexión efectiva, OAuth y permisos separados siguen siendo un hito posterior.
- Pruebas del catálogo, del panel, persistencia y rechazo de uso inseguro de la configuración local para IAs remotas.
- No se publica el servidor MCP 3000 ni se altera la instalación activa.

## 0.10.45 — Configuración automática de clientes MCP desde el panel

- En **Conexiones IA**, botones **Configurar automáticamente**, **Revisar estado**, **Ver archivo** y **Desvincular** para Copilot, Gemini CLI, Cursor y Claude Code. Sin copiar JSON ni ejecutar comandos.
- Configuración de usuario portable para Copilot (`mcp-config.json`), Gemini (`settings.json`) y Cursor (`mcp.json`). Claude Code utiliza `.mcp.json` de la carpeta abierta en VS Code, limitado a ese proyecto.
- Edición estructurada JSON/JSONC, copias de seguridad antes de cambiar un archivo existente, bloqueo exclusivo, comprobación de cambios concurrentes, protección frente a symlinks y rechazo de colisiones. Solo se pueden retirar las entradas que MultiShell registró como propias.
- Workspace Trust y confirmación nativa antes de configurar o desvincular. No se habilitan permisos por IA ni se fuerza un inicio de sesión externo.
- Las configuraciones existentes se preservan; la conectividad del cliente real no se da por verificada automáticamente.

## 0.10.44 — Solicitudes sin duplicación y pruebas de cinco clientes

- El apartado «Solicitudes» muestra su propio título, contador, controles de aprobación y estado vacío, sin un segundo desplegable redundante.
- Pruebas automatizadas con cinco clientes MCP HTTP independientes usando un solo coordinador y cinco shells en cinco trabajadores, y un solo trabajador con cinco shells. Se comprueba el paralelismo entre shells, FIFO en el shell compartido y ausencia de colas pendientes.
- Prueba local sintética de 30 segundos: 6.756 comandos, p95 de 48 ms, sin errores inesperados. No equivale a cargas de las IAs reales.
- Se confirma una limitación de seguridad: los perfiles multIA son etiquetas y configuraciones; no impiden que un cliente MCP use los shells de otro. Los permisos por cliente y el gateway autenticado siguen pendientes.
- Corregida la propagación de cancelación HTTP por solicitud hacia el SDK y las herramientas; el caso de 100 solicitudes/80 cancelaciones pasó tres repeticiones consecutivas y la batería integrada terminó con 103 suites correctas. Conservar seguimiento de saturación y evitar garantías absolutas.

## 0.10.43 — Navegación estructurada y perfiles MCP locales multIA

- Rediseño del panel mediante menú vertical plegable, Resumen y separación de Solicitudes, Conexiones IA y Configuración; se conservan terminales, skills, seguridad y túnel OpenAI.
- Perfiles locales para VS Code/Copilot, Claude Code, Gemini CLI, Cursor y clientes genéricos. Validación estricta de etiquetas, persistencia sin secretos, exportación por portapapeles y confirmación antes de compartir el acceso a herramientas MCP.
- Los perfiles locales no implican conexiones verificadas ni autorizaciones separadas. No se publica ninguna URL remota ni se añade pasarela pública.
- Pruebas nuevas de navegación, permisos de interfaz, almacenamiento, generación local segura y regresiones. Pruebas reales de clientes adicionales y controles por identidad pendientes.

## 0.10.42 — Recuperación de túnel y protección de procesos

- La limpieza de bloqueos antiguos utiliza un guardián exclusivo para impedir que dos ventanas retiren el bloqueo de otra. Si un guardián queda abandonado, el sistema falla de forma segura.
- Recuperación del proceso propio tras una recarga mediante PID, inicio del proceso, ruta del ejecutable y huella de la línea de órdenes. Se rechaza la finalización si falla cualquier comprobación. Los procesos externos y anteriores a la nueva prueba de identidad no se adoptan.
- Sincronización atómica del puerto MCP en perfiles creados por la extensión, preservando comentarios y campos YAML. Bloquea el cambio si el túnel gestionado está activo; nunca modifica perfiles importados.
- Nuevas regresiones de concurrencia, recuperación, identidad nativa del proceso y cambios de puerto. Estabilizadas las pruebas de reinicio y FIFO de solicitudes. Las 98 suites, TypeScript, ESLint y auditoría npm han pasado en Windows. Linux/macOS físicos y conectividad remota completa siguen pendientes.

## 0.10.41 — Gestión de túnel desde la interfaz lateral

- Nueva pestaña **Túnel** del panel bilingüe con estado, instalación, perfil, Tunnel ID, API key oculta, conexión, parada y arranque automático.
- Acciones protegidas por Workspace Trust, confirmaciones de desconexión y arranque automático; los procesos externos no se alteran.
- El estado enviado a la webview no incluye credenciales. Nuevas pruebas de acciones de la interfaz y ausencia de filtraciones, además de regresiones de UI.
- Windows: compilación, lint, pruebas y creación de instalador; validación de túnel remoto real y ejecución física en Linux/macOS siguen pendientes.

## 0.10.40 — Gestor de túnel integrado con Tunnel Client v0.0.19

- Primer gestor de túneles integrado en TypeScript, activado únicamente por el usuario; comandos locales de instalación, configuración, arranque, estado y parada de procesos propios.
- Cliente oficial v0.0.19 y seis paquetes con SHA-256 fijados; compatible con Windows, Linux y macOS, arquitecturas x64 y ARM64.
- Perfil aislado en almacenamiento global de VS Code, API key en `SecretStorage` e invocación segura de `init` y `doctor` sin scripts PowerShell.
- Inicio automático deshabilitado por defecto; solo la ventana hub puede iniciarlo, sin modificar procesos de túneles existentes.
- Pruebas unitarias de identidad, sumas de comprobación, integridad de instalación y restricciones del gestor; pruebas físicas multiplataforma todavía pendientes.

- Nuevos perfiles existentes reutilizables en modo lectura, con comprobaciones estrictas del destino local, la referencia de API key y el host oficial de OpenAI.
- Bloqueo interproceso persistente para evitar duplicar túneles tras recargas o varias ventanas; reintentos con espera progresiva y pausa ante errores continuados.
- Nuevas pruebas de ciclo de vida completo simulado, recuperación, bloqueo y perfiles multiplataforma.

## 0.10.39 — Migración completa al SDK MCP v2

- Se ha eliminado el SDK v1 como dependencia directa, junto con el transporte HTTP y el registro de herramientas de la implementación antigua.
- Un único servidor basado en `@modelcontextprotocol/server` atiende protocolos MCP 2025 y 2026 desde `127.0.0.1:3000/mcp`, usando `createMcpHandler` en modo `legacy: 'stateless'`.
- Se mantiene la compatibilidad de los comandos heredados `@mcp`, las skills por ventana, los permisos, los controles HTTP de Host/Origin, la cancelación y el cierre de solicitudes.
- Las respuestas modernas de herramientas incluyen los metadatos `resultType`, `ttlMs` y `cacheScope`; las herramientas deshabilitadas se rechazan tanto en el modo antiguo como en el moderno.
- Migrada la prueba de clientes anteriores al SDK v2 en modo legado. Añadida prueba de migración dual que verifica el registro de ambas eras, la igualdad de recursos, los metadatos modernos y la ausencia de imports v1.
- El script, perfil y ejecutable del túnel permanecen sin modificar. El comportamiento de la interfaz **Skills** no cambia.

## 0.10.38 — Skills compactas con descripción desplegable

- Cada skill muestra el **nombre y su ruta debajo**, siempre visibles. Solo la descripción está plegada por defecto y se abre con el control accesible «Descripción».
- El botón de copiar permanece **a la derecha del nombre**, separado del desplegable. Las rutas largas se truncan visualmente con acceso al texto completo al pasar el cursor; copiar no abre ni cierra la descripción.
- Las descripciones expandidas se mantienen visibles al paginar o actualizar resultados de la misma ventana; se restablecen cuando cambia el proyecto o el contexto de permisos.
- Se reduce el espacio vertical, se mantiene el acceso al texto completo y se adapta la interfaz a paneles estrechos, temas de VS Code y localización ES/EN.
- Nueva prueba de regresión que ejecuta el renderizado real del panel con un DOM simulado y comprueba la separación entre controles, estado, permisos y accesibilidad.

## 0.10.37 — Selector y búsqueda de skills más fiables

- Auditoría estructural de 18 archivos de TypeScript mediante Graphify (310 nodos y 897 relaciones), guardada fuera del repositorio para no añadir artefactos temporales.
- `list_skill_names_code` filtra únicamente por nombre **antes de paginar**. Ya no puede devolver páginas vacías por coincidencias de las descripciones mientras oculta nombres posteriores.
- El selector de la paleta de VS Code recorre todas las páginas del catálogo, muestra las descripciones y copia la ruta exacta cuando existen skills con nombres duplicados.
- El selector respeta el idioma de VS Code y no utiliza el directorio de ejecución del proceso como proyecto cuando no hay ninguna carpeta abierta.
- Pruebas de regresión con más de 100 skills, coincidencias engañosas en descripciones, rutas duplicadas y ventanas sin carpeta. Se conservan los permisos, el aislamiento por ventana y las instrucciones de las skills existentes.
- Actualizadas las guías y referencias a los instaladores de la versión vigente.

## 0.10.36 — Buscador de skills en el panel de cada ventana

- La pestaña Skills permite buscar por nombre o descripción, filtrar por origen y continuar por páginas de 40 resultados.
- Cada skill muestra su descripción y ruta; «Copiar para ChatGPT» prepara una instrucción MCP con ruta y terminal exactas de la ventana actual.
- Las solicitudes de terminales de usuario pasan a un desplegable entre Ventana actual y Terminales, visible desde todas las pestañas.
- Catálogo local disponible con el servidor detenido, permisos globales conservados, descarte de búsquedas obsoletas y foco estable durante las actualizaciones.

## 0.10.35 — Skills fáciles de buscar y cargar por MCP

- Nuevas herramientas `find_skills_code` y `load_skill_code`: búsqueda por tarea/nombre/descripción, lectura por nombre y selección explícita ante duplicados.
- Búsqueda anterior al límite de respuesta y catálogo paginado en la ventana propietaria.
- El descubrimiento moderno recorre las páginas del catálogo sin perder las entradas posteriores a la número 100.
- Leer una skill no ejecuta sus scripts ni activa permisos globales.

## 0.10.34 — Skills con lecturas acotadas y descubrimiento eficiente

- Las skills globales mantienen los enlaces de instalación autorizados, pero sus archivos internos no pueden enlazar a otros directorios personales.
- Las lecturas limitan la memoria y rechazan archivos que cambian durante la consulta. Los manifiestos rechazan un `SKILL.md` distinto del utilizado para sus metadatos.
- La paginación calcula como máximo los veinte manifiestos de la página solicitada, valida el cursor antes de leer archivos y cede ejecución entre manifiestos.
- Las terminales de una misma carpeta y ventana comparten descubrimiento; ventanas, equipos y carpetas distintos conservan catálogos independientes.
- Actualizadas la skill del plugin y la del repositorio: selección de alcance, lectura progresiva y diferencia entre leer archivos y activar una skill en el cliente.
- Corregida la compatibilidad del protocolo moderno con los selectores heredados `@shell:` y las consultas de skills `@mcp`. Se conservan la validación de cabeceras, permisos y las respuestas antiguas de control.
- Seis nuevas suites de regresión y tres comprobaciones de skills y compatibilidad con VS Code real. Corregida la descripción incompleta de límites en español.

## 0.10.33 — Skills independientes por ventana y origen de máquina

- Las búsquedas, lecturas, archivos y manifiestos de skills se ejecutan en el worker de VS Code propietario del `shell_id`. El coordinador no abre rutas de otro worker en su propio disco.
- Cada ventana conserva sus propias skills del proyecto; las skills globales se leen en el directorio personal del worker y requieren autorización tanto en el coordinador como en la ventana propietaria.
- Las ventanas registradas identifican la instalación local mediante `machine_id`, junto a `window_id`. Las skills con nombres idénticos en ventanas distintas mantienen URIs diferentes.
- Una ventana desconectada no provoca lecturas alternativas desde el disco del coordinador.
- Nueva regresión con dos directorios de proyecto, dos hogares personales simulados, permisos diferentes y clientes MCP antiguos y modernos.
- **Límite de red:** el enlace hub-worker sigue usando `127.0.0.1`, por lo que solo agrega ventanas de la misma máquina. Para varias máquinas se necesitan conexiones MCP independientes, una por equipo, o un futuro puente autenticado y cifrado.

## 0.10.32 — Skills globales de Codex y listado por nombre

- MultiShell puede leer directamente las skills del usuario desde `~/.agents/skills`, `~/.codex/skills` y `~/.codex/skills/.system`, sin copiar archivos ni ejecutar scripts.
- Nueva opción `multi-shell-mcp.globalCodexSkills` con consentimiento explícito; desactivada por defecto para evitar la exposición de archivos personales a clientes MCP conectados mediante túneles.
- Nueva herramienta `list_skill_names_code` con lista alfabética, filtro de búsqueda, alcance `project/global/all` y rutas individuales para nombres duplicados.
- Nueva consulta compatible con conectores antiguos: `execute_shell_command_code(command="skills <shell_id> [global|project]",cwd="@mcp")`, sin ejecución en terminal.
- Nuevo comando en la paleta de VS Code **Mostrar skills disponibles**, con búsqueda, copia del nombre y solicitud de autorización para activar skills globales.
- Integración de las skills globales en `skills/list`, `skills/get` y los recursos MCP, manteniendo aislamiento por terminal y las restricciones de lectura.
- Añadidas regresiones de rutas, permisos, enlaces y compatibilidad entre protocolos. Consulta [Validación](validacion.md) para los resultados.

## 0.10.31 — Protocolo oficial MCP Skills y plugin portable

- Nuevo transporte MCP moderno basado en SDK v2 (`2026-07-28`): `server/discover` anuncia `io.modelcontextprotocol/skills`. Se conservan el SDK y el transporte anteriores para clientes MCP de 2025.
- Implementados `skills/list` paginado y `skills/get`; cada skill lleva frontmatter YAML completo, manifiesto de recursos y SHA-256 de cada fichero. Los nombres repetidos entre ventanas mantienen URI distintas.
- Las lecturas `resources/read` siguen acotadas a cada proyecto; se rechazan enlaces simbólicos y manifiestos incompletos o que excedan 512 archivos y 16 MiB. Se mantiene `directoryRead: false` (función opcional).
- Herramientas normales, permisos, aislamiento por shell, recuperación de terminales y cola FIFO conservados mediante un adaptador compartido entre ambos protocolos.
- Plugin portable `plugins/multishell-mcp` con skill, onboarding, configuración local MCP y marketplace de repositorio. Nuevo paquete ZIP independiente del VSIX; instalación manual y autorización del usuario obligatorias.
- Pruebas oficiales de negociación, manifiestos, seguridad y regresión para los dos protocolos; consulta [Validación](validacion.md) para los resultados y límites.

## 0.10.30 — Integración con Agent Skills

- Descubrimiento de skills válidas en `.agents/skills/`, `.github/skills/` y `.claude/skills/` del proyecto seleccionado, sin copiar o ejecutar archivos.
- Añadidas herramientas `list_skills_code`, `read_skill_code` y `read_skill_file_code` con `shell_id` obligatorio y acceso limitado a la carpeta de cada skill.
- Publicación MCP de `skill://index.json` y recursos `skill://workspace/...` para clientes que reconocen la distribución de skills como recursos.
- Validación YAML de `SKILL.md`, límites de tamaño, bloqueo de traversal y symlinks, y lectura selectiva de referencias y recursos binarios.
- Skill de ejemplo `.agents/skills/multishell-mcp/` para Codex y documentación bilingüe de instalación, uso y seguridad.
- Nuevas suites para descubrimiento, lectura, aislamiento entre ventanas y protocolo MCP: **68/68 suites**, ESLint y auditoría completa de npm sin vulnerabilidades conocidas; VSIX de 25 archivos generado. No hay ejecución automática de scripts ni inscripción automática en el catálogo nativo de ChatGPT.

## 0.10.29 — Cancelación y respuestas tardías

- La creación temporal, el cierre y los cambios de alias reciben la cancelación del cliente. Una petición desconectada no puede crear posteriormente una terminal ni cerrar una sesión de usuario tras una aprobación tardía.
- Las respuestas de creación, cierre, alias y descubrimiento se validan contra la conexión que las originó. Una respuesta anterior no puede modificar ni cerrar una terminal que reutilice el ID después de reconectar, borrar su registro o marcar la ventana nueva como desconectada.
- Reiniciar el gestor libera sus peticiones y escuchadores pendientes, incluso si falta la integración de shell o un evento de finalización. Conservar terminales no conserva las esperas del gestor anterior ni interrumpe sus procesos.
- La compensación de una creación fallida se limita a su conexión original. Se mantienen las autorizaciones locales y no se repiten automáticamente operaciones ya enviadas.
- Añadidas tres suites de regresión para cancelación de mutaciones, respuestas obsoletas y liberación del gestor.

## 0.10.28 — Conexión, reconexión y recarga resistentes

- Corregido el arranque al restaurar terminales mientras el coordinador conserva el registro anterior: se reintenta únicamente el registro durante un plazo limitado, sin apropiarse de sesiones activas ni repetir órdenes.
- Los inicios y cierres simultáneos comparten una sola operación; los eventos tardíos de un servidor anterior no invalidan su sustituto.
- La desconexión y el cierre del servidor cancelan las órdenes pendientes. Se conservan los procesos principales y de usuario ya iniciados.
- La reconciliación rechaza respuestas de conexiones antiguas; una ventana que no responde limita su consulta de descubrimiento a dos segundos.
- Las cabeceras incompletas caducan en diez segundos y los cuerpos en quince, con un intervalo de comprobación de un segundo. Estos límites de recepción no recortan las respuestas de órdenes largas o silenciosas.
- Los tokens malformados no provocan excepciones; el JSON inválido y los cuerpos excesivos reciben errores limitados, sin páginas HTML con trazas internas.
- Nuevas pruebas de protocolo con el cliente MCP oficial, reinicios, desconexiones, cancelación, carga sostenida y ventanas reales de VS Code. Consulta [Validación](validacion.md) para resultados y límites.

## 0.10.27 — Recuperación automática y envío seguro

- PowerShell se verifica mediante un runspace de diagnóstico separado; las terminales libres se recuperan automáticamente, incluso tras perder un evento de fin. No se envían teclas ni se ejecutan sondeos en el runspace de la terminal.
- La inspección distingue procesos silenciosos y esperas de entrada; la actividad nueva invalida un resultado anterior. Los fallos de inspección mantienen la protección.
- Corregidos el registro obsoleto tras recuperación, la cancelación durante la espera de integración, el envío sobre actividad manual y la contaminación de estado por lectores antiguos.
- El botón de recuperación repite una verificación automática sin pedir confirmación manual.
- Actualizados ESLint y minimatch; la auditoría completa de npm no detecta vulnerabilidades conocidas.
- Nuevas suites para regresiones de recuperación y consultas reales de PowerShell. **57/57 suites**, ESLint, auditoría completa de npm y **12/12 comprobaciones en VS Code 1.144.0 con PowerShell 7** superadas. Recarga real de ventanas y Linux pendientes.

## 0.10.26 — Diagnóstico de terminales aparentemente bloqueadas

- El panel y las respuestas MCP distinguen terminales ocupadas por comandos de MCP de terminales con actividad externa detectada por VS Code (`external_busy`).
- Las sesiones que precisan verificación incluyen `recovery_reason`: `restored_unverified` (restaurada sin prueba de inactividad), `ambiguous_completion` (finalización sin confirmación fiable) o `unverified_execution` (estado de ejecución incierto).
- Corregido el diagnóstico engañoso de terminal aparentemente disponible cuando existe un comando manual observado, y ahora se refleja inmediatamente una finalización ambigua.
- Se mantiene la confirmación manual únicamente cuando falta evidencia fiable; no se envían pulsaciones de teclado, comandos de sondeo ni señales.
- Los comandos incompletos muestran ahora fases diferenciadas: esperando integración de shell, en ejecución, salida finalizada sin evento de fin, error de lectura pendiente de confirmación o proceso conservado tras timeout.
- Detección pasiva de posibles paginadores, confirmaciones y credenciales sin responderlos automáticamente; avisos de silencio prolongado, que no implican necesariamente bloqueo.
- Corregida una carrera de finalización: si VS Code emite el evento de fin antes de que `executeCommand()` devuelva la identidad de ejecución, se conserva y se asocia al comando correcto.
- Nuevas pruebas para prompts, esperas de finalización, cola FIFO y finalización temprana. **Pendiente de validación automatizada y empaquetado** por indisponibilidad de una terminal de compilación confirmada libre.

## 0.10.25 — Ejecución aislada y protección frente a paginadores

- Nueva herramienta MCP `execute_isolated_command_code` para comandos no interactivos en un subproceso independiente de la terminal integrada. Usa el directorio de la sesión indicada, incluso si esa terminal está ocupada o protegida por timeout.
- La ejecución aislada desactiva los paginadores de Git (`GIT_PAGER=cat`, `PAGER=cat`), impide solicitudes interactivas de Git (`GIT_TERMINAL_PROMPT=0`) y emplea entrada estándar cerrada. No envía `q` ni `Ctrl+C` a la terminal de usuario.
- Timeout y cancelación intentan terminar el árbol de procesos aislado; si no se confirma su terminación se devuelve un error. La salida está limitada a 1 MB, mantiene información de truncamiento y respeta caracteres UTF-8.
- Añadido `.gitattributes` para normalizar los archivos de texto a LF y eliminar los avisos de Git sobre conversiones LF/CRLF, sin modificar la configuración global del usuario.
- Pruebas de regresión para salida, ruta de trabajo, variables antipaginación, cancelación, timeout y truncamiento. **53/53 suites**, compilación TypeScript, ESLint sin advertencias y empaquetado VSIX de 23 archivos superados.
- La terminal integrada mantiene su ruta anterior y sus protecciones; no se altera de forma automática ningún comando compuesto o de procedencia desconocida.

## 0.10.24 — Salida interactiva basada en señales y drenaje limitado

- La salida automática ya no envía `q` por recibir cualquier texto. Para `more`, `less`, `man` y `top` exige indicios de paginación o pantalla interactiva; en `htop` y nuevos monitores exige entrada a la pantalla alternativa.
- Se descartan las opciones no interactivas de ayuda, versión, lotes, consultas de `man`, entre otras (`top -bn1`, `less --help`, `more /?`).
- Añadidos a la lista blanca condicional `btop`, `bpytop`, `nvtop`, `iftop`, `iotop` y `tig`. Sin señal de pantalla completa no se envía ninguna tecla. La compatibilidad real en Linux sigue pendiente de prueba.
- Eliminado el envío de `q` diferido 120 ms que podía ejecutarse después de que el programa saliera.
- Cuando VS Code confirma la finalización y el iterador de salida permanece abierto, se espera un máximo adicional de 750 ms. Si sigue abierto se libera la cola y se marca `output_incomplete=true` y `truncated=true`, sin dar por finalizado un proceso que no haya notificado su salida.
- Nueva batería específica de opciones, salidas simuladas y flujos retenidos: **51/51 suites**, seis repeticiones adicionales de la prueba interactiva, lint y empaquetado VSIX verificados. El riesgo de una notificación de finalización tardía no puede eliminarse completamente sin soporte adicional de VS Code.

## 0.10.23 — Creación desde el panel sin modal externo y empaquetado actualizado

- La creación de terminales de usuario iniciada mediante **Crear terminal** en el panel se autoriza dentro del propio formulario, sin abrir otro diálogo de Windows/VS Code.
- Cada autorización interna es temporal y de un solo uso; está vinculada al ID, al directorio canónico y al permiso de compartir carpeta. El endpoint HTTP no puede generar estas autorizaciones; las solicitudes remotas mantienen su confirmación en **Solicitudes**.
- Actualizado el empaquetador de `@vscode/vsce` 3.9.2 a 4.1.0, con Node.js 22 o posterior para tareas de compilación.
- Añadida una suite de regresión para el servidor principal, una ventana trabajadora y las autorizaciones inválidas o falsificadas. **50 suites automatizadas**.
- Auditoría: dependencias de producción sin vulnerabilidades conocidas; algunas dependencias de desarrollo aún tienen avisos moderados de `minimatch` sin corrección compatible disponible según `npm audit`.

## 0.10.22 — Protección frente a carreras y procesos activos

- Se impide ejecutar una orden MCP en una terminal con una ejecución manual activa detectada mediante integración de shell; no se envía `Ctrl+C`.
- La cancelación de órdenes en la cola FIFO mantiene cerrada la puerta a las siguientes hasta que todas las anteriores finalicen realmente.
- Un error de lectura de salida no libera la terminal mientras continúe activa; se exige la señal de finalización o confirmación manual.
- Las terminales de usuario restauradas deben tener un registro persistente de titularidad; los nombres y directorios de temporales no bastan para adoptarlas.
- Las solicitudes de creación canceladas durante autorización o persistencia se revierten; la creación de una temporal también se comprueba después de la respuesta del trabajador.
- Se añaden pruebas de regresión de carreras de ejecución y cancelación. **49/49 suites superadas**; ESLint, auditoría de dependencias y VSIX de 23 archivos verificados.

## 0.10.21 — Recuperación automática más frecuente e iconos diferenciados

- **Reactiva MCP sin confirmación** cuando una terminal restaurada coincide con una prueba reciente de inactividad, su PID y su directorio, y no hay ejecuciones activas conocidas.
- La prueba de inactividad se actualiza tras eventos de ejecución y cada 15 segundos, además de guardarse al desactivar la extensión. Esto reduce los casos en los que Reload Window no llega a guardar el estado.
- La salida automática de paginadores utiliza un icono de **salida** y la recuperación MCP un icono de **escudo**.
- Se mantiene la confirmación manual en situaciones ambiguas, con procesos activos o sin una finalización verificable; nunca se envían comandos de sondeo.
- Compilación, pruebas y empaquetado finalizados: **48/48 suites**, ESLint y auditoría de producción superadas; VSIX de 23 archivos verificado.

## 0.10.20 — Recarga sin principales duplicadas y panel simplificado

- Los menús contextuales de las terminales se sitúan por encima de las acciones de filas posteriores.
- Eliminado el selector manual de idioma del panel: se utiliza el idioma de VS Code si es español y, en otro caso, inglés.
- Tras **Reload Window** se registra solo una principal por ventana y se prioriza el ID guardado. La principal original que reaparece tarde sustituye a la temporal de arranque únicamente si esta no se ha utilizado; los procesos que puedan seguir activos no se cierran.
- Se conserva evidencia de inactividad cuando termina una sesión limpia y se utiliza para reactivar automáticamente terminales restauradas con el mismo PID y directorio. Si la identidad o el estado es ambiguo, se mantiene la confirmación manual.
- Añadidas y actualizadas pruebas de recuperación y del panel. **48 suites definidas; no verificadas todavía en conjunto**. No se reinstaló la extensión ni se reinició el túnel.

## 0.10.19 — Recuperación automática segura de terminales restauradas

- Las terminales principales y de usuario restauradas se desbloquean automáticamente cuando VS Code notifica una finalización de comando inequívoca mediante la integración de shell, siempre que no haya otras ejecuciones observadas todavía activas.
- Se conservan las protecciones ante eventos ambiguos, ausencia de integración, terminales ajenas y falta de pruebas de inactividad. No se ejecutan comandos de sondeo que podrían interrumpir procesos.
- Añadida una suite de pruebas para finalizaciones durante y después de la restauración: 45 suites automatizadas en total. La confirmación manual sigue disponible si no hay evidencia suficiente.

## 0.10.18 — Herencia de preferencias para terminales temporales

- Las terminales temporales creadas por MCP heredan la preferencia de salida automática de su ventana y no las excepciones de la terminal solicitante.
- Los cambios de ventana afectan a las terminales que no tienen una excepción propia, incluidas las temporales existentes. Las excepciones individuales tienen prioridad.
- Reutilizar un ID de terminal temporal descarta cualquier excepción persistida de una sesión anterior.
- Nueva suite de regresión que comprueba ventanas independientes, cambios dinámicos, excepciones y reutilización de ID: **44 suites automatizadas**.

## 0.10.17 — Salida automática por terminal y bandeja de solicitudes

- Añadida la configuración global `multi-shell-mcp.interactiveAutoExit` (activada por defecto), con interruptor por ventana y excepciones por terminal desde el panel.
- Reconocimiento conservador de comandos independientes `less`, `more`, `top`, `htop` y `man`: intenta enviar `q` únicamente tras recibir salida y mientras la ejecución siga activa; evita intervenir en tuberías, órdenes compuestas o procesos desconocidos.
- Las peticiones de creación de terminales persistentes de la IA pasan a una cola **Solicitudes** en la ventana propietaria, con botones para autorizar o rechazar, caducidad y limpieza en caso de desconexión.
- La aprobación solo puede hacerse desde el panel local, no mediante herramientas MCP ni el endpoint interno.
- Dos suites nuevas de pruebas; 43 suites automatizadas en total. No cambia la configuración del túnel.

## 0.10.16 — Terminales de usuario autorizadas y multitarea

- Nueva herramienta MCP `create_user_shell_code`: la IA puede solicitar una terminal de usuario persistente solo cuando la persona lo haya pedido; la creación exige confirmación modal en VS Code con ID, directorio y riesgo de compartir carpeta. La creación desde el panel también exige la misma aprobación, incluso si se intenta acceder directamente a la API interna. Rechazo, cancelación o caducidad impiden la creación.
- `create_shell_code` permanece reservado a terminales temporales con `origin=mcp` y no puede elevarse a `origin=user` por parámetros extra.
- El cierre MCP de terminales de usuario requiere confirmación; el cierre desde el panel conserva su confirmación existente.
- Se persisten las terminales creadas bajo aprobación incluso con el panel cerrado. Serialización de guardados simultáneos de sesiones, alias y eliminaciones.
- Pruebas de ejecución paralela en terminales de usuario distintas, FIFO dentro de cada terminal y reconexión tras la recarga sin duplicados.
- Tres suites de regresión nuevas; total 40 suites. Sin cambios en el túnel ni en su protocolo.

## 0.10.15 — Recuperación de conexiones y protección de la terminal principal

- Los timeouts de terminales principales automáticas conservan el proceso y bloquean nuevas órdenes hasta terminar, evitando cierres destructivos y comandos solapados.
- Si Shell Integration no está disponible y el comando no se inició, el timeout permite reintentar sin destruir ni bloquear la terminal.
- El listener HTTP mantiene un manejador permanente de errores y publica su estado de salud.
- El heartbeat detecta el cierre inesperado del hub, libera sus recursos y ejecuta una elección de coordinador controlada.
- El worker de cada ventana gestiona errores de su listener y puede recuperar su puerto efímero sin duplicar terminales.
- Se bloquean operaciones sobre los archivos de una ventana detectada como desconectada; la verificación o registro posterior restablece el acceso.
- Cobertura ampliada a 37 suites automatizadas; el protocolo, los puertos configurados y el cliente de túnel permanecen intactos.

## 0.10.14 — Arranque transaccional, reconciliación y protección de archivos

- Si falla la persistencia del ID principal después del arranque, se libera el servidor y se conserva la terminal para permitir reintentar sin recursos huérfanos.
- La reconciliación prepara y valida las asignaciones antes de publicarlas; si falla un cambio de alias posterior, intenta revertir los cambios de alias ya enviados y notifica errores de reversión.
- Se serializan las operaciones de modificación sobre rutas compartidas y se publican sustituciones completas desde archivos temporales.
- Creaciones y copias sin sobrescritura publicadas con un enlace exclusivo; movimientos/renombrados de archivos normales protegidos contra destinos creados simultáneamente.
- Añadidas tres suites de regresión (35 en total) para arranque tras fallo de almacenamiento, reconciliación parcial y operaciones destructivas simultáneas.
- Sin cambios en el perfil, credenciales, URL, protocolo ni ejecutable de Tunnel Client.

## 0.10.13 — Aislamiento, reinicios y lectura de archivos

- Una creación de terminal no puede utilizar un ID reservado por un cambio de alias todavía pendiente.
- La restauración de terminales principales rechaza directorios ajenos, duplicados físicos e identidades sin pruebas suficientes de pertenencia.
- El apagado espera los heartbeats pendientes y evita reelegir el coordinador después de detenerlo.
- Las ventanas sin respuesta se identifican como desconectadas hasta que se recupera la comunicación.
- Los cambios de configuración rápidos ya no se pierden durante un reinicio; el rollback respeta peticiones posteriores.
- Validación HTTP de Host además de Origin, manteniendo el contrato local de Tunnel Client 0.0.18.
- Lecturas UTF-8 por rangos con streaming y comprobación previa de tamaño de respuestas base64.
- Corregidos caracteres españoles mal codificados en el panel.
- 32 suites automatizadas, incluyendo nuevas pruebas de aislamiento, ciclo de vida y lectura incremental.

## 0.10.12 — Robustez de sesiones y alias

- Persistencia correcta del alias ante fallos de escritura y serialización de cambios simultáneos sobre una terminal.
- Validación previa del inventario de terminales de cada ventana para evitar reconciliaciones parciales ante IDs repetidos o conflictivos.
- Recuperación manual de terminales de usuario bloqueadas tras un timeout cuando VS Code omite el evento de finalización. Se exige confirmar que el proceso ha terminado; no se mata el proceso.
- Tres suites de regresión nuevas (29 en total), sin modificar la URL, el perfil o la autenticación del túnel.

## 0.10.11 — Seguridad, recuperación y compatibilidad con el túnel

- Permisos de lectura y edición MCP independientes; los errores de archivos se comunican con `isError`.
- Cancelación HTTP propagada a los comandos MCP en cola, preservando los procesos de usuario ya iniciados.
- Filtrado de `Origin` sin cambiar la URL ni el perfil sin OAuth de Tunnel Client 0.0.18.
- Limpieza de coordinadores parcialmente iniciados, protección del cierre de la principal y confirmación de principales restauradas.
- Reserva de alias durante cambios simultáneos y persistencia de alias modificados desde MCP.
- Recarga de permisos en caliente con rollback; panel con actualización periódica solo si cambia el estado.
- Versión del servidor sincronizada con el paquete, 26 suites de prueba y lint estricto de la interfaz.
- Distribución externa del túnel excluida de Git y del instalador VSIX; sin cambios en sus credenciales o perfil.

## 0.10.10 — Reparación del botón Cerrar terminal

- Sustituye la confirmación del webview mediante window.confirm por un diálogo modal nativo de VSCode.
- Cerrar desde el icono o el menú envía la solicitud al host, que dispone la terminal real tras confirmación.
- Cancelar no cierra ni elimina la terminal y libera el estado de cierre pendiente.
- Pruebas de cancelación, cierre, protección de la principal y vinculación de la interfaz.

## 0.10.9 — Recuperación tras Reload Window sin cwd

- Las terminales del usuario con ID y cwd guardados en el estado del proyecto se reconectan aunque VSCode pierda `creationOptions.cwd` al restaurarlas.
- Si VSCode conserva un cwd que no coincide con el guardado, se rechaza la asociación. Las sesiones sin identidad guardada siguen necesitando un cwd verificable dentro del proyecto.
- No se adopta ninguna terminal si aparecen identificadores físicos duplicados.
- Pruebas de regresión sobre recarga con metadatos incompletos, aislamiento, confirmación de terminal disponible y coordinador.

## 0.10.8 — Reconexión y protección de terminales de usuario

- Reasociación segura de terminales creadas desde el panel al recargar VSCode, conservando identificador, directorio y alias.
- Migración de terminales `MCP [id]` antiguas solo cuando pertenecen al mismo proyecto; protección contra adopciones ajenas y duplicados.
- Confirmación explícita de terminal disponible antes de reactivar los comandos MCP tras una recarga, para proteger trabajos prolongados.
- Limpieza del registro persistente al cerrar voluntariamente la terminal, sin recrearla.
- Nuevas pruebas de recuperación del gestor, del coordinador y del panel.

### Protección frente a tiempos de espera

- Clasificación explícita de terminales por origen: `user`, `mcp`, `automatic`.
- Las terminales auxiliares creadas desde el panel conservan sus procesos si un comando MCP agota el tiempo; el error no cierra la terminal.
- Mientras el proceso sigue activo se rechazan nuevas órdenes y se cancelan órdenes pendientes, sin romper la cola FIFO ni provocar ejecuciones solapadas.
- Recuperación automática de la disponibilidad cuando termina la ejecución real; cierre tradicional para terminales MCP/automáticas.
- Indicador de origen y de timeout conservado en el panel bilingüe.
- Pruebas de preservación, aislamiento y reanudación.

## 0.10.6 — Limpieza y distribución portable

- Eliminada una importación sin uso detectada por TypeScript.
- Eliminados los metadatos que presentaban erróneamente el repositorio original como repositorio del proyecto derivado; se mantiene el crédito MIT en el README y la licencia.
- Retirada la documentación exclusivamente de desarrollo del instalador VSIX, conservándola en el proyecto fuente.
- Añadida una guía de instalación portable y un empaquetador por lista blanca para transferir el proyecto con su VSIX, archivos fuente, pruebas y scripts, sin node_modules ni datos locales.
- Actualizadas las instrucciones y las comprobaciones de portabilidad.

## 0.10.5 — Workspace Trust

- Inhabilita explícitamente la extensión en Restricted Mode mediante `capabilities.untrustedWorkspaces.supported=false`.
- Añade un guardia adicional en el arranque automático y manual para impedir activar el servidor MCP en proyectos no confiables, incluso si el usuario anula la restricción de VSCode para la extensión.
- Incorpora pruebas automatizadas de bloqueo y de arranque al conceder confianza.

## 0.10.4 — Recuperación de terminales restauradas

- Reconoce las terminales principales MCP restauradas por VSCode en el proyecto de cada ventana y evita crear una principal duplicada.
- Conserva el identificador de la terminal principal entre reinicios, con prioridad para el ID recordado y selección de la primera restaurada si todavía no existe un registro previo.
- Recupera las otras terminales principales antiguas como shells independientes, sin cerrarlas automáticamente.
- Protege las terminales normales y las de otros proyectos; espera brevemente por terminales restauradas con retraso.
- No destruye las terminales al recargar la extensión ni al cambiar de puerto; el apagado explícito mantiene el cierre habitual.
- Añade pruebas de recuperación, ejecución sobre sesiones restauradas, cierre seguro y ausencia de duplicados.

## 0.10.3 — Etiqueta y nombre de la extensión

- El indicador inferior incluye el nombre: `MultiShell MCP: ON · <puerto>` en verde o `MultiShell MCP: OFF` en amarillo.
- Conserva su acción de inicio/parada, sin cambios en el panel ni en la configuración.

## 0.10.2 — Puerto MCP configurable desde el panel

- Edita el puerto compartido desde MultiShell MCP → Puerto MCP y aplica el cambio a todas las ventanas mediante los ajustes globales de VSCode.
- Reinicio automático de las instancias activas; si el nuevo puerto falla, se intenta restaurar el anterior.
- El estado inferior muestra ON · <puerto real> en verde, y OFF en amarillo cuando está detenido.
- Cambiar el puerto local no reconfigura los túneles externos.


## 0.10.1 — Indicador compacto

- La barra inferior muestra únicamente ON en verde o OFF en amarillo. Se conserva el clic para iniciar/detener y los detalles siguen en el panel lateral.

## 0.10.0 — Refuerzo en Windows y distribución autocontenida

- Recuperadas las herramientas nativas de diagnósticos, símbolos del proyecto y del documento, definiciones e información contextual, con destino explícito de terminal.
- Conservados parámetros compatibles (`symbol`, `maxDepth`, `severities`, `format`) y selectores heredados.
- Incorporadas pruebas de enrutamiento por ventana, límites de archivos, dos trabajadores, arranque, recuperación de alias y HTTP MCP.
- Distribución JavaScript autocontenida, sin `node_modules` ni binarios nativos en el VSIX.
- Actualizada Zod a la versión 4 corregida, con cero vulnerabilidades conocidas de producción en la validación.
- Añadidos comandos reproducibles de validación para Windows y una lista de comprobación tras recargas.

## 0.9.1 — Rutas relativas, ciclo de terminales e icono nuevo

- Las rutas relativas se resuelven desde el proyecto propietario en Windows y Linux.
- La limpieza del trabajador y del coordinador libera alias y registros tras cierres manuales.
- Botones del panel alineados a la derecha, con truncamiento de IDs largos.
- Acciones diferenciadas para copiar selector, copiar instrucciones y cerrar con protección.
- Icono original de dos terminales conectado a un coordinador.

## 0.9.0 — Alias cortos

- Alias numéricos o con nombres como selectores explícitos en herramientas y rutas heredadas.
- Alias generados desde el proyecto; colisiones resueltas mediante sufijos y rechazos adecuados.
- El panel muestra `shell=alias`, permite renombrar con un diálogo nativo y copiar instrucciones.
- El alias principal se conserva por proyecto; los alias sobreviven a cambios de coordinador.
- No existe una terminal activa global implícita: los IDs completos siguen siendo válidos.

## 0.8.1 — Limpieza del código fuente

- Eliminados módulos y pruebas obsoletos de archivos, edición, diagnósticos y símbolos.
- Conservadas las pruebas de integración HTTP y multiventana.
- Retiradas dependencias de desarrollo y opciones de configuración innecesarias.
- Las compilaciones limpian salidas generadas y excluyen pruebas y archivos de desarrollo del VSIX.
- Sin cambios intencionados en compatibilidad heredada, enrutamiento o interfaz bilingüe.

## 0.8.0 — Panel visual

- Panel adaptable en español e inglés, con pestañas de proyectos y ventanas, estado de terminales y acciones.

## 0.7.1 — Compatibilidad con conectores antiguos

- Selectores explícitos `@shell:<id>` y consultas de descubrimiento `@mcp` de solo lectura.

## 0.7.0 — Compatibilidad multiventana

- Una terminal principal por ventana, coordinación entre ventanas y un único puerto MCP público.