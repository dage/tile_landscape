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
  path.join(logDir, 'mcp-standalone-server.log'),
  { flags: 'a' }
);

// Log everything to stderr and to debug file
function logDebug(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.error(logMessage);
  debugLogFile.write(logMessage + '\n');
}

logDebug('Starting standalone MCP server...');

// Create server with explicit version and capabilities specification
const server = new McpServer({
  name: 'MCP Example Server',
  version: '1.0.0',
  capabilities: {
    tools: {}, // Specify that this server has tool capabilities
  },
});

logDebug('Created McpServer instance');

// Simple ping tool
server.tool('ping', 'A simple ping tool that returns pong', async () => {
  logDebug('Ping tool called');
  return {
    content: [{ type: 'text', text: 'pong' }],
  };
});

// Define types for our tool arguments
interface HelloArgs {
  name: string;
}

interface CalculateArgs {
  operation: string;
  a: number;
  b: number;
}

// Add a hello tool that takes a name parameter
server.tool(
  'hello',
  'Say hello to someone',
  // This is necessary for proper MCP type validation
  { name: { type: 'string', description: 'Name to greet' } },
  async (args: HelloArgs) => {
    const name = args.name || 'World';
    logDebug(`Hello tool called with name: ${name}`);
    return {
      content: [{ type: 'text', text: `Hello, ${name}!` }],
    };
  }
);

// Add a calculator tool
server.tool(
  'calculate',
  'Perform a calculation',
  {
    operation: {
      type: 'string',
      description: 'Operation to perform (add, subtract, multiply, divide)',
    },
    a: { type: 'number', description: 'First number' },
    b: { type: 'number', description: 'Second number' },
  },
  async (args: CalculateArgs) => {
    logDebug(`Calculate tool called with: ${JSON.stringify(args)}`);

    // If we're getting a signal object instead of our expected arguments,
    // log the full input to help debug
    if (!args.operation) {
      logDebug(`Invalid arguments received: ${JSON.stringify(args)}`);
      return {
        content: [{ type: 'text', text: 'Error: Invalid arguments' }],
        isError: true,
      };
    }

    const { operation, a, b } = args;
    let result: number;

    switch (operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        if (b === 0) {
          return {
            content: [{ type: 'text', text: 'Error: Division by zero' }],
            isError: true,
          };
        }
        result = a / b;
        break;
      default:
        return {
          content: [
            { type: 'text', text: `Error: Unknown operation ${operation}` },
          ],
          isError: true,
        };
    }

    return {
      content: [{ type: 'text', text: `${a} ${operation} ${b} = ${result}` }],
    };
  }
);

logDebug('Registered tools');

// Keep the process running and prevent it from exiting on error
process.on('uncaughtException', (error) => {
  logDebug(`Uncaught exception: ${error.message}`);
  logDebug(error.stack || '');
});

process.on('unhandledRejection', (reason, promise) => {
  logDebug(`Unhandled rejection at: ${promise}, reason: ${reason}`);
});

// Set up clean shutdown
process.on('SIGINT', async () => {
  logDebug('Received SIGINT, shutting down gracefully...');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logDebug('Received SIGTERM, shutting down gracefully...');
  await server.close();
  process.exit(0);
});

// Start the server
async function main() {
  logDebug('Starting MCP server connection...');
  const transport = new StdioServerTransport();

  try {
    logDebug('Connecting transport...');
    await server.connect(transport);
    logDebug('MCP Server connected and running on stdio.');

    // Log registered tools for debugging
    const tools = Object.keys((server as any)._registeredTools || {});
    logDebug(`Registered tools: ${JSON.stringify(tools)}`);

    logDebug(
      'Server is now waiting for client connections. Press Ctrl+C to exit.'
    );
  } catch (error) {
    logDebug(`Failed to connect MCP Server: ${error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  logDebug(`Fatal error in MCP Server main: ${error}`);
});
