import type {AiProvider} from './ai-connections';

export type OnboardingFieldId='publicMcpUrl'|'connectorId'|'providerApiKey'|'mcpBearer';
export type OnboardingFieldKind='https-url'|'text'|'secret';
export interface OnboardingField{
  id:OnboardingFieldId;
  kind:OnboardingFieldKind;
  labelEs:string;labelEn:string;helpEs:string;helpEn:string;
}
export interface OnboardingCommand{
  labelEs:string;labelEn:string;
  command:string;
  platform:'all'|'windows'|'unix';
}
export interface OnboardingLink{labelEs:string;labelEn:string;url:string;}
export interface AiOnboardingGuide{
  provider:AiProvider;
  stepsEs:string[];
  stepsEn:string[];
  commands:OnboardingCommand[];
  links:OnboardingLink[];
  fields:OnboardingField[];
  noteEs:string;noteEn:string;
}

const publicMcpUrl:OnboardingField={
  id:'publicMcpUrl',kind:'https-url',
  labelEs:'URL HTTPS pública del MCP',labelEn:'Public HTTPS MCP URL',
  helpEs:'Solo https:// y sin contraseña en la URL. Debe apuntar a un túnel HTTPS autenticado configurado fuera de MultiShell; guardar esta URL no crea el túnel.',
  helpEn:'Only https://, no embedded credentials. Must point to an independently configured authenticated HTTPS tunnel; saving it does not start a tunnel.'
};
const connectorId:OnboardingField={
  id:'connectorId',kind:'text',labelEs:'Identificador del conector (opcional)',
  labelEn:'Connector ID (optional)',
  helpEs:'Identificador o nombre que el servicio te asigne; no es una clave.',
  helpEn:'Name or identifier supplied by the vendor; not a secret.'
};
const providerApiKey:OnboardingField={
  id:'providerApiKey',kind:'secret',labelEs:'API key del proveedor (opcional)',
  labelEn:'Provider API key (optional)',
  helpEs:'Solo si utilizas la modalidad API del proveedor. Guardada en SecretStorage, no se configura automáticamente en el cliente ni se envía a una web.',
  helpEn:'Only for the provider API mode. Stored in SecretStorage; it is not injected into client settings or sent to a website.'
};
const mcpBearer:OnboardingField={
  id:'mcpBearer',kind:'secret',labelEs:'Token Bearer del conector MCP (opcional)',
  labelEn:'MCP connector Bearer token (optional)',
  helpEs:'Credencial que admita el servicio al enlazar el servidor MCP, no tu contraseña. Se almacena, pero no se transmite ni se activa sin transporte seguro.',
  helpEn:'A token supported by the client connector, not an account password. Saved only; never transmitted or activated without verified secure transport.'
};
const link=(labelEs:string,labelEn:string,url:string):OnboardingLink=>
  ({labelEs,labelEn,url});
const cmd=(labelEs:string,labelEn:string,command:string,
  platform:'all'|'windows'|'unix'='all'):OnboardingCommand=>
  ({labelEs,labelEn,command,platform});

/** Verified provider entry points. No arbitrary commands or URLs are accepted
 * from the Webview: all copy/open actions resolve a catalog index on the host.
 * Install commands are copied for REVIEW, never executed automatically.
 */
