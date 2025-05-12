import * as THREE from 'three';
import { CAMERA_SPEED, CAMERA_INITIAL_HEIGHT } from '@/core/constants';

export interface CameraControls {
  speed: number;
  rotationX: number;
  rotationY: number;
  height: number;
}

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private isMouseDown: { left: boolean; right: boolean } = {
    left: false,
    right: false,
  };
  private isKeyDown: { [key: string]: boolean } = {};
  private mousePosition: { x: number; y: number } = { x: 0, y: 0 };
  private controls: CameraControls = {
    speed: CAMERA_SPEED,
    rotationX: 0,
    rotationY: 0,
    height: CAMERA_INITIAL_HEIGHT,
  };

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
  }

  private onMouseMove(event: MouseEvent): void {
    const newX = event.clientX;
    const newY = event.clientY;
    if (
      this.isMouseDown.left &&
      (this.mousePosition.x !== 0 || this.mousePosition.y !== 0)
    ) {
      const deltaX = newX - this.mousePosition.x;
      const deltaY = newY - this.mousePosition.y;
      this.controls.rotationY -= deltaX * 0.002;
      this.controls.rotationX -= deltaY * 0.002;
      this.controls.rotationX = Math.max(
        -Math.PI / 3,
        Math.min(Math.PI / 3, this.controls.rotationX)
      );
    }
    this.mousePosition.x = newX;
    this.mousePosition.y = newY;
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button === 0) {
      this.isMouseDown.left = true;
      this.mousePosition.x = event.clientX;
      this.mousePosition.y = event.clientY;
    } else if (event.button === 2) this.isMouseDown.right = true;
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 0) this.isMouseDown.left = false;
    else if (event.button === 2) this.isMouseDown.right = false;
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.isKeyDown[event.key.toLowerCase()] = true;
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.isKeyDown[event.key.toLowerCase()] = false;
  }

  public update(deltaTime: number): CameraControls {
    // Speed changes via keyboard only (mouse acceleration removed)
    // WASD rotation
    if (this.isKeyDown['w']) this.controls.rotationX -= 0.03;
    if (this.isKeyDown['s']) this.controls.rotationX += 0.03;
    if (this.isKeyDown['a']) this.controls.rotationY += 0.03;
    if (this.isKeyDown['d']) this.controls.rotationY -= 0.03;
    // Q/Z height
    if (this.isKeyDown['q']) this.controls.height += 10 * deltaTime;
    if (this.isKeyDown['z']) {
      this.controls.height -= 10 * deltaTime;
      this.controls.height = Math.max(1, this.controls.height);
    }
    // E/R acceleration
    if (this.isKeyDown['e']) this.controls.speed += 180 * deltaTime;
    if (this.isKeyDown['r']) this.controls.speed -= 180 * deltaTime;
    // Allow negative speed (reverse)
    // Limit vertical look
    this.controls.rotationX = Math.max(
      -Math.PI / 3,
      Math.min(Math.PI / 3, this.controls.rotationX)
    );
    return { ...this.controls };
  }

  public dispose(): void {
    this.domElement.removeEventListener(
      'mousemove',
      this.onMouseMove.bind(this)
    );
    this.domElement.removeEventListener(
      'mousedown',
      this.onMouseDown.bind(this)
    );
    this.domElement.removeEventListener('mouseup', this.onMouseUp.bind(this));
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
    window.removeEventListener('keyup', this.onKeyUp.bind(this));
  }
}
