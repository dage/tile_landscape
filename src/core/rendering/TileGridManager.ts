import * as THREE from 'three';
import { TILE_SIZE, GRID_DIMENSION } from '@/core/constants';

interface TerrainTile {
  mesh: THREE.Mesh;
  conceptualGridX: number;
  conceptualGridZ: number;
}

export class TileGridManager {
  private scene: THREE.Scene;
  private tiles: TerrainTile[][] = [];
  private sharedTerrainMaterial: THREE.Material;

  private lastCameraGridX: number = -Infinity;
  private lastCameraGridZ: number = -Infinity;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Use a standard material with lighting/fog
    this.sharedTerrainMaterial = new THREE.MeshStandardMaterial({
      color: 0x335522,
      roughness: 0.8,
      metalness: 0.1,
      flatShading: false,
      side: THREE.FrontSide,
      vertexColors: true,
    });

    this.initGrid();
  }

  /**
   * Creates a terrain geometry with procedural height displacement
   * @param gridX The conceptual grid X position of this tile
   * @param gridZ The conceptual grid Z position of this tile
   */
  private createTerrainGeometry(
    gridX: number,
    gridZ: number
  ): THREE.BufferGeometry {
    // Create base plane geometry
    const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE, 32, 32);

    // Rotate to be horizontal (Y-up)
    geometry.rotateX(-Math.PI / 2);

    // Access position attribute for modification
    const positions = geometry.attributes.position;
    const vertex = new THREE.Vector3();

    // First delete the normal attribute - we'll recompute it
    geometry.deleteAttribute('normal');

    // Calculate the world offset for this tile
    const tileOffsetX = gridX * TILE_SIZE;
    const tileOffsetZ = gridZ * TILE_SIZE;

    // Apply noise-based displacement to each vertex
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);

      // Apply noise with parameters matching original shader
      const noiseScale = 0.015;
      const heightScale = 15.0;

      // Adjust for tile position in world to get continuous noise
      const worldX = (vertex.x + tileOffsetX) * noiseScale;
      const worldZ = (vertex.z + tileOffsetZ) * noiseScale;

      // Apply simplified noise function
      const height = this.simplifiedNoise(worldX, worldZ) * heightScale;

      // Set Y-coordinate for height
      vertex.y = height;

      // Write back to buffer
      positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    // Recompute normals for proper lighting
    geometry.computeVertexNormals();

    // Height-based coloring using vertex colors
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    const baseColor = new THREE.Color(0x335522); // Dark green
    const peakColor = new THREE.Color(0x99aabb); // Light blue-gray

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);

      // Normalize height for color interpolation
      const normalizedHeight = THREE.MathUtils.smoothstep(
        -10.0,
        15.0,
        vertex.y
      );

      // Mix colors based on height
      color.copy(baseColor).lerp(peakColor, normalizedHeight);

      // Set RGB values
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    // Add vertex colors to geometry
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    return geometry;
  }

  /**
   * A simplified noise function that creates terrain-like variation
   */
  private simplifiedNoise(x: number, z: number): number {
    // Simplified noise function that approximates the shader noise
    const nx =
      Math.sin(x * 1.5) * 0.5 +
      Math.sin(x * 3.7 + z * 2.3) * 0.25 +
      Math.sin(x * 5.9 + z * 1.6) * 0.125;
    const nz =
      Math.sin(z * 1.5) * 0.5 +
      Math.sin(z * 3.7 + x * 2.3) * 0.25 +
      Math.sin(z * 5.9 + x * 1.6) * 0.125;
    return nx + nz;
  }

  private initGrid(): void {
    for (let r = 0; r < GRID_DIMENSION; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < GRID_DIMENSION; c++) {
        // Create a mesh with dummy coords (will be set in first update)
        const tile: TerrainTile = {
          mesh: new THREE.Mesh(
            new THREE.BufferGeometry(), // Empty placeholder, will be set in first update
            this.sharedTerrainMaterial
          ),
          conceptualGridX: 0,
          conceptualGridZ: 0,
        };
        this.tiles[r][c] = tile;
        this.scene.add(tile.mesh);
      }
    }
  }

  update(
    conceptualCameraPosition: THREE.Vector3,
    worldOriginOffset: THREE.Vector3,
    cameraScenePosition?: THREE.Vector3
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

        // Check if the tile needs to be moved to a new grid position
        if (
          tile.conceptualGridX !== targetConceptualGridX ||
          tile.conceptualGridZ !== targetConceptualGridZ
        ) {
          // Update tile's conceptual grid coordinates
          tile.conceptualGridX = targetConceptualGridX;
          tile.conceptualGridZ = targetConceptualGridZ;

          // Clean up old geometry if it exists
          if (tile.mesh.geometry) {
            tile.mesh.geometry.dispose();
          }

          // Create a new geometry for this tile at its new position
          tile.mesh.geometry = this.createTerrainGeometry(
            targetConceptualGridX,
            targetConceptualGridZ
          );
        }
      }
    }
  }

  /**
   * Enables or disables wireframe rendering on all terrain tiles
   */
  setWireframeMode(enabled: boolean): void {
    if (this.sharedTerrainMaterial instanceof THREE.Material) {
      (this.sharedTerrainMaterial as any).wireframe = enabled;
    }
  }

  /**
   * Replaces the material on all tiles with the provided material
   * Returns the original material for later restoration
   */
  replaceMaterial(newMaterial: THREE.Material): THREE.Material {
    const originalMaterial = this.sharedTerrainMaterial;

    // Apply new material to all tiles
    for (let r = 0; r < GRID_DIMENSION; r++) {
      for (let c = 0; c < GRID_DIMENSION; c++) {
        this.tiles[r][c].mesh.material = newMaterial;
      }
    }

    this.sharedTerrainMaterial = newMaterial;
    return originalMaterial;
  }

  dispose(): void {
    this.tiles.forEach((row) =>
      row.forEach((tile) => {
        this.scene.remove(tile.mesh);
        if (tile.mesh.geometry) {
          tile.mesh.geometry.dispose();
        }
      })
    );

    if (this.sharedTerrainMaterial instanceof THREE.Material) {
      this.sharedTerrainMaterial.dispose();
    }
  }
}
