import express, { Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import { HTTP_RECEIVE_LIMITS } from './http-limits';
import {createMcpHandler} from '@modelcontextprotocol/server';
import {Readable} from 'stream';
import {AsyncLocalStorage} from 'async_hooks';
import {createMcpServer} from './tools/mcp-v2-server';
import { ShellApi } from './shell-api';
import {
  WindowRouter,
  REGISTER_PATH,
  CONTROL_PATH,
  authenticated,
  Registration
} from './multi-window';
import {listSkillsForShell} from './tools/agent-skills';
import { logger } from './utils/logger';
import { adaptLegacyToolCall } from './legacy-bridge';
import {validBearer} from './ai-access';

function legacyHelp() {
  return {usage:{windows:{command:'windows',cwd:'@mcp'},
    shells:{command:'shells',cwd:'@mcp'},
    skills:{command:'skills <shell_id> [global|project|all]',cwd:'@mcp'},
    execute:{command:'<your command>',cwd:'@shell:<shell_id>'},
    files:'@shell:<alias>/relative/path',example:'shell=1; cwd=@shell:1'}};
}

/** Preserve the existing control response shape after normal v2 tool dispatch. */
function legacyControlResponse(raw:string,command:'windows'|'shells'|'skills'|'help'):string {
  const response=JSON.parse(raw);
  const result=response.result;
  const item=result?.content?.[0];
  if(result?.isError||item?.type!=='text'||typeof item.text!=='string'){return raw;}
  let value=JSON.parse(item.text);
  if(command==='windows'){value=value.windows;}
  else if(command==='shells'){value=value.shells;}
  else if(command==='help'){value=legacyHelp();}
  else if(Array.isArray(value.entries)){value.total=value.entries.length;}
  item.text=JSON.stringify(value,null,2);
  return JSON.stringify(response);
}

/** Track the actual HTTP request cancellation across SDK async callbacks.
 * Some SDK callbacks run after streaming response setup; a request-specific
 * AsyncLocalStorage context avoids relying solely on SDK protocol cancellation.
 */
const httpAbortContext=new AsyncLocalStorage<AbortSignal>();

export interface ToolConfiguration {
  file: boolean;
  edit: boolean;
  shell: boolean;
  /** Explicit opt-in before the MCP client can read user-level Codex skills. */
  globalSkills?: boolean;
}

/**
 * Stateless MCP requires a fresh SDK transport/server PER HTTP request.
 * The earlier single stateless transport handled initialize, then failed
 * subsequent requests with HTTP 500 in SDK 1.x. ShellManager is shared,
 * but request transports and message IDs are independent.
 */
export class MCPServer {
  private readonly app = express();
  private mcpHandler?: ReturnType<typeof createMcpHandler>;
  private httpServer?: Server;
  private healthy = false;
  private starting?: Promise<void>;
  private stopping?: Promise<void>;
  /** Active HTTP requests, not MCP v1 transport sessions. Kept observable
   * for lifecycle assertions and reliably aborted when the listener stops. */
  readonly sessions=new Set<AbortController>();

  constructor(
    private readonly port = 3000,
    private readonly host = '127.0.0.1',
    private readonly shells: ShellApi,
    private readonly config: ToolConfiguration = {
      file: true,
      edit: true,
      shell: true
    },
    private readonly registrationRouter?: WindowRouter,
    private readonly access?:{bearerToken?:string;localToken?:string;isEnabled?:()=>boolean}
  ) {
    // The tunnel's server-to-server requests normally omit Origin. Do not
    // introduce OAuth or custom headers that would break its no-auth profile.
    this.app.use((req,res,next)=>{
      // DNS rebinding defense: Host must be a loopback literal or localhost.
      // Tunnel Client connects to 127.0.0.1, so this adds no credentials.
      const hostHeader=req.headers.host;
      if(typeof hostHeader!=='string' ||
        !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i.test(hostHeader)){
        res.status(403).json({error:'Untrusted request host'});
        return;
      }
      const origin=req.headers.origin;
      if(!origin){next();return;}
      let permitted=false;
      try{
        const value=new URL(origin);
        const hostname=value.hostname.toLowerCase();
        permitted=(value.protocol==='http:' &&
          ['localhost','127.0.0.1','[::1]'].includes(hostname)) ||
          (value.protocol==='https:' &&
          ['chatgpt.com','api.openai.com'].includes(hostname));
      }catch{/* Invalid browser Origin. */}
      if(!permitted){res.status(403).json({error:'Untrusted request origin'});return;}
      next();
    });
    // Every production listener is authenticated: the local coordinator uses
    // a shared private token, while independent AI gateways use Bearer keys.
    // The test-only no-access constructor remains available for fixtures.
    if(this.access){
      this.app.use('/mcp',(req,res,next)=>{
        if(this.access!.isEnabled&&this.access!.isEnabled()===false){
          res.status(503).setHeader('Cache-Control','no-store');
          res.json({error:'AI gateway no longer belongs to a trusted active coordinator.'});
          return;
        }
        const authorized=this.access!.localToken!==undefined
          ?authenticated(req.headers['x-multishell-local-auth'],this.access!.localToken)
          :validBearer(req.headers.authorization,this.access!.bearerToken||'');
        if(!authorized){
          res.status(401).setHeader('WWW-Authenticate','Bearer realm="multishell"');
          res.setHeader('Cache-Control','no-store');
          res.json({error:'Invalid or missing AI connection credentials.'});
          return;
        }
        next();
      });
    }
    this.app.use(express.json({ limit: '2mb' }));
    this.app.post(REGISTER_PATH, async (req, res) => {
      if (!this.registrationRouter) {
        res.status(404).end();
        return;
      }
      if (
        !authenticated(
          req.headers['x-multishell-token'],
          this.registrationRouter.secret
        )
      ) {
        res.status(403).json({ error: 'Authentication required' });
        return;
      }
      try {
        const registration = req.body as Registration;
        this.registrationRouter.register(registration);
        await this.registrationRouter.reconcile(registration.window_id);
        res.status(200).json({ registered: registration.window_id });
      } catch (e) {
        res
          .status(400)
          .json({ error: e instanceof Error ? e.message : String(e) });
      }
    });
    this.app.post(CONTROL_PATH, async (req, res) => {
      if (!this.registrationRouter) {
        res.status(404).end();
        return;
      }
      if (
        !authenticated(
          req.headers['x-multishell-token'],
          this.registrationRouter.secret
        )
      ) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }
      try {
        const m = req.body as {
          op: string;
          id?: string;
          cwd?: string;
          share?: boolean;
          origin?: 'user';
          panelPermit?: string;
          window_id?: string;
          alias?: string;
        };
        let result: unknown;
        if (m.op === 'windows') {result = this.registrationRouter.windows();}
        else if (m.op === 'create') {
          if (!m.window_id) {throw new Error('Explicit window_id required.');}
          result = m.origin==='user'
            ? await this.registrationRouter.createPanelUser(m.id!,m.cwd,m.share===true,m.window_id,m.panelPermit)
            : await this.registrationRouter.create(m.id!,m.cwd,m.share===true,m.window_id);
        } else if (m.op === 'alias') {
          if(!m.window_id){throw new Error('Explicit window_id required.');}
          const owner=this.registrationRouter.ownerOf(m.id!);
          if(owner!==m.window_id){throw new Error('The shell belongs to another window.');}
          result=await this.registrationRouter.setAlias(m.id!,m.alias!);
        } else if (m.op === 'close') {
          if (
            !m.window_id ||
            !this.registrationRouter
              .windows()
              .some(w => w.window_id === m.window_id)
          ) {
            throw new Error('Valid window_id required.');
          }
          const owner = this.registrationRouter.ownerOf(m.id!);
          if (owner !== m.window_id)
            {throw new Error('The shell belongs to another window.');}
          await this.registrationRouter.close(m.id!,true);
          result = { closed: m.id };
        } else {throw new Error('Unsupported action');}
        res.status(200).json({ result });
      } catch (e) {
        res
          .status(400)
          .json({ error: e instanceof Error ? e.message : String(e) });
      }
    });
    this.app.post('/mcp',(req,res)=>{void this.handleMcp(req,res);});
    this.app.get('/mcp', (_, res) => {
      res.status(405).end('Standalone SSE not available.');
    });
    this.app.delete('/mcp', (_, res) => {
      res.status(405).end('Stateless MCP; no persistent session to delete.');
    });
    this.app.use((error:unknown,req:Request,res:Response,next:NextFunction)=>{
      if(req.aborted||res.destroyed){return;}
      if(res.headersSent){next(error);return;}
      const status=(error as {status?:number})?.status;
      const code=status===413?413:status===400?400:500;
      if(code===500){logger.error('MultiShell HTTP request failed: '+String(error));}
      res.status(code).json({error:code===413?'Request exceeds 2 MB':code===400?'Invalid JSON request':'Internal error'});
    });
  }

  /** One SDK v2 handler serves both the 2025 initialize era and 2026 discover
   * era. Preserve compatibility with old @mcp selectors without bypassing
   * the SDK's modern routing-header consistency checks. */
  private async handleMcp(req:Request,res:Response):Promise<void>{
    const handler=this.mcpHandler;
    if(!handler){res.status(503).end('MCP handler unavailable.');return;}
    // Apply the same bound to BOTH the main MCP listener and AI gateways.
    // Requests failing authentication are rejected by middleware first.
    if(this.sessions.size>=32){
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Retry-After','1');
      res.status(429).json({error:'MCP concurrency limit reached.'});
      return;
    }
    const abort=new AbortController();
    this.sessions.add(abort);
    let finished=false;
    const socketClosed=()=>{if(!finished){abort.abort();}};
    req.socket.once('close',socketClosed);
    res.once('finish',()=>{
      finished=true;
      this.sessions.delete(abort);
      req.socket.off('close',socketClosed);
    });
    res.once('close',()=>{
      if(!finished){abort.abort();}
      this.sessions.delete(abort);
      req.socket.off('close',socketClosed);
    });
    req.once('aborted',()=>abort.abort());
    try{
      const headers=new Headers();
      for(const [key,value] of Object.entries(req.headers)){
        if(typeof value==='string'&&!['connection','content-length','transfer-encoding'].includes(key)){
          headers.set(key,value);
        }
      }
      let body:unknown=req.body;
      let control:'windows'|'shells'|'skills'|'help'|undefined;
      const incoming=req.body as {method?:unknown;params?:{name?:unknown;
        _meta?:Record<string,unknown>}}|null;
      const modern=incoming?.method==='server/discover'||
        headers.get('mcp-protocol-version')==='2026-07-28'||
        incoming?.params?._meta?.['io.modelcontextprotocol/protocolVersion']==='2026-07-28';
      const toolRequest=incoming?.method==='tools/call'&&
        typeof incoming.params?.name==='string';
      const routeMatches=!modern||
        (headers.get('mcp-method')==='tools/call'&&
          headers.get('mcp-name')===incoming?.params?.name);
      if(toolRequest&&routeMatches){
        const adapted=adaptLegacyToolCall(req.body);
        if(adapted.kind==='error'){
          res.status(200).json({jsonrpc:'2.0',id:adapted.requestId,
            result:{resultType:'complete',ttlMs:0,cacheScope:'private',isError:true,
              content:[{type:'text',text:JSON.stringify({error:adapted.message})}]}});
          return;
        }
        if(adapted.kind==='rewrite'){body=adapted.request;}
        else if(adapted.kind==='control'){
          control=adapted.command;
          const name=control==='skills'?'list_skill_names_code':
            control==='shells'?'list_shells_code':'list_windows_code';
          body={...req.body,params:{...req.body.params,name,
            arguments:control==='skills'?{shell_id:adapted.shellId,scope:adapted.scope||'all'}:{}}};
          if(modern){headers.set('mcp-name',name);}
        }
      }
      // express.json() has already consumed the Node request stream. Feed
      // the official v2 handler a web-standard request with the same headers.
      const webRequest=new globalThis.Request(
        'http://127.0.0.1:'+this.port+'/mcp',
        {method:'POST',headers,body:JSON.stringify(body),signal:abort.signal});
      const answer=await httpAbortContext.run(abort.signal,()=>handler.fetch(webRequest));
      if(res.headersSent||res.destroyed){return;}
      res.status(answer.status);
      answer.headers.forEach((value,key)=>{
        if(!['content-length','transfer-encoding','connection'].includes(key)){
          res.setHeader(key,value);
        }
      });
      if(control&&answer.ok){
        let result=Buffer.from(await answer.arrayBuffer());
        if(answer.headers.get('content-type')?.includes('text/event-stream')){
          result=Buffer.from(result.toString('utf8').split('\n').map(line=>
            line.startsWith('data:')?'data: '+legacyControlResponse(line.slice(5),control!):line).join('\n'));
        }else{
          result=Buffer.from(legacyControlResponse(result.toString('utf8'),control));
        }
        if(!res.destroyed){res.send(result);}
        return;
      }
      // Preserve streaming response semantics and client cancellation rather
      // than buffering a long-running SSE tool response into memory.
      if(!answer.body){res.end();return;}
      const stream=Readable.fromWeb(answer.body as import('stream/web').ReadableStream);
      stream.on('error',error=>{
        logger.warn('MCP response stream closed: '+String(error));
        if(!res.destroyed){res.destroy(error as Error);}
      });
      if(res.destroyed){stream.destroy();return;}
      stream.pipe(res);
    }catch(error){
      if(!res.headersSent&&!res.destroyed){
        logger.error('MCP v2 HTTP request error: '+String(error));
        res.status(500).json({jsonrpc:'2.0',id:null,
          error:{code:-32603,message:'MCP request failed'}});
      }
    }
  }

  /** True only while the local HTTP listener can accept connections. */
  public get listeningPort():number{
    const address=this.httpServer?.address();
    return address&&typeof address==='object'?address.port:0;
  }
  public isHealthy(): boolean {
    return this.healthy && Boolean(this.httpServer?.listening);
  }

  public async start(): Promise<void> {
    if (this.stopping) {await this.stopping;}
    if (this.isHealthy()) {return;}
    if (this.starting) {return this.starting;}
    const work = this.startListener();
    this.starting = work;
    try {await work;}
    finally {if (this.starting === work) {this.starting = undefined;}}
  }

  private async startListener(): Promise<void> {
    this.mcpHandler=createMcpHandler(({requestInfo})=>{
        const fromHttp=httpAbortContext.getStore();
        const signal=fromHttp&&requestInfo?.signal
            ? AbortSignal.any([fromHttp,requestInfo.signal])
            : (fromHttp||requestInfo?.signal);
        return createMcpServer(this.shells,this.config,signal);
    },
        {legacy:'stateless'});
    await new Promise<void>((resolve, reject) => {
      const listener = createServer(HTTP_RECEIVE_LIMITS, this.app);
      this.httpServer = listener;
      // Node.js error events without a permanent listener can terminate the
      // extension host. Keep this handler for the entire server lifetime.
      listener.on('error', error => {
        if (this.httpServer === listener) {this.healthy = false;}
        logger.error('MultiShell MCP listener error: ' + String(error));
      });
      listener.on('close', () => {
        if (this.httpServer === listener) {
          this.healthy = false;
          logger.warn('MultiShell MCP HTTP listener closed.');
        }
      });
      const started = () => {
        listener.off('error', failed);
        this.healthy = true;
        resolve();
      };
      const failed = (error: Error) => {
        listener.off('listening', started);
        this.healthy = false;
        if (this.httpServer === listener) {this.httpServer = undefined;}
        reject(error);
      };
      listener.once('listening', started);
      listener.once('error', failed);
      listener.listen(this.port, this.host);
    });
    logger.info('MultiShell MCP listening on ' + this.host + ':' + this.port);
  }

  public async stop(): Promise<void> {
    if (this.stopping) {return this.stopping;}
    const work = this.stopListener();
    this.stopping = work;
    try {await work;}
    finally {if (this.stopping === work) {this.stopping = undefined;}}
  }

  private async stopListener(): Promise<void> {
    await this.starting?.catch(() => {});
    const modern=this.mcpHandler;
    this.mcpHandler=undefined;
    for(const request of this.sessions){request.abort();}
    await modern?.close();
    const http = this.httpServer;
    this.httpServer = undefined;
    this.healthy = false;
    if (http) {
      const closing = new Promise<void>(resolve => http.close(() => resolve()));
      const timer = setTimeout(() => {
        http.closeAllConnections?.();
      }, 1500);
      try {
        await closing;
      } finally {
        clearTimeout(timer);
      }
    }
    this.sessions.clear();
  }
}