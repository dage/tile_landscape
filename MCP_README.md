# MCP Server and Client

This project includes a minimal implementation of an MCP (Model Context Protocol) server and client. The MCP protocol enables standardized communication between AI applications and external tools and data sources.

## What is MCP?

Model Context Protocol (MCP) is an open protocol that enables AI applications to interact with external data sources and tools. It provides a standardized way to share context with language models, expose tools for AI systems to use, and define templates for user interactions.

## Components

### MCP Server (`src/server.ts`)

A minimal MCP server that exposes a single "ping" tool. The server follows the MCP 2025-03-26 protocol specification and uses a stdio transport.

Features:

- Implements the Model Context Protocol
- Provides a simple ping tool that returns "pong"
- Uses stdio for transport (communication via standard input/output)
- Logs detailed debug information to help understand the protocol

### Standalone MCP Server (`src/standalone-server.ts`)

A more feature-rich MCP server designed to run continuously for integration with tools like Cursor. This server:

- Stays running until explicitly terminated
- Implements multiple tools (ping, hello, calculator)
- Has proper error handling to prevent crashes
- Uses stdio for transport

### MCP Client (`src/mcp-client.ts`)

A client implementation that connects to the MCP server, discovers available tools, and calls them.

Features:

- Implements the client side of the MCP protocol
- Automatically handles initialization and capability negotiation
- Provides methods for listing and calling tools
- Includes robust error handling and timeouts

## Usage

### Starting the Simple Server

To start just the simple MCP server:

```bash
npm run start:mcp-server
```

This will start the server and make it available via stdio. The server will wait for MCP protocol requests.

### Starting the Standalone Server (For Cursor Integration)

To start the standalone server that can be used with Cursor:

```bash
npm run start:mcp-standalone
```

This server will:

1. Start and keep running until terminated with Ctrl+C
2. Register multiple tools (ping, hello, calculator)
3. Log all activity to the logs directory
4. Stay alive to handle multiple requests

### Running the Client

To run the client that connects to the server:

```bash
npm run mcp:client
```

This will:

1. Start the server as a child process
2. Initialize the MCP connection
3. List available tools
4. Call the ping tool
5. Shut down both client and server

### Testing Protocol Methods

To test different MCP protocol methods:

```bash
npm run test:mcp-client
```

This will try different method names to discover which ones are supported by the server.

## Integrating with Cursor

To use this MCP server with Cursor:

1. Use the provided script for Cursor integration:

   ```bash
   ./scripts/cursor-mcp.sh
   ```

   This script:

   - Sets the appropriate environment variables
   - Runs the standalone server with the correct configuration
   - Uses `exec` to ensure proper signal handling

2. In Cursor, add a new MCP server connection:

   - Open Cursor's settings
   - Navigate to the MCP section
   - Add a new server with the following details:
     - Name: Tile Landscape MCP Server
     - Command: Full path to the script
     - For example: `/Users/username/projects/tile_landscape/scripts/cursor-mcp.sh`

3. Once connected, Cursor will have access to all the tools provided by the server:

   - `ping`: A simple tool that returns "pong"
   - `hello`: A greeting tool that takes a name parameter
   - `calculate`: A calculator tool that performs basic arithmetic operations

4. If you encounter "client closed" errors:
   - Make sure to run the standalone server using the provided script
   - Check the logs in `logs/mcp-standalone-server.log` for any errors
   - Ensure the stdio communication isn't being interrupted
   - Restart Cursor and try again

## Protocol Details

The MCP protocol uses JSON-RPC 2.0 for communication. The key methods implemented by this server are:

- `initialize` - Establishes the connection and negotiates capabilities
- `tools/list` - Lists available tools provided by the server
- `tools/call` - Calls a specific tool with arguments

## Logs

All server and client activity is logged to the `logs/` directory:

- `mcp-server-debug.log` - Simple server debug logs
- `mcp-standalone-server.log` - Standalone server debug logs
- `mcp-client.log` - Client operation logs
- `mcp-client-error.log` - Client error logs

## Resources

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/specification/)
- [MCP GitHub](https://github.com/modelcontextprotocol)
