import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Create log directory if it doesn't exist
const logDir = join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Set up log file
const logFile = fs.createWriteStream(join(logDir, 'test-standalone.log'), {
  flags: 'a',
});

// Simple function to log with timestamp
function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  logFile.write(logMessage + '\n');
}

// Start the standalone server as a separate process (simulate Cursor's behavior)
const serverProcess = spawn('npm', ['run', 'start:mcp-standalone'], {
  detached: false, // Keep it attached to the parent process
  stdio: ['pipe', 'pipe', 'pipe'], // We need to pipe stdio to communicate
});

log(`Standalone server process started with PID: ${serverProcess.pid}`);

// Give the server a moment to start up
setTimeout(async () => {
  try {
    log('Starting test sequence...');

    // Run a sequence of tests
    await testInitialize(serverProcess);

    // Test listing tools
    const tools = await testListTools(serverProcess);
    log(
      `Server has ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`
    );

    // Test each tool
    for (const tool of tools) {
      await testTool(serverProcess, tool);
    }

    log('All tests completed successfully!');
  } catch (error) {
    log(`Test failed: ${error}`);
  } finally {
    // Clean up - send SIGINT to allow graceful shutdown
    serverProcess.kill('SIGINT');

    // Give the server a moment to shut down cleanly
    setTimeout(() => {
      log('Test script complete');
      process.exit(0);
    }, 1000);
  }
}, 2000);

// Track server output
serverProcess.stdout?.on('data', (data) => {
  const output = data.toString().trim();
  if (output) {
    log(`Server stdout: ${output}`);
  }
});

serverProcess.stderr?.on('data', (data) => {
  const output = data.toString().trim();
  if (output) {
    log(`Server stderr: ${output}`);
  }
});

serverProcess.on('close', (code) => {
  log(`Server process exited with code ${code}`);
});

// Test initialize
async function testInitialize(serverProcess: ChildProcess): Promise<void> {
  log('Testing initialize...');

  const result = await sendRequest(serverProcess, 'initialize', {
    protocolVersion: '2025-03-26',
    clientInfo: {
      name: 'TestClient',
      version: '0.0.1',
    },
    capabilities: {
      tools: {},
    },
  });

  log(`Initialize response: ${JSON.stringify(result)}`);
  return;
}

// Test listing tools
async function testListTools(serverProcess: ChildProcess): Promise<any[]> {
  log('Testing tools/list...');

  const result = await sendRequest(serverProcess, 'tools/list', {});

  log(`List tools response: ${JSON.stringify(result)}`);
  return result.tools || [];
}

// Test a specific tool
async function testTool(serverProcess: ChildProcess, tool: any): Promise<void> {
  let args: any = {};

  // Set up appropriate test arguments based on tool name
  if (tool.name === 'hello') {
    args = { name: 'Test User' };
  } else if (tool.name === 'calculate') {
    args = { operation: 'add', a: 5, b: 7 };
  }

  log(`Testing tool ${tool.name} with args ${JSON.stringify(args)}...`);

  // Make sure to pass the arguments correctly according to MCP protocol
  const result = await sendRequest(serverProcess, 'tools/call', {
    name: tool.name,
    arguments: args,
  });

  log(`${tool.name} result: ${JSON.stringify(result)}`);
  return;
}

// Helper to send a request and get a response
function sendRequest(
  serverProcess: ChildProcess,
  method: string,
  params: any
): Promise<any> {
  return new Promise((resolve, reject) => {
    // Generate a unique ID for this request
    const id = uuidv4();

    // Function to handle response
    const responseHandler = (data: Buffer) => {
      const responseText = data.toString();

      try {
        // Try to parse each line as JSON (there might be multiple outputs)
        const lines = responseText.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const response = JSON.parse(line);

            // Check if this is the response for our request
            if (response.id === id) {
              // Remove this handler since we got our response
              serverProcess.stdout?.removeListener('data', responseHandler);

              if (response.error) {
                reject(
                  new Error(
                    `Error ${response.error.code}: ${response.error.message}`
                  )
                );
              } else {
                resolve(response.result);
              }
              return;
            }
          } catch (e) {
            // Ignore parse errors for non-JSON lines
          }
        }
      } catch (error) {
        // Only remove listener and reject if we encounter a real error
        serverProcess.stdout?.removeListener('data', responseHandler);
        reject(error);
      }
    };

    // Set up the response handler
    serverProcess.stdout?.on('data', responseHandler);

    // Send the request
    const request =
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }) + '\n';

    if (serverProcess.stdin) {
      serverProcess.stdin.write(request);

      // Set timeout for request
      setTimeout(() => {
        serverProcess.stdout?.removeListener('data', responseHandler);
        reject(new Error(`Request timeout for method ${method}`));
      }, 5000);
    } else {
      reject(new Error('Server process stdin is not available'));
    }
  });
}
