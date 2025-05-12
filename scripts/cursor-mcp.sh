#!/bin/bash
# This script runs the standalone MCP server in a way that's compatible with Cursor

# Get the directory of the script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Go to the project root
cd "$SCRIPT_DIR/.."

# Set NODE_ENV to production to avoid debug output
export NODE_ENV=production

# Run the standalone server
exec node -r dotenv/config ./node_modules/.bin/tsx src/standalone-server.ts 