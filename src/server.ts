// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Ensure logs directory exists
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Create debug log file
const debugLogFile = fs.createWriteStream(
  path.join(logDir, 'mcp-server-debug.log'),
  { flags: 'a' }
);

// Log everything to stderr and to debug file
function logDebug(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.error(logMessage);
  debugLogFile.write(logMessage + '\n');
}

logDebug('Starting MCP server setup...');

// Create server with explicit version and capabilities specification
const server = new McpServer({
  name: 'PingServer',
  version: '0.0.1',
  capabilities: {
    tools: {}, // Specify that this server has tool capabilities
  },
});

logDebug('Created McpServer instance');

// Simple ping tool - using a description and callback
server.tool('ping', 'A simple ping tool that returns pong', async () => {
  logDebug('Ping tool called');
  return {
    content: [{ type: 'text', text: 'pong' }],
  };
});

logDebug('Registered ping tool');

// Listen to stdin directly for debugging
process.stdin.on('data', (data) => {
  const message = data.toString();
  logDebug(`Received input: ${message.trim()}`);
});

// Override console.log to capture output to stdout
const originalConsoleLog = console.log;
console.log = (...args) => {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    .join(' ');

  logDebug(`Sending output: ${message.trim()}`);
  return originalConsoleLog.apply(console, args);
};

async function main() {
  logDebug('Starting MCP server connection...');
  const transport = new StdioServerTransport();

  try {
    logDebug('Connecting transport...');
    await server.connect(transport);
    logDebug('MCP Ping Server connected and running on stdio.');

    // Log registered tools for debugging
    const tools = Object.keys((server as any)._registeredTools || {});
    logDebug(`Registered tools: ${JSON.stringify(tools)}`);

    // Log available methods if possible
    if ((server as any).server && (server as any).server._handlers) {
      const methods = Object.keys((server as any).server._handlers);
      logDebug(`Available methods: ${JSON.stringify(methods)}`);
    }
  } catch (error) {
    logDebug(`Failed to connect MCP Ping Server: ${error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  logDebug(`Fatal error in MCP Ping Server main: ${error}`);
  process.exit(1);
});
