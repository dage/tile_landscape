# /README.md
# Infinite-Tile Sci-Fi Landscape Demo

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
.github/
 └─ workflows/
    └─ ci.yml           # GitHub Actions CI configuration
.vscode/
 └─ settings.json       # Recommended VSCode settings (e.g., format on save)
.eslintrc.cjs          # ESLint configuration
.prettierrc.json       # Prettier configuration
package.json
README.md              # This file
docs/
 └─ PRD.md              # Project Requirements Document
```

## Coding Standards

- Absolute imports via `@/...` (Vite alias to be configured in `tsconfig.json` and `vite.config.ts`).
- Disposables (`geometry`, `material`, `texture`) should be cleaned in `onRemove()` methods or equivalent lifecycle hooks.
- Worker IPC types declared in `types/ipc.ts` (to be created).
- CI gate: build, ESLint (zero errors), Vitest.

Refer to `docs/PRD.md` for more details. 