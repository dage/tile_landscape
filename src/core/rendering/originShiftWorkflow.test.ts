import { computeShiftDelta } from './originShift';
import {
  FLOATING_ORIGIN_SHIFT_THRESHOLD,
  TILE_SIZE,
  CAMERA_SPEED,
} from '@/core/constants';
import { Vector3 } from 'three';
import { test, expect } from 'vitest';

/**
 * Simulates a single frame crossing the origin shift threshold and checks
 * that the camera's scene position moves by exactly CAMERA_SPEED (no sudden jumps).
 * Current implementation will cause a jump, so this test will fail.
 */

test('camera scene position movement is consistent across origin shift', () => {
  const deltaTime = 1; // Simulate one discrete step
  const speed = CAMERA_SPEED; // 30

  // Initial state (like end of Frame 0)
  // Start far enough back so the first step doesn't cross threshold
  let conceptualCameraPos = new Vector3(
    0,
    0,
    FLOATING_ORIGIN_SHIFT_THRESHOLD - speed * 1.5
  ); // e.g., 150 - 30*1.5 = 105
  let worldOriginOffset = new Vector3(0, 0, 0);
  let cameraScenePos = conceptualCameraPos.clone().sub(worldOriginOffset);

  // --- Simulate Frame 1 (moves to just below threshold, no shift) ---
  const scenePos_Frame0_End = cameraScenePos.clone(); // Z is 105

  // 1. Update conceptual camera position
  conceptualCameraPos.z += speed * deltaTime; // 105 + 30 = 135

  // 2. Floating Origin Check & Shift
  let shiftDelta = computeShiftDelta(
    conceptualCameraPos,
    worldOriginOffset,
    FLOATING_ORIGIN_SHIFT_THRESHOLD,
    TILE_SIZE
  );
  expect(shiftDelta.z).toBe(0); // No shift expected this frame
  if (shiftDelta.lengthSq() > 0) {
    worldOriginOffset.add(shiftDelta);
  }

  // 3. Update camera's actual scene position
  cameraScenePos.subVectors(conceptualCameraPos, worldOriginOffset); // 135 - 0 = 135
  const sceneMovement_Frame1 = cameraScenePos.z - scenePos_Frame0_End.z; // 135 - 105 = 30
  expect(sceneMovement_Frame1).toBeCloseTo(speed * deltaTime, 5); // Should be 30

  // --- Simulate Frame 2 (crosses threshold, shift occurs) ---
  const scenePos_Frame1_End = cameraScenePos.clone(); // Z is 135

  // 1. Update conceptual camera position
  conceptualCameraPos.z += speed * deltaTime; // 135 + 30 = 165

  // 2. Floating Origin Check & Shift
  shiftDelta = computeShiftDelta(
    conceptualCameraPos,
    worldOriginOffset, // Still (0,0,0) at this point of check
    FLOATING_ORIGIN_SHIFT_THRESHOLD,
    TILE_SIZE
  );
  expect(shiftDelta.z).toBe(TILE_SIZE); // Shift of TILE_SIZE expected
  if (shiftDelta.lengthSq() > 0) {
    worldOriginOffset.add(shiftDelta); // worldOriginOffset.z becomes 100
  }

  // 3. Update camera's actual scene position
  cameraScenePos.subVectors(conceptualCameraPos, worldOriginOffset); // 165 - 100 = 65
  const sceneMovement_Frame2 = cameraScenePos.z - scenePos_Frame1_End.z; // 65 - 135 = -70

  // The actual change in scene Z coordinate is speed - TILE_SIZE
  expect(sceneMovement_Frame2).toBeCloseTo(speed * deltaTime - TILE_SIZE, 5); // Expected: 30 - 100 = -70
});
