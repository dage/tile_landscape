// src/example.test.ts
import { describe, it, expect } from 'vitest';

// Example test suite
describe('simple math test', () => {
  it('should add two numbers correctly', () => {
    expect(1 + 1).toBe(2);
  });

  it('should subtract two numbers correctly', () => {
    expect(5 - 3).toBe(2);
  });
});

// Example of a test that might use an aliased import (if we had a module in src/utils for example)
// import { someUtilityFunction } from '@/utils/someModule';
// describe('utility function test', () => {
//   it('should work as expected', () => {
//     expect(someUtilityFunction()).toBe(true); // or whatever it does
//   });
// });
