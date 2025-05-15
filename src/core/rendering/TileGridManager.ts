// src/core/rendering/TileGridManager.ts
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
  fenceGroup?: THREE.Group;
}

const FENCE_HEIGHT = 10.0;
const FENCE_COLOR = 0x888888;
const TILE_SUBDIVISIONS = 32;

export class TileGridManager {
  private scene: THREE.Scene;
  private tiles: TerrainTile[][] = [];
  private sharedTerrainMaterial: THREE.Material;
  private fenceMaterial: THREE.LineBasicMaterial;

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

    this.fenceMaterial = new THREE.LineBasicMaterial({
      color: FENCE_COLOR,
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
          fenceGroup: new THREE.Group(),
          conceptualGridX: -Infinity,
          conceptualGridZ: -Infinity,
        };
        this.tiles[r][c] = tile;
        this.scene.add(tile.mesh);
        if (tile.fenceGroup) {
          this.scene.add(tile.fenceGroup);
        }
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
          0 - worldOriginOffset.y, // Assuming terrain base is at y=0 conceptually before height displacement
          conceptualTileWorldZ - worldOriginOffset.z
        );
        if (tile.fenceGroup) {
          tile.fenceGroup.position.set(
            conceptualTileWorldX - worldOriginOffset.x,
            -worldOriginOffset.y, // Fence group is also relative to tile's conceptual origin (0,0,0)
            conceptualTileWorldZ - worldOriginOffset.z
          );
        }
      }
    }
  }

  private createOrUpdateTileFence(tile: TerrainTile): void {
    if (!tile.fenceGroup) {
      tile.fenceGroup = new THREE.Group();
      this.scene.add(tile.fenceGroup);
    }

    // Clear previous fence geometry
    tile.fenceGroup.children.forEach((child) => {
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
      }
    });
    tile.fenceGroup.children = [];

    const fencePoints: THREE.Vector3[] = [];
    const tempNormal = new THREE.Vector3();

    const tileWorldOriginX = tile.conceptualGridX * TILE_SIZE;
    const tileWorldOriginZ = tile.conceptualGridZ * TILE_SIZE;

    // Edge 1: Positive X edge (local x = TILE_SIZE / 2)
    // Local z varies from TILE_SIZE / 2 down to -TILE_SIZE / 2
    const postTopsEdge1: THREE.Vector3[] = [];
    for (let s = 0; s <= TILE_SUBDIVISIONS; s++) {
      const x_local = TILE_SIZE / 2;
      // y_orig_s ranges from -TILE_SIZE / 2 to +TILE_SIZE / 2
      // z_local_s = -y_orig_s, so it ranges from +TILE_SIZE / 2 to -TILE_SIZE / 2
      const z_local_s = TILE_SIZE / 2 - s * (TILE_SIZE / TILE_SUBDIVISIONS);

      const conceptualWorldX = x_local + tileWorldOriginX;
      const conceptualWorldZ = z_local_s + tileWorldOriginZ;

      const baseY = getHeight(conceptualWorldX, conceptualWorldZ);
      getSurfaceNormal(conceptualWorldX, conceptualWorldZ, tempNormal);

      const postBase = new THREE.Vector3(x_local, baseY, z_local_s);
      const postTop = postBase
        .clone()
        .add(tempNormal.clone().multiplyScalar(FENCE_HEIGHT));

      fencePoints.push(postBase);
      fencePoints.push(postTop);
      postTopsEdge1.push(postTop);
    }

    // Add top wire for Edge 1
    for (let i = 0; i < postTopsEdge1.length - 1; i++) {
      fencePoints.push(postTopsEdge1[i]);
      fencePoints.push(postTopsEdge1[i + 1]);
    }

    // Edge 2: Positive Z edge (local z = TILE_SIZE / 2)
    // Local x varies from -TILE_SIZE / 2 to TILE_SIZE / 2
    const postTopsEdge2: THREE.Vector3[] = [];
    for (let s = 0; s <= TILE_SUBDIVISIONS; s++) {
      const z_local = TILE_SIZE / 2;
      const x_local_s = -TILE_SIZE / 2 + s * (TILE_SIZE / TILE_SUBDIVISIONS);

      const conceptualWorldX = x_local_s + tileWorldOriginX;
      const conceptualWorldZ = z_local + tileWorldOriginZ;

      const baseY = getHeight(conceptualWorldX, conceptualWorldZ);
      getSurfaceNormal(conceptualWorldX, conceptualWorldZ, tempNormal);

      const postBase = new THREE.Vector3(x_local_s, baseY, z_local);
      const postTop = postBase
        .clone()
        .add(tempNormal.clone().multiplyScalar(FENCE_HEIGHT));

      fencePoints.push(postBase);
      fencePoints.push(postTop);
      postTopsEdge2.push(postTop);
    }

    // Add top wire for Edge 2
    for (let i = 0; i < postTopsEdge2.length - 1; i++) {
      fencePoints.push(postTopsEdge2[i]);
      fencePoints.push(postTopsEdge2[i + 1]);
    }

    if (fencePoints.length > 0) {
      const fenceGeometry = new THREE.BufferGeometry().setFromPoints(
        fencePoints
      );
      const fenceLines = new THREE.LineSegments(
        fenceGeometry,
        this.fenceMaterial
      );
      tile.fenceGroup.add(fenceLines);
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
          // Regenerate terrain geometry for the new position
          tile.mesh.geometry = this.createTerrainGeometry(
            targetConceptualGridX,
            targetConceptualGridZ
          );
          // Create/update fence for the new geometry
          this.createOrUpdateTileFence(tile);
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
        if (tile.fenceGroup) {
          tile.fenceGroup.children.forEach((child) => {
            if (child instanceof THREE.LineSegments) {
              child.geometry.dispose();
            }
          });
          this.scene.remove(tile.fenceGroup);
        }
      })
    );

    if (this.sharedTerrainMaterial instanceof THREE.Material) {
      this.sharedTerrainMaterial.dispose();
    }
    if (this.fenceMaterial) {
      this.fenceMaterial.dispose();
    }
  }
}
