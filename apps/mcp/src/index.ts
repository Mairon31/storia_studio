#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createStoriaMcpServer } from "./server.js";

export * from "./audit.js";
export * from "./client.js";
export * from "./http.js";
export * from "./server.js";

async function main() {
  const server = createStoriaMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[storia-studio-mcp] Connected over stdio");
}

// Run stdio server only when executed directly (not when imported by tests)
const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("index.js") || process.argv[1].endsWith("index.ts"));

if (isDirectExecution) {
  main().catch((err) => {
    console.error("[storia-studio-mcp] Fatal error:", err);
    process.exit(1);
  });
}
