import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

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

// Class for MCP client
class McpClient {
  private serverProcess: ChildProcess;
  private initialized = false;
  private requestCallbacks: Map<string, (response: any) => void> = new Map();

  constructor() {
    // Start the MCP server as a child process
    this.serverProcess = spawn('node', [
      '-r',
      'dotenv/config',
      './node_modules/.bin/tsx',
      'src/server.ts',
    ]);

    // Log server process ID
    const pid = this.serverProcess.pid;
    log(`MCP Server started with PID: ${pid}`);

    // Handle server output
    this.serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      log(`Server stdout: ${output}`);

      try {
        // Try to parse the response as JSON
        const response = JSON.parse(output);

        // If there's a response ID, find and call the associated callback
        if (response.id && this.requestCallbacks.has(response.id)) {
          const callback = this.requestCallbacks.get(response.id);
          if (callback) {
            callback(response);
            this.requestCallbacks.delete(response.id);
          }
        }
      } catch (error) {
        log(`Error parsing server response: ${error}`);
      }
    });

    this.serverProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      log(`Server stderr: ${output}`);
      errorLogFile.write(`[${new Date().toISOString()}] ${output}\n`);
    });

    // Handle server termination
    this.serverProcess.on('close', (code) => {
      log(`Server process exited with code ${code}`);
    });

    // Handle process termination
    process.on('SIGINT', () => {
      log('Received SIGINT, shutting down...');
      this.shutdown();
      process.exit(0);
    });
  }

  // Method to send a request to the server and register a callback for the response
  private async sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = uuidv4();

      // Register callback for this request ID
      this.requestCallbacks.set(id, (response) => {
        if (response.error) {
          reject(
            new Error(`Error ${response.error.code}: ${response.error.message}`)
          );
        } else {
          resolve(response.result);
        }
      });

      // Create request object
      const request =
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }) + '\n';

      // Send request to server
      log(`Sending ${method} request to server...`);
      if (this.serverProcess.stdin) {
        this.serverProcess.stdin.write(request);
      } else {
        reject(new Error('Server process stdin is not available'));
      }

      // Set timeout for request
      setTimeout(() => {
        if (this.requestCallbacks.has(id)) {
          this.requestCallbacks.delete(id);
          reject(new Error(`Request timeout for method ${method}`));
        }
      }, 5000);
    });
  }

  // Initialize the client
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const result = await this.sendRequest('initialize', {
        protocolVersion: '2025-03-26',
        clientInfo: {
          name: 'McpClient',
          version: '0.0.1',
        },
        capabilities: {
          tools: {},
        },
      });

      log(`Initialization successful: ${JSON.stringify(result)}`);
      this.initialized = true;
    } catch (error) {
      log(`Initialization failed: ${error}`);
      throw error;
    }
  }

  // List available tools
  async listTools(): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const result = await this.sendRequest('tools/list', {});
      log(`Available tools: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      log(`Failed to list tools: ${error}`);
      throw error;
    }
  }

  // Call a tool
  async callTool(name: string, args: any = {}): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const result = await this.sendRequest('tools/call', {
        name,
        arguments: args,
      });
      log(`Tool ${name} call result: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      log(`Failed to call tool ${name}: ${error}`);
      throw error;
    }
  }

  // Shutdown the client
  shutdown(): void {
    if (this.serverProcess) {
      log('Shutting down MCP client and server...');
      this.serverProcess.kill();
    }
  }
}

// Example usage
async function runExample() {
  const client = new McpClient();

  try {
    // Initialize the client
    await client.initialize();

    // List available tools
    const toolsList = await client.listTools();

    // Call the ping tool
    if (toolsList.tools.some((tool: any) => tool.name === 'ping')) {
      const pingResult = await client.callTool('ping');
      log(`Ping result content: ${JSON.stringify(pingResult.content)}`);
    }
  } catch (error) {
    log(`Error during example: ${error}`);
  } finally {
    // Shutdown after 2 seconds to allow logs to be written
    setTimeout(() => {
      client.shutdown();
    }, 2000);
  }
}

// Run the example
runExample();
