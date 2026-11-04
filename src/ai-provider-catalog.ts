/**
 * Capabilities of AI *client surfaces*, not model brands.
 * The official cloud account authorization remains outside MultiShell.
 * Do not turn a public tunnel into a working connection without auth/policy.
 */
export type RemoteProvider='claude-web'|'grok-web'|'gemini-api'|'mistral-work'|'cursor-remote';
export const REMOTE_PROVIDERS=[
 'claude-web','grok-web','gemini-api','mistral-work','cursor-remote'
] as const;
export type ProviderMode='local'|'remote'|'manual';
export interface AiClientCapability {
  id:string;
  name:string;
  mode:ProviderMode;
  transport:'local-http'|'remote-https'|'user-managed';
  setupUrl?:string;
  setupEs:string;
  setupEn:string;
  cautionEs:string;
  cautionEn:string;
  automatic:boolean;
}
export const AI_CLIENT_CATALOG:readonly AiClientCapability[]=[
 {
  id:'vscode',name:'GitHub Copilot / VS Code',mode:'local',transport:'local-http',
  setupUrl:'https://code.visualstudio.com/docs/agent-customization/mcp-servers',
  setupEs:'Utiliza una pasarela MCP local autenticada por IA y copia la configuración con un marcador de clave. La sesión y la clave se autorizan en Copilot.',
  setupEn:'Use a per-AI authenticated local MCP gateway and copy settings with a credential placeholder. Sign-in and secret configuration are handled by Copilot.',
  cautionEs:'Solo clientes locales; permisos MCP globales.',cautionEn:'Local clients only; server-wide MCP permissions.',automatic:false
 },
 {
  id:'claude-code',name:'Claude Code',mode:'local',transport:'local-http',
  setupUrl:'https://code.claude.com/docs/en/mcp',
  setupEs:'Configura una pasarela local autenticada para Claude Code. Usa la URL y una clave individual en su configuración segura; no copies la clave al proyecto.',
  setupEn:'Configure an authenticated local gateway for Claude Code. Use the URL and an individual credential in a secure client setting; do not commit the key to your project.',
  cautionEs:'La cuenta de Claude y la aceptación de herramientas se gestionan en Claude Code.',
  cautionEn:'Claude sign-in and tool approval stay within Claude Code.',automatic:false
 },
 {
  id:'gemini-cli',name:'Gemini CLI',mode:'local',transport:'local-http',
  setupUrl:'https://geminicli.com/docs/tools/mcp-server/',
  setupEs:'Configura Gemini CLI con una pasarela local autenticada y un encabezado Bearer individual, sin guardar secretos compartidos en el proyecto.',
  setupEn:'Configure Gemini CLI with an authenticated local gateway and an individual Bearer credential, without committing secrets to the project.',
  cautionEs:'No configura automáticamente Gemini web ni la API Gemini.',
  cautionEn:'Does not automatically configure Gemini web or the Gemini API.',automatic:false
 },
 {
  id:'cursor',name:'Cursor (editor)',mode:'local',transport:'local-http',
  setupUrl:'https://docs.cursor.com/context/model-context-protocol',
  setupEs:'Configura Cursor con la pasarela local autenticada y sus credenciales individuales, sin copiar el token interno del coordinador.',
  setupEn:'Configure Cursor with the authenticated local gateway and individual credentials, never the coordinator internal token.',
  cautionEs:'La integración local no registra conectores en una cuenta remota.',
  cautionEn:'Local integration does not register connectors in a remote account.',automatic:false
 },
 {
  id:'other',name:'Otro cliente MCP',mode:'manual',transport:'user-managed',
  setupEs:'Obtén la especificación MCP y el formato de configuración de tu cliente.',
  setupEn:'Consult your client MCP specification and supported configuration format.',
  cautionEs:'Es necesario un adaptador verificado para automatizarlo.',
  cautionEn:'A verified adapter is required for automated setup.',automatic:false
 },
 {
  id:'claude-web',name:'Claude (web / móvil / Cowork)',mode:'remote',transport:'remote-https',
  setupUrl:'https://claude.ai',
  setupEs:'En Claude: Personalizar → Conectores → Añadir conector personalizado. Necesita HTTPS público y autenticación compatible (OAuth o encabezados admitidos).',
  setupEn:'In Claude: Customize → Connectors → Add custom connector. Requires reachable HTTPS and supported authentication (OAuth or supported headers).',
  cautionEs:'Claude se conecta desde la nube de Anthropic, incluso si usas Claude Desktop. MultiShell aún no publica un gateway autenticado.',
  cautionEn:'Claude connects from Anthropic cloud, even when using Claude Desktop. MultiShell does not yet publish an authenticated gateway.',automatic:false
 },
 {
  id:'grok-web',name:'Grok (web)',mode:'remote',transport:'remote-https',
  setupUrl:'https://grok.com/connectors',
  setupEs:'En Grok: Connectors → New Connector → Custom. Introduce la URL del MCP remoto y completa la autenticación.',
  setupEn:'In Grok: Connectors → New Connector → Custom. Enter the remote MCP URL and complete authentication.',
  cautionEs:'No acepta localhost. Un túnel por sí solo NO protege las herramientas de tu ordenador.',
  cautionEn:'Localhost is not accepted. A tunnel alone does NOT protect computer tools.',automatic:false
 },
 {
  id:'gemini-api',name:'Gemini (Interactions API)',mode:'remote',transport:'remote-https',
  setupUrl:'https://ai.google.dev/gemini-api/docs/function-calling',
  setupEs:'Usa una herramienta mcp_server con nombre snake_case, URL Streamable HTTP y encabezados de autorización desde tu aplicación Gemini.',
  setupEn:'Use an mcp_server tool with snake_case name, Streamable HTTP URL, and authorization headers from your Gemini application.',
  cautionEs:'Es una integración API; no es el chat web de Gemini. Necesita gateway seguro y una aplicación cliente.',
  cautionEn:'This is an API integration, not Gemini web chat. Requires a secure gateway and a client application.',automatic:false
 },
 {
  id:'mistral-work',name:'Mistral (Work / Studio)',mode:'remote',transport:'remote-https',
  setupUrl:'https://docs.mistral.ai/vibe/work/connectors/mcp-connectors',
  setupEs:'Registra un conector MCP personalizado en Work/Studio con la URL pública y autoriza las credenciales según el producto.',
  setupEn:'Register a custom MCP connector in Work/Studio with the public URL and authorize credentials in that product.',
  cautionEs:'Puede requerir permisos de administrador. Los conectores de Studio son una función en vista previa.',
  cautionEn:'Administrator privileges may be required. Studio connectors are in preview.',automatic:false
 },
 {
  id:'cursor-remote',name:'Cursor (MCP remoto)',mode:'remote',transport:'remote-https',
  setupUrl:'https://docs.cursor.com/context/model-context-protocol',
  setupEs:'Configura un servidor Streamable HTTP remoto en Cursor. Utiliza OAuth cuando la instalación lo soporte.',
  setupEn:'Configure a remote Streamable HTTP server in Cursor. Use OAuth where supported.',
  cautionEs:'Necesita un gateway HTTPS protegido, distinto de la conexión local existente.',
  cautionEn:'Requires a protected HTTPS gateway, unlike the existing local connection.',automatic:false
 }
];
const catalogMap=new Map(AI_CLIENT_CATALOG.map(item=>[item.id,item]));
export function getAiClientCapability(id:unknown):AiClientCapability|undefined{
 return typeof id==='string'?catalogMap.get(id):undefined;
}
export function isRemoteProvider(value:unknown):value is RemoteProvider{
 return typeof value==='string' && (REMOTE_PROVIDERS as readonly string[]).includes(value);
}
export function clientCapabilitiesForUi():AiClientCapability[]{
 return AI_CLIENT_CATALOG.map(x=>({...x}));
}
