import express, { Request, Response } from 'express';
import { Server } from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ShellApi } from './shell-api';
import {
  WindowRouter,
  REGISTER_PATH,
  CONTROL_PATH,
  authenticated,
  Registration
} from './multi-window';
import { registerShellTools } from './tools/shell-tools';
import { registerScopedFileTools } from './tools/scoped-file-tools';
import { registerNativeTools } from './tools/native-mcp-tools';
import { logger } from './utils/logger';
import { adaptLegacyToolCall } from './legacy-bridge';

export interface ToolConfiguration {
  file: boolean;
  edit: boolean;
  shell: boolean;
}

/**
 * Stateless MCP requires a fresh SDK transport/server PER HTTP request.
 * The earlier single stateless transport handled initialize, then failed
 * subsequent requests with HTTP 500 in SDK 1.x. ShellManager is shared,
 * but request transports and message IDs are independent.
 */
export class MCPServer {
  private readonly app = express();
  private httpServer?: Server;
  private readonly sessions = new Set<{
    transport: StreamableHTTPServerTransport;
    mcp: McpServer;
  }>();

  constructor(
    private readonly port = 3000,
    private readonly host = '127.0.0.1',
    private readonly shells: ShellApi,
    private readonly config: ToolConfiguration = {
      file: true,
      edit: true,
      shell: true
    },
    private readonly registrationRouter?: WindowRouter
  ) {
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
          window_id?: string;
          alias?: string;
        };
        let result: unknown;
        if (m.op === 'windows') {result = this.registrationRouter.windows();}
        else if (m.op === 'create') {
          if (!m.window_id) {throw new Error('Explicit window_id required.');}
          result = await this.registrationRouter.create(
            m.id!,
            m.cwd,
            m.share === true,
            m.window_id,
            m.origin === 'user' ? 'user' : 'mcp'
          );
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
          await this.registrationRouter.close(m.id!);
          result = { closed: m.id };
        } else {throw new Error('Unsupported action');}
        res.status(200).json({ result });
      } catch (e) {
        res
          .status(400)
          .json({ error: e instanceof Error ? e.message : String(e) });
      }
    });
    this.app.post('/mcp', (req, res) => {
      const adapted = adaptLegacyToolCall(req.body);
      if (adapted.kind === 'rewrite') {
        req.body = adapted.request;
      } else if (adapted.kind === 'error') {
        res
          .status(200)
          .json({
            jsonrpc: '2.0',
            id: adapted.requestId,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: adapted.message })
                }
              ]
            }
          });
        return;
      } else if (adapted.kind === 'control') {
        void (async () => {
          try {
            let value: unknown;
            if (adapted.command === 'windows') {
              value = this.shells.windows?.() || [];
            } else if (adapted.command === 'shells') {
              value = await this.shells.list();
            } else {
              value = {
                usage: {
                  windows: { command: 'windows', cwd: '@mcp' },
                  shells: { command: 'shells', cwd: '@mcp' },
                  execute: {
                    command: '<your command>',
                    cwd: '@shell:<shell_id>'
                  },
                  files: '@shell:<alias>/relative/path',
                  example: 'shell=1; cwd=@shell:1'
                }
              };
            }
            res
              .status(200)
              .json({
                jsonrpc: '2.0',
                id: adapted.requestId,
                result: {
                  content: [
                    { type: 'text', text: JSON.stringify(value, null, 2) }
                  ]
                }
              });
          } catch (error) {
            res
              .status(200)
              .json({
                jsonrpc: '2.0',
                id: adapted.requestId,
                result: {
                  isError: true,
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({ error: String(error) })
                    }
                  ]
                }
              });
          }
        })();
        return;
      }
      void this.handle(req, res);
    });
    this.app.get('/mcp', (_, res) => {
      res.status(405).end('Standalone SSE not available.');
    });
    this.app.delete('/mcp', (_, res) => {
      res.status(405).end('Stateless MCP; no persistent session to delete.');
    });
  }

  private registerTools(mcp: McpServer): void {
    if (this.config.file || this.config.edit) {
      registerScopedFileTools(mcp, this.shells);
    }
    if (this.config.shell) {
      registerShellTools(mcp, this.shells);
    }
    registerNativeTools(mcp,this.shells);
  }

  private async handle(req: Request, res: Response): Promise<void> {
    const mcp = new McpServer({
      name: 'multi-shell-mcp-server',
      version: '0.10.0'
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    const session = { mcp, transport };
    let cleaned = false;
    const cleanup = async () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      this.sessions.delete(session);
      try {
        await transport.close();
      } catch {}
      try {
        await mcp.close();
      } catch {}
    };
    this.sessions.add(session);
    res.once('finish', () => {
      void cleanup();
    });
    res.once('close', () => {
      void cleanup();
    });
    try {
      this.registerTools(mcp);
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('MultiShell MCP request error: ' + String(error));
      if (!res.headersSent) {
        res
          .status(500)
          .json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error' },
            id: null
          });
      }
      await cleanup();
    }
  }

  public async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const listener = this.app.listen(this.port, this.host);
      this.httpServer = listener;
      const started = () => {
        listener.off('error', failed);
        resolve();
      };
      const failed = (error: Error) => {
        listener.off('listening', started);
        reject(error);
      };
      listener.once('listening', started);
      listener.once('error', failed);
    });
    logger.info('MultiShell MCP listening on ' + this.host + ':' + this.port);
  }

  public async stop(): Promise<void> {
    const http = this.httpServer;
    this.httpServer = undefined;
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
    for (const session of [...this.sessions]) {
      try {
        await session.transport.close();
      } catch {}
      try {
        await session.mcp.close();
      } catch {}
    }
    this.sessions.clear();
  }
}