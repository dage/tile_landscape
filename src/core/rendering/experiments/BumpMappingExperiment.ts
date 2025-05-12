// src/core/rendering/experiments/BumpMappingExperiment.ts

import * as THREE from 'three';
import { TileGridManager } from '../TileGridManager';
import type { RenderingExperiment } from './RenderingExperiment';

/**
 * Experiment that adds bump mapping to the terrain
 *
 * This experiment:
 * 1. Creates a procedural bump texture using a simple noise function
 * 2. Replaces the default terrain shader material with a MeshStandardMaterial
 * 3. Applies the texture as both a bump map and displacement map
 * 4. Restores the original material when disabled
 *
 * This demonstrates:
 * - How to use MeshStandardMaterial for more realistic terrain
 * - How to create and apply procedural textures
 * - How to use bump and displacement mapping for terrain detail
 * - Proper resource management (keeping original material and restoring it)
 */
export class BumpMappingExperiment implements RenderingExperiment {
  private scene: THREE.Scene;
  private tileManager: TileGridManager;
  private bumpTexture: THREE.Texture | null = null;
  private bumpMaterial: THREE.MeshStandardMaterial | null = null;
  private originalMaterial: THREE.Material | null = null;

  constructor(scene: THREE.Scene, tileManager: TileGridManager) {
    this.scene = scene;
    this.tileManager = tileManager;
  }

  async initialize(): Promise<void> {
    // Create a bump map texture (we could also load one from a file)
    const textureSize = 256;
    const data = new Uint8Array(textureSize * textureSize * 4);

    // Generate a simple procedural noise pattern for the bump map
    for (let i = 0; i < textureSize; i++) {
      for (let j = 0; j < textureSize; j++) {
        const index = (i * textureSize + j) * 4;

        // Make a noisy, rock-like pattern
        const x = i / textureSize;
        const y = j / textureSize;
        const noise = this.simplex2(x * 5, y * 5) * 0.5 + 0.5;
        const detail = this.simplex2(x * 20, y * 20) * 0.25 + 0.25;

        const value = Math.floor((noise + detail) * 255);

        data[index] = value; // R
        data[index + 1] = value; // G
        data[index + 2] = value; // B
        data[index + 3] = 255; // A
      }
    }

    // Create texture from the data
    this.bumpTexture = new THREE.DataTexture(
      data,
      textureSize,
      textureSize,
      THREE.RGBAFormat
    );
    this.bumpTexture.wrapS = THREE.RepeatWrapping;
    this.bumpTexture.wrapT = THREE.RepeatWrapping;
    this.bumpTexture.needsUpdate = true;

    // Create a new material for the terrain tiles
    this.bumpMaterial = new THREE.MeshStandardMaterial({
      color: 0x669944,
      roughness: 0.8,
      metalness: 0.2,
      bumpMap: this.bumpTexture,
      bumpScale: 5.0,
      displacementMap: this.bumpTexture,
      displacementScale: 10.0,
    });

    // Replace the material on all terrain tiles
    this.originalMaterial = this.tileManager.replaceMaterial(this.bumpMaterial);
  }

  update(deltaTime: number): void {
    // Animation or updates if needed
  }

  dispose(): void {
    // Restore original material
    if (this.originalMaterial) {
      this.tileManager.replaceMaterial(this.originalMaterial);
    }

    // Dispose of resources
    if (this.bumpTexture) {
      this.bumpTexture.dispose();
    }

    if (this.bumpMaterial) {
      this.bumpMaterial.dispose();
    }
  }

  // Simple 2D simplex noise-like function (not true simplex noise but sufficient for the demo)
  private simplex2(x: number, y: number): number {
    const dot = (g: number[], x: number, y: number) => g[0] * x + g[1] * y;
    const grad3 = [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    // Skew the input space to determine which simplex cell we're in
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    // Determine which simplex we're in
    let i1, j1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    // Hash coordinates to find out gradient indices
    const ii = i & 255;
    const jj = j & 255;
    const hash0 = this.hash(ii + this.hash(jj)) % 8;
    const hash1 = this.hash(ii + i1 + this.hash(jj + j1)) % 8;
    const hash2 = this.hash(ii + 1 + this.hash(jj + 1)) % 8;

    // Calculate the contribution from the three corners
    const t0 = 0.5 - x0 * x0 - y0 * y0;
    const n0 = t0 < 0 ? 0.0 : t0 * t0 * t0 * t0 * dot(grad3[hash0], x0, y0);

    const t1 = 0.5 - x1 * x1 - y1 * y1;
    const n1 = t1 < 0 ? 0.0 : t1 * t1 * t1 * t1 * dot(grad3[hash1], x1, y1);

    const t2 = 0.5 - x2 * x2 - y2 * y2;
    const n2 = t2 < 0 ? 0.0 : t2 * t2 * t2 * t2 * dot(grad3[hash2], x2, y2);

    // Add contributions from each corner to get the final noise value
    // The result is scaled to return values in the interval [-1,1]
    return 70.0 * (n0 + n1 + n2);
  }

  // Simple hash function for our noise
  private hash(n: number): number {
    return ((n << 13) ^ n) * (n * (n * n * 15731 + 789221) + 1376312589);
  }
}
