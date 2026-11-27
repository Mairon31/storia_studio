import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createStoriaMcpServer } from "./server.js";

/**
 * Handles a single Streamable HTTP MCP request (`/mcp`) in stateless JSON-RPC mode.
 * Stateless mode guarantees clean reconnection across ngrok / Cloudflare tunnels and server restarts
 * for remote AI harnesses (Claude, Codex, Antigravity, OpenCode, Cursor, ChatGPT Connectors, etc.).
 */
export async function handleStoriaMcpHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody: unknown,
  serverBaseUrl: string,
): Promise<void> {
  // Normalize Accept header for web AI connectors (ChatGPT / Gemini / proxies) that send
  // `Accept: application/json` or `*/*`; we always return JSON via `enableJsonResponse: true`.
  const currentAccept = String(req.headers.accept ?? "");
  if (!currentAccept.includes("application/json") || !currentAccept.includes("text/event-stream")) {
    req.headers.accept = "application/json, text/event-stream";
  }

  // Disable arbitrary local disk read/write tools over remote HTTP MCP transport for zero-trust security
  const mcpServer = createStoriaMcpServer({
    serverUrl: serverBaseUrl,
    allowLocalFilesystem: false,
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close().catch(() => {});
    void mcpServer.close().catch(() => {});
  });

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
}
