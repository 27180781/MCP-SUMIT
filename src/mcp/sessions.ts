import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { identityKey, type ConnectionIdentity } from "../auth/identity.js";
import type { ToolContext } from "./context.js";
import { createMcpServer } from "./server.js";

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  identity: string;
  lastSeen: number;
}

interface SseEntry {
  transport: SSEServerTransport;
  server: McpServer;
  identity: string;
}

export interface SessionManagerOptions {
  createContext: (identity: ConnectionIdentity) => ToolContext;
  idleMs: number;
  log: (level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Manages Streamable HTTP sessions (one McpServer per session so that each session
 * carries its own account/scope context) plus legacy SSE sessions.
 */
export class McpSessionManager {
  private sessions = new Map<string, SessionEntry>();
  private sse = new Map<string, SseEntry>();
  private sweeper?: NodeJS.Timeout;

  constructor(private readonly opts: SessionManagerOptions) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  get size(): number {
    return this.sessions.size;
  }

  async handleStreamable(req: Request, res: Response, identity: ConnectionIdentity): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const key = identityKey(identity);

    if (sessionId) {
      const entry = this.sessions.get(sessionId);
      if (!entry) {
        res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found (it may have expired) — re-initialize" }, id: null });
        return;
      }
      if (entry.identity !== key) {
        res.status(403).json({ jsonrpc: "2.0", error: { code: -32003, message: "Session belongs to a different credential" }, id: null });
        return;
      }
      entry.lastSeen = Date.now();
      await entry.transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === "POST" && isInitializeRequest(req.body)) {
      const ctx = this.opts.createContext(identity);
      const server = createMcpServer(ctx);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          this.sessions.set(sid, { transport, server, identity: key, lastSeen: Date.now() });
          this.opts.log("info", "mcp session initialized", { sid, actor: identity.name, kind: identity.kind });
        },
        onsessionclosed: (sid) => {
          this.sessions.delete(sid);
        }
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) this.sessions.delete(sid);
      };
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === "POST") {
      // Stateless fallback for clients that do not keep a session
      const ctx = this.opts.createContext(identity);
      const server = createMcpServer(ctx);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad request: missing Mcp-Session-Id header" }, id: null });
  }

  async handleSseConnect(req: Request, res: Response, identity: ConnectionIdentity, messagesPath: string): Promise<void> {
    const ctx = this.opts.createContext(identity);
    const server = createMcpServer(ctx);
    const transport = new SSEServerTransport(messagesPath, res);
    this.sse.set(transport.sessionId, { transport, server, identity: identityKey(identity) });
    transport.onclose = () => {
      this.sse.delete(transport.sessionId);
    };
    res.on("close", () => {
      this.sse.delete(transport.sessionId);
    });
    await server.connect(transport);
  }

  async handleSseMessage(req: Request, res: Response, identity: ConnectionIdentity): Promise<void> {
    const sessionId = String(req.query.sessionId || "");
    const entry = this.sse.get(sessionId);
    if (!entry) {
      res.status(404).json({ error: "SSE session not found" });
      return;
    }
    if (entry.identity !== identityKey(identity)) {
      res.status(403).json({ error: "Session belongs to a different credential" });
      return;
    }
    await entry.transport.handlePostMessage(req, res, req.body);
  }

  private sweep(): void {
    const cutoff = Date.now() - this.opts.idleMs;
    for (const [sid, entry] of this.sessions) {
      if (entry.lastSeen < cutoff) {
        this.sessions.delete(sid);
        void entry.transport.close().catch(() => undefined);
        void entry.server.close().catch(() => undefined);
        this.opts.log("info", "mcp session expired", { sid });
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const [sid, entry] of this.sessions) {
      this.sessions.delete(sid);
      await entry.transport.close().catch(() => undefined);
    }
    for (const [sid, entry] of this.sse) {
      this.sse.delete(sid);
      await entry.transport.close().catch(() => undefined);
    }
  }
}
