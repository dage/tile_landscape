// src/core/terrain/heightmapGenerator.ts
import { createNoise4D } from 'simplex-noise';

export interface HeightmapData {
  data: Float32Array;
  width: number;
  height: number;
  scale: number; // The effective world size this heightmap covers before repeating
}

// Size must be (2^n + 1) for Diamond-Square. e.g., 257, 513, 1025
const DEFAULT_MAP_SIZE = 1025;
const DEFAULT_WORLD_SCALE = 2048; // World units the heightmap covers before repeating
// const ROUGHNESS_FACTOR = 0.7; // No longer directly used by simplex like this
// const INITIAL_AMPLITUDE = 150; // Will be controlled by simplex parameters

// Simplex noise parameters
const SIMPLEX_FEATURE_SCALE = 1.5; // Controls how "zoomed-in" the noise is. Larger = more features.
const SIMPLEX_OCTAVES = 10;
const SIMPLEX_PERSISTENCE = 0.3; // How much amplitude decreases per octave
const SIMPLEX_LACUNARITY = 2.0; // How much frequency increases per octave
const SIMPLEX_INITIAL_AMPLITUDE = 125.0; // Overall scale of the noise

let memoizedHeightmap: HeightmapData | null = null;
let noise4D: (x: number, y: number, z: number, w: number) => number;

/**
 * Generates a tileable heightmap using 4D Simplex noise for fractal terrain.
 * The result is memoized for performance.
 */
export function generateHeightmap(
  mapWidth: number = DEFAULT_MAP_SIZE,
  mapHeight: number = DEFAULT_MAP_SIZE,
  worldScale: number = DEFAULT_WORLD_SCALE
): HeightmapData {
  // Memoization check
  if (
    memoizedHeightmap &&
    memoizedHeightmap.width === mapWidth &&
    memoizedHeightmap.height === mapHeight &&
    memoizedHeightmap.scale === worldScale
  ) {
    return memoizedHeightmap;
  }

  if (!noise4D) {
    noise4D = createNoise4D();
  }

  if (mapWidth !== mapHeight) {
    console.warn(
      'Heightmap requires mapWidth === mapHeight for proper tiling. Using mapWidth for both.'
    );
    mapHeight = mapWidth;
  }

  const data = new Float32Array(mapWidth * mapHeight);
  const size = mapWidth;

  console.log(
    `Generating new ${size}x${size} Simplex noise heightmap (world scale: ${worldScale})...`
  );
  const startTime = performance.now();

  const PI2 = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Normalize coordinates to [0,1] range for angle calculation
      const u = x / (size - 1); // Normalized x for periodicity
      const v = y / (size - 1); // Normalized y for periodicity

      let totalHeight = 0;
      let currentAmplitude = SIMPLEX_INITIAL_AMPLITUDE;
      let currentFrequencyScale = SIMPLEX_FEATURE_SCALE;

      for (let i = 0; i < SIMPLEX_OCTAVES; i++) {
        const angleU = u * PI2;
        const angleV = v * PI2;

        // Use 4D simplex noise to create a 2D tileable pattern
        // Map (u,v) to a torus in 4D space
        const nx = currentFrequencyScale * Math.cos(angleU);
        const ny = currentFrequencyScale * Math.sin(angleU);
        const nz = currentFrequencyScale * Math.cos(angleV);
        const nw = currentFrequencyScale * Math.sin(angleV);

        totalHeight += noise4D(nx, ny, nz, nw) * currentAmplitude;

        currentAmplitude *= SIMPLEX_PERSISTENCE;
        currentFrequencyScale *= SIMPLEX_LACUNARITY;
      }
      data[y * size + x] = totalHeight;
    }
  }

  const endTime = performance.now();
  console.log(
    `Simplex Heightmap generation took ${(endTime - startTime).toFixed(2)} ms`
  );

  memoizedHeightmap = {
    data,
    width: size,
    height: size,
    scale: worldScale,
  };
  return memoizedHeightmap;
}

// Pre-generate on load (optional, but good for consistency during development)
// generateHeightmap();
