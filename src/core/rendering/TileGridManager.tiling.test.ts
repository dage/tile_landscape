import * as THREE from 'three';
import { TileGridManager } from './TileGridManager';
import { TILE_SIZE } from '@/core/constants';

// Test to ensure height continuity between adjacent tiles at their shared edge
describe('TileGridManager tiling continuity', () => {
  it('matches heights on the shared edge between two horizontally adjacent tiles', () => {
    const scene = new THREE.Scene();
    const manager = new TileGridManager(scene);
    // Access private method via type assertion
    const createGeo = (manager as any).createTerrainGeometry.bind(manager);

    // Generate geometries for tiles at grid positions (0,0) and (1,0)
    const geo0 = createGeo(0, 0);
    const geo1 = createGeo(1, 0);

    const pos0 = (geo0.attributes.position as THREE.BufferAttribute)
      .array as Float32Array;
    const pos1 = (geo1.attributes.position as THREE.BufferAttribute)
      .array as Float32Array;

    const halfTile = TILE_SIZE / 2;
    const tol = 1e-6;

    // Collect heights at x = +halfTile in geo0 and x = -halfTile in geo1
    const edge0: { z: number; y: number }[] = [];
    const edge1: { z: number; y: number }[] = [];

    for (let i = 0; i < pos0.length; i += 3) {
      const x = pos0[i];
      if (Math.abs(x - halfTile) < tol) {
        edge0.push({ z: pos0[i + 2], y: pos0[i + 1] });
      }
    }
    for (let i = 0; i < pos1.length; i += 3) {
      const x = pos1[i];
      if (Math.abs(x + halfTile) < tol) {
        edge1.push({ z: pos1[i + 2], y: pos1[i + 1] });
      }
    }

    expect(edge0.length).toBeGreaterThan(0);
    expect(edge0.length).toBe(edge1.length);

    // Sort both edges by Z coordinate
    edge0.sort((a, b) => a.z - b.z);
    edge1.sort((a, b) => a.z - b.z);

    // Compare heights
    for (let idx = 0; idx < edge0.length; idx++) {
      expect(edge0[idx].y).toBeCloseTo(edge1[idx].y, 6);
    }
  });

  it('matches heights one subdivision inside the shared edge between two horizontally adjacent tiles', () => {
    const scene = new THREE.Scene();
    const manager = new TileGridManager(scene);
    const createGeo = (manager as any).createTerrainGeometry.bind(manager);

    const geo0 = createGeo(0, 0);
    const geo1 = createGeo(1, 0);
    const pos0 = (geo0.attributes.position as THREE.BufferAttribute)
      .array as Float32Array;
    const pos1 = (geo1.attributes.position as THREE.BufferAttribute)
      .array as Float32Array;

    const SUBDIVISIONS = 32; // Matches the PlaneGeometry subdivisions
    const halfTile = TILE_SIZE / 2;
    const step = TILE_SIZE / SUBDIVISIONS;
    const insideX0 = halfTile - step;
    const insideX1 = -halfTile + step;
    const tol = 1e-6;

    const edge0: { z: number; y: number }[] = [];
    const edge1: { z: number; y: number }[] = [];
    // Collect heights at x ~ insideX0 in geo0
    for (let i = 0; i < pos0.length; i += 3) {
      const x = pos0[i];
      if (Math.abs(x - insideX0) < tol) {
        edge0.push({ z: pos0[i + 2], y: pos0[i + 1] });
      }
    }
    // Collect heights at x ~ insideX1 in geo1
    for (let i = 0; i < pos1.length; i += 3) {
      const x = pos1[i];
      if (Math.abs(x - insideX1) < tol) {
        edge1.push({ z: pos1[i + 2], y: pos1[i + 1] });
      }
    }
    expect(edge0.length).toBeGreaterThan(0);
    expect(edge0.length).toBe(edge1.length);

    edge0.sort((a, b) => a.z - b.z);
    edge1.sort((a, b) => a.z - b.z);
    for (let idx = 0; idx < edge0.length; idx++) {
      expect(edge0[idx].y).toBeCloseTo(edge1[idx].y, 6);
    }
  });
});
