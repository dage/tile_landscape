import { expect, test, describe, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CameraController } from './CameraController';

class MockHTMLElement {
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  preventDefault = vi.fn();
  clientX = 0;
  clientY = 0;
  button = 0;
}

// Create a mock window object for keyboard events
const originalWindow = global.window;
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

// Create a test suite for CameraController
describe('CameraController', () => {
  let camera: THREE.PerspectiveCamera;
  let domElement: any;
  let controller: CameraController;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup test objects
    camera = new THREE.PerspectiveCamera();
    domElement = new MockHTMLElement();

    // Mock window event listener
    global.window = {
      ...originalWindow,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
    } as any;

    // Create controller
    controller = new CameraController(
      camera,
      domElement as unknown as HTMLElement
    );
  });

  test('event listeners are set up correctly', () => {
    expect(domElement.addEventListener).toHaveBeenCalledTimes(4); // mousemove, mousedown, mouseup, contextmenu
    expect(mockAddEventListener).toHaveBeenCalledTimes(2); // keydown, keyup
  });

  test('update returns controls with the initialized speed', () => {
    const controls = controller.update(1.0);
    expect(controls.speed).toBeGreaterThan(0);
  });

  test('height increases when Q key is pressed', () => {
    // Simulate Q key being pressed
    const keydownEvent = { key: 'q' };
    const keydownCallData = mockAddEventListener.mock.calls.find(
      (call) => call[0] === 'keydown'
    );
    const keydownHandler = keydownCallData ? keydownCallData[1] : null;
    expect(keydownHandler).not.toBeNull();
    if (!keydownHandler) return;
    keydownHandler(keydownEvent);

    // Update with a deltaTime of 1.0
    const initialControls = controller.update(0); // Get initial state
    const updatedControls = controller.update(1.0);

    // Height should increase
    expect(updatedControls.height).toBeGreaterThan(initialControls.height);
  });

  test('height decreases when Z key is pressed', () => {
    // Simulate Z key being pressed
    const keydownEvent = { key: 'z' };
    const keydownCallData = mockAddEventListener.mock.calls.find(
      (call) => call[0] === 'keydown'
    );
    const keydownHandler = keydownCallData ? keydownCallData[1] : null;
    expect(keydownHandler).not.toBeNull();
    if (!keydownHandler) return;
    keydownHandler(keydownEvent);

    // Update with a deltaTime of 1.0
    const initialControls = controller.update(0); // Get initial state
    const initialHeight = initialControls.height;
    const updatedControls = controller.update(1.0);

    // Height should decrease
    expect(updatedControls.height).toBeLessThan(initialHeight);
  });

  test('speed increases when E key is pressed', () => {
    // Simulate E key being pressed
    const keydownEvent = { key: 'e' };
    const keydownCallData = mockAddEventListener.mock.calls.find(
      (call) => call[0] === 'keydown'
    );
    const keydownHandler = keydownCallData ? keydownCallData[1] : null;
    expect(keydownHandler).not.toBeNull();
    if (!keydownHandler) return;
    keydownHandler(keydownEvent);

    // Update with a deltaTime of 1.0
    const initialControls = controller.update(0); // Get initial state
    const updatedControls = controller.update(1.0);

    // Speed should increase
    expect(updatedControls.speed).toBeGreaterThan(initialControls.speed);
  });

  test('speed decreases when R key is pressed', () => {
    // Simulate R key being pressed
    const keydownEvent = { key: 'r' };
    const keydownCallData = mockAddEventListener.mock.calls.find(
      (call) => call[0] === 'keydown'
    );
    const keydownHandler = keydownCallData ? keydownCallData[1] : null;
    expect(keydownHandler).not.toBeNull();
    if (!keydownHandler) return;
    keydownHandler(keydownEvent);

    // Update with a deltaTime of 1.0
    const initialControls = controller.update(0); // Get initial state
    const updatedControls = controller.update(1.0);

    // Speed should decrease
    expect(updatedControls.speed).toBeLessThan(initialControls.speed);
  });

  test('speed can go negative to allow reverse movement', () => {
    // Simulate R key (decelerate)
    const keydownEvent = { key: 'r' };
    const keydownCallData = mockAddEventListener.mock.calls.find(
      (call) => call[0] === 'keydown'
    );
    const keydownHandler = keydownCallData ? keydownCallData[1] : null;
    expect(keydownHandler).not.toBeNull();
    if (!keydownHandler) return;
    keydownHandler(keydownEvent);
    // Large deltaTime to force negative speed
    controller.update(100.0);
    const controls = controller.update(0);
    expect(controls.speed).toBeLessThan(0);
  });

  test('dispose removes event listeners', () => {
    controller.dispose();
    expect(domElement.removeEventListener).toHaveBeenCalledTimes(3); // mousemove, mousedown, mouseup
    expect(mockRemoveEventListener).toHaveBeenCalledTimes(2); // keydown, keyup
  });

  // Mouse drag rotation tests
  test('mouse move without drag does not rotate camera', () => {
    const mousemoveHandler = domElement.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'mousemove'
    )![1] as (e: MouseEvent) => void;
    mousemoveHandler({ clientX: 200, clientY: 200 } as MouseEvent);
    const controls = controller.update(0);
    expect(controls.rotationX).toBe(0);
    expect(controls.rotationY).toBe(0);
  });

  test('mouse drag rotates camera only when left button held', () => {
    const mousedownHandler = domElement.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'mousedown'
    )![1] as (e: MouseEvent) => void;
    const mousemoveHandler = domElement.addEventListener.mock.calls.find(
      (call: any) => call[0] === 'mousemove'
    )![1] as (e: MouseEvent) => void;
    // Simulate left button down at (100,100)
    mousedownHandler({ button: 0, clientX: 100, clientY: 100 } as MouseEvent);
    // Simulate drag to (110, 105)
    mousemoveHandler({ clientX: 110, clientY: 105 } as MouseEvent);
    const controls = controller.update(0);
    expect(controls.rotationY).toBeCloseTo(-0.02, 3);
    expect(controls.rotationX).toBeCloseTo(-0.01, 3);
  });
});

