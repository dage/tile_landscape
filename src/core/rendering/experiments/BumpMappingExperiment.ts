// src/core/rendering/experiments/BumpMappingExperiment.ts

import * as THREE from 'three';
import type { TileGridManager } from '@/core/rendering/TileGridManager';
import type { RenderingExperiment } from '@/core/rendering/experiments/RenderingExperiment';

/**
 * Experiment that adds bump mapping to the terrain
 *
 * This experiment:
 * 1. Loads a pre-generated bump texture (normal.png)
 * 2. Replaces the default terrain shader material with a MeshStandardMaterial
 * 3. Applies the texture as a bump map
 * 4. Restores the original material when disabled
 *
 * This demonstrates:
 * - How to use MeshStandardMaterial for more realistic terrain
 * - How to apply textures for bump mapping
 * - Proper resource management
 */
export class BumpMappingExperiment implements RenderingExperiment {
  private scene: THREE.Scene;
  private tileGridManager: TileGridManager;
  private originalTerrainMaterial: THREE.Material | null = null;
  private bumpMaterial: THREE.MeshStandardMaterial | null = null;
  private textureLoader: THREE.TextureLoader;
  private normalMap: THREE.Texture | null = null;

  constructor(scene: THREE.Scene, tileGridManager: TileGridManager) {
    this.scene = scene;
    this.tileGridManager = tileGridManager;
    this.textureLoader = new THREE.TextureLoader();
  }

  async initialize(): Promise<void> {
    try {
      // Load the pre-generated normal map
      // Vite serves files from `public` directory at the root, so path is /assets/normal.png
      this.normalMap = await this.textureLoader.loadAsync('/assets/normal.png');
      this.normalMap.wrapS = THREE.RepeatWrapping;
      this.normalMap.wrapT = THREE.RepeatWrapping;

      this.bumpMaterial = new THREE.MeshStandardMaterial({
        bumpMap: this.normalMap,
        bumpScale: 15.0, // User preferred scale
        // color can be inherited or set if desired
      });

      this.originalTerrainMaterial = this.tileGridManager.replaceMaterial(
        this.bumpMaterial
      );
      console.log(
        'BumpMappingExperiment initialized, material replaced with /assets/normal.png.'
      );
    } catch (error) {
      console.error('Error initializing BumpMappingExperiment:', error);
      if (this.originalTerrainMaterial && this.bumpMaterial) {
        this.tileGridManager.replaceMaterial(this.originalTerrainMaterial);
      }
      throw error;
    }
  }

  update(deltaTime: number): void {
    // No specific update logic for this experiment
  }

  dispose(): void {
    if (this.originalTerrainMaterial) {
      this.tileGridManager.replaceMaterial(this.originalTerrainMaterial);
      this.originalTerrainMaterial = null;
      console.log(
        'BumpMappingExperiment disposed, original material restored.'
      );
    }
    if (this.normalMap) {
      this.normalMap.dispose();
      this.normalMap = null;
    }
    if (this.bumpMaterial) {
      this.bumpMaterial.dispose();
      this.bumpMaterial = null;
    }
  }
}