export const AI_ONBOARDING_GUIDES:readonly AiOnboardingGuide[]=[
 {provider:'gemini-cli',
  stepsEs:[
    'Instala Node.js 20 o posterior si aún no está disponible.',
    'Instala Gemini CLI con el comando oficial mostrado abajo.',
    'Ejecuta gemini e inicia sesión con Google en el navegador. Para este inicio de sesión NO necesitas guardar una API key en MultiShell.',
    'En Conexiones IA pulsa Configurar automáticamente: MultiShell conserva los otros servidores de ~/.gemini/settings.json.',
    'Reinicia Gemini CLI y ejecuta /mcp list dentro de Gemini (o gemini mcp list en una terminal) para comprobar si MultiShell aparece conectado.'
  ],
  stepsEn:[
    'Install Node.js 20 or later if needed.',
    'Install Gemini CLI using the official command below.',
    'Run gemini and sign in with Google using your browser. This sign-in does NOT require storing an API key in MultiShell.',
    'Choose Configure automatically under AI Connections; MultiShell preserves other servers in ~/.gemini/settings.json.',
    'Restart Gemini CLI and run /mcp list in Gemini (or gemini mcp list in a shell) to check its real MCP status.'
  ],
  commands:[cmd('Instalar Gemini CLI','Install Gemini CLI','npm install -g @google/gemini-cli'),
    cmd('Iniciar Gemini / autorizar cuenta','Start Gemini / sign in','gemini'),
    cmd('Verificar servidores MCP','Verify MCP servers','gemini mcp list')],
  links:[link('Guía oficial de instalación','Official installation guide','https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/installation.mdx'),
    link('MCP en Gemini CLI','MCP in Gemini CLI','https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md'),
    ],
  fields:[],
  noteEs:'Gemini CLI se autentica desde su propia aplicación. No introduzcas una API key de Gemini ni credenciales de Google en MultiShell. Si usas la API, elige el perfil separado Gemini API.',
  noteEn:'Gemini CLI signs in through its own application. Do not enter Gemini API keys or Google credentials into MultiShell. For API access, use the separate Gemini API profile.'},
 {provider:'claude-code',
  stepsEs:[
    'Instala Claude Code desde el instalador oficial. En Windows puedes utilizar WinGet; en Linux/macOS consulta el instalador nativo oficial.',
    'Inicia claude y completa el acceso de tu cuenta en su flujo oficial. No introduzcas tu contraseña en MultiShell.',
    'Pulsa Configurar automáticamente para añadir MultiShell al .mcp.json del proyecto conservando otros servidores.',
    'Ejecuta claude mcp list y confirma las herramientas desde Claude Code cuando lo solicite.'
  ],
  stepsEn:[
    'Install Claude Code using its official installer. On Windows WinGet is available; on Linux/macOS follow the native-install guide.',
    'Run claude and complete your account sign-in using its own flow. Do not enter your password in MultiShell.',
    'Choose Configure automatically to add MultiShell to this project .mcp.json without replacing other servers.',
    'Run claude mcp list and approve project MCP tools inside Claude Code when prompted.'
  ],
  commands:[cmd('Instalar con WinGet','Install with WinGet','winget install Anthropic.ClaudeCode','windows'),
    cmd('Iniciar Claude Code','Launch Claude Code','claude'),
    cmd('Comprobar MCP','Check MCP','claude mcp list')],
  links:[link('Instalación oficial','Official setup','https://code.claude.com/docs/en/setup'),
    link('Servidores MCP en Claude Code','Claude Code MCP servers','https://code.claude.com/docs/en/mcp')],
  fields:[],
  noteEs:'Claude Code inicia sesión en Anthropic por su propio flujo. No solicita contraseñas ni API keys de la cuenta en MultiShell; configurar MCP no inicia sesión automáticamente.',
  noteEn:'Claude Code signs into Anthropic in its own application. MultiShell does not require account passwords or API keys; configuring MCP does not sign in automatically.'},
 {provider:'vscode',
  stepsEs:['Instala o actualiza VS Code y habilita GitHub Copilot si lo usas.',
    'En Conexiones IA pulsa Configurar automáticamente. Después verifica los MCP disponibles en el agente y autoriza las herramientas que necesites.'],
  stepsEn:['Install or update VS Code and enable GitHub Copilot if used.',
    'Choose Configure automatically. Check the available MCP servers in your agent and approve only the tools you intend to use.'],
  commands:[],links:[link('Documentación MCP de VS Code','VS Code MCP documentation',
    'https://code.visualstudio.com/docs/copilot/customization/mcp-servers')],
  fields:[],
  noteEs:'El inicio de sesión de Copilot se gestiona en VS Code. No guardes credenciales de GitHub aquí.',
  noteEn:'Copilot sign-in stays in VS Code. Do not paste GitHub credentials here.'},
 {provider:'cursor',
  stepsEs:['Instala Cursor desde su web oficial e inicia sesión dentro del editor.',
    'Pulsa Configurar automáticamente para añadir la entrada MCP a ~/.cursor/mcp.json.',
    'Comprueba las herramientas en Cursor Agent y acepta los permisos solicitados.'],
  stepsEn:['Install Cursor from its official site and sign in within the editor.',
    'Choose Configure automatically to add MCP in ~/.cursor/mcp.json.',
    'Inspect the MCP tools in Cursor Agent and approve requested access.'],
  commands:[],links:[link('Descargar Cursor','Download Cursor','https://cursor.com/downloads'),
    link('MCP en Cursor','Cursor MCP','https://docs.cursor.com/context/model-context-protocol')],
  fields:[],
  noteEs:'La cuenta y autorización de Cursor se tramitan en el editor; no requiere una API key de Cursor en MultiShell.',
  noteEn:'Cursor account authorization stays in the editor; no Cursor API key is required by MultiShell.'},
 {provider:'claude-web',
  stepsEs:['Necesitas una URL MCP pública HTTPS autenticada. La pasarela local de MultiShell NO es accesible desde Claude web.',
    'En Claude abre Personalizar / Conectores y registra un conector personalizado si tu cuenta lo permite.',
    'Completa OAuth o el mecanismo de autenticación ofrecido en Claude; no pegues la contraseña de Claude en MultiShell.',
    'Verifica herramientas y permisos en Claude antes de usarlo. Guardar campos aquí NO registra el conector automáticamente.'],
  stepsEn:['You need a reachable authenticated public HTTPS MCP URL. The local MultiShell gateway is NOT reachable from Claude web.',
    'In Claude open Customize / Connectors and register a custom connector if your account supports it.',
    'Complete OAuth or the supported authentication inside Claude; never enter your Claude password in MultiShell.',
    'Verify tools and permissions in Claude. Saving these fields does NOT register the connector automatically.'],
  commands:[],links:[link('Abrir Claude / Conectores','Open Claude / Connectors','https://claude.ai'),
    link('Ayuda de conectores de Claude','Claude connectors support','https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp')],
  fields:[publicMcpUrl,connectorId],
  noteEs:'Si el conector requiere OAuth, esa autorización se realiza en Claude. No solicites ni guardes aquí contraseñas, cookies ni tokens OAuth de sesión.',
  noteEn:'OAuth authorization belongs in Claude. Do not enter passwords, cookies or session OAuth tokens here.'},
 {provider:'grok-web',
  stepsEs:['La documentación oficial exige un MCP accesible públicamente por HTTPS; localhost no funciona.',
    'Abre grok.com/connectors → New Connector → Custom.',
    'Introduce la URL segura y termina la autenticación admitida por Grok. La configuración guardada en MultiShell no crea el túnel.'],
  stepsEn:['Official docs require a publicly accessible HTTPS MCP server; localhost is not accepted.',
    'Open grok.com/connectors → New Connector → Custom.',
    'Enter your secured URL and complete authentication supported by Grok. MultiShell does not create a tunnel by saving these values.'],
  commands:[],links:[link('Configurar conectores de Grok','Configure Grok connectors','https://grok.com/connectors'),
    link('Documentación oficial de Grok','Official Grok connector documentation','https://docs.x.ai/grok/connectors')],
  fields:[publicMcpUrl,connectorId,mcpBearer],
  noteEs:'El token es opcional y solo sirve si el conector admite credenciales Bearer. No se transmite automáticamente desde esta interfaz.',
  noteEn:'The token is optional and only useful if the connector supports Bearer credentials. It is not transmitted by this wizard.'},
 {provider:'gemini-api',
  stepsEs:['Crea una API key en Google AI Studio para tu aplicación cliente. Gemini CLI puede funcionar sin ella mediante inicio de sesión con Google.',
    'Interactions API admite MCP remoto Streamable HTTP, nombre de herramienta snake_case y encabezados de autenticación.',
    'Configura tu propia aplicación con la URL HTTPS y sus credenciales. Guardar estos valores en MultiShell NO llama a Interactions API.'],
  stepsEn:['Create an API key in Google AI Studio for an API client. Gemini CLI may instead use Google browser sign-in.',
    'Interactions API supports remote MCP Streamable HTTP, snake_case server names and authentication headers.',
    'Configure your own application with its HTTPS URL and credentials. Saving them in MultiShell does NOT invoke Interactions API.'],
  commands:[],links:[link('Crear API key en Google AI Studio','Create a Google AI Studio API key','https://aistudio.google.com/api-keys'),
    link('MCP con Gemini Interactions API','MCP with Gemini Interactions API','https://ai.google.dev/gemini-api/docs/function-calling')],
  fields:[publicMcpUrl,providerApiKey,mcpBearer],
  noteEs:'La API key de Google autentica la aplicación frente a Google; el token Bearer autentica el acceso al MCP. Son credenciales distintas.',
  noteEn:'The Google API key authenticates your application with Google; the Bearer token authenticates the MCP server. These are separate secrets.'},
 {provider:'mistral-work',
  stepsEs:['Comprueba el acceso a Connectors en Mistral Work o Studio y los permisos de administrador necesarios.',
    'Añade un MCP Connector personalizado indicando la URL HTTPS protegida.',
    'Completa su autorización en Mistral y comprueba las herramientas. Guardar la URL y el ID aquí no registra nada en Studio.'],
  stepsEn:['Check Connectors availability in Mistral Work or Studio and whether administrator rights are required.',
    'Add a custom MCP Connector with a protected HTTPS URL.',
    'Complete authorization within Mistral and test tools. Saving the URL and ID here does not register anything in Studio.'],
  commands:[],links:[link('MCP Connectors en Mistral Work','Mistral Work MCP Connectors','https://docs.mistral.ai/vibe/work/connectors/mcp-connectors'),
    link('Studio Connectors','Studio Connectors','https://docs.mistral.ai/studio/connectors')],
  fields:[publicMcpUrl,connectorId,mcpBearer],
  noteEs:'La disponibilidad depende del producto/plan y permisos. El token se guarda opcionalmente si la modalidad de conector lo admite.',
  noteEn:'Availability depends on product, plan and permissions. A token can be stored if your connector setup supports it.'},
 {provider:'cursor-remote',
  stepsEs:['Instala Cursor si aún no lo tienes y abre sus ajustes MCP.',
    'Crea una entrada MCP remota Streamable HTTP con URL HTTPS autenticada.',
    'Completa OAuth en Cursor cuando corresponda y verifica el estado de la conexión. El formulario no registra el servidor automáticamente.'],
  stepsEn:['Install Cursor if needed and open MCP settings.',
    'Add an authenticated HTTPS Streamable HTTP MCP entry.',
    'Complete OAuth in Cursor where supported and inspect its connection status. The form does not install this entry automatically.'],
  commands:[],links:[link('Documentación MCP de Cursor','Cursor MCP documentation','https://docs.cursor.com/context/model-context-protocol')],
  fields:[publicMcpUrl,connectorId,mcpBearer],
  noteEs:'La URL remota debe pertenecer a una pasarela HTTPS fiable. No publiques directamente los puertos de MultiShell.',
  noteEn:'The remote URL must be a trusted HTTPS gateway. Never expose raw MultiShell ports.'},
 {provider:'other',
  stepsEs:['Comprueba en la documentación de tu aplicación que admita MCP y el transporte local o remoto correspondiente.',
    'Este cliente no tiene un adaptador verificado; configúralo en la propia aplicación y verifica sus herramientas.'],
  stepsEn:['Verify in your application documentation that MCP and the relevant local or remote transport are supported.',
    'This client has no verified adapter; configure it in the application and check its tools.'],
  commands:[],links:[],fields:[publicMcpUrl,connectorId,mcpBearer],
  noteEs:'Campos opcionales para guardar datos de una integración manual. MultiShell no aplica esas credenciales ni puede verificar cualquier cliente sin un adaptador.',
  noteEn:'Optional fields for a manual integration. MultiShell does not apply these credentials or verify an arbitrary client without a dedicated adapter.'}
];
const guideMap=new Map<string,AiOnboardingGuide>(AI_ONBOARDING_GUIDES.map(x=>[x.provider,x]));
export function onboardingGuide(provider:unknown):AiOnboardingGuide|undefined{
  return typeof provider==='string'?guideMap.get(provider):undefined;
}
export function onboardingGuidesForUi():AiOnboardingGuide[]{
  return AI_ONBOARDING_GUIDES.map(g=>({...g,
    stepsEs:[...g.stepsEs],stepsEn:[...g.stepsEn],
    commands:g.commands.map(x=>({...x})),
    links:g.links.map(x=>({...x})),
    fields:g.fields.map(x=>({...x}))}));
}