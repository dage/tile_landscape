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
  fenceEdgePaths?: {
    positiveX: THREE.Vector3[];
    positiveZ: THREE.Vector3[];
  };
}

const FENCE_HEIGHT = 5.0;
const FENCE_COLOR = 0xff0000;
const FENCE_OPACITY = 0.5;
const FENCE_PANEL_VERTICAL_THICKNESS = 1.0;

const WALL_COLOR = 0xff8888;
const WALL_OPACITY = 0.3;

const TILE_SUBDIVISIONS = 32;

export class TileGridManager {
  private scene: THREE.Scene;
  private tiles: TerrainTile[][] = [];
  private sharedTerrainMaterial: THREE.Material;
  private fenceMaterial: THREE.MeshBasicMaterial;
  private wallMaterial: THREE.MeshBasicMaterial;

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

    this.fenceMaterial = new THREE.MeshBasicMaterial({
      color: FENCE_COLOR,
      transparent: true,
      opacity: FENCE_OPACITY,
      side: THREE.DoubleSide,
    });

    this.wallMaterial = new THREE.MeshBasicMaterial({
      color: WALL_COLOR,
      transparent: true,
      opacity: WALL_OPACITY,
      side: THREE.DoubleSide,
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

    tile.fenceGroup.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
      }
    });
    tile.fenceGroup.children = [];
    tile.fenceEdgePaths = { positiveX: [], positiveZ: [] }; // Initialize paths

    const bandVertices: number[] = [];
    const wallVertices: number[] = [];
    const tempNormal = new THREE.Vector3();

    const tileWorldOriginX = tile.conceptualGridX * TILE_SIZE;
    const tileWorldOriginZ = tile.conceptualGridZ * TILE_SIZE;

    const halfBandThicknessVec = new THREE.Vector3(
      0,
      FENCE_PANEL_VERTICAL_THICKNESS / 2,
      0
    );

    const addBandPanelSegment = (
      p1: THREE.Vector3,
      p2: THREE.Vector3,
      targetVerticesArray: number[]
    ) => {
      const v1_bottom = p1.clone().sub(halfBandThicknessVec);
      const v1_top = p1.clone().add(halfBandThicknessVec);
      const v2_bottom = p2.clone().sub(halfBandThicknessVec);
      const v2_top = p2.clone().add(halfBandThicknessVec);

      // Triangle 1: v1_bottom, v2_bottom, v2_top
      targetVerticesArray.push(v1_bottom.x, v1_bottom.y, v1_bottom.z);
      targetVerticesArray.push(v2_bottom.x, v2_bottom.y, v2_bottom.z);
      targetVerticesArray.push(v2_top.x, v2_top.y, v2_top.z);

      // Triangle 2: v1_bottom, v2_top, v1_top
      targetVerticesArray.push(v1_bottom.x, v1_bottom.y, v1_bottom.z);
      targetVerticesArray.push(v2_top.x, v2_top.y, v2_top.z);
      targetVerticesArray.push(v1_top.x, v1_top.y, v1_top.z);
    };

    const addWallPanelSegment = (
      groundP1: THREE.Vector3,
      groundP2: THREE.Vector3,
      bandBottomP1: THREE.Vector3,
      bandBottomP2: THREE.Vector3,
      targetVerticesArray: number[]
    ) => {
      // Triangle 1: groundP1, groundP2, bandBottomP2
      targetVerticesArray.push(groundP1.x, groundP1.y, groundP1.z);
      targetVerticesArray.push(groundP2.x, groundP2.y, groundP2.z);
      targetVerticesArray.push(bandBottomP2.x, bandBottomP2.y, bandBottomP2.z);

      // Triangle 2: groundP1, bandBottomP2, bandBottomP1
      targetVerticesArray.push(groundP1.x, groundP1.y, groundP1.z);
      targetVerticesArray.push(bandBottomP2.x, bandBottomP2.y, bandBottomP2.z);
      targetVerticesArray.push(bandBottomP1.x, bandBottomP1.y, bandBottomP1.z);
    };

    // Process edges
    const edges = [
      { isXEdge: true, pathStore: tile.fenceEdgePaths.positiveX },
      { isXEdge: false, pathStore: tile.fenceEdgePaths.positiveZ },
    ];

    for (const edge of edges) {
      const postBases: THREE.Vector3[] = [];
      const postTops: THREE.Vector3[] = []; // These are the points particles will follow (in local tile space)
      edge.pathStore.length = 0; // Clear previous path points for this edge

      for (let s = 0; s <= TILE_SUBDIVISIONS; s++) {
        let x_local_coord: number;
        let z_local_coord: number;

        if (edge.isXEdge) {
          // Positive X edge
          x_local_coord = TILE_SIZE / 2;
          z_local_coord = TILE_SIZE / 2 - s * (TILE_SIZE / TILE_SUBDIVISIONS);
        } else {
          // Positive Z edge
          x_local_coord = -TILE_SIZE / 2 + s * (TILE_SIZE / TILE_SUBDIVISIONS);
          z_local_coord = TILE_SIZE / 2;
        }

        const conceptualWorldX = x_local_coord + tileWorldOriginX;
        const conceptualWorldZ = z_local_coord + tileWorldOriginZ;

        const baseY = getHeight(conceptualWorldX, conceptualWorldZ);
        getSurfaceNormal(conceptualWorldX, conceptualWorldZ, tempNormal);

        const postBase = new THREE.Vector3(x_local_coord, baseY, z_local_coord);
        const postTop = postBase
          .clone()
          .add(tempNormal.clone().multiplyScalar(FENCE_HEIGHT));

        postBases.push(postBase);
        postTops.push(postTop);
        edge.pathStore.push(postTop.clone()); // Store a clone of the postTop for the particle path
      }

      // Add panels for Band and Wall
      for (let i = 0; i < TILE_SUBDIVISIONS; i++) {
        // Iterate TILE_SUBDIVISIONS times for segments
        const pTopA = postTops[i];
        const pTopB = postTops[i + 1];
        addBandPanelSegment(pTopA, pTopB, bandVertices);

        const pBaseA = postBases[i];
        const pBaseB = postBases[i + 1];
        const bandBottomA = pTopA.clone().sub(halfBandThicknessVec);
        const bandBottomB = pTopB.clone().sub(halfBandThicknessVec);
        addWallPanelSegment(
          pBaseA,
          pBaseB,
          bandBottomA,
          bandBottomB,
          wallVertices
        );
      }
    }

    if (bandVertices.length > 0) {
      const bandGeometry = new THREE.BufferGeometry();
      bandGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(bandVertices, 3)
      );
      const bandMesh = new THREE.Mesh(bandGeometry, this.fenceMaterial);
      tile.fenceGroup.add(bandMesh);
    }

    if (wallVertices.length > 0) {
      const wallGeometry = new THREE.BufferGeometry();
      wallGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(wallVertices, 3)
      );
      const wallMesh = new THREE.Mesh(wallGeometry, this.wallMaterial);
      tile.fenceGroup.add(wallMesh);
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
            if (child instanceof THREE.Mesh) {
              if (child.geometry) {
                child.geometry.dispose();
              }
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
    if (this.wallMaterial) {
      this.wallMaterial.dispose();
    }
  }

  // New public method to get all active tiles with their fence paths
  public getActiveTileFenceData(): Array<{
    conceptualGridX: number;
    conceptualGridZ: number;
    tileWorldOrigin: THREE.Vector3; // Added for convenience for particle system
    paths:
      | {
          positiveX: THREE.Vector3[]; // Paths are in local tile coordinates
          positiveZ: THREE.Vector3[];
        }
      | undefined;
  }> {
    const activeTilesData = [];
    for (let r = 0; r < GRID_DIMENSION; r++) {
      for (let c = 0; c < GRID_DIMENSION; c++) {
        const tile = this.tiles[r]?.[c];
        // A tile is active if its conceptualGridX is not -Infinity (initial value)
        if (tile && tile.conceptualGridX !== -Infinity && tile.fenceEdgePaths) {
          activeTilesData.push({
            conceptualGridX: tile.conceptualGridX,
            conceptualGridZ: tile.conceptualGridZ,
            tileWorldOrigin: new THREE.Vector3( // Calculate and provide tile world origin
              tile.conceptualGridX * TILE_SIZE,
              0, // Assuming Y is handled by getHeight for particles later
              tile.conceptualGridZ * TILE_SIZE
            ),
            paths: tile.fenceEdgePaths,
          });
        }
      }
    }
    return activeTilesData;
  }
}
