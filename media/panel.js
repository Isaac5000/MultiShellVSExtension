'use strict';
(() => {
  const vscode = acquireVsCodeApi();
  const es = {
    subtitle: 'Centro de control MCP',
    refresh: 'Actualizar',
    hub: 'Coordinador',
    worker: 'Trabajador',
    offline: 'Desconectado',
    online: 'En línea',
    start: 'Iniciar',
    stop: 'Detener',
    connected: 'Conectado',
    currentWindow: 'VENTANA ACTUAL',
    windowIdShort: 'ID DE VENTANA',
    workspace: 'Proyecto',
    copyWindow: 'Copiar ID de ventana',
    shells: 'Terminales',
    shellsLabel: 'SESIONES',
    connectedWindows: 'Ventanas',
    windowsHelp: 'Conectadas al mismo servidor MCP',
    new: 'Nueva',
    createTitle: 'Nueva terminal',
    identifier: 'IDENTIFICADOR',
    directory: 'DIRECTORIO DE TRABAJO',
    directoryPlaceholder: 'Ej.: src, ../otro-proyecto o C:\\ruta',
    directoryHelp: 'Se aceptan rutas relativas al proyecto de esta ventana o rutas absolutas. En blanco usa la raíz del proyecto.',
    allowShare:
      'Compartir directorio con otra terminal (puede provocar conflictos)',
    cancel: 'Cancelar',
    create: 'Crear terminal',
    search: 'Filtrar terminales…',
    noShells: 'No hay terminales',
    noShellsHelp: 'Inicia el servidor para crear tu primera terminal.',
    noResults: 'Sin coincidencias',
    noResultsHelp: 'Prueba con otro identificador.',
    noWindows: 'No hay ventanas conectadas',
    primaryTag: 'Principal',
    primaryLabel: 'Terminal principal',
    originUser: 'Usuario',
    originMcp: 'MCP',
    originAutomatic: 'Automática',
    timedOutRunning: 'Tiempo agotado · proceso conservado',
    backgroundRunning: 'Procesos aislados activos',
    backgroundCancelling: 'Cancelando proceso aislado',
    backgroundCancel: 'Cancelar proceso aislado',
    backgroundFailed: 'Último trabajo aislado falló',
    recoveredShell: 'Recuperada · verificando disponibilidad',
    restoredUnverified: 'Restaurada · verificación automática pendiente',
    ambiguousCompletion: 'Finalización no confirmada · verificación automática',
    unverifiedExecution: 'Comprobando el estado real de la terminal',
    externalBusy: 'Ocupada · comando externo a MCP',
    integrationPending: 'Esperando integración de terminal (orden aún no iniciada)',
    completionPending: 'Salida finalizada · esperando confirmación de VS Code',
    outputReadFailed: 'Error de lectura · esperando finalización confirmada',
    outputDraining: 'Orden terminada · recogiendo salida',
    possiblePager: 'Posible paginador esperando entrada',
    possibleConfirmation: 'Posible confirmación pendiente',
    possibleCredentials: 'Posible solicitud de credenciales',
    possibleContinuation: 'Posible comando incompleto (>>); revisa comillas y escapes, sin interrupción automática',
    possibleSilentWait: 'Sin salida reciente · podría estar trabajando o esperando entrada',
    enableRestored: 'Comprobar disponibilidad',
    restoredReady: 'Terminal restaurada y disponible',
    queued: 'En cola',
    busy: 'Ocupada',
    idle: 'Disponible',
    show: 'Abrir terminal',
    copy: 'Copiar identificador',
    copied: 'Copiado al portapapeles',
    copyInstruction: 'Copiar instrucción corta para ChatGPT',
    editAlias: 'Cambiar alias',
    aliasSaved: 'Alias actualizado',
    copySelector: 'Copiar shell=alias',
    close: 'Cerrar terminal',
    confirmClose:
      '¿Cerrar esta terminal? Se interrumpirán los comandos que siga ejecutando.',
    created: 'Terminal creada',
    closed: 'Terminal cerrada',
    closeCancelled: 'Cierre cancelado',
    you: 'ESTA VENTANA',
    local: 'Actual',
    language: 'IDIOMA',
    auto: 'Automático (VSCode)',
    usageTitle: 'Cómo vincular un chat',
    isolation:
      'Usa el alias visible en cada terminal. En ChatGPT basta escribir «shell=1: ejecuta ls» o «shell=minecraft: compila». Las operaciones siguen identificando el shell explícitamente; no se comparte una selección global entre chats.',
    error: 'Error',
    notAvailable: 'No disponible',
    sessions: 'sesiones',
    copyId: 'Copiar ID',
    more: 'Más acciones',
    project: 'Proyecto',
    noProject: 'Sin proyecto',
    portLabel: 'PUERTO MCP',
    savePort: 'Aplicar',
    portHelp: 'Compartido entre ventanas. Al cambiarlo se reinicia MCP y se sincroniza el perfil gestionado si el túnel está detenido. Los perfiles importados no se modifican.',
    portSaved: 'Configuración guardada. Se está aplicando el nuevo puerto.',
    invalidPort: 'El puerto debe estar entre 1024 y 65535.',
    commandLine: 'MCP · puerto',
    windowOffline: 'Inicia MultiShell MCP en esta ventana',
    countOne: 'terminal',
    countMany: 'terminales',
    requests: 'Solicitudes',
    skills: 'Skills',
    windowSkills: 'SKILLS DE ESTA VENTANA',
    skillsHelp: 'Pulsa una skill para ver su descripción. Copia la instrucción desde el botón de su derecha.',
    searchSkills: 'Buscar por nombre o descripción…',
    refreshSkills: 'Volver a detectar skills',
    skillScope: 'Mostrar',
    allSkills: 'Todas las autorizadas',
    personalSkills: 'Personales',
    skillSettings: 'Configurar acceso a skills personales',
    skillsLocal: 'Proyecto: .agents/skills, .github/skills y .claude/skills.',
    skillsGlobal: 'Incluye las skills personales autorizadas de .agents y .codex.',
    skillsPrivate: 'Las skills personales no están autorizadas para MCP.',
    skillsUnavailable: 'Abre un proyecto de confianza y habilita la lectura de archivos.',
    skillsLoading: 'Buscando skills…',
    skillsEmpty: 'No hay skills que coincidan. Comprueba las carpetas indicadas o cambia la búsqueda.',
    skillsFound: 'skills mostradas',
    skillsTimeout: 'La búsqueda no ha respondido. Pulsa volver a detectar para reintentar.',
    moreSkills: 'Mostrar más skills',
    useSkill: 'Copiar para ChatGPT',
    skillPreferred: 'Quitar de preferidas',
    skillUnpreferred: 'Marcar como preferida',
    skillDetails: 'Descripción',
    skillCopied: 'Instrucción copiada. Pégala en tu chat con MultiShell MCP.',
    skillStart: 'Inicia MultiShell MCP para copiar la instrucción.',
    pendingRequests: 'SOLICITUDES PENDIENTES',
    requestsHelp: 'La IA no puede autorizar su propia solicitud',
    noRequests: 'No hay solicitudes pendientes',
    approveRequest: 'Autorizar creación',
    rejectRequest: 'Rechazar',
    requestExpires: 'Caduca',
    windowInteractive: 'Salir automáticamente de comandos interactivos en esta ventana',
    windowInteractiveHelp: 'Activado por defecto. Solo programas conocidos; cada terminal puede tener una excepción.',
    enableAutoExit: 'Activar salida automática',
    disableAutoExit: 'Desactivar salida automática',
    inheritAutoExit: 'Utilizar ajuste de ventana',
    tunnelTab: 'Túnel',
    tunnelHeading: 'TÚNEL OPENAI',
    tunnelHelp: 'Conecta Tunnel Client aquí; para usarlo en ChatGPT también debes crear un complemento MCP en Plugins → +.',
    tunnelInstall: 'Verificar cliente',
    tunnelReuse: 'Usar perfil existente',
    tunnelId: 'IDENTIFICADOR DEL TÚNEL',
    tunnelProfile: 'NOMBRE DEL PERFIL NUEVO',
    tunnelKey: 'API KEY DE EJECUCIÓN DEL TÚNEL',
    tunnelKeyHelp: 'La clave se guarda en SecretStorage, nunca en el perfil, el panel ni los registros.',
    tunnelConfigure: 'Crear perfil',
    tunnelUpdateKey: 'Actualizar clave',
    tunnelStart: 'Conectar',
    tunnelStop: 'Desconectar',
    tunnelAutostart: 'Iniciar túnel automáticamente',
    tunnelAutostartHelp: 'Solo cuando el coordinador MCP esté activo. No se crea un túnel remoto nuevo.',
    tunnelUnavailable: 'Gestor no disponible',
    tunnelInstallRequired: 'El cliente integrado no se puede verificar: reinstala el VSIX',
    tunnelConfigRequired: 'Necesita configurar un perfil',
    tunnelConnected: 'Túnel preparado',
    tunnelStarting: 'Proceso iniciado · verificando conexión',
    tunnelExternalStatus: 'Puerto de salud ocupado por otro túnel',
    tunnelDetached: 'Proceso conservado tras recarga',
    tunnelAdopted: 'Túnel recuperado tras recarga',
    tunnelOffline: 'Desconectado',
    tunnelUntrusted: 'Confía en el proyecto para configurar o iniciar túneles.',
    tunnelHubRequired: 'Solo la ventana coordinadora puede iniciar el túnel.',
    tunnelProfileInfo: 'Perfil',
    tunnelVersionInfo: 'Versión',
    tunnelRetryPaused: 'Reintentos automáticos detenidos: requiere intervención manual.',
    tunnelKeyMissing: 'Introduce la API key.',
    tunnelInstalled: 'Cliente integrado verificado.',
    tunnelConfigured: 'Perfil creado correctamente.',
    tunnelKeyUpdated: 'Clave actualizada de forma segura.',
    tunnelStarted: 'Proceso del túnel iniciado.',
    tunnelStopped: 'Túnel gestionado detenido y arranque automático desactivado.',
    tunnelExternal: 'Otro proceso ocupa el puerto 8080; no se ha interrumpido.',
    tunnelAlreadyRunning: 'El túnel ya está en ejecución.',
    tunnelAutoOn: 'Arranque automático activado.',
    tunnelAutoOff: 'Arranque automático desactivado.',
    navTitle: 'MENÚ',
    navWorkspace: 'ÁREA DE TRABAJO',
    navAi: 'CONEXIONES IA',
    navAdministration: 'ADMINISTRACIÓN',
    overview: 'Resumen',
    overviewTitle: 'RESUMEN',
    overviewHelp: 'Servidor, actividad y ventana actual',
    overviewSecurity: 'Las terminales y solicitudes mantienen los permisos locales de VS Code.',
    settings: 'Configuración',
    settingsHelp: 'Ajustes del coordinador y de esta ventana',
    settingsSecurity: 'Los cambios del puerto pueden reiniciar MCP. Desconecta primero el túnel gestionado.',
    mcpConfiguration: 'CONFIGURACIÓN DEL SERVIDOR',
    aiConnections: 'Conexiones IA',
    connectionsHelp: 'Conexiones MCP y asistentes específicos por IA',
    connectionsSecurity: 'El acceso directo al puerto 3000 comparte permisos globales. Usa Acceso independiente para claves y permisos por IA. Las conexiones en nube todavía necesitan un túnel HTTPS autenticado.',
    chatgpt: 'ChatGPT / Tunnel Client',
    chatgptGuideTitle: '¿Cómo conectar ChatGPT mediante MCP?',
    chatgptGuideExplanation: 'Necesitas un Secure MCP Tunnel activo Y crear un complemento MCP personalizado en ChatGPT. El túnel por sí solo no crea el complemento.',
    chatgptGuidePlatformTitle: '1 · OPENAI PLATFORM',
    chatgptGuidePlatformTunnel: 'Crea o selecciona un túnel en Tunnels, copia su tunnel_id y asócialo al espacio de trabajo de ChatGPT donde crearás el complemento. Crear túneles requiere Tunnels Read + Manage.',
    chatgptGuidePlatformKey: 'Crea una API key de ejecución restringida con Tunnels Read + Use. Solo la utiliza Tunnel Client; no la pegues en el complemento de ChatGPT ni utilices una clave administrativa.',
    chatgptOpenTunnels: 'Administrar túneles en Platform',
    chatgptOpenRuntimeKeys: 'Crear clave de ejecución',
    chatgptGuideLocalTitle: '2 · MULTISHELL → TÚNEL OPENAI',
    chatgptGuideLocalSetup: 'Instala Tunnel Client desde el panel, introduce el tunnel_id y la clave de ejecución, crea el perfil y pulsa Conectar. El servidor MCP local también debe estar activo.',
    chatgptGuidePluginTitle: '3 · CHATGPT → PLUGINS → + → ADD CUSTOM MCP SERVER',
    chatgptGuidePluginOpen: 'En ChatGPT abre Plugins, pulsa + y selecciona Add custom MCP server. Tu cuenta o espacio de trabajo debe permitir crear complementos MCP.',
    chatgptGuidePluginFields: 'Nombre: MultiShell MCP (o el que prefieras). Descripción opcional. En Connection selecciona Tunnel y elige el túnel o pega exactamente el mismo tunnel_id.',
    chatgptGuidePluginAuth: 'Autenticación: la admitida por tu MCP. El servidor local actual de MultiShell no requiere OAuth; NO introduzcas aquí la API key de ejecución del túnel.',
    chatgptGuidePluginCreate: 'Revisa el aviso, marca I understand and want to continue, pulsa Create as a plugin y comprueba las herramientas detectadas. Después prueba el complemento en un chat.',
    chatgptOpenChat: 'Abrir ChatGPT',
    chatgptOpenMcpGuide: 'Guía oficial: complemento MCP',
    chatgptGuideWarning: 'Si no aparece el túnel, comprueba su asociación con tu espacio de trabajo y los permisos Tunnels Read + Use. No necesitas introducir localhost ni subir el ZIP del plugin local.',
    manage: 'Gestionar',
    newAiTitle: 'Nueva conexión IA',
    aiProvider: 'CLIENTE MCP',
    aiName: 'NOMBRE DEL PERFIL',
    aiNamePlaceholder: 'Ej.: Claude personal',
    aiFormHelp: 'Selecciona tu cliente. Después encontrarás instrucciones y opciones compatibles en su tarjeta.',
    providerVscode: 'VS Code / GitHub Copilot',
    providerClaude: 'Claude Code',
    providerGemini: 'Gemini CLI',
    providerCursor: 'Cursor',
    providerOther: 'Otro cliente MCP local',
    saveAi: 'Guardar perfil',
    localClients: 'CONEXIONES CONFIGURADAS',
    aiEmpty: 'No hay conexiones IA configuradas.',
    aiNotVerified: 'Configuración pendiente · no verificada',
    aiLocalReady: 'Servidor MCP local disponible',
    aiMcpOffline: 'Inicia MCP para copiar la configuración',
    aiCopy: 'Copiar configuración',
    aiDelete: 'Eliminar perfil',
    aiAdded: 'Perfil guardado. Sigue las instrucciones del cliente; la conexión aún no está verificada.',
    aiCopied: 'Configuración MCP copiada. Pégala en el cliente de IA correspondiente.',
    aiInstall: 'Configurar automáticamente',
    aiUninstall: 'Desvincular',
    aiOpenConfig: 'Ver archivo',
    aiCheck: 'Revisar estado',
    aiConfigured: 'Configurado en el cliente · conexión sin verificar',
    aiManaged: 'Configuración gestionada desde MultiShell',
    aiManual: 'Configuración personalizada',
    aiInstallPending: 'Requiere pasarela autenticada',
    aiInstalled: 'Configuración MCP aplicada. Abre o actualiza el cliente para que descubra las herramientas.',
    aiAlreadyInstalled: 'La configuración ya existe. No se han sobrescrito otros datos.',
    aiUninstalled: 'Entrada MCP retirada del archivo; se conservan los demás servidores.',
    aiChecked: 'Estado de la configuración actualizado. No verifica la sesión de IA.',
    aiConfigOpened: 'Archivo de configuración abierto.',
    aiStatusHelp: 'Configurar guarda los ajustes en el cliente; no inicia sesión en su cuenta ni garantiza que esté conectado.',
    aiRemotePending: 'Conector remoto pendiente: requiere HTTPS autenticado',
    aiLocalGroup: 'Local / Escritorio',
    aiRemoteGroup: 'Nube / API',
    aiRemoteOpen: 'Ver configuración oficial',
    aiProviderOpened: 'Se ha abierto la configuración oficial del proveedor.',
    aiRemoteWarning: 'No publiques 127.0.0.1:3000: antes se necesita una pasarela autenticada con permisos por IA.',
    aiOnboardingHelp: '¿Cómo conectarlo?',
    aiOnboardingSteps: 'PASOS PARA CONECTAR',
    aiOnboardingCommands: 'COMANDOS · COPIAR, NO EJECUTAR',
    aiOnboardingLinks: 'DOCUMENTACIÓN OFICIAL',
    aiOnboardingFields: 'DATOS DE CONEXIÓN',
    aiOnboardingSave: 'Guardar dato',
    aiOnboardingClear: 'Borrar dato',
    aiOnboardingStored: 'Guardado de forma segura (no se muestra)',
    aiOnboardingSavedNonSecret: 'Valor guardado',
    aiOnboardingManual: 'Guardar estos datos no activa automáticamente una conexión ni un túnel.',
    aiOnboardingUnusedKey: 'Esta conexión conserva una API key antigua que no utiliza para iniciar sesión. Puedes borrarla.',
    aiOnboardingDeleteOldKey: 'Borrar clave antigua',
    aiOnboardingWindows: 'Windows',
    aiOnboardingUnix: 'Linux / macOS',
    aiOnboardingAll: 'Todos los sistemas',
    aiGuideCommandCopied: 'Comando oficial copiado. Revísalo y ejecútalo tú; MultiShell no lo ha ejecutado.',
    aiGuideLinkOpened: 'Página oficial abierta.',
    aiProviderFieldSaved: 'Dato guardado. Las claves se almacenan en SecretStorage y no se aplican automáticamente.',
    aiProviderFieldCleared: 'Dato eliminado de esta conexión.',
    gatewayTitle: 'ACCESO INDEPENDIENTE · MCP',
    gatewayConfigure: 'Crear acceso aislado',
    gatewayStart: 'Activar pasarela',
    gatewayStop: 'Detener pasarela',
    gatewayCopyKey: 'Copiar clave privada',
    gatewayCopyUrl: 'Copiar URL local',
    gatewayRotate: 'Rotar clave',
    gatewayRevoke: 'Revocar',
    gatewayAutoOn: 'Arranque automático: ACTIVAR',
    gatewayAutoOff: 'Arranque automático: DESACTIVAR',
    aiGatewayAutoOn: 'Arranque local de esta conexión activado.',
    aiGatewayAutoOff: 'Arranque local de esta conexión desactivado.',
    gatewayShell: 'Terminal autorizada',
    gatewayLevel: 'Permisos',
    gatewayRead: 'Solo lectura',
    gatewayEdit: 'Lectura y edición',
    gatewayShellLevel: 'Lectura y comandos',
    gatewayFull: 'Lectura, edición y comandos',
    gatewayPending: 'Credencial independiente preparada · pasarela detenida',
    gatewayRunning: 'Pasarela autenticada activa (solo localhost)',
    gatewayNoShell: 'No hay terminales disponibles',
    gatewayHubOnly: 'Esta operación se realiza desde la ventana coordinadora.',
    gatewayReminder: 'La URL local NO sirve como conector de IA en la nube. No abrir puertos públicos.',
    aiGatewayConfigured: 'Permisos y clave individual configurados. La pasarela está detenida.',
    aiGatewayStarted: 'Pasarela MCP local iniciada y protegida con credencial individual.',
    aiGatewayStopped: 'Pasarela MCP detenida. Las demás conexiones no se han alterado.',
    aiGatewayKeyCopied: 'Clave privada copiada al portapapeles. Guárdala fuera del repositorio.',
    aiGatewayUrlCopied: 'URL MCP local copiada.',
    aiGatewayRotated: 'Clave anterior revocada. Pasarela detenida; copia la nueva clave antes de iniciar.',
    aiGatewayRevoked: 'Acceso individual y clave eliminados.',
    aiRemoved: 'Perfil eliminado; la configuración del cliente de IA no se ha modificado.',
    openAiAvailable: 'Puerto del túnel disponible; conexión remota no verificada.',
    openAiUnavailable: 'Configura o inicia el túnel OpenAI en su sección.'
  };
  const en = {
    subtitle: 'MCP control center',
    refresh: 'Refresh',
    hub: 'Hub',
    worker: 'Worker',
    offline: 'Disconnected',
    online: 'Online',
    start: 'Start',
    stop: 'Stop',
    connected: 'Connected',
    currentWindow: 'CURRENT WINDOW',
    windowIdShort: 'WINDOW ID',
    workspace: 'Workspace',
    copyWindow: 'Copy window ID',
    shells: 'Terminals',
    shellsLabel: 'SESSIONS',
    connectedWindows: 'Windows',
    windowsHelp: 'Connected to the same MCP server',
    new: 'New',
    createTitle: 'New terminal',
    identifier: 'IDENTIFIER',
    directory: 'WORKING DIRECTORY',
    directoryPlaceholder: 'e.g. src, ../another-project or /home/user/project',
    directoryHelp: 'Relative paths start at this VSCode workspace. Absolute paths are also valid. Blank uses the workspace root.',
    allowShare: 'Share a directory with another terminal (may cause conflicts)',
    cancel: 'Cancel',
    create: 'Create terminal',
    search: 'Filter terminals…',
    noShells: 'No terminals yet',
    noShellsHelp: 'Start the server to create your first terminal.',
    noResults: 'No matches',
    noResultsHelp: 'Try a different identifier.',
    noWindows: 'No connected windows',
    primaryTag: 'Primary',
    primaryLabel: 'Main terminal',
    originUser: 'User',
    originMcp: 'MCP',
    originAutomatic: 'Automatic',
    timedOutRunning: 'Timed out · process preserved',
    backgroundRunning: 'Background processes active',
    backgroundCancelling: 'Cancelling isolated process',
    backgroundCancel: 'Cancel isolated process',
    backgroundFailed: 'Last isolated job failed',
    recoveredShell: 'Restored · checking availability',
    restoredUnverified: 'Restored · automatic verification pending',
    ambiguousCompletion: 'Completion unverified · checking automatically',
    unverifiedExecution: 'Checking the actual terminal state',
    externalBusy: 'Busy · command outside MCP',
    integrationPending: 'Waiting for terminal integration (command not started)',
    completionPending: 'Output ended · waiting for VS Code completion event',
    outputReadFailed: 'Output read error · waiting for confirmed completion',
    outputDraining: 'Command ended · draining output',
    possiblePager: 'Possible pager awaiting input',
    possibleConfirmation: 'Possible confirmation prompt awaiting input',
    possibleCredentials: 'Possible credentials prompt awaiting input',
    possibleContinuation: 'Possible incomplete command (>>); check quotes and escapes, no automatic interruption',
    possibleSilentWait: 'No recent output · may be working or awaiting input',
    enableRestored: 'Check availability',
    restoredReady: 'Terminal restored and available',
    queued: 'Queued',
    busy: 'Busy',
    idle: 'Available',
    show: 'Open terminal',
    copy: 'Copy identifier',
    copied: 'Copied to clipboard',
    copyInstruction: 'Copy short ChatGPT instruction',
    editAlias: 'Change alias',
    aliasSaved: 'Alias updated',
    copySelector: 'Copy shell=alias',
    close: 'Close terminal',
    confirmClose:
      'Close this terminal? Any running commands will be interrupted.',
    created: 'Terminal created',
    closed: 'Terminal closed',
    closeCancelled: 'Close cancelled',
    you: 'THIS WINDOW',
    local: 'Current',
    language: 'LANGUAGE',
    auto: 'Automatic (VSCode)',
    usageTitle: 'How to connect a chat',
    isolation:
      'Use each terminal’s short alias. In ChatGPT, type “shell=1: run ls” or “shell=minecraft: build”. Operations explicitly select a shell; conversations do not share a global selection.',
    error: 'Error',
    notAvailable: 'Not available',
    sessions: 'sessions',
    copyId: 'Copy ID',
    more: 'More actions',
    project: 'Project',
    noProject: 'No workspace',
    portLabel: 'MCP PORT',
    savePort: 'Apply',
    portHelp: 'Shared across windows. Changes restart MCP and sync a stopped managed tunnel profile. Imported profiles are never modified.',
    portSaved: 'Setting saved. Applying the new port.',
    invalidPort: 'Port must be between 1024 and 65535.',
    commandLine: 'MCP · port',
    windowOffline: 'Start MultiShell MCP in this window',
    countOne: 'terminal',
    countMany: 'terminals',
    requests: 'Requests',
    skills: 'Skills',
    windowSkills: 'SKILLS IN THIS WINDOW',
    skillsHelp: 'Select a skill to expand its description. Copy the instruction using the button on its right.',
    searchSkills: 'Search by name or description…',
    refreshSkills: 'Detect skills again',
    skillScope: 'Show',
    allSkills: 'All authorized',
    personalSkills: 'Personal',
    skillSettings: 'Configure personal skill access',
    skillsLocal: 'Workspace: .agents/skills, .github/skills and .claude/skills.',
    skillsGlobal: 'Includes authorized personal skills from .agents and .codex.',
    skillsPrivate: 'Personal skills are not authorized for MCP.',
    skillsUnavailable: 'Open a trusted workspace and enable file reading.',
    skillsLoading: 'Finding skills…',
    skillsEmpty: 'No matching skills. Check the listed folders or change your search.',
    skillsFound: 'skills shown',
    skillsTimeout: 'Search did not respond. Use detect again to retry.',
    moreSkills: 'Show more skills',
    useSkill: 'Copy for ChatGPT',
    skillPreferred: 'Remove from preferred',
    skillUnpreferred: 'Mark as preferred',
    skillDetails: 'Description',
    skillCopied: 'Instruction copied. Paste it into your chat with MultiShell MCP.',
    skillStart: 'Start MultiShell MCP to copy the instruction.',
    pendingRequests: 'PENDING REQUESTS',
    requestsHelp: 'The AI cannot approve its own request',
    noRequests: 'No pending requests',
    approveRequest: 'Approve creation',
    rejectRequest: 'Deny',
    requestExpires: 'Expires',
    windowInteractive: 'Automatically exit interactive commands in this window',
    windowInteractiveHelp: 'Enabled by default. Only known programs; each terminal can override it.',
    enableAutoExit: 'Enable automatic exit',
    disableAutoExit: 'Disable automatic exit',
    inheritAutoExit: 'Use window setting',
    tunnelTab: 'Tunnel',
    tunnelHeading: 'OPENAI TUNNEL',
    tunnelHelp: 'Connect Tunnel Client here; to use it in ChatGPT, also create a custom MCP plugin under Plugins → +.',
    tunnelInstall: 'Verify client',
    tunnelReuse: 'Reuse existing profile',
    tunnelId: 'TUNNEL IDENTIFIER',
    tunnelProfile: 'NEW PROFILE NAME',
    tunnelKey: 'TUNNEL RUNTIME API KEY',
    tunnelKeyHelp: 'The key is saved in SecretStorage, never in the profile, panel state or logs.',
    tunnelConfigure: 'Create profile',
    tunnelUpdateKey: 'Update key',
    tunnelStart: 'Connect',
    tunnelStop: 'Disconnect',
    tunnelAutostart: 'Start tunnel automatically',
    tunnelAutostartHelp: 'Only while the MCP hub is active. Does not create a remote tunnel.',
    tunnelUnavailable: 'Manager unavailable',
    tunnelInstallRequired: 'Bundled client verification failed: reinstall the VSIX',
    tunnelConfigRequired: 'Profile configuration required',
    tunnelConnected: 'Tunnel ready',
    tunnelStarting: 'Process started · verifying connection',
    tunnelExternalStatus: 'Health port in use by another tunnel',
    tunnelDetached: 'Process preserved after reload',
    tunnelAdopted: 'Tunnel reattached after reload',
    tunnelOffline: 'Disconnected',
    tunnelUntrusted: 'Trust this workspace to configure or start tunnels.',
    tunnelHubRequired: 'Only the hub window may start the tunnel.',
    tunnelProfileInfo: 'Profile',
    tunnelVersionInfo: 'Version',
    tunnelRetryPaused: 'Automatic retries paused; manual intervention required.',
    tunnelKeyMissing: 'Enter the API key.',
    tunnelInstalled: 'Bundled client verified.',
    tunnelConfigured: 'Profile created successfully.',
    tunnelKeyUpdated: 'Key updated securely.',
    tunnelStarted: 'Tunnel process started.',
    tunnelStopped: 'Managed tunnel stopped and autostart disabled.',
    tunnelExternal: 'Another process occupies port 8080; it was not interrupted.',
    tunnelAlreadyRunning: 'Tunnel is already running.',
    tunnelAutoOn: 'Autostart enabled.',
    tunnelAutoOff: 'Autostart disabled.',
    navTitle: 'MENU',
    navWorkspace: 'WORKSPACE',
    navAi: 'AI CONNECTIONS',
    navAdministration: 'ADMINISTRATION',
    overview: 'Overview',
    overviewTitle: 'OVERVIEW',
    overviewHelp: 'Server, activity and current window',
    overviewSecurity: 'Terminals and requests retain local VS Code authorization checks.',
    settings: 'Settings',
    settingsHelp: 'Coordinator and window settings',
    settingsSecurity: 'Changing the port can restart MCP. Disconnect your managed tunnel first.',
    mcpConfiguration: 'SERVER SETTINGS',
    aiConnections: 'AI connections',
    connectionsHelp: 'MCP clients and per-provider setup guides',
    connectionsSecurity: 'Direct clients on port 3000 share global permissions. Use Independent MCP Access for per-AI keys and permissions. Cloud profiles still need authenticated HTTPS transport.',
    chatgpt: 'ChatGPT / Tunnel Client',
    chatgptGuideTitle: 'How to connect ChatGPT using MCP',
    chatgptGuideExplanation: 'You need both an active Secure MCP Tunnel AND a custom MCP plugin created in ChatGPT. Starting the tunnel does not create the plugin.',
    chatgptGuidePlatformTitle: '1 · OPENAI PLATFORM',
    chatgptGuidePlatformTunnel: 'Create or choose a tunnel under Tunnels, copy its tunnel_id and associate it with the ChatGPT workspace in which you will create the plugin. Creating tunnels requires Tunnels Read + Manage.',
    chatgptGuidePlatformKey: 'Create a restricted runtime API key with Tunnels Read + Use. Only Tunnel Client uses it; do not enter it in the ChatGPT plugin or use an admin key.',
    chatgptOpenTunnels: 'Manage Platform tunnels',
    chatgptOpenRuntimeKeys: 'Create runtime API key',
    chatgptGuideLocalTitle: '2 · MULTISHELL → OPENAI TUNNEL',
    chatgptGuideLocalSetup: 'Install Tunnel Client from the panel, enter the tunnel_id and runtime API key, create the profile and select Connect. The local MCP server must also be running.',
    chatgptGuidePluginTitle: '3 · CHATGPT → PLUGINS → + → ADD CUSTOM MCP SERVER',
    chatgptGuidePluginOpen: 'Open ChatGPT Plugins, select + then Add custom MCP server. Account or workspace permission to create MCP plugins is required.',
    chatgptGuidePluginFields: 'Name: MultiShell MCP (or your preferred name). Optional description. Under Connection choose Tunnel and select the tunnel or enter the same tunnel_id.',
    chatgptGuidePluginAuth: 'Authentication: choose what the MCP server supports. Current local MultiShell MCP does not require OAuth; do NOT enter the tunnel runtime API key here.',
    chatgptGuidePluginCreate: 'Review the risk warning, check I understand and want to continue, select Create as a plugin and inspect discovered tools. Then test the plugin in a chat.',
    chatgptOpenChat: 'Open ChatGPT',
    chatgptOpenMcpGuide: 'Official MCP plugin guide',
    chatgptGuideWarning: 'If the tunnel is not listed, verify workspace association and Tunnels Read + Use permissions. No localhost URL or local plugin ZIP is needed.',
    manage: 'Manage',
    newAiTitle: 'New AI connection',
    aiProvider: 'MCP CLIENT',
    aiName: 'PROFILE NAME',
    aiNamePlaceholder: 'e.g. Personal Claude',
    aiFormHelp: 'Choose a client to see tailored connection instructions and compatible options in its card.',
    providerVscode: 'VS Code / GitHub Copilot',
    providerClaude: 'Claude Code',
    providerGemini: 'Gemini CLI',
    providerCursor: 'Cursor',
    providerOther: 'Other local MCP client',
    saveAi: 'Save profile',
    localClients: 'SAVED CONNECTIONS',
    aiEmpty: 'No AI connections configured yet.',
    aiNotVerified: 'Setup pending · not verified',
    aiLocalReady: 'Local MCP server is available',
    aiMcpOffline: 'Start MCP before copying configuration',
    aiCopy: 'Copy configuration',
    aiDelete: 'Remove profile',
    aiAdded: 'Profile saved. Follow client setup instructions; connectivity is not yet verified.',
    aiCopied: 'MCP configuration copied. Paste it in the selected AI client.',
    aiInstall: 'Configure automatically',
    aiUninstall: 'Disconnect',
    aiOpenConfig: 'View file',
    aiCheck: 'Refresh status',
    aiConfigured: 'Configured in client · connection unverified',
    aiManaged: 'Configuration managed by MultiShell',
    aiManual: 'Custom client configuration',
    aiInstallPending: 'Authenticated gateway required',
    aiInstalled: 'MCP configuration saved. Open or refresh the client to discover its tools.',
    aiAlreadyInstalled: 'Configuration already present. No other settings were overwritten.',
    aiUninstalled: 'MCP entry removed; other servers were preserved.',
    aiChecked: 'Configuration status refreshed. Does not verify the live AI session.',
    aiConfigOpened: 'Configuration file opened.',
    aiStatusHelp: 'Configuring updates the client settings; it does not sign into the AI account or prove a live connection.',
    aiRemotePending: 'Remote connector pending: authenticated HTTPS gateway required',
    aiLocalGroup: 'Local / Desktop',
    aiRemoteGroup: 'Cloud / API',
    aiRemoteOpen: 'Official setup',
    aiProviderOpened: 'Opened the provider official setup page.',
    aiRemoteWarning: 'Never publish 127.0.0.1:3000: an authenticated gateway with per-AI authorization is required first.',
    aiOnboardingHelp: 'How to connect',
    aiOnboardingSteps: 'SETUP STEPS',
    aiOnboardingCommands: 'COMMANDS · COPY, DO NOT EXECUTE',
    aiOnboardingLinks: 'OFFICIAL DOCUMENTATION',
    aiOnboardingFields: 'CONNECTION DETAILS',
    aiOnboardingSave: 'Save field',
    aiOnboardingClear: 'Clear field',
    aiOnboardingStored: 'Stored securely (not displayed)',
    aiOnboardingSavedNonSecret: 'Saved value',
    aiOnboardingManual: 'Saving these details does not activate a connection or tunnel.',
    aiOnboardingUnusedKey: 'An unused API key from an older version is still stored for this client. You can delete it.',
    aiOnboardingDeleteOldKey: 'Delete old key',
    aiOnboardingWindows: 'Windows',
    aiOnboardingUnix: 'Linux / macOS',
    aiOnboardingAll: 'All systems',
    aiGuideCommandCopied: 'Official command copied. Review and run it yourself; MultiShell did not execute it.',
    aiGuideLinkOpened: 'Official setup page opened.',
    aiProviderFieldSaved: 'Field saved. Keys are kept in SecretStorage and are not applied automatically.',
    aiProviderFieldCleared: 'Connection field cleared.',
    gatewayTitle: 'INDEPENDENT MCP ACCESS',
    gatewayConfigure: 'Set up isolated access',
    gatewayStart: 'Start gateway',
    gatewayStop: 'Stop gateway',
    gatewayCopyKey: 'Copy private key',
    gatewayCopyUrl: 'Copy local URL',
    gatewayRotate: 'Rotate key',
    gatewayRevoke: 'Revoke',
    gatewayAutoOn: 'Autostart: ENABLE',
    gatewayAutoOff: 'Autostart: DISABLE',
    aiGatewayAutoOn: 'Local automatic startup enabled for this connection.',
    aiGatewayAutoOff: 'Local automatic startup disabled for this connection.',
    gatewayShell: 'Authorized terminal',
    gatewayLevel: 'Permissions',
    gatewayRead: 'Read only',
    gatewayEdit: 'Read and edit',
    gatewayShellLevel: 'Read and run commands',
    gatewayFull: 'Read, edit and run commands',
    gatewayPending: 'Independent key prepared · gateway stopped',
    gatewayRunning: 'Authenticated gateway running (localhost only)',
    gatewayNoShell: 'No available terminals',
    gatewayHubOnly: 'Use the coordinating VS Code window to manage gateways.',
    gatewayReminder: 'The local URL is NOT a cloud connector. Do not open public ports.',
    aiGatewayConfigured: 'Isolated access and individual key configured. Gateway stopped.',
    aiGatewayStarted: 'Local MCP gateway started, protected by an independent credential.',
    aiGatewayStopped: 'Gateway stopped. Other AI connections remain unchanged.',
    aiGatewayKeyCopied: 'Private key copied to clipboard. Keep it out of repositories.',
    aiGatewayUrlCopied: 'Local MCP URL copied.',
    aiGatewayRotated: 'Old key revoked and gateway stopped. Copy the new key before starting.',
    aiGatewayRevoked: 'Independent access and secret removed.',
    aiRemoved: 'Profile removed; no external AI client configuration was changed.',
    openAiAvailable: 'Tunnel health port available; remote path unverified.',
    openAiUnavailable: 'Configure or start the OpenAI tunnel in its section.'
  };

  const glyphs = {
    refresh: [
      'M20 11a8 8 0 0 0-14-5M4 4v6h6',
      'M4 13a8 8 0 0 0 14 5m2 2v-6h-6'
    ],
    folder: [
      'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z'
    ],
    terminal: ['m4 6 6 6-6 6', 'M12 18h8'],
    plus: ['M12 5v14', 'M5 12h14'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    copy: [
      'M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2',
      'M10 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z'
    ],
    monitor: [
      'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
      'M8 22h8',
      'M12 18v4'
    ],
    search: ['m21 21-4.5-4.5', 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z'],
    info: [
      'M12 16v-4',
      'M12 8h.01',
      'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'
    ],
    chevron: ['m6 9 6 6 6-6'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    'check-circle': ['M20 6 9 17l-5-5', 'M22 12a10 10 0 1 1-10-10'],
    'log-out': [
      'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4',
      'M16 17l5-5-5-5',
      'M21 12H9'
    ],
    'shield-check': [
      'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
      'm9 12 2 2 4-4'
    ],
    message: [
      'M21 11.5a8.4 8.4 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5Z'
    ],
    trash: [
      'M3 6h18',
      'M8 6V4h8v2',
      'M6 6l1 14h10l1-14',
      'M10 10v7',
      'M14 10v7'
    ],
    grid: ['M3 3h8v8H3z','M13 3h8v8h-8z','M3 13h8v8H3z','M13 13h8v8h-8z'],
    menu: ['M4 6h16','M4 12h16','M4 18h16'],
    inbox: ['M4 4h16l2 10v6H2v-6L4 4z','M2 14h6l2 3h4l2-3h6'],
    book: ['M12 6C9 4 6 4 3 5v15c3-1 6-1 9 1','M12 6c3-2 6-2 9-1v15c-3-1-6-1-9 1','M12 6v15'],
    network: ['M12 3v6','M6 14h12','M6 14v5','M18 14v5','M12 9l-6 5','M12 9l6 5','M4 19h4v3H4z','M16 19h4v3h-4z'],
    lock: ['M6 11V7a6 6 0 0 1 12 0v4','M5 11h14v11H5z'],
    settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z','M19.4 15a1.7 1.7 0 0 0 .34 1.87l-2 2a1.7 1.7 0 0 0-1.87-.35l-1.1.46-.48 2.02h-2.8L11 19l-1.12-.45a1.7 1.7 0 0 0-1.86.34l-2-2a1.7 1.7 0 0 0 .34-1.87L5.92 14 4 13.5v-2.8l1.92-.48.46-1.11a1.7 1.7 0 0 0-.34-1.87l2-2a1.7 1.7 0 0 0 1.86.34L11 5.13 11.5 3h2.8l.48 2.12 1.1.46a1.7 1.7 0 0 0 1.86-.34l2 2a1.7 1.7 0 0 0-.34 1.87l.46 1.11 2.14.48v2.8L19.9 14z'],
    external: [
      'M14 3h7v7',
      'M10 14 21 3',
      'M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6'
    ]
  };
  function makeIcon(key) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of glyphs[key] || glyphs.terminal) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      svg.append(p);
    }
    return svg;
  }
  function insertIcons(parent = document) {
    // Icons are generated from bundled SVG paths; never from workspace text.
    for (const node of parent.querySelectorAll('[data-icon]')) {
      if (node.dataset.iconReady) {continue;}
      node.replaceChildren(makeIcon(node.dataset.icon));
      node.dataset.iconReady = 'true';
    }
  }
  const $ = id => document.getElementById(id);
  let locale = 'en';
  let state = { running: false, port: 3000 };
  let activePage = 'overview';
  let formOpen = false;
  let search = '';
  let toastTimer;
  let openMenu = null;
  let busyAction = false;
  let portBusy = false;
  let tunnelBusy = false;
  let aiBusy = false;
  let skillContext;
  let skillItems = [];
  let skillCursor;
  let skillWarnings = [];
  let skillError = '';
  let skillBusy = false;
  let skillPrefBusy = false;
  let skillRequest = 0;
  let skillAppend = false;
  let skillTimer;
  let skillDeadline;
  let skillRows;
  const expandedSkills = new Set();
  const expandedAiGuides = new Set();
  const closingIds = new Set();
  const t = key => (locale === 'es' ? es : en)[key] || key;
  const send = (type, more = {}) =>
    vscode.postMessage(Object.assign({ type }, more));
  function el(tag, classes, text) {
    const node = document.createElement(tag);
    if (classes) {node.className = classes;}
    if (text !== undefined) {node.textContent = text;}
    return node;
  }
  function commandButton(key, title, onclick, danger = false) {
    const b = el(
      'button',
      'icon-button row-action' + (danger ? ' danger' : '')
    );
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.append(makeIcon(key));
    b.addEventListener('click', onclick);
    return b;
  }
  function menuButton(key, label, callback, danger = false) {
    const b = el('button', 'menu-option' + (danger ? ' danger' : ''));
    b.type = 'button';
    b.append(makeIcon(key), el('span', null, label));
    b.addEventListener('click', callback);
    return b;
  }
  function requestClose(shell) {
    const id=shell.shell_id;
    if(closingIds.has(id)) {return;}
    closingIds.add(id);
    send('close',{id});
    renderShells();
  }
  function copyInstruction(shell) {
    const selector=shell.alias||shell.shell_id;
    send('copy',{value:locale==='es'
      ? 'Usa shell='+selector+' para esta conversación.'
      : 'Use shell='+selector+' for this conversation.'});
  }
  function notify(message, isError = false) {
    const node = $('notice');
    node.textContent = message;
    node.hidden = false;
    node.classList.toggle('error', isError);
    if (toastTimer) {clearTimeout(toastTimer);}
    toastTimer = setTimeout(() => {
      node.hidden = true;
    }, 3800);
  }
  function baseName(p) {
    if (!p) {return t('noProject');}
    const parts = p.split(/[\\/]/).filter(Boolean);
    return parts.at(-1) || p;
  }
  function localize() {
    document.documentElement.lang = locale;
    for (const node of document.querySelectorAll('[data-i18n]'))
      {node.textContent = t(node.dataset.i18n);}
    for (const node of document.querySelectorAll('[data-aria-i18n]')) {
      node.setAttribute('aria-label', t(node.dataset.ariaI18n));
      node.title = t(node.dataset.ariaI18n);
    }
    for (const node of document.querySelectorAll('[data-placeholder-i18n]')) {
      node.placeholder = t(node.dataset.placeholderI18n);
    }
    $('searchShells').setAttribute('aria-label', t('search'));
  }
  function drawHeader() {
    $('connection').classList.toggle('online', !!state.running);
    $('connection').classList.toggle('offline', !state.running);
    $('role').textContent = state.running
      ? t(state.role === 'hub' ? 'hub' : 'worker')
      : t('offline');
    $('connectionDetail').textContent = state.running
      ? t('commandLine') + ' ' + (state.activePort || state.port || 3000)
      : t('windowOffline');
    $('toggle').textContent = t(state.running ? 'stop' : 'start');
    $('toggle').disabled = busyAction;
    const portInput=$('portInput');
    if(document.activeElement!==portInput && !portBusy){portInput.value=String(state.port||3000);}
    const newPort=Number(portInput.value);
    $('savePort').disabled=portBusy||!Number.isInteger(newPort)||newPort<1024||newPort>65535||
      newPort===state.port;
    $('workspaceName').textContent = state.workspace
      ? baseName(state.workspace)
      : t('noProject');
    $('workspace').textContent = state.workspace || '—';
    $('workspace').title = state.workspace || '';
    $('windowId').textContent = state.windowId || '—';
    $('windowId').title = state.windowId || '';
    $('copyWindow').disabled = !state.windowId;
    $('shellCount').textContent = String((state.shells || []).length);
    $('windowCount').textContent = String((state.windows || []).length);
    $('requestsCount').textContent = String((state.requests || []).length);
    $('navRequestsCount').textContent = String((state.requests || []).length);
    $('connectionsCount').textContent = String((state.aiConnections||[]).length + (state.tunnel?.configured?1:0));
    $('overviewShells').textContent = String((state.shells||[]).length);
    $('overviewWindows').textContent = String((state.windows||[]).length);
    $('overviewRequests').textContent = String((state.requests||[]).length);
    $('windowInteractive').checked = state.windowAutoExit !== false;
    $('windowInteractive').disabled = !state.running;
    for (const field of $('shellForm').elements)
      {field.disabled = !state.running;}
    $('newShell').disabled = !state.running;
    $('newShell').setAttribute('aria-expanded', String(formOpen));
    $('newShell').classList.toggle('selected', formOpen);
    $('createPanel').hidden = !formOpen || !state.running;
  }
  function renderTunnel() {
    const tunnel = state.tunnel;
    const trusted = state.tunnelTrusted !== false;
    const running = !!state.running;
    const owned = ['extension','adopted'].includes(tunnel?.owner) && tunnel.childRunning;
    const occupied = !!tunnel?.listenerOccupied;
    const connected = !!tunnel?.ready;
    let status = 'tunnelOffline';
    if (!tunnel) {status = 'tunnelUnavailable';}
    else if (!tunnel.installed) {status = 'tunnelInstallRequired';}
    else if (occupied && tunnel.owner === 'external') {status = 'tunnelExternalStatus';}
    else if (occupied && tunnel.owner === 'detached') {status = 'tunnelDetached';}
    else if (tunnel.owner === 'adopted') {status = 'tunnelAdopted';}
    else if (connected) {status = 'tunnelConnected';}
    else if (owned) {status = 'tunnelStarting';}
    else if (!tunnel.configured) {status = 'tunnelConfigRequired';}
    $('tunnelStatus').textContent = t(status);
    $('tunnelIndicator').classList.toggle('is-ready', connected);
    const parts = [];
    if (tunnel) {
      parts.push(t('tunnelVersionInfo') + ': ' + tunnel.version);
      parts.push(t('tunnelProfileInfo') + ': ' + tunnel.profile);
    }
    $('tunnelDetails').textContent = parts.join(' · ');
    const warning = !trusted ? t('tunnelUntrusted')
      : running && state.role !== 'hub' ? t('tunnelHubRequired')
      : tunnel?.retryPaused ? t('tunnelRetryPaused') : '';
    $('tunnelWarning').textContent = warning;
    $('tunnelWarning').hidden = !warning;
    const allowed = trusted && !!tunnel && !tunnelBusy;
    $('tunnelRefresh').disabled = tunnelBusy;
    $('tunnelInstall').disabled = !allowed || tunnel.installed;
    $('tunnelReuse').disabled = !allowed || !running;
    for (const id of ['tunnelId', 'tunnelProfile', 'tunnelApiKey']) {
      $(id).disabled = !allowed;
    }
    const key = $('tunnelApiKey').value.trim();
    $('tunnelConfigure').disabled = !allowed || owned || !running || !tunnel.installed
      || !key || !$('tunnelId').value.trim() || !$('tunnelProfile').value.trim();
    $('tunnelUpdateKey').disabled = !allowed || owned || !tunnel.configured || !key;
    $('tunnelStart').disabled = !allowed || !running || state.role !== 'hub'
      || !tunnel.installed || !tunnel.configured || occupied || owned;
    $('tunnelStop').disabled = !allowed || !owned;
    const autostart = $('tunnelAutostart');
    autostart.checked = !!tunnel?.autostart;
    autostart.disabled = !allowed || (!tunnel.autostart && (!tunnel.configured || !tunnel.installed));
  }
  function tunnelAction(type, more = {}) {
    if (tunnelBusy) {return;}
    tunnelBusy = true;
    send(type, more);
    renderTunnel();
  }
  const providerNames = {
    vscode: 'providerVscode',
    'claude-code': 'providerClaude',
    'gemini-cli': 'providerGemini',
    cursor: 'providerCursor',
    other: 'providerOther'
  };
  function renderConnections() {
    // Auto-refresh runs every 3 seconds. Never replace a password field while
    // the user is typing: that would discard unsaved credentials.
    const focused=typeof document!=='undefined'?document.activeElement:undefined;
    if(!aiBusy && focused && typeof focused.closest==='function' &&
        focused.closest('.ai-onboarding-field')){return;}
    const tunnel = state.tunnel;
    $('openAiStatus').textContent = tunnel?.ready?t('openAiAvailable'):t('openAiUnavailable');
    const profiles = state.aiConnections || [];
    const target = $('aiList');
    target.replaceChildren();
    $('aiEmpty').hidden = profiles.length > 0;
    $('newAiConnection').disabled = aiBusy || state.tunnelTrusted === false;
    $('aiLocalGroup').label=t('aiLocalGroup');
    $('aiRemoteGroup').label=t('aiRemoteGroup');
    const capability=(state.aiProviders||[]).find(p=>p.id===$('aiProvider').value);
    $('aiFormHelp').textContent=capability
      ? (locale==='es'?capability.setupEs+' '+capability.cautionEs:capability.setupEn+' '+capability.cautionEn)
      : t('aiFormHelp');
    for (const profile of profiles) {
      const item = el('div','ai-entry');
      item.setAttribute('role','listitem');
      const head = el('div','ai-entry-heading');
      head.append(el('strong','ai-name',profile.name));
      const capability = (state.aiProviders||[]).find(p=>p.id===profile.provider);
      const remote = capability?.mode==='remote';
      const provider = capability?.name || t(providerNames[profile.provider] || 'providerOther');
      const details = el('div','ai-entry-details');
      const status=state.aiLinkStates?.[profile.id];
      details.append(el('span',null,provider),
        el('span',null,t(remote?'aiRemotePending':profile.provider==='other'?'aiManual':status?.configured?'aiConfigured':'aiInstallPending')));
      if(remote&&capability){
        details.append(el('span',null,locale==='es'?capability.setupEs:capability.setupEn));
        details.append(el('span',null,locale==='es'?capability.cautionEs:capability.cautionEn));
      }
      if(status?.managed){details.append(el('span',null,t('aiManaged')));}
      const buttons = el('div','ai-entry-actions');
      const copy = el('button','ai-primary',t('aiCopy'));
      copy.type = 'button';
      copy.disabled = !state.running || aiBusy;
      copy.addEventListener('click',()=>aiAction('ai_copy',{id:profile.id}));
      const remove = el('button','quiet is-danger',t('aiDelete'));
      remove.type = 'button';
      remove.disabled = aiBusy;
      remove.addEventListener('click',()=>aiAction('ai_remove',{id:profile.id}));
      if(remote){
        const guide=el('button','ai-primary',t('aiRemoteOpen'));
        guide.type='button';
        guide.disabled=aiBusy||state.tunnelTrusted===false;
        guide.addEventListener('click',()=>aiAction('ai_open',{id:profile.id}));
        buttons.append(guide);
      }else if(profile.provider!=='other'){
        // URL-only auto setup cannot authenticate since v0.10.51.
        // Existing managed entries can still be inspected and removed.
        if(status?.managed){
          const unlink=el('button','quiet',t('aiUninstall'));
          unlink.type='button';
          unlink.disabled=aiBusy||!state.running;
          unlink.addEventListener('click',()=>aiAction('ai_uninstall',{id:profile.id}));
          buttons.append(unlink);
        }
        if(status?.configured||status?.managed){
          const openConfig=el('button','quiet',t('aiOpenConfig'));
          openConfig.type='button';
          openConfig.disabled=aiBusy;
          openConfig.addEventListener('click',()=>aiAction('ai_open',{id:profile.id}));
          buttons.append(openConfig);
        }
      }
      if(!remote){buttons.append(copy);}
      buttons.append(remove);
      const gateway=(state.aiGateways||[]).find(p=>p.profileId===profile.id);
      const hubReady=state.running&&state.role==='hub'&&state.tunnelTrusted!==false;
      const security=el('div','ai-gateway');
      security.append(el('strong','ai-gateway-title',t('gatewayTitle')));
      if(gateway){
        security.append(el('div','ai-entry-details',
          t(gateway.running?'gatewayRunning':'gatewayPending')));
        security.append(el('code','ai-gateway-url',gateway.endpoint));
        security.append(el('div','ai-entry-details',
          gateway.shellId+' · '+t(gateway.level==='read'?'gatewayRead':
            gateway.level==='edit'?'gatewayEdit':
            gateway.level==='shell'?'gatewayShellLevel':'gatewayFull')));
        const controls=el('div','ai-entry-actions');
        const action=(key,label)=>{
          const button=el('button','quiet',t(label));
          button.type='button';
          button.disabled=aiBusy||!hubReady;
          button.addEventListener('click',()=>aiAction(key,{id:profile.id}));
          controls.append(button);
        };
        action(gateway.running?'ai_gateway_stop':'ai_gateway_start',
          gateway.running?'gatewayStop':'gatewayStart');
        action('ai_gateway_copy_url','gatewayCopyUrl');
        action('ai_gateway_copy_key','gatewayCopyKey');
        action('ai_gateway_rotate','gatewayRotate');
        const auto=el('button','quiet',t(gateway.autostart?'gatewayAutoOff':'gatewayAutoOn'));
        auto.type='button';
        auto.disabled=aiBusy||!hubReady;
        auto.addEventListener('click',()=>aiAction('ai_gateway_autostart',
          {id:profile.id,value:!gateway.autostart}));
        controls.append(auto);
        action('ai_gateway_revoke','gatewayRevoke');
        security.append(controls);
      }else{
        const shells=(state.shells||[]).filter(x=>x.shell_id);
        const form=el('div','ai-gateway-form');
        const terminal=el('select','ai-gateway-select');
        terminal.setAttribute('aria-label',t('gatewayShell'));
        for(const shell of shells){
          const option=el('option',null,(shell.alias||shell.shell_id)+' · '+shell.shell_id);
          option.value=shell.shell_id;
          terminal.append(option);
        }
        const level=el('select','ai-gateway-select');
        level.setAttribute('aria-label',t('gatewayLevel'));
        for(const [value,label] of [
          ['read','gatewayRead'],['edit','gatewayEdit'],
          ['shell','gatewayShellLevel'],['full','gatewayFull']]){
          const option=el('option',null,t(label));
          option.value=value;
          level.append(option);
        }
        const create=el('button','ai-primary',t('gatewayConfigure'));
        create.type='button';
        create.disabled=aiBusy||!hubReady||!shells.length;
        create.addEventListener('click',()=>aiAction('ai_gateway_configure',
          {id:profile.id,shellId:terminal.value,level:level.value}));
        form.append(terminal,level,create);
        security.append(form);
        if(!shells.length){security.append(el('p','field-help',t('gatewayNoShell')));}
      }
      security.append(el('p','field-help',t(hubReady?'gatewayReminder':'gatewayHubOnly')));
      const guide=(state.aiOnboarding||[]).find(g=>g.provider===profile.provider);
      const help=el('details','ai-onboarding');
      help.open=expandedAiGuides.has(profile.id);
      const summary=el('summary','ai-onboarding-summary');
      summary.append(el('span','ai-help-mark','?'),
        el('span',null,t('aiOnboardingHelp')));
      summary.setAttribute('aria-label',t('aiOnboardingHelp')+': '+profile.name);
      help.addEventListener('toggle',()=>{
        if(help.open){expandedAiGuides.add(profile.id);}
        else{expandedAiGuides.delete(profile.id);}
      });
      help.append(summary);
      if(guide){
        const wrap=el('div','ai-onboarding-content');
        wrap.append(el('strong','ai-onboarding-subtitle',t('aiOnboardingSteps')));
        const steps=el('ol','ai-onboarding-steps');
        for(const step of (locale==='es'?guide.stepsEs:guide.stepsEn)){
          steps.append(el('li',null,step));
        }
        wrap.append(steps);
        if(guide.commands.length){
          wrap.append(el('strong','ai-onboarding-subtitle',t('aiOnboardingCommands')));
          for(const [i,entry] of guide.commands.entries()){
            const codeRow=el('div','ai-onboarding-command');
            const caption=el('span',null,
              (locale==='es'?entry.labelEs:entry.labelEn)+' · '+
              t(entry.platform==='windows'?'aiOnboardingWindows':
                entry.platform==='unix'?'aiOnboardingUnix':'aiOnboardingAll'));
            const code=el('code',null,entry.command);
            const copyCmd=el('button','quiet',t('copy'));
            copyCmd.type='button';
            copyCmd.disabled=aiBusy||state.tunnelTrusted===false;
            copyCmd.addEventListener('click',()=>aiAction('ai_guide_copy',
              {id:profile.id,commandIndex:i}));
            codeRow.append(caption,code,copyCmd);
            wrap.append(codeRow);
          }
        }
        if(guide.links.length){
          wrap.append(el('strong','ai-onboarding-subtitle',t('aiOnboardingLinks')));
          const urls=el('div','ai-onboarding-links');
          for(const [i,link] of guide.links.entries()){
            const open=el('button','quiet',locale==='es'?link.labelEs:link.labelEn);
            open.type='button';
            open.disabled=aiBusy||state.tunnelTrusted===false;
            open.addEventListener('click',()=>aiAction('ai_guide_open',
              {id:profile.id,linkIndex:i}));
            urls.append(open);
          }
          wrap.append(urls);
        }
        if(guide.fields.length){
          wrap.append(el('strong','ai-onboarding-subtitle',t('aiOnboardingFields')));
          const saved=state.aiProviderSaved?.[profile.id]||{};
          const fields=el('div','ai-onboarding-fields');
          for(const field of guide.fields){
            const row=el('div','ai-onboarding-field');
            const label=el('label',null,locale==='es'?field.labelEs:field.labelEn);
            const input=el('input','ai-onboarding-input');
            input.type=field.kind==='secret'?'password':'text';
            input.autocomplete='off';input.spellcheck=false;
            input.maxLength=field.kind==='secret'?8192:field.kind==='https-url'?2048:120;
            input.value=field.kind==='secret'?'':(saved[field.id]||'');
            input.placeholder=field.kind==='secret' && saved[field.id==='providerApiKey'?'hasProviderApiKey':'hasMcpBearer']
              ? t('aiOnboardingStored'):'';
            label.append(input);
            const status=el('p','field-help',locale==='es'?field.helpEs:field.helpEn);
            const controls=el('div','ai-entry-actions');
            const save=el('button','ai-primary',t('aiOnboardingSave'));
            save.type='button';
            save.disabled=aiBusy||state.tunnelTrusted===false;
            save.addEventListener('click',()=>{
              const value=input.value;
              if(!value.trim()){return;}
              input.value='';
              aiAction('ai_provider_save',{id:profile.id,field:field.id,value});
            });
            controls.append(save);
            const isSaved=field.kind==='secret'
              ?!!saved[field.id==='providerApiKey'?'hasProviderApiKey':'hasMcpBearer']
              :!!saved[field.id];
            if(isSaved){
              const clear=el('button','quiet',t('aiOnboardingClear'));
              clear.type='button';clear.disabled=aiBusy;
              clear.addEventListener('click',()=>aiAction('ai_provider_clear',
                {id:profile.id,field:field.id}));
              controls.append(clear);
            }
            row.append(label,status,controls);
            fields.append(row);
          }
          wrap.append(fields);
        }
        const legacyKey=state.aiProviderSaved?.[profile.id]?.hasProviderApiKey &&
          (profile.provider==='gemini-cli'||profile.provider==='claude-code') &&
          !guide.fields.some(x=>x.id==='providerApiKey');
        if(legacyKey){
          wrap.append(el('p','field-help',t('aiOnboardingUnusedKey')));
          const clearOld=el('button','quiet',t('aiOnboardingDeleteOldKey'));
          clearOld.type='button';clearOld.disabled=aiBusy;
          clearOld.addEventListener('click',()=>aiAction('ai_provider_clear',
            {id:profile.id,field:'providerApiKey'}));
          wrap.append(clearOld);
        }
        wrap.append(el('p','field-help',locale==='es'?guide.noteEs:guide.noteEn));
        if(guide.fields.length || remote){wrap.append(el('p','field-help',t('aiOnboardingManual')));}
        help.append(wrap);
      }
      remove.disabled=aiBusy||!!status?.managed||!!gateway;
      item.append(head,details,buttons,help,security);
      target.append(item);
    }
  }
  function aiAction(type, more = {}) {
    if(aiBusy){return;}
    aiBusy = true;
    send(type,more);
    renderConnections();
  }
  function renderSkills() {
    const enabled=!!state.workspace && state.skillsEnabled!==false;
    $('searchSkills').disabled=!enabled;
    $('skillsScope').disabled=!enabled;
    $('skillsScope').querySelector('option[value="global"]').disabled=!state.globalSkillsEnabled;
    $('refreshSkills').disabled=!enabled || skillBusy;
    $('skillsList').setAttribute('aria-busy',String(skillBusy));
    $('skillCount').textContent=String(skillItems.length)+(skillCursor?'+':'');
    $('skillsPermission').textContent=t('skillsLocal')+' '+t(state.globalSkillsEnabled?'skillsGlobal':'skillsPrivate');
    $('skillSettings').hidden=!!state.globalSkillsEnabled;
    $('skillsStatus').textContent=!enabled?t('skillsUnavailable'):
      skillError || (skillBusy?t('skillsLoading'):skillItems.length?`${skillItems.length}${skillCursor?'+':''} ${t('skillsFound')}`:t('skillsEmpty'));
    $('skillsWarnings').textContent=skillWarnings.join('\n');
    $('moreSkills').hidden=!skillCursor;
    $('moreSkills').disabled=skillBusy;
    const rows=JSON.stringify([skillItems,state.running,state.skillsEnabled,locale,skillPrefBusy]);
    if(rows===skillRows){return;}
    skillRows=rows;
    const target=$('skillsList');
    target.replaceChildren();
    for(const skill of skillItems){
      const row=el('div','skill-row');
      row.setAttribute('role','listitem');
      const header=el('div','skill-heading');
      const identity=el('div','skill-identity');
      const source=el('span','skill-source',
        `${t(skill.scope==='global'?'personalSkills':'project')} · ${skill.skill_path}`);
      source.title=skill.skill_path;
      identity.append(el('strong','skill-name',skill.name),source);
      const details=el('details','skill-details');
      details.open=expandedSkills.has(skill.skill_path);
      const summary=el('summary','skill-summary');
      summary.title=`${t('skillDetails')}: ${skill.name}`;
      summary.setAttribute('aria-label',`${t('skillDetails')}: ${skill.name}`);
      const chevron=el('span','skill-chevron');
      chevron.setAttribute('aria-hidden','true');
      chevron.append(makeIcon('chevron'));
      summary.append(chevron,el('span','skill-details-label',t('skillDetails')));
      const content=el('div','skill-expanded');
      content.append(el('p','skill-description',skill.description));
      details.append(summary,content);
      details.addEventListener('toggle',()=>{
        if(details.open){expandedSkills.add(skill.skill_path);}
        else{expandedSkills.delete(skill.skill_path);}
      });
      const copy=commandButton('copy',
        `${t('useSkill')}: ${skill.name} (${skill.skill_path})`,
        ()=>send('skill_copy',{value:skill.skill_path}));
      copy.classList.add('skill-copy');
      copy.disabled=!state.running || state.skillsEnabled===false;
      if(copy.disabled){copy.title=t('skillStart');}
      const prefer=el('button','icon-button row-action skill-prefer',
        skill.preferred?'★':'☆');
      prefer.type='button';
      prefer.title=t(skill.preferred?'skillPreferred':'skillUnpreferred');
      prefer.setAttribute('aria-label',prefer.title+': '+skill.name);
      prefer.setAttribute('aria-pressed',String(skill.preferred===true));
      prefer.disabled=!enabled||skillPrefBusy;
      prefer.addEventListener('click',()=>{
        if(skillPrefBusy){return;}
        skillPrefBusy=true;
        send('skill_prefer',{key:skill.skill_path,value:!skill.preferred});
        renderSkills();
      });
      header.append(identity,prefer,copy);
      row.append(header,details);
      target.append(row);
    }
  }
  function cancelSkillSearch() {
    ++skillRequest;
    clearTimeout(skillTimer);
    clearTimeout(skillDeadline);
    skillBusy=false;
  }
  function requestSkills(append=false) {
    cancelSkillSearch();
    if(!state.workspace || state.skillsEnabled===false){renderSkills();return;}
    skillAppend=append;
    skillBusy=true;
    skillError='';
    const requestId=skillRequest;
    send('skills',{requestId,query:$('searchSkills').value.trim(),scope:$('skillsScope').value,
      cursor:append?skillCursor:undefined});
    skillDeadline=setTimeout(()=>{
      if(requestId!==skillRequest){return;}
      ++skillRequest;
      skillBusy=false;
      skillError=t('skillsTimeout');
      renderSkills();
    },10000);
    renderSkills();
  }
  function syncSkills() {
    const context=JSON.stringify([state.workspace,state.windowId,state.skillsEnabled,state.globalSkillsEnabled]);
    if(context!==skillContext){
      skillContext=context;
      expandedSkills.clear();
      cancelSkillSearch();
      skillItems=[];
      skillCursor=undefined;
      skillWarnings=[];
      skillError='';
      if(!state.globalSkillsEnabled && $('skillsScope').value==='global'){$('skillsScope').value='all';}
      requestSkills();
    }
    renderSkills();
  }
  function renderShells() {
    const target = $('shells');
    target.replaceChildren();
    const all = (state.shells || []).slice().sort((a, b) => {
      if (a.shell_id === state.primary) {return -1;}
      if (b.shell_id === state.primary) {return 1;}
      return a.shell_id.localeCompare(b.shell_id);
    });
    $('shellMeta').textContent =
      String(all.length) + ' ' + t(all.length === 1 ? 'countOne' : 'countMany');
    $('searchRow').hidden = all.length < 5;
    const shown = all.filter(
      s =>
        (s.alias||'').toLowerCase().includes(search.toLowerCase()) || s.shell_id.toLowerCase().includes(search.toLowerCase()) ||
        s.initial_cwd.toLowerCase().includes(search.toLowerCase())
    );
    const noItems = shown.length === 0;
    $('shellEmpty').hidden = !noItems;
    $('shellEmptyTitle').textContent = t(all.length ? 'noResults' : 'noShells');
    $('shellEmptyHint').textContent = t(
      all.length ? 'noResultsHelp' : 'noShellsHelp'
    );
    for (const shell of shown) {
      const primary = shell.shell_id === state.primary;
      const item = el('div', 'shell-row' + (primary ? ' is-primary' : ''), '');
      item.setAttribute('role', 'listitem');
      item.classList.toggle('is-closing',closingIds.has(shell.shell_id));
      item.classList.toggle('menu-open',openMenu===shell.shell_id);
      const open = el('button', 'row-main');
      open.type = 'button';
      open.title = t('show');
      open.setAttribute('aria-label', t('show') + ': ' + shell.shell_id);
      const leading = el('span', 'terminal-icon');
      leading.append(makeIcon('terminal'));
      const details = el('span', 'row-details');
      const nameLine = el('span', 'row-title');
      nameLine.append(
        el('span', 'row-name', primary ? t('primaryLabel') : (shell.alias || shell.shell_id))
      );
      const aliasLine = el('span', 'shell-alias', 'shell='+(shell.alias||shell.shell_id));
      aliasLine.title = 'shell='+(shell.alias||shell.shell_id);
      if (primary)
        {nameLine.append(el('span', 'primary-indicator', t('primaryTag')));}
      if (!primary && shell.origin)
        {nameLine.append(el('span', 'origin-indicator', t(shell.origin === 'user' ? 'originUser' : shell.origin === 'automatic' ? 'originAutomatic' : 'originMcp')));}
      const idLine = el(
        'span',
        'shell-id subline',
        shell.shell_id
      );
      idLine.title = primary ? shell.shell_id : shell.initial_cwd;
      const statusKey = shell.external_busy ? 'externalBusy'
        : shell.recovery_required
          ? (shell.recovery_reason === 'restored_unverified' ? 'restoredUnverified'
            : shell.recovery_reason === 'ambiguous_completion' ? 'ambiguousCompletion'
            : shell.recovery_reason === 'unverified_execution' ? 'unverifiedExecution'
            : 'recoveredShell')
          : shell.timed_out_running ? 'timedOutRunning'
          : shell.execution_phase === 'waiting_for_integration' ? 'integrationPending'
          : shell.execution_phase === 'waiting_for_completion' ? 'completionPending'
          : shell.execution_phase === 'output_error_waiting_for_completion' ? 'outputReadFailed'
          : shell.execution_phase === 'draining_output' ? 'outputDraining'
          : shell.busy ? 'busy' : 'idle';
      const status = el('span', 'row-status' + (shell.busy ? ' running' : ''), t(statusKey));
      if(shell.busy || shell.timed_out_running){
        const hint = shell.input_wait_hint === 'pager' ? 'possiblePager'
          : shell.input_wait_hint === 'confirmation' ? 'possibleConfirmation'
          : shell.input_wait_hint === 'credentials' ? 'possibleCredentials'
          : shell.input_wait_hint === 'continuation' ? 'possibleContinuation'
          : null;
        if(hint){status.textContent += ' · ' + t(hint);}
        else if((shell.execution_phase === 'running' || shell.timed_out_running) && shell.output_silent_seconds >= 20){
          status.textContent += ' · ' + t('possibleSilentWait');
        }
      }
      if (shell.queued > 0)
        {status.textContent += ' · ' + t('queued') + ': ' + shell.queued;}
      const bgJobs = Array.isArray(shell.background_jobs) ? shell.background_jobs : [];
      const liveJobs = bgJobs.filter(j => j.status === 'running' || j.status === 'cancelling');
      if (liveJobs.length) {
        const active = liveJobs[0];
        const commandLabel = /^[a-z0-9_-]{1,32}$/i.test(active.command_label || '')
          ? active.command_label : 'isolated';
        status.textContent += ' · ' + t(active.status === 'cancelling' ? 'backgroundCancelling' : 'backgroundRunning')+
          ': ' + liveJobs.length + ' · ' + commandLabel + ' (' + Math.floor(active.elapsed_ms/1000) + ' s)';
        const hint = active.input_hint === 'pager' ? 'possiblePager'
          : active.input_hint === 'confirmation' ? 'possibleConfirmation'
          : active.input_hint === 'credentials' ? 'possibleCredentials'
          : active.input_hint === 'continuation' ? 'possibleContinuation' : null;
        if (hint) {status.textContent += ' · ' + t(hint);}
      } else if (bgJobs[0]?.status === 'failed') {
        status.textContent += ' · ' + t('backgroundFailed');
      }
      details.append(nameLine, aliasLine, idLine, status);
      open.append(leading, details);
      open.addEventListener('click', () =>
        send('show', { id: shell.shell_id })
      );
      const actions = el('div', 'row-actions');
      actions.append(
        commandButton('copy', t('copySelector'), () =>
          send('copy', { value: 'shell='+(shell.alias||shell.shell_id) })
        )
      );
      actions.append(commandButton('message', t('copyInstruction'), () => copyInstruction(shell)));
      if (liveJobs.length) {
        actions.append(commandButton('x', t('backgroundCancel'), () =>
          send('cancel_background', { id: shell.shell_id, jobId: liveJobs[0].job_id }), true));
      }
      if((shell.recovery_required || shell.timed_out_running)){
        const restore=commandButton('shield-check',t('enableRestored'),()=>send('confirm_restore',{id:shell.shell_id}));
        actions.append(restore);
      }
      if (!primary) {
        const remove = commandButton('trash', t('close'), () => requestClose(shell), true);
        remove.classList.add('quick-close');
        actions.append(remove);
      }
      const overflow = el('div', 'overflow');
      const more = commandButton('more', t('more'), () => {
        openMenu = openMenu === shell.shell_id ? null : shell.shell_id;
        renderShells();
      });
      more.setAttribute('aria-expanded', String(openMenu === shell.shell_id));
      overflow.append(more);
      if (openMenu === shell.shell_id) {
        const options = el('div', 'popup-menu');
        options.append(
          menuButton('message', t('copyInstruction'), () => {
            openMenu = null;
            copyInstruction(shell);
            renderShells();
          })
        );
        options.append(
          menuButton('terminal', t('editAlias'), () => {
            openMenu=null;
            send('alias', {id:shell.shell_id});
            renderShells();
          })
        );
        options.append(
          menuButton('external', t('show'), () => {
            openMenu = null;
            send('show', { id: shell.shell_id });
            renderShells();
          })
        );
        options.append(menuButton(
          'log-out',
          t(shell.auto_exit_interactive===false?'enableAutoExit':'disableAutoExit'),
          ()=>{
            openMenu=null;
            send('shell_interactive',{id:shell.shell_id,value:shell.auto_exit_interactive===false});
            renderShells();
          }
        ));
        if(typeof shell.auto_exit_override==='boolean'){
          options.append(menuButton('refresh',t('inheritAutoExit'),()=>{
            openMenu=null;
            send('shell_interactive',{id:shell.shell_id,value:null});
            renderShells();
          }));
        }
        if (!primary)
          {options.append(
            menuButton(
              'trash',
              t('close'),
              () => {
                openMenu = null;
                requestClose(shell);
                renderShells();
              },
              true
            )
          );}
        overflow.append(options);
      }
      actions.append(overflow);
      item.append(open, actions);
      target.append(item);
    }
  }
  function renderWindows() {
    const target = $('windows');
    target.replaceChildren();
    const windows = state.windows || [];
    $('windowEmpty').hidden = windows.length !== 0;
    for (const win of windows) {
      const here = win.window_id === state.windowId;
      const row = el('div', 'window-row' + (here ? ' is-current' : ''), '');
      row.setAttribute('role', 'listitem');
      const icon = el('span', 'window-icon');
      icon.append(makeIcon('monitor'));
      const center = el('div', 'window-info');
      const line = el('div', 'window-title');
      line.append(el('strong', null, baseName(win.workspace)));
      if (here) {line.append(el('span', 'current-tag', t('you')));}
      const id = el('div', 'window-id mono', win.window_id);
      const dir = el('div', 'window-dir', win.workspace);
      id.title = win.window_id;
      dir.title = win.workspace;
      center.append(line, id, dir);
      row.append(
        icon,
        center,
        commandButton('copy', t('copyWindow'), () =>
          send('copy', { value: win.window_id })
        )
      );
      target.append(row);
    }
  }
  function renderRequests() {
    const target=$('requestsList');
    target.replaceChildren();
    const pending=state.requests||[];
    $('requestsEmpty').hidden=pending.length!==0;
    for(const request of pending){
      const row=el('div','approval-request');
      row.setAttribute('role','listitem');
      row.append(el('strong','request-id',request.shell_id));
      row.append(el('div','subline path',request.cwd));
      row.append(el('div','subline',t('allowShare')+': '+(request.share?'✓':'—')));
      const actions=el('div','request-actions');
      const approve=el('button','add-button',t('approveRequest'));
      approve.type='button';
      approve.addEventListener('click',()=>send('request_decision',{id:request.request_id,value:true}));
      const deny=el('button','quiet',t('rejectRequest'));
      deny.type='button';
      deny.addEventListener('click',()=>send('request_decision',{id:request.request_id,value:false}));
      actions.append(approve,deny);
      row.append(actions);
      target.append(row);
    }
  }
  const pages = [
    ['overview','tabOverview','overviewPage','overview'],
    ['shells','tabShells','shellsPage','shells'],
    ['windows','tabWindows','windowsPage','connectedWindows'],
    ['requests','tabRequests','requestsPage','requests'],
    ['skills','tabSkills','skillsPage','skills'],
    ['connections','tabConnections','connectionsPage','aiConnections'],
    ['tunnel','tabTunnel','tunnelPage','tunnelTab'],
    ['settings','tabSettings','settingsPage','settings']
  ];
  function switchPage(target, closeNavigation = false) {
    if(!pages.some(([key])=>key===target)){target='overview';}
    activePage=target;
    for(const [key,tab,page] of pages){
      $(tab).setAttribute('aria-selected',String(target===key));
      $(tab).tabIndex=target===key?0:-1;
      $(page).hidden=target!==key;
    }
    const selected=pages.find(([key])=>key===target);
    $('activeViewLabel').textContent=t(selected[3]);
    if(closeNavigation){
      $('navDisclosure').open=false;
      // The selected tab is hidden in a collapsed disclosure. Put keyboard
      // focus on its summary rather than leaving it on an invisible control.
      $('navDisclosure').querySelector('summary')?.focus();
    }
    if(target==='shells'){renderShells();}
    else if(target==='windows'){renderWindows();}
    else if(target==='tunnel'){renderTunnel();}
    else if(target==='connections'){renderConnections();}
  }
  function draw() {
    localize();
    drawHeader();
    renderTunnel();
    renderShells();
    renderWindows();
    renderRequests();
    renderConnections();
    syncSkills();
    switchPage(activePage);
  }
  function setForm(open) {
    formOpen = open;
    $('createPanel').hidden = !formOpen || !state.running;
    $('newShell').classList.toggle('selected', formOpen);
    $('newShell').setAttribute('aria-expanded', String(formOpen));
    if (open) {$('shellId').focus();}
  }
  function handleTabKeys(event) {
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){return;}
    event.preventDefault();
    const tabs=pages.map(item=>item[0]);
    const index=tabs.indexOf(activePage);
    const forward=event.key==='ArrowRight'||event.key==='ArrowDown';
    const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):
      tabs[(index+(forward?1:tabs.length-1))%tabs.length];
    switchPage(next);
    $(pages.find(([key])=>key===next)[1]).focus();
  }
  insertIcons();
  $('refresh').addEventListener('click', () => {send('refresh');requestSkills();});
  $('portInput').addEventListener('input',drawHeader);
  $('portForm').addEventListener('submit',event=>{
    event.preventDefault();
    const port=Number($('portInput').value);
    if(!Number.isInteger(port)||port<1024||port>65535){notify(t('invalidPort'),true);return;}
    if(port===state.port){return;}
    portBusy=true;
    drawHeader();
    send('port',{value:port});
  });
  $('toggle').addEventListener('click', () => {
    busyAction = true;
    drawHeader();
    send('toggle');
  });
  $('copyWindow').addEventListener('click', () => {
    if (state.windowId) {send('copy', { value: state.windowId });}
  });
  for(const [page,button] of pages){
    $(button).addEventListener('click',()=>switchPage(page,true));
    $(button).addEventListener('keydown',handleTabKeys);
  }
  $('overviewTerminals').addEventListener('click',()=>switchPage('shells'));
  $('overviewConnections').addEventListener('click',()=>switchPage('connections'));
  $('openAiDetails').addEventListener('click',()=>switchPage('tunnel'));
  $('chatgptOpenTunnels').addEventListener('click',()=>aiAction('ai_chatgpt_tunnels'));
  $('chatgptOpenRuntimeKeys').addEventListener('click',()=>aiAction('ai_chatgpt_runtime_keys'));
  $('chatgptOpenChat').addEventListener('click',()=>aiAction('ai_chatgpt_chat'));
  $('chatgptOpenMcpGuide').addEventListener('click',()=>aiAction('ai_chatgpt_guide'));
  const aiForm=$('aiFormPanel');
  function showAiForm(show) {
    aiForm.hidden=!show;
    $('newAiConnection').setAttribute('aria-expanded',String(show));
    if(show){$('aiName').focus();}
  }
  $('newAiConnection').addEventListener('click',()=>showAiForm(aiForm.hidden));
  $('aiProvider').addEventListener('change',renderConnections);
  $('cancelAiForm').addEventListener('click',()=>showAiForm(false));
  $('cancelAiForm2').addEventListener('click',()=>showAiForm(false));
  $('aiForm').addEventListener('submit',event=>{
    event.preventDefault();
    if(!event.target.reportValidity()||aiBusy){return;}
    const name=$('aiName').value.trim();
    if(!name || name.length>48){return;}
    aiAction('ai_add',{provider:$('aiProvider').value,value:name});
  });
  $('tunnelRefresh').addEventListener('click', () => tunnelAction('tunnel_refresh'));
  $('tunnelInstall').addEventListener('click', () => tunnelAction('tunnel_install'));
  $('tunnelReuse').addEventListener('click', () => tunnelAction('tunnel_reuse'));
  for (const id of ['tunnelId','tunnelProfile','tunnelApiKey']) {
    $(id).addEventListener('input',renderTunnel);
  }
  $('tunnelForm').addEventListener('submit',event=>{
    event.preventDefault();
    if (!$('tunnelForm').reportValidity() || tunnelBusy) {return;}
    const key=$('tunnelApiKey').value;
    const id=$('tunnelId').value.trim();
    const profile=$('tunnelProfile').value.trim();
    $('tunnelApiKey').value='';
    tunnelAction('tunnel_configure',{id,profile,key});
  });
  $('tunnelUpdateKey').addEventListener('click',()=>{
    const key=$('tunnelApiKey').value;
    if(!key.trim()){notify(t('tunnelKeyMissing'),true);return;}
    $('tunnelApiKey').value='';
    tunnelAction('tunnel_update_key',{key});
  });
  $('tunnelStart').addEventListener('click',()=>tunnelAction('tunnel_start'));
  $('tunnelStop').addEventListener('click',()=>tunnelAction('tunnel_stop'));
  $('tunnelAutostart').addEventListener('change',event=>
    tunnelAction('tunnel_autostart',{value:event.target.checked}));
  $('refreshSkills').addEventListener('click',()=>requestSkills());
  $('moreSkills').addEventListener('click',()=>requestSkills(true));
  $('skillSettings').addEventListener('click',()=>send('skill_settings'));
  $('skillsScope').addEventListener('change',()=>{
    skillItems=[];skillCursor=undefined;requestSkills();
  });
  $('searchSkills').addEventListener('input',()=>{
    cancelSkillSearch();
    skillItems=[];skillCursor=undefined;skillWarnings=[];skillError='';
    skillBusy=true;
    renderSkills();
    skillTimer=setTimeout(()=>requestSkills(),250);
  });
  $('windowInteractive').addEventListener('change',event=>{
    send('window_interactive',{value:event.target.checked});
  });
  $('newShell').addEventListener('click', () => setForm(!formOpen));
  $('cancelCreate').addEventListener('click', () => setForm(false));
  $('formCancel').addEventListener('click', () => setForm(false));
  $('searchShells').addEventListener('input', event => {
    search = event.target.value;
    renderShells();
  });
  $('shellForm').addEventListener('submit', event => {
    event.preventDefault();
    const id = $('shellId').value.trim();
    const cwd = $('cwd').value.trim();
    send('create', { id, cwd, share: $('share').checked });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (openMenu) {
        openMenu = null;
        renderShells();
      } else if (formOpen) {setForm(false);}
    }
  });
  document.addEventListener('click', event => {
    if (openMenu && !event.target.closest('.overflow')) {
      openMenu = null;
      renderShells();
    }
  });
  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || typeof data !== 'object') {return;}
    if (data.type === 'state') {
      state = data.snapshot || { running: false };
      const active=new Set((state.shells||[]).map(shell=>shell.shell_id));
      for(const id of closingIds){if(!active.has(id)){closingIds.delete(id);}}
      locale = data.language === 'es' ? 'es' : 'en';
      busyAction = false;
      draw();
    } else if(data.type==='skills_result'){
      if(data.requestId!==skillRequest){return;}
      clearTimeout(skillDeadline);
      skillBusy=false;
      skillError=data.error||'';
      if(!data.error){
        const next=skillAppend?skillItems.concat(data.skills||[]):data.skills||[];
        skillItems=[...new Map(next.map(skill=>[skill.skill_path,skill])).values()];
        skillCursor=data.next_cursor;
        skillWarnings=(data.warnings||[]).filter(w=>!w.startsWith('More skills available;'));
      }
      renderSkills();
    } else if (data.type === 'skill_preferred') {
      skillPrefBusy=false;
      requestSkills();
    } else if (data.type === 'ai_done') {
      aiBusy=false;
      if(data.notice==='aiAdded'){
        $('aiForm').reset();
        showAiForm(false);
      }
      renderConnections();
      if(data.notice){notify(t(data.notice));}
    } else if (data.type === 'tunnel_done') {
      tunnelBusy = false;
      renderTunnel();
      if(data.notice){notify(t(data.notice));}
    } else if (data.type === 'notice') {
      if(data.key==='portSaved'){portBusy=false;send('refresh');}
      notify(t(data.key));
      if (data.key === 'closed') {closingIds.clear();}
      if (data.key === 'created') {
        $('shellForm').reset();
        setForm(false);
      }
    } else if (data.type === 'closeCancelled') {
      closingIds.delete(data.id);
      renderShells();
    } else if (data.type === 'error') {
      if(skillPrefBusy){skillPrefBusy=false;renderSkills();}
      portBusy=false;
      tunnelBusy=false;
      aiBusy=false;
      closingIds.clear();
      busyAction = false;
      drawHeader();
      renderTunnel();
      renderConnections();
      notify(t('error') + ': ' + data.text, true);
    }
  });
  draw();
  send('refresh');
})();