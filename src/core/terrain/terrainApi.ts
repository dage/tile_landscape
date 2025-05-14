import * as THREE from 'three';
import { generateHeightmap, type HeightmapData } from './heightmapGenerator';

let heightmap: HeightmapData | null = null;

/**
 * Initializes the terrain API by generating or retrieving the heightmap.
 * Must be called before using other API functions.
 */
export function initializeTerrainApi(): void {
  heightmap = generateHeightmap(); // Uses defaults from heightmapGenerator or mock
}

/**
 * Gets the terrain height at a conceptual world (x, z) coordinate.
 * Uses bilinear interpolation for smooth height transitions.
 * Assumes the heightmap tiles infinitely.
 *
 * @param worldX Conceptual world X coordinate.
 * @param worldZ Conceptual world Z coordinate.
 * @returns The terrain height at the given world coordinates.
 */
export function getHeight(worldX: number, worldZ: number): number {
  if (!heightmap) {
    console.warn(
      'TerrainAPI not initialized. Call initializeTerrainApi() first.'
    );
    initializeTerrainApi(); // Attempt to initialize if not already
  }
  if (!heightmap) return 0; // Should not happen if initialize worked

  const mapWidth = heightmap.width;
  const mapHeight = heightmap.height;
  const worldToMapScaleX = mapWidth / heightmap.scale;
  const worldToMapScaleZ = mapHeight / heightmap.scale;

  // Map world coordinates to heightmap coordinates, handling tiling
  // fmod ensures that mapX/mapZ are always positive before the final modulo
  const fmod = (a: number, b: number) => ((a % b) + b) % b;

  let mapX = fmod(worldX * worldToMapScaleX, mapWidth);
  let mapZ = fmod(worldZ * worldToMapScaleZ, mapHeight);

  // Get integer and fractional parts for interpolation
  const x0 = Math.floor(mapX);
  const z0 = Math.floor(mapZ);
  const x1 = (x0 + 1) % mapWidth; // Wrap around for points at the edge
  const z1 = (z0 + 1) % mapHeight; // Wrap around

  const fx = mapX - x0;
  const fz = mapZ - z0;

  // Get heights of the four surrounding points from the heightmap data
  // The heightmap data is 1D, so index is (y * width + x)
  const h00 = heightmap.data[z0 * mapWidth + x0];
  const h10 = heightmap.data[z0 * mapWidth + x1];
  const h01 = heightmap.data[z1 * mapWidth + x0];
  const h11 = heightmap.data[z1 * mapWidth + x1];

  // Bilinear interpolation
  const r0 = h00 * (1 - fx) + h10 * fx; // Interpolate along x for z0
  const r1 = h01 * (1 - fx) + h11 * fx; // Interpolate along x for z1
  const height = r0 * (1 - fz) + r1 * fz; // Interpolate along z

  return height;
}

const normalSamplingOffset = 0.5; // World units for sampling points for normal calculation
const tempVec = new THREE.Vector3(); // For intermediate calculations

/**
 * Calculates the surface normal at a conceptual world (x, z) coordinate.
 * Uses finite differences by sampling heights at nearby points.
 *
 * @param worldX Conceptual world X coordinate.
 * @param worldZ Conceptual world Z coordinate.
 * @param outNormal THREE.Vector3 to store the calculated normal.
 */
export function getSurfaceNormal(
  worldX: number,
  worldZ: number,
  outNormal: THREE.Vector3
): void {
  if (!heightmap) {
    console.warn(
      'TerrainAPI not initialized. Call initializeTerrainApi() first.'
    );
    initializeTerrainApi();
  }
  if (!heightmap) {
    outNormal.set(0, 1, 0); // Default to flat if not initialized
    return;
  }

  // Get heights at slightly offset points
  const h = getHeight(worldX, worldZ);
  const hx_plus = getHeight(worldX + normalSamplingOffset, worldZ);
  const hx_minus = getHeight(worldX - normalSamplingOffset, worldZ);
  const hz_plus = getHeight(worldX, worldZ + normalSamplingOffset);
  const hz_minus = getHeight(worldX, worldZ - normalSamplingOffset);

  // Calculate deltas for finite differences
  // The denominator is 2 * normalSamplingOffset, but this cancels out when normalizing
  const dx = hx_minus - hx_plus; // Gradient in X (note: (h_prev - h_next) / (2*offset) gives positive slope direction)
  const dz = hz_minus - hz_plus; // Gradient in Z

  outNormal.set(dx, 2 * normalSamplingOffset, dz);
  outNormal.normalize();
}
