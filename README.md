# Infinite-Tile Sci-Fi Landscape Demo

[![CI](https://github.com/dage/tile_landscape/actions/workflows/ci.yml/badge.svg)](https://github.com/dage/tile_landscape/actions/workflows/ci.yml)

This project is a browser-based demo that flies over an endlessly repeating, FFT-generated landscape. It aims to incorporate physics, LOSO objects, AI entities, and advanced instancing, targeting desktop and high-end mobile browsers (WebGL 2 / WebGPU-capable).

This project was bootstrapped with [Vite](https://vitejs.dev/) using the vanilla-ts template.

## Project Requirements

Detailed project requirements can be found in [docs/PRD.md](docs/PRD.md).

## Tech Stack

- **Runtime**: Three.js r169
- **Physics**: Rapier.js v0.13 (WASM + TS)
- **Bundler / Dev server**: Vite 5
- **Language**: TypeScript 5.x
- **Package manager**: npm (Node 20 LTS)
- **Lint / Format**: ESLint + @typescript-eslint + Prettier
- **Unit tests**: Vitest
- **CI**: GitHub Actions

## Getting Started

### Prerequisites

- Node.js (Version 20 LTS recommended, as specified in `package.json` engines or CI)
- npm (comes with Node.js)

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    ```
2.  Navigate to the project directory:
    ```bash
    cd tile_landscape
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```

### Environment Setup (for MCP Vision Server)

The MCP Vision Server (`src/server.ts`) uses Google's Generative AI.

**For use with Cursor's AI features:**
Cursor manages the `GOOGLE_API_KEY` for the MCP Vision server if it's configured within Cursor's settings (specifically, the `.cursor/mcp.json` file includes an `env` block where this key can be set). When you use features that rely on this server through the Cursor interface, Cursor provides the necessary environment variables.

**For manual server execution (e.g., using `npm run start:mcp-server` directly):**
If you intend to run the server manually from your terminal, you'll need to provide the `GOOGLE_API_KEY` via an `.env` file.

1.  **Create a `.env` file (if running manually):**
    Copy the template file `.env_template` to a new file named `.env` in the project root:
    ```bash
    cp .env_template .env
    ```
2.  **Add your API Key to `.env` (if running manually):**
    Open the `.env` file and add your Google API key:
    ```
    GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY_HERE"
    # You can also specify a different Gemini model if needed
    # GEMINI_MODEL="gemini-1.5-flash"
    ```
    **Important:** Keep your `.env` file private and do not commit it to version control. The `.gitignore` file should already be configured to ignore `.env`.

### Development

To start the development server:

```bash
npm run dev
```

This will typically open the application in your default browser at `http://localhost:5173` (or the next available port).

### Available Scripts

- `npm run dev`: Starts the development server with Hot Module Replacement (HMR).
- `npm run build`: Compiles TypeScript and builds the project for production into the `dist` folder.
- `npm run preview`: Serves the production build locally for preview.
- `npm run lint`: Lints the codebase using ESLint.
- `npm run format`: Formats the codebase using Prettier.
- `npm run test`: Runs unit tests using Vitest (once configured).
- `node --loader ts-node/esm run-visual-test.ts`: Runs an automated visual test using Puppeteer. It starts the dev server, navigates to the app, and saves a screenshot to `screenshots/current.png`.
- `npm run start:mcp-server`: Starts the Tiny MCP 'Vision' Server for AI-powered image analysis. For this script to work when run manually, it requires a `.env` file with `GOOGLE_API_KEY` (see Environment Setup). The server uses `tsx` and `tsconfig.mcp.json`.

## Visual Testing (Experimental)

This project includes a basic visual regression testing setup using Puppeteer.

1.  **Run the test:**
    ```bash
    node --loader ts-node/esm run-visual-test.ts
    ```
    This will generate a `screenshots/current.png` file.
2.  **Establish a Baseline:**
    - Inspect `screenshots/current.png`.
    - If it's correct, copy it to `screenshots/baseline.png`.
    - Commit `screenshots/baseline.png` to the repository.
    - (`screenshots/current.png` should be in `.gitignore`).
3.  **Subsequent Tests:**
    - Run the test script again.
    - Manually compare the new `screenshots/current.png` with the committed `screenshots/baseline.png` to detect any unintended visual changes.

## Folder Structure

```
/src
 ├─ core/
 │   ├─ terrain/        # FFT generation, util fns
 │   ├─ physics/        # worker bootstrap, message types
 │   └─ rendering/      # scene helpers, origin shift
 ├─ agents/             # AI-agent tasks / JSON specs
 ├─ loaders/            # asset & texture loaders
 ├─ main.ts             # entry point
 ├─ worker/
 │   └─ physics.ts      # Rapier worker
 └─ shaders/
     └─ terrain.glsl
/public
 ├─ assets/             # GLTF, HDRI, textures (futuristic)
 └─ index.html
/screenshots
 ├─ baseline.png        # Committed baseline image for visual tests
 └─ current.png         # Current screenshot (ignored by git)
.github/
 └─ workflows/
    └─ ci.yml           # GitHub Actions CI configuration
.vscode/
 └─ settings.json       # Recommended VSCode settings (e.g., format on save)
eslint.config.js      # ESLint configuration
.prettierrc.json       # Prettier configuration
package.json
README.md              # This file
run-visual-test.ts     # Puppeteer script for automated visual testing
docs/
 └─ PRD.md              # Project Requirements Document
.env                   # Local environment variables (e.g., API keys, ignored by git)
.env_template          # Template for .env file
tsconfig.mcp.json      # TypeScript configuration for the MCP server
```

## Coding Standards

- Absolute imports via `@/...` (Vite alias to be configured in `tsconfig.json` and `vite.config.ts`).
- Disposables (`geometry`, `material`, `texture`) should be cleaned in `onRemove()` methods or equivalent lifecycle hooks.
- Worker IPC types declared in `types/ipc.ts` (to be created).
- CI gate: build, ESLint (zero errors), Vitest.

Refer to `docs/PRD.md` for more details.
