// src/core/terrain/heightmapGenerator.ts

export interface HeightmapData {
  data: Float32Array;
  width: number;
  height: number;
  scale: number; // The effective world size this heightmap covers before repeating
}

// Size must be (2^n + 1) for Diamond-Square. e.g., 257, 513, 1025
const DEFAULT_MAP_SIZE = 1025;
const DEFAULT_WORLD_SCALE = 2048; // World units the heightmap covers before repeating
const ROUGHNESS_FACTOR = 0.7; // Range [0,1]. Higher = rougher. Affects how fast random range decreases.
const INITIAL_AMPLITUDE = 150; // Initial range for random displacement, effectively max height variation.

let memoizedHeightmap: HeightmapData | null = null;

function dsRandom(): number {
  return Math.random() * 2 - 1; // Returns a random number between -1 and 1
}

/**
 * Generates a tileable heightmap using the Diamond-Square algorithm.
 * The result is memoized for performance.
 */
export function generateHeightmap(
  mapWidth: number = DEFAULT_MAP_SIZE,
  mapHeight: number = DEFAULT_MAP_SIZE,
  worldScale: number = DEFAULT_WORLD_SCALE
): HeightmapData {
  if (mapWidth !== mapHeight) {
    console.warn(
      'Diamond-Square requires mapWidth === mapHeight. Using mapWidth for both.'
    );
    mapHeight = mapWidth;
  }
  // Check if mapWidth is of the form 2^n + 1
  const n = Math.log2(mapWidth - 1);
  if (n !== Math.floor(n) || mapWidth <= 1) {
    console.warn(
      `Diamond-Square map size must be 2^n + 1. Adjusting ${mapWidth} to ${DEFAULT_MAP_SIZE}.`
    );
    mapWidth = DEFAULT_MAP_SIZE;
    mapHeight = DEFAULT_MAP_SIZE;
  }

  if (
    memoizedHeightmap &&
    memoizedHeightmap.width === mapWidth &&
    memoizedHeightmap.height === mapHeight &&
    memoizedHeightmap.scale === worldScale
  ) {
    return memoizedHeightmap;
  }

  const data = new Float32Array(mapWidth * mapHeight);
  const size = mapWidth; // Since width and height are the same

  console.log(
    `Generating new ${size}x${size} Diamond-Square heightmap (world scale: ${worldScale})...`
  );
  const startTime = performance.now();

  // Helper to get/set height, handling wrapping for tileability
  const getHeight = (x: number, y: number): number => {
    return data[((y + size) % size) * size + ((x + size) % size)];
  };
  const setHeight = (x: number, y: number, value: number): void => {
    data[((y + size) % size) * size + ((x + size) % size)] = value;
  };

  // Initialize corners (e.g., to an average height or 0 for simplicity here)
  // For tileability, all corners could be the same, or from a repeating pattern.
  // Setting to 0 simplifies, and randomness will build from there.
  const initialCornerValue = 0;
  setHeight(0, 0, initialCornerValue);
  setHeight(size - 1, 0, initialCornerValue);
  setHeight(0, size - 1, initialCornerValue);
  setHeight(size - 1, size - 1, initialCornerValue);

  let currentAmplitude = INITIAL_AMPLITUDE;
  let step = size - 1;

  while (step > 1) {
    const halfStep = step / 2;

    // Diamond step
    for (let y = 0; y < size - 1; y += step) {
      for (let x = 0; x < size - 1; x += step) {
        const avg =
          (getHeight(x, y) +
            getHeight(x + step, y) +
            getHeight(x, y + step) +
            getHeight(x + step, y + step)) /
          4.0;
        setHeight(
          x + halfStep,
          y + halfStep,
          avg + dsRandom() * currentAmplitude
        );
      }
    }

    // Square step
    for (let y = 0; y < size; y += halfStep) {
      for (let x = (y + halfStep) % step; x < size; x += step) {
        const avg =
          (getHeight((x - halfStep + size) % size, y) + // Left
            getHeight((x + halfStep) % size, y) + // Right
            getHeight(x, (y - halfStep + size) % size) + // Top
            getHeight(x, (y + halfStep) % size)) / // Bottom
          4.0;
        setHeight(x, y, avg + dsRandom() * currentAmplitude);
      }
    }

    currentAmplitude *= Math.pow(2, -ROUGHNESS_FACTOR); // Reduce amplitude
    step /= 2;
  }

  const endTime = performance.now();
  console.log(
    `Heightmap generation took ${(endTime - startTime).toFixed(2)} ms`
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
