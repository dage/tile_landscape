import * as THREE from 'three';
import { TILE_SIZE, GRID_DIMENSION } from '@/core/constants';

interface TerrainTile {
  mesh: THREE.Mesh;
  conceptualGridX: number;
  conceptualGridZ: number;
  markerMesh?: THREE.Mesh; // Replaced boundaryMesh with markerMesh
  centerMarkerMesh?: THREE.Mesh; // New larger green sphere
}

export class TileGridManager {
  private scene: THREE.Scene;
  private tiles: TerrainTile[][] = [];
  private sharedTerrainMaterial: THREE.Material;
  private markerMaterial: THREE.Material; // For the new sphere markers
  private centerMarkerMaterial: THREE.Material; // For the larger green sphere

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

    // Create a material for markers
    this.markerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000, // Red color for visibility
    });

    // Create a material for the center green markers
    this.centerMarkerMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00, // Green color
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
          // markerMesh will be created in recycleTiles
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
        // The markerMesh is a child of tile.mesh, so its position updates automatically.
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

          // Clean up old marker mesh if it exists
          if (tile.markerMesh) {
            tile.mesh.remove(tile.markerMesh); // Remove from parent tile mesh
            if (tile.markerMesh.geometry) {
              tile.markerMesh.geometry.dispose();
            }
          }
          // Clean up old center marker mesh if it exists
          if (tile.centerMarkerMesh) {
            tile.mesh.remove(tile.centerMarkerMesh); // Remove from parent tile mesh
            if (tile.centerMarkerMesh.geometry) {
              tile.centerMarkerMesh.geometry.dispose();
            }
          }

          // Create new markers for this tile
          this.createTileMarkers(tile);
        }
      }
    }
  }

  /**
   * Creates sphere markers for a tile.
   */
  private createTileMarkers(tile: TerrainTile): void {
    // Small red marker for a corner
    const smallSphereRadius = 1;
    const sphereSegments = 8;
    const halfTileSize = TILE_SIZE / 2;
    const smallMarkerGeometry = new THREE.SphereGeometry(
      smallSphereRadius,
      sphereSegments,
      sphereSegments
    );
    const markerMesh = new THREE.Mesh(smallMarkerGeometry, this.markerMaterial);
    // Position the red marker at a corner of the tile (e.g., bottom-left relative to local origin)
    markerMesh.position.set(
      -halfTileSize,
      smallSphereRadius + 0.5, // Slightly above the tile plane
      -halfTileSize
    );
    tile.markerMesh = markerMesh;
    tile.mesh.add(markerMesh); // Add as child of the tile mesh

    // Larger green center marker
    const largeSphereRadius = 3; // Larger radius
    const largeMarkerGeometry = new THREE.SphereGeometry(
      largeSphereRadius,
      sphereSegments, // Can use same segments or more if detail is needed
      sphereSegments
    );
    const centerMarkerMesh = new THREE.Mesh(
      largeMarkerGeometry,
      this.centerMarkerMaterial
    );
    // Position it slightly higher than the small marker, or at terrain height if calculated
    centerMarkerMesh.position.set(0, largeSphereRadius + 0.5, 0); // Adjust Y as needed
    tile.centerMarkerMesh = centerMarkerMesh;
    tile.mesh.add(centerMarkerMesh);
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

        // Clean up marker mesh
        if (tile.markerMesh) {
          tile.mesh.remove(tile.markerMesh); // Remove from parent tile mesh
          if (tile.markerMesh.geometry) {
            tile.markerMesh.geometry.dispose();
          }
        }
        // Clean up center marker mesh
        if (tile.centerMarkerMesh) {
          tile.mesh.remove(tile.centerMarkerMesh);
          if (tile.centerMarkerMesh.geometry) {
            tile.centerMarkerMesh.geometry.dispose();
          }
        }
      })
    );

    if (this.sharedTerrainMaterial instanceof THREE.Material) {
      this.sharedTerrainMaterial.dispose();
    }

    if (this.markerMaterial) {
      this.markerMaterial.dispose();
    }
    if (this.centerMarkerMaterial) {
      this.centerMarkerMaterial.dispose();
    }
  }
}
