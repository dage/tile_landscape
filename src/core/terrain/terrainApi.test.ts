import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import * as THREE from 'three';
import {
  initializeTerrainApi,
  getHeight,
  getSurfaceNormal,
} from './terrainApi';
import * as HeightmapGenerator from './heightmapGenerator';
import type { HeightmapData } from './heightmapGenerator';

// Mock the heightmapGenerator to provide controlled data for tests
vi.mock('./heightmapGenerator', async (importOriginal) => {
  const actual = await importOriginal<typeof HeightmapGenerator>();
  return {
    ...actual,
    generateHeightmap: vi.fn(),
  };
});

const mockGenerateHeightmap = HeightmapGenerator.generateHeightmap as Mock;

describe('TerrainAPI', () => {
  let simpleHeightmap: HeightmapData;

  beforeEach(() => {
    // Reset mocks and create a simple heightmap for each test
    mockGenerateHeightmap.mockReset();
    simpleHeightmap = {
      width: 3, // 3x3 grid for simple interpolation tests
      height: 3,
      scale: 30, // World units this 3x3 map covers
      data: new Float32Array([
        0,
        10,
        20, // z = 0
        5,
        15,
        25, // z = 1
        10,
        20,
        30, // z = 2
      ]),
      // Point (0,0) in map = world (0,0), height 0
      // Point (1,0) in map = world (10,0), height 10
      // Point (0,1) in map = world (0,10), height 5
      // Point (1,1) in map = world (10,10), height 15
    };
    mockGenerateHeightmap.mockReturnValue(simpleHeightmap);
    initializeTerrainApi(); // This will now use the mocked return value
  });

  describe('getHeight', () => {
    it('should return the correct height for a point exactly on a grid vertex', () => {
      expect(getHeight(0, 0)).toBe(0); // map (0,0)
      expect(getHeight(10, 0)).toBe(10); // map (1,0)
      expect(getHeight(0, 10)).toBe(5); // map (0,1)
      expect(getHeight(20, 20)).toBe(30); // map (2,2)
    });

    it('should bilinearly interpolate height for a point between grid vertices', () => {
      // Test point at world (5, 5), which is map (0.5, 0.5)
      // h00=0, h10=10, h01=5, h11=15
      // r0 = 0*(0.5) + 10*(0.5) = 5
      // r1 = 5*(0.5) + 15*(0.5) = 10
      // height = 5*(0.5) + 10*(0.5) = 2.5 + 5 = 7.5
      expect(getHeight(5, 5)).toBeCloseTo(7.5);

      // Test point at world (15, 5), which is map (1.5, 0.5)
      // h00=10, h10=20, h01=15, h11=25
      // r0 = 10*(0.5) + 20*(0.5) = 15
      // r1 = 15*(0.5) + 25*(0.5) = 20
      // height = 15*(0.5) + 20*(0.5) = 7.5 + 10 = 17.5
      expect(getHeight(15, 5)).toBeCloseTo(17.5);
    });

    it('should handle tiling correctly when querying heights outside the primary map scale', () => {
      // World (30,0) should be same as world (0,0) due to tiling (scale is 30)
      expect(getHeight(30, 0)).toBeCloseTo(simpleHeightmap.data[0]); // map (0,0)
      expect(getHeight(35, 5)).toBeCloseTo(getHeight(5, 5)); // map (0.5, 0.5) -> 7.5
      expect(getHeight(-5, -5)).toBeCloseTo(getHeight(25, 25)); // map (2.5, 2.5) -> effectively (0.5,0.5) from top-right corner from tile before
      // map(-0.5, -0.5) -> map(2.5, 2.5)
      // h00=data[2*3+2]=30, h10=data[2*3+0]=10, h01=data[0*3+2]=20, h11=data[0*3+0]=0
      // r0 = 30*0.5 + 10*0.5 = 20
      // r1 = 20*0.5 + 0*0.5 = 10
      // height = 20*0.5 + 10*0.5 = 15
      // Let's re-verify the tiling logic for negative numbers.
      // worldX = -5. worldToMapScaleX = 3/30 = 0.1. mapX = fmod(-5 * 0.1, 3) = fmod(-0.5, 3) = 2.5
      // worldZ = -5. worldToMapScaleZ = 0.1. mapZ = fmod(-0.5, 3) = 2.5
      // x0=2, z0=2. x1=0, z1=0. fx=0.5, fz=0.5
      // h00 = data[2*3+2] = 30
      // h10 = data[2*3+0] = 10 (map point x1=0, z0=2)
      // h01 = data[0*3+2] = 20 (map point x0=2, z1=0)
      // h11 = data[0*3+0] = 0  (map point x1=0, z1=0)
      // r0 = 30*0.5 + 10*0.5 = 20
      // r1 = 20*0.5 + 0*0.5 = 10
      // height = 20*0.5 + 10*0.5 = 15
      expect(getHeight(-5, -5)).toBeCloseTo(15);
    });
  });

  describe('getSurfaceNormal', () => {
    const outNormal = new THREE.Vector3();

    it('should return (0,1,0) for a flat area', () => {
      // Make a flat section in the heightmap for this test
      const flatHeightmap: HeightmapData = {
        width: 3,
        height: 3,
        scale: 30,
        data: new Float32Array([5, 5, 5, 5, 5, 5, 5, 5, 5]),
      };
      mockGenerateHeightmap.mockReturnValue(flatHeightmap);
      initializeTerrainApi(); // Re-initialize with flat map

      getSurfaceNormal(15, 15, outNormal); // Center of the map
      expect(outNormal.x).toBeCloseTo(0);
      expect(outNormal.y).toBeCloseTo(1);
      expect(outNormal.z).toBeCloseTo(0);
    });

    it('should calculate correct normal for a simple slope', () => {
      // Use the default simpleHeightmap which has slopes
      // world (5,5) -> height 7.5
      // normalSamplingOffset = 0.5
      // hx_plus = getHeight(5.5, 5) -> map (0.55, 0.5)
      //   x0=0, z0=0. x1=1, z1=1. fx=0.55, fz=0.5
      //   h00=0,h10=10,h01=5,h11=15. r0=0*0.45+10*0.55=5.5. r1=5*0.45+15*0.55=2.25+8.25=10.5. height=5.5*0.5+10.5*0.5=2.75+5.25 = 8.0
      // hx_minus = getHeight(4.5, 5) -> map (0.45, 0.5)
      //   fx=0.45. r0=0*0.55+10*0.45=4.5. r1=5*0.55+15*0.45=2.75+6.75=9.5. height=4.5*0.5+9.5*0.5=2.25+4.75 = 7.0
      // hz_plus = getHeight(5, 5.5) -> map (0.5, 0.55)
      //   fz=0.55. r0=0*0.5+10*0.5=5. r1=5*0.5+15*0.5=10. height=5*0.45+10*0.55=2.25+5.5=7.75
      // hz_minus = getHeight(5, 4.5) -> map (0.5, 0.45)
      //   fz=0.45. r0=5. r1=10. height=5*0.55+10*0.45=2.75+4.5=7.25
      // dx = hx_minus - hx_plus = 7.0 - 8.0 = -1.0
      // dz = hz_minus - hz_plus = 7.25 - 7.75 = -0.5
      // outNormal.set(-1.0, 2 * 0.5, -0.5) = (-1.0, 1.0, -0.5).normalize()
      mockGenerateHeightmap.mockReturnValue(simpleHeightmap); // Ensure original simple map
      initializeTerrainApi();

      getSurfaceNormal(5, 5, outNormal);
      const expected = new THREE.Vector3(-1.0, 1.0, -0.5).normalize();
      expect(outNormal.x).toBeCloseTo(expected.x);
      expect(outNormal.y).toBeCloseTo(expected.y);
      expect(outNormal.z).toBeCloseTo(expected.z);
    });
  });
});
