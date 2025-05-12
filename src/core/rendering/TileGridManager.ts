import * as THREE from 'three';
import { TILE_SIZE, GRID_DIMENSION } from '@/core/constants';

interface TerrainTile {
  mesh: THREE.Mesh;
  conceptualGridX: number;
  conceptualGridZ: number;
  boundaryMesh?: THREE.Object3D; // Changed from LineSegments to Object3D to be more generic
}

export class TileGridManager {
  private scene: THREE.Scene;
  private tiles: TerrainTile[][] = [];
  private sharedTerrainMaterial: THREE.Material;
  private boundariesVisible: boolean = false; // Track visibility state
  private boundaryMaterial: THREE.LineBasicMaterial;

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

    // Create a material for boundaries
    this.boundaryMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff, // Cyan color for visibility
      transparent: true,
      opacity: 0.4,
      depthWrite: true,
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

    // Enhanced color palette for more variation
    const colorStops = [
      { height: -10.0, color: new THREE.Color(0x224411) }, // Deep valleys - dark forest
      { height: -2.0, color: new THREE.Color(0x336622) }, // Low areas - forest green
      { height: 5.0, color: new THREE.Color(0x669944) }, // Mid-level - grassy
      { height: 10.0, color: new THREE.Color(0x998866) }, // High ground - rocky
      { height: 15.0, color: new THREE.Color(0xaabbcc) }, // Peaks - snowy blue-gray
    ];

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);

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

      // Add a subtle noise factor to the color interpolation for more variation
      const noiseValue =
        this.simplifiedNoise(
          (gridX + vertex.x) * 0.05,
          (gridZ + vertex.z) * 0.05
        ) * 0.15;
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

        // Also update the boundary position if it exists
        if (tile.boundaryMesh) {
          const tileScenePosition = new THREE.Vector3(
            conceptualTileWorldX - worldOriginOffset.x,
            0.05 - worldOriginOffset.y, // Slightly above ground to avoid z-fighting
            conceptualTileWorldZ - worldOriginOffset.z
          );

          tile.boundaryMesh.position.copy(tileScenePosition);

          // Also update corner markers
          if ((tile.boundaryMesh as any).cornerMarkers) {
            (tile.boundaryMesh as any).cornerMarkers.position.copy(
              tileScenePosition
            );
          }
        }
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

          // Clean up old boundary mesh if it exists
          if (tile.boundaryMesh) {
            this.scene.remove(tile.boundaryMesh);

            // Also remove corner markers
            if ((tile.boundaryMesh as any).cornerMarkers) {
              this.scene.remove((tile.boundaryMesh as any).cornerMarkers);
            }

            if ((tile.boundaryMesh as THREE.Line).geometry) {
              (tile.boundaryMesh as THREE.Line).geometry.dispose();
            }
          }

          // Create new boundary for this tile
          this.createTileBoundary(tile);
        }
      }
    }
  }

  /**
   * Creates a wireframe boundary for a tile
   */
  private createTileBoundary(tile: TerrainTile): void {
    // Create a simple square outline at the exact tile perimeter
    const halfSize = TILE_SIZE / 2;

    // Create exactly 4 points for the corners of the tile
    const points = [
      new THREE.Vector3(-halfSize, 0, -halfSize), // Bottom left
      new THREE.Vector3(halfSize, 0, -halfSize), // Bottom right
      new THREE.Vector3(halfSize, 0, halfSize), // Top right
      new THREE.Vector3(-halfSize, 0, halfSize), // Top left
      new THREE.Vector3(-halfSize, 0, -halfSize), // Close the loop
    ];

    // Create geometry from the points
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    // Use LineLoop for a continuous line
    const boundaryMesh = new THREE.LineLoop(geometry, this.boundaryMaterial);
    boundaryMesh.visible = this.boundariesVisible;

    // Add small vertical markers at the corners for better visibility
    const cornerMarkers = new THREE.Group();
    const markerHeight = 5;

    // Add a small vertical line at each corner
    for (let i = 0; i < 4; i++) {
      const cornerPoint = points[i].clone();
      const markerPoints = [
        cornerPoint,
        cornerPoint.clone().setY(markerHeight),
      ];

      const markerGeometry = new THREE.BufferGeometry().setFromPoints(
        markerPoints
      );
      const marker = new THREE.Line(markerGeometry, this.boundaryMaterial);
      cornerMarkers.add(marker);
    }

    // Add the corner markers to the scene
    cornerMarkers.visible = this.boundariesVisible;
    this.scene.add(cornerMarkers);

    // Store the corner markers with the boundary mesh for disposal later
    (boundaryMesh as any).cornerMarkers = cornerMarkers;

    // Store reference to the boundary mesh
    tile.boundaryMesh = boundaryMesh;

    // Add boundary mesh to scene
    this.scene.add(boundaryMesh);
  }

  /**
   * Set visibility of tile boundaries for debugging
   */
  public setTileBoundariesVisible(visible: boolean): void {
    this.boundariesVisible = visible;

    // Update visibility of all boundary meshes
    for (let r = 0; r < GRID_DIMENSION; r++) {
      for (let c = 0; c < GRID_DIMENSION; c++) {
        const tile = this.tiles[r][c];
        if (tile.boundaryMesh) {
          tile.boundaryMesh.visible = visible;
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

        // Clean up boundary mesh
        if (tile.boundaryMesh) {
          this.scene.remove(tile.boundaryMesh);

          // Also remove corner markers
          if ((tile.boundaryMesh as any).cornerMarkers) {
            this.scene.remove((tile.boundaryMesh as any).cornerMarkers);
          }

          if ((tile.boundaryMesh as THREE.Line).geometry) {
            (tile.boundaryMesh as THREE.Line).geometry.dispose();
          }
        }
      })
    );

    if (this.sharedTerrainMaterial instanceof THREE.Material) {
      this.sharedTerrainMaterial.dispose();
    }

    if (this.boundaryMaterial) {
      this.boundaryMaterial.dispose();
    }
  }
}
