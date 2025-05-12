import * as THREE from 'three';
import { TILE_SIZE, GRID_DIMENSION } from '@/core/constants';
import placeholderTerrainVert from '@/shaders/placeholderTerrain.vert.glsl?raw';
import placeholderTerrainFrag from '@/shaders/placeholderTerrain.frag.glsl?raw';

interface TerrainTile {
  mesh: THREE.Mesh;
  conceptualGridX: number;
  conceptualGridZ: number;
}

export class TileGridManager {
  private scene: THREE.Scene;
  private tiles: TerrainTile[][] = [];
  private sharedPlaneGeometry: THREE.PlaneGeometry;
  private sharedTerrainMaterial: THREE.ShaderMaterial;

  private lastCameraGridX: number = -Infinity;
  private lastCameraGridZ: number = -Infinity;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.sharedPlaneGeometry = new THREE.PlaneGeometry(
      TILE_SIZE,
      TILE_SIZE,
      32,
      32
    );
    this.sharedPlaneGeometry.rotateX(-Math.PI / 2); // Orient plane to be horizontal

    this.sharedTerrainMaterial = new THREE.ShaderMaterial({
      vertexShader: placeholderTerrainVert,
      fragmentShader: placeholderTerrainFrag,
      uniforms: {
        uWorldOffset: { value: new THREE.Vector3() },
        // uTime: { value: 0.0 }, // If you need time in shader
        uTerrainColorBase: { value: new THREE.Color(0x335522) }, // Dark green
        uTerrainColorPeak: { value: new THREE.Color(0x99aabb) }, // Light grey/blue for peaks
      },
    });

    this.initGrid();
  }

  private initGrid(): void {
    for (let r = 0; r < GRID_DIMENSION; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < GRID_DIMENSION; c++) {
        const mesh = new THREE.Mesh(
          this.sharedPlaneGeometry,
          this.sharedTerrainMaterial
        );
        // Initial conceptual coords don't matter much as they'll be set in first update
        const tile: TerrainTile = {
          mesh,
          conceptualGridX: 0,
          conceptualGridZ: 0,
        };
        this.tiles[r][c] = tile;
        this.scene.add(mesh);
      }
    }
  }

  update(
    conceptualCameraPosition: THREE.Vector3,
    worldOriginOffset: THREE.Vector3
  ): void {
    const camGridX = Math.round(conceptualCameraPosition.x / TILE_SIZE);
    const camGridZ = Math.round(conceptualCameraPosition.z / TILE_SIZE);

    if (
      camGridX !== this.lastCameraGridX ||
      camGridZ !== this.lastCameraGridZ
    ) {
      this.recycleTiles(camGridX, camGridZ);
      this.lastCameraGridX = camGridX;
      this.lastCameraGridZ = camGridZ;
    }

    // Update positions of all tiles
    for (let r = 0; r < GRID_DIMENSION; r++) {
      for (let c = 0; c < GRID_DIMENSION; c++) {
        const tile = this.tiles[r][c];
        const conceptualTileWorldX = tile.conceptualGridX * TILE_SIZE;
        const conceptualTileWorldZ = tile.conceptualGridZ * TILE_SIZE;

        tile.mesh.position.set(
          conceptualTileWorldX - worldOriginOffset.x,
          0 - worldOriginOffset.y, // Assuming terrain base is at y=0 conceptually
          conceptualTileWorldZ - worldOriginOffset.z
        );
      }
    }

    // Update world offset uniform for seamless noise wrapping
    this.sharedTerrainMaterial.uniforms.uWorldOffset.value.copy(
      worldOriginOffset
    );

    // if (this.sharedTerrainMaterial.uniforms.uTime) {
    //   this.sharedTerrainMaterial.uniforms.uTime.value += 0.016; // Example time update
    // }
  }

  private recycleTiles(cameraGridX: number, cameraGridZ: number): void {
    const halfGrid = Math.floor(GRID_DIMENSION / 2);

    for (let r = 0; r < GRID_DIMENSION; r++) {
      for (let c = 0; c < GRID_DIMENSION; c++) {
        const tile = this.tiles[r][c];

        // Calculate the desired conceptual grid coordinates for this tile slot (r,c)
        // relative to the current camera grid position
        const targetConceptualGridX = cameraGridX + c - halfGrid;
        const targetConceptualGridZ = cameraGridZ + r - halfGrid;

        // If tile is not in the correct conceptual position, update it
        // This check ensures we only "move" tiles if their target conceptual pos changes
        // In practice, all tiles are repositioned relative to camera view every time camGridX/Z changes
        tile.conceptualGridX = targetConceptualGridX;
        tile.conceptualGridZ = targetConceptualGridZ;
        // The actual mesh physical position is updated in the main `update` loop
      }
    }
  }

  dispose(): void {
    this.tiles.forEach((row) =>
      row.forEach((tile) => {
        this.scene.remove(tile.mesh);
        // Mesh does not own geometry/material, so don't dispose shared ones here
      })
    );
    this.sharedPlaneGeometry.dispose();
    this.sharedTerrainMaterial.dispose();
  }
}
