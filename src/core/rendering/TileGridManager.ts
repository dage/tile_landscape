import * as THREE from 'three';
import { TILE_SIZE, GRID_DIMENSION } from '@/core/constants';
import {
  initializeTerrainApi,
  getHeight,
  getSurfaceNormal,
} from '@/core/terrain/terrainApi';

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

    // Initialize the terrain API (generates/loads heightmap)
    initializeTerrainApi();

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
    // Create base plane geometry with sufficient subdivisions
    const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE, 32, 32);
    geometry.rotateX(-Math.PI / 2); // Rotate to be horizontal (Y-up)

    const positions = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const normal = new THREE.Vector3();

    // Calculate the world offset for this tile
    const tileWorldOriginX = gridX * TILE_SIZE;
    const tileWorldOriginZ = gridZ * TILE_SIZE;

    // Apply displacement from heightmap and calculate normals
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);

      // Calculate conceptual world position of this vertex
      const conceptualWorldX = vertex.x + tileWorldOriginX;
      const conceptualWorldZ = vertex.z + tileWorldOriginZ;

      // Get height from new Terrain API
      vertex.y = getHeight(conceptualWorldX, conceptualWorldZ);
      positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    // Compute vertex normals
    geometry.deleteAttribute('normal'); // Remove existing normals
    const normals = new Float32Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);
      const conceptualWorldX = vertex.x + tileWorldOriginX;
      const conceptualWorldZ = vertex.z + tileWorldOriginZ;

      // Calculate normal for ALL vertices using getSurfaceNormal
      // This ensures that if two vertices from adjacent tiles share the same
      // conceptual world coordinate (e.g., at a seam), they get the same normal.
      getSurfaceNormal(conceptualWorldX, conceptualWorldZ, normal);

      normals[i * 3] = normal.x;
      normals[i * 3 + 1] = normal.y;
      normals[i * 3 + 2] = normal.z;
    }
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    // Height-based coloring using vertex colors
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();

    // Enhanced color palette for more variation
    const colorStops = [
      { height: -70.0, color: new THREE.Color(0x224411) }, // Deep valleys - dark forest
      { height: -20.0, color: new THREE.Color(0x336622) }, // Low areas - forest green
      { height: 10.0, color: new THREE.Color(0x669944) }, // Mid-level - grassy
      { height: 50.0, color: new THREE.Color(0x998866) }, // High ground - rocky
      { height: 90.0, color: new THREE.Color(0xaabbcc) }, // Peaks - snowy blue-gray
    ];

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);
      // For color, we also need conceptual world X, Z for consistent color noise
      const conceptualWorldX = vertex.x + tileWorldOriginX;
      const conceptualWorldZ = vertex.z + tileWorldOriginZ;

      // Find the appropriate color segment based on height
      let colorIndex = 0;
      for (let j = 0; j < colorStops.length - 1; j++) {
        if (
          vertex.y >= colorStops[j].height &&
          vertex.y < colorStops[j + 1].height
        ) {
          colorIndex = j;
          break;
        } else if (vertex.y >= colorStops[colorStops.length - 1].height) {
          colorIndex = colorStops.length - 2; // Last segment
        }
      }

      // Calculate interpolation within this segment
      const lowerStop = colorStops[colorIndex];
      const upperStop = colorStops[colorIndex + 1];
      const segmentSize = upperStop.height - lowerStop.height;
      let t = (vertex.y - lowerStop.height) / segmentSize;

      // Adjust for tile position in world to get continuous noise for color
      const colorNoiseX = conceptualWorldX * 0.05; // Corrected: Apply 0.05 to the full conceptualWorldX
      const colorNoiseZ = conceptualWorldZ * 0.05; // Corrected: Apply 0.05 to the full conceptualWorldZ

      const noiseValue = this.simplifiedNoise(colorNoiseX, colorNoiseZ) * 0.15;
      t = THREE.MathUtils.clamp(t + noiseValue, 0, 1);

      // Interpolate between the two colors in this segment
      color.copy(lowerStop.color).lerp(upperStop.color, t);

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
    // This simplifiedNoise is now only used for color variation.
    // It can remain as is, or be replaced if a different color noise pattern is desired.
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
          conceptualGridX: -Infinity,
          conceptualGridZ: -Infinity,
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
