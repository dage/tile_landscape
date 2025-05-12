import { Vector3 } from 'three';

/**
 * Calculate the shift delta for the floating origin based on camera and current origin offset.
 * @param conceptualCameraPosition - The conceptual camera position in world units.
 * @param worldOriginOffset - The current world origin offset.
 * @param threshold - The threshold beyond which to shift the origin.
 * @param tileSize - The size of a single tile (amount to shift by).
 * @returns A Vector3 representing how much to shift the world origin.
 */
export function computeShiftDelta(
  conceptualCameraPosition: Vector3,
  worldOriginOffset: Vector3,
  threshold: number,
  tileSize: number
): Vector3 {
  const cameraScenePos = conceptualCameraPosition
    .clone()
    .sub(worldOriginOffset);
  const shiftDelta = new Vector3(0, 0, 0);
  if (Math.abs(cameraScenePos.x) > threshold) {
    shiftDelta.x = Math.sign(cameraScenePos.x) * tileSize;
  }
  if (Math.abs(cameraScenePos.z) > threshold) {
    shiftDelta.z = Math.sign(cameraScenePos.z) * tileSize;
  }
  return shiftDelta;
}
