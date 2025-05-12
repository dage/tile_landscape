import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { computeShiftDelta } from './originShift';
import { TILE_SIZE } from '@/core/constants';

const threshold = TILE_SIZE * 1.5;

test('no shift when below threshold', () => {
  const camPos = new Vector3(threshold - 1, 0, 0);
  const originOffset = new Vector3(0, 0, 0);
  const shift = computeShiftDelta(camPos, originOffset, threshold, TILE_SIZE);
  expect(shift.x).toBe(0);
  expect(shift.y).toBe(0);
  expect(shift.z).toBe(0);
});

test('shift in positive x when above threshold', () => {
  const camPos = new Vector3(threshold + 10, 0, 0);
  const originOffset = new Vector3(0, 0, 0);
  const shift = computeShiftDelta(camPos, originOffset, threshold, TILE_SIZE);
  expect(shift.x).toBe(TILE_SIZE);
  expect(shift.y).toBe(0);
  expect(shift.z).toBe(0);
});

test('shift in negative x when below negative threshold', () => {
  const camPos = new Vector3(-threshold - 20, 0, 0);
  const originOffset = new Vector3(0, 0, 0);
  const shift = computeShiftDelta(camPos, originOffset, threshold, TILE_SIZE);
  expect(shift.x).toBe(-TILE_SIZE);
  expect(shift.y).toBe(0);
  expect(shift.z).toBe(0);
});

test('shift in positive z when above threshold', () => {
  const camPos = new Vector3(0, 0, threshold + 5);
  const originOffset = new Vector3(0, 0, 0);
  const shift = computeShiftDelta(camPos, originOffset, threshold, TILE_SIZE);
  expect(shift.x).toBe(0);
  expect(shift.y).toBe(0);
  expect(shift.z).toBe(TILE_SIZE);
});

test('shift in both axes when both exceed threshold', () => {
  const camPos = new Vector3(threshold + 2, 0, -threshold - 3);
  const originOffset = new Vector3(0, 0, 0);
  const shift = computeShiftDelta(camPos, originOffset, threshold, TILE_SIZE);
  expect(shift.x).toBe(TILE_SIZE);
  expect(shift.z).toBe(-TILE_SIZE);
});

// Test that existing origin offset is considered
test('consider existing origin offset', () => {
  const camPos = new Vector3(threshold + 10, 0, 0);
  const originOffset = new Vector3(TILE_SIZE, 0, 0);
  // Now cameraScenePos.x = camPos.x - originOffset.x = threshold+10 - TILE_SIZE
  // threshold+10 - 100 = (1.5*100+10)-100 = 60, which is below threshold, so no shift
  const shift = computeShiftDelta(camPos, originOffset, threshold, TILE_SIZE);
  expect(shift.x).toBe(0);
  expect(shift.z).toBe(0);
});
