import { spawn } from 'child_process';
import { join } from 'path';
import fs from 'fs';

// Create log directory if it doesn't exist
const logDir = join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Set up log files
const logFile = fs.createWriteStream(join(logDir, 'mcp-client.log'), {
  flags: 'a',
});
const errorLogFile = fs.createWriteStream(
  join(logDir, 'mcp-client-error.log'),
  { flags: 'a' }
);

// Simple function to log with timestamp
function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  logFile.write(logMessage + '\n');
}

// Start the MCP server as a child process
const serverProcess = spawn('node', [
  '-r',
  'dotenv/config',
  './node_modules/.bin/tsx',
  'src/server.ts',
]);

// Log server process ID
log(`MCP Server started with PID: ${serverProcess.pid}`);

// Handle server output
serverProcess.stdout.on('data', (data) => {
  const output = data.toString();
  log(`Server stdout: ${output}`);
});

serverProcess.stderr.on('data', (data) => {
  const output = data.toString();
  log(`Server stderr: ${output}`);
  errorLogFile.write(`[${new Date().toISOString()}] ${output}\n`);
});

// First, initialize the connection with protocol version
const initializeRequest =
  JSON.stringify({
    jsonrpc: '2.0',
    id: '1',
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      clientInfo: {
        name: 'TestMcpClient',
        version: '0.0.1',
      },
      capabilities: {
        tools: {},
      },
    },
  }) + '\n';

// List tools using the correct method
const listToolsRequest =
  JSON.stringify({
    jsonrpc: '2.0',
    id: '2',
    method: 'tools/list',
    params: {},
  }) + '\n';

// Try different methods for calling a tool
const toolCallMethods = [
  { name: 'tools/call', id: '3', params: { name: 'ping', arguments: {} } },
  { name: 'tool', id: '4', params: { name: 'ping', arguments: {} } },
  { name: 'call/tool', id: '5', params: { name: 'ping', arguments: {} } },
  { name: 'calltool', id: '6', params: { name: 'ping', arguments: {} } },
  { name: 'toolcall', id: '7', params: { name: 'ping', arguments: {} } },
];

// Wait a moment for the server to initialize, then send the initialize request
setTimeout(() => {
  log('Sending initialize request to server...');
  serverProcess.stdin.write(initializeRequest);

  // After initialization succeeded, list the tools
  setTimeout(() => {
    log('Sending tools/list request...');
    serverProcess.stdin.write(listToolsRequest);

    // After listing tools, try various tool call methods
    setTimeout(() => {
      toolCallMethods.forEach((method, index) => {
        setTimeout(() => {
          const request =
            JSON.stringify({
              jsonrpc: '2.0',
              id: method.id,
              method: method.name,
              params: method.params,
            }) + '\n';

          log(`Trying method: ${method.name}...`);
          serverProcess.stdin.write(request);
        }, index * 1000); // Send each request with a 1-second interval
      });
    }, 1000);
  }, 1000);
}, 1000);

// Handle server termination
serverProcess.on('close', (code) => {
  log(`Server process exited with code ${code}`);
});

// Handle process termination
process.on('SIGINT', () => {
  log('Received SIGINT, shutting down...');
  serverProcess.kill();
  process.exit(0);
});

// Set a timeout to end the test after a few seconds
setTimeout(() => {
  log('Test complete, shutting down...');
  serverProcess.kill();
  process.exit(0);
}, 15000);
