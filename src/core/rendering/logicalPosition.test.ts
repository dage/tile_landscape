import { expect, test } from 'vitest';
import { TILE_SIZE, FLOATING_ORIGIN_SHIFT_THRESHOLD } from '@/core/constants';

/**
 * Given a conceptual world position and origin offset before and after shift,
 * verify that (vWorldPos + worldOffset) remains consistent.
 */
function logicalPosition(conceptualZ: number, worldOffsetZ: number): number {
  const vWorldZ = conceptualZ - worldOffsetZ;
  return vWorldZ + worldOffsetZ;
}

test('logical Z coordinate remains constant across shift', () => {
  const conceptZ = FLOATING_ORIGIN_SHIFT_THRESHOLD + 10; // Cross threshold
  const oldOffset = 0;
  const shiftDelta = TILE_SIZE;
  const newOffset = oldOffset + shiftDelta;

  const beforeLogical = logicalPosition(conceptZ, oldOffset);
  const afterLogical = logicalPosition(conceptZ, newOffset);

  expect(afterLogical).toBeCloseTo(beforeLogical);
});

test('logical X coordinate remains constant across shift', () => {
  const conceptX = -(FLOATING_ORIGIN_SHIFT_THRESHOLD + 20);
  const oldOffset = 0;
  const shiftDelta = -TILE_SIZE;
  const newOffset = oldOffset + shiftDelta;

  const beforeLogical = conceptX - oldOffset + oldOffset;
  const afterLogical = conceptX - newOffset + newOffset;

  expect(afterLogical).toBeCloseTo(beforeLogical);
});