describe('CameraController integration', () => {
  let camera: THREE.PerspectiveCamera;
  let domElement: any;
  let controller: CameraController;
  let conceptualCameraPosition: THREE.Vector3;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera();
    domElement = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    controller = new CameraController(
      camera,
      domElement as unknown as HTMLElement
    );
    conceptualCameraPosition = new THREE.Vector3(0, 0, 0);
  });

  test('camera moves forward in +Z when speed is positive', () => {
    // Simulate a frame
    const deltaTime = 1.0;
    const controls = controller.update(0); // default speed
    const direction = new THREE.Vector3(0, 0, 1);
    const rotationMatrix = new THREE.Matrix4().makeRotationY(
      controls.rotationY
    );
    direction.applyMatrix4(rotationMatrix);
    direction.multiplyScalar(controls.speed * deltaTime);
    conceptualCameraPosition.add(direction);
    // Should move in +Z
    expect(conceptualCameraPosition.z).toBeGreaterThan(0);
  });

  test('camera does not move if speed is zero', () => {
    // Set speed to zero
    controller['controls'].speed = 0;
    const deltaTime = 1.0;
    const controls = controller.update(0);
    const direction = new THREE.Vector3(0, 0, 1);
    const rotationMatrix = new THREE.Matrix4().makeRotationY(
      controls.rotationY
    );
    direction.applyMatrix4(rotationMatrix);
    direction.multiplyScalar(controls.speed * deltaTime);
    conceptualCameraPosition.add(direction);
    expect(conceptualCameraPosition.z).toBe(0);
  });

  test('camera moves further when speed is increased', () => {
    // Simulate E key (accelerate)
    controller['isKeyDown']['e'] = true;
    controller.update(1.0); // increase speed
    controller['isKeyDown']['e'] = false;
    const controls = controller.update(0);
    const direction = new THREE.Vector3(0, 0, 1);
    const rotationMatrix = new THREE.Matrix4().makeRotationY(
      controls.rotationY
    );
    direction.applyMatrix4(rotationMatrix);
    direction.multiplyScalar(controls.speed * 1.0);
    conceptualCameraPosition.add(direction);
    expect(conceptualCameraPosition.z).toBeGreaterThan(0);
    expect(controls.speed).toBeGreaterThan(0);
  });

  test('camera moves less when speed is decreased', () => {
    // Simulate R key (decelerate)
    controller['isKeyDown']['r'] = true;
    controller.update(1.0); // decrease speed into negative
    controller['isKeyDown']['r'] = false;
    const controls = controller.update(0);
    // Speed should now be negative
    expect(controls.speed).toBeLessThan(0);
    // Movement direction should be backwards in world +Z
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyEuler(new THREE.Euler(0, controls.rotationY, 0, 'YXZ'));
    direction.multiplyScalar(controls.speed * 1.0);
    conceptualCameraPosition.add(direction);
    expect(conceptualCameraPosition.z).toBeGreaterThan(0);
  });
});
