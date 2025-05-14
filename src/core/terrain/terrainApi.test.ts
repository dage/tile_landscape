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
      // With new scaling (mapWidth-1)/scale, worldX=0 maps to mapX=0, worldX=scale/2 maps to mapX=(mapWidth-1)/2, worldX=scale maps to mapX=0 (wrapped from mapWidth-1)
      // simpleHeightmap: width=3, height=3, scale=30. effectiveWidth = 2.
      // Data: [0,10,20, 5,15,25, 10,20,30]
      // (0,0) -> map(0,0) -> val 0
      expect(getHeight(0, 0)).toBe(0);

      // worldX=10. mapX = fmod(10 * (2/30), 2) = 2/3. x0=0, fx=2/3.
      // Height = data[0]*(1/3) + data[1]*(2/3) = 0*(1/3) + 10*(2/3) = 20/3
      expect(getHeight(10, 0)).toBeCloseTo(20 / 3);

      // worldZ=10. mapZ = 2/3. z0=0, fz=2/3
      // Height = data[0]*(1/3) + data[3]*(2/3) = 0*(1/3) + 5*(2/3) = 10/3 (using data[0*width+0] and data[1*width+0])
      expect(getHeight(0, 10)).toBeCloseTo(10 / 3);

      // worldX=20, worldZ=20
      // mapX = fmod(20 * (2/30), 2) = fmod(4/3,2) = 4/3. x0=1, fx=1/3.
      // mapZ = fmod(20 * (2/30), 2) = fmod(4/3,2) = 4/3. z0=1, fz=1/3.
      // h00=data[1*3+1]=15, h10=data[1*3+2]=25, h01=data[2*3+1]=20, h11=data[2*3+2]=30
      // r0 = 15*(2/3) + 25*(1/3) = (30+25)/3 = 55/3
      // r1 = 20*(2/3) + 30*(1/3) = (40+30)/3 = 70/3
      // height = (55/3)*(2/3) + (70/3)*(1/3) = (110+70)/9 = 180/9 = 20
      expect(getHeight(20, 20)).toBeCloseTo(20);
    });

    it('should bilinearly interpolate height for a point between grid vertices', () => {
      // Test point at world (5, 5)
      // mapX = fmod(5 * (2/30), 2) = fmod(1/3, 2) = 1/3. x0=0, fx=1/3.
      // mapZ = fmod(5 * (2/30), 2) = fmod(1/3, 2) = 1/3. z0=0, fz=1/3.
      // h00=data[0]=0, h10=data[1]=10, h01=data[3]=5, h11=data[4]=15
      // r0 = 0*(2/3) + 10*(1/3) = 10/3
      // r1 = 5*(2/3) + 15*(1/3) = (10+15)/3 = 25/3
      // height = (10/3)*(2/3) + (25/3)*(1/3) = (20+25)/9 = 45/9 = 5
      expect(getHeight(5, 5)).toBeCloseTo(5);

      // Test point at world (15, 5)
      // mapX = fmod(15 * (2/30), 2) = fmod(1, 2) = 1. x0=1, fx=0.
      // mapZ = fmod(5 * (2/30), 2) = 1/3. z0=0, fz=1/3.
      // h00=data[1]=10, h10=data[2]=20, h01=data[4]=15, h11=data[5]=25
      // r0 = 10*1 + 20*0 = 10
      // r1 = 15*1 + 25*0 = 15
      // height = 10*(2/3) + 15*(1/3) = (20+15)/3 = 35/3
      expect(getHeight(15, 5)).toBeCloseTo(35 / 3);
    });

    it('should handle tiling correctly when querying heights outside the primary map scale', () => {
      // World (30,0) should be same as world (0,0) due to tiling (scale is 30)
      // mapX = fmod(30*(2/30),2) = fmod(2,2) = 0.
      expect(getHeight(30, 0)).toBeCloseTo(simpleHeightmap.data[0]); // map (0,0) -> val 0. Correct.

      // getHeight(5,5) is 5 (from test above)
      expect(getHeight(35, 5)).toBeCloseTo(getHeight(5, 5));

      // worldX = -5. mapX = fmod(-5 * (2/30), 2) = fmod(-1/3, 2) = 5/3. x0=1, fx=2/3.
      // worldZ = -5. mapZ = fmod(-5 * (2/30), 2) = fmod(-1/3, 2) = 5/3. z0=1, fz=2/3.
      // h00=data[1*3+1]=15, h10=data[1*3+2 ('x1=(1+1)%3=2')]=25,
      // h01=data[2*3+1 ('z1=(1+1)%3=2')]=20, h11=data[2*3+2]=30
      // r0 = 15*(1/3) + 25*(2/3) = (15+50)/3 = 65/3
      // r1 = 20*(1/3) + 30*(2/3) = (20+60)/3 = 80/3
      // height = (65/3)*(1/3) + (80/3)*(2/3) = (65+160)/9 = 225/9 = 25
      expect(getHeight(-5, -5)).toBeCloseTo(25);
    });

    it('should ensure seamless C0 continuity across tile boundaries', () => {
      const mapScale = simpleHeightmap.scale; // e.g., 30
      const epsilon = 0.001;
      const testCoords = [0, 5, 10, 15, 20, 25]; // Various points within a tile span

      testCoords.forEach((coord) => {
        // Test X-axis wrapping
        // getHeight(0, Z) vs getHeight(scale, Z)
        expect(getHeight(0, coord)).toBeCloseTo(getHeight(mapScale, coord), 5);
        // getHeight(epsilon, Z) vs getHeight(scale + epsilon, Z)
        expect(getHeight(epsilon, coord)).toBeCloseTo(
          getHeight(mapScale + epsilon, coord),
          5
        );
        // getHeight(scale - epsilon, Z) vs getHeight(-epsilon, Z)
        expect(getHeight(mapScale - epsilon, coord)).toBeCloseTo(
          getHeight(-epsilon, coord),
          5
        );

        // Test Z-axis wrapping
        // getHeight(X, 0) vs getHeight(X, scale)
        expect(getHeight(coord, 0)).toBeCloseTo(getHeight(coord, mapScale), 5);
        // getHeight(X, epsilon) vs getHeight(X, scale + epsilon)
        expect(getHeight(coord, epsilon)).toBeCloseTo(
          getHeight(coord, mapScale + epsilon),
          5
        );
        // getHeight(X, scale - epsilon) vs getHeight(X, -epsilon)
        expect(getHeight(coord, mapScale - epsilon)).toBeCloseTo(
          getHeight(coord, -epsilon),
          5
        );
      });
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
      // world (5,5) -> height is 5 from corrected test above.
      // normalSamplingOffset = 0.5

      // h = getHeight(5,5) = 5

      // hx_plus = getHeight(5.5, 5)
      // mapX_plus = fmod(5.5 * (2/30), 2) = fmod(1.1/3, 2) = 1.1/3. x0=0, fx=1.1/3.
      // mapZ_plus = fmod(5 * (2/30), 2) = 1/3. z0=0, fz=1/3.
      // h00=0,h10=10,h01=5,h11=15
      // r0_p = 0*(1-1.1/3) + 10*(1.1/3) = 11/3
      // r1_p = 5*(1-1.1/3) + 15*(1.1/3) = (5*1.9 + 15*1.1)/3 = (9.5+16.5)/3 = 26/3
      // hx_plus = (11/3)*(2/3) + (26/3)*(1/3) = (22+26)/9 = 48/9 = 16/3 = 5.333...

      // hx_minus = getHeight(4.5, 5)
      // mapX_minus = fmod(4.5 * (2/30), 2) = fmod(0.9/3, 2) = 0.3. x0=0, fx=0.3.
      // mapZ_minus = 1/3 (as above)
      // r0_m = 0*(0.7) + 10*(0.3) = 3
      // r1_m = 5*(0.7) + 15*(0.3) = 3.5+4.5 = 8
      // hx_minus = 3*(2/3) + 8*(1/3) = (6+8)/3 = 14/3 = 4.666...

      // hz_plus = getHeight(5, 5.5)
      // mapX_pz = 1/3
      // mapZ_pz = 1.1/3
      // r0_pz = 0*(1-1/3) + 10*(1/3) = 10/3
      // r1_pz = 5*(1-1/3) + 15*(1/3) = (10+15)/3 = 25/3
      // hz_plus = (10/3)*(1-1.1/3) + (25/3)*(1.1/3) = (10*1.9 + 25*1.1)/9 = (19+27.5)/9 = 46.5/9 = 15.5/3 = 5.166...

      // hz_minus = getHeight(5, 4.5)
      // mapZ_mz = 0.3
      // hz_minus = (10/3)*(0.7) + (25/3)*(0.3) = (7+7.5)/3 = 14.5/3 = 4.833...

      // dx = hx_minus - hx_plus = (14/3) - (16/3) = -2/3
      // dz = hz_minus - hz_plus = (14.5/3) - (15.5/3) = -1/3
      // outNormal.set(-2/3, 2 * 0.5, -1/3) = (-2/3, 1, -1/3).
      // Length = sqrt(4/9 + 1 + 1/9) = sqrt(5/9+1) = sqrt(14/9) = sqrt(14)/3
      // Normalized: (-2/sqrt(14), 3/sqrt(14), -1/sqrt(14))
      // sqrt(14) approx 3.7416
      // x = -2/3.7416 = -0.5345
      // y = 3/3.7416 = 0.8017
      // z = -1/3.7416 = -0.2672

      mockGenerateHeightmap.mockReturnValue(simpleHeightmap); // Ensure original simple map
      initializeTerrainApi();

      getSurfaceNormal(5, 5, outNormal);
      const expected = new THREE.Vector3(-2 / 3, 1.0, -1 / 3).normalize();
      expect(outNormal.x).toBeCloseTo(expected.x);
      expect(outNormal.y).toBeCloseTo(expected.y);
      expect(outNormal.z).toBeCloseTo(expected.z);
    });
  });
});
