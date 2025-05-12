import * as THREE from 'three';
import { computeShiftDelta } from '@/core/rendering/originShift';
import { TileGridManager } from '@/core/rendering/TileGridManager';
import { CameraController } from '@/core/rendering/CameraController';
import type { CameraControls } from '@/core/rendering/CameraController';
import {
  TILE_SIZE,
  CAMERA_SPEED,
  CAMERA_INITIAL_HEIGHT,
  CAMERA_LOOK_AHEAD_DISTANCE,
  FLOATING_ORIGIN_SHIFT_THRESHOLD,
} from '@/core/constants';

export class App {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;

  private tileGridManager: TileGridManager;
  private cameraController: CameraController;

  private conceptualCameraPosition: THREE.Vector3;
  private worldOriginOffset: THREE.Vector3; // How much the world has shifted to keep camera near scene origin
  private sceneLookAtTarget: THREE.Vector3; // For camera.lookAt, in scene coordinates
  private infoBox: HTMLDivElement;
  private controls: CameraControls;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x101020); // Dark background

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.clock = new THREE.Clock();

    this.conceptualCameraPosition = new THREE.Vector3(
      0,
      CAMERA_INITIAL_HEIGHT,
      TILE_SIZE * 1
    ); // Start a bit into the grid
    this.worldOriginOffset = new THREE.Vector3(0, 0, 0);
    this.sceneLookAtTarget = new THREE.Vector3();
    this.controls = {
      speed: CAMERA_SPEED,
      rotationX: 0,
      rotationY: 0,
      height: CAMERA_INITIAL_HEIGHT,
    };

    this.setupCamera();
    this.setupLighting();

    this.tileGridManager = new TileGridManager(this.scene);
    this.cameraController = new CameraController(this.camera, canvas);

    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Info box for debugging camera and world state
    this.infoBox = document.createElement('div');
    Object.assign(this.infoBox.style, {
      position: 'absolute',
      top: '10px',
      right: '10px',
      color: '#fff',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      fontSize: '12px',
      fontFamily: 'monospace',
      padding: '5px',
      zIndex: '100',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    });
    document.body.appendChild(this.infoBox);
  }

  private setupCamera(): void {
    // Initial camera scene position based on conceptual position and origin offset
    this.camera.position.subVectors(
      this.conceptualCameraPosition,
      this.worldOriginOffset
    );

    // Initial lookAt
    const conceptualLookAt = new THREE.Vector3(
      this.conceptualCameraPosition.x,
      0, // Look towards horizon
      this.conceptualCameraPosition.z + CAMERA_LOOK_AHEAD_DISTANCE // Look forward
    );
    this.sceneLookAtTarget.subVectors(conceptualLookAt, this.worldOriginOffset);
    this.camera.lookAt(this.sceneLookAtTarget);
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 20); // Adjust as needed
    directionalLight.castShadow = false; // Shadows can be added later
    this.scene.add(directionalLight);
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public start(): void {
    this.renderer.setAnimationLoop(this.animate.bind(this));
  }

  private animate(): void {
    // Original animation logic
    const deltaTime = this.clock.getDelta();

    // Update camera controls
    this.controls = this.cameraController.update(deltaTime);

    // 1. Update conceptual camera position based on controls
    // Move in camera's local -Z (forward) direction
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyEuler(new THREE.Euler(0, this.controls.rotationY, 0, 'YXZ'));
    direction.multiplyScalar(this.controls.speed * deltaTime);
    this.conceptualCameraPosition.add(direction);
    this.conceptualCameraPosition.y = this.controls.height;

    // 2. Floating Origin Check & Shift
    const shiftDelta = computeShiftDelta(
      this.conceptualCameraPosition,
      this.worldOriginOffset,
      FLOATING_ORIGIN_SHIFT_THRESHOLD,
      TILE_SIZE
    );
    if (shiftDelta.lengthSq() > 0) {
      this.worldOriginOffset.add(shiftDelta);
    }

    // 3. Update camera's actual scene position
    this.camera.position.subVectors(
      this.conceptualCameraPosition,
      this.worldOriginOffset
    );

    // 4. Update camera's rotation
    this.camera.rotation.set(
      this.controls.rotationX,
      this.controls.rotationY,
      0,
      'YXZ'
    );

    // 5. Update tile grid (recycles tiles, updates their scene positions)
    this.tileGridManager.update(
      this.conceptualCameraPosition,
      this.worldOriginOffset
    );

    // Update debug info box
    {
      const cx = this.conceptualCameraPosition.x;
      const cz = this.conceptualCameraPosition.z;
      const ox = this.worldOriginOffset.x;
      const oz = this.worldOriginOffset.z;
      const camGridX = Math.round(cx / TILE_SIZE);
      const camGridZ = Math.round(cz / TILE_SIZE);
      const fracX = ((cx % TILE_SIZE) + TILE_SIZE) % TILE_SIZE;
      const fracZ = ((cz % TILE_SIZE) + TILE_SIZE) % TILE_SIZE;
      this.infoBox.innerText =
        `Controls: Speed=${this.controls.speed.toFixed(1)}, Height=${this.controls.height.toFixed(1)}\n` +
        `Rotation: X=${((this.controls.rotationX * 180) / Math.PI).toFixed(0)}°, Y=${((this.controls.rotationY * 180) / Math.PI).toFixed(0)}°\n` +
        `Direction: (${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)})\n` +
        `Movement: Δx=${direction.x.toFixed(2)}, Δy=${direction.y.toFixed(2)}, Δz=${direction.z.toFixed(2)}\n` +
        `Conceptual Cam Pos: x=${cx.toFixed(2)}, z=${cz.toFixed(2)}\n` +
        `World Origin Offset: x=${ox.toFixed(2)}, z=${oz.toFixed(2)}\n` +
        `Grid Coords: (${camGridX}, ${camGridZ})\n` +
        `Frac In Tile: x=${fracX.toFixed(2)}, z=${fracZ.toFixed(2)}\n` +
        `Shift Threshold: ${FLOATING_ORIGIN_SHIFT_THRESHOLD}`;
    }
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer.setAnimationLoop(null);
    this.tileGridManager.dispose();
    this.cameraController.dispose();
    this.renderer.dispose();
    // Remove debug info box
    document.body.removeChild(this.infoBox);
    // Consider disposing scene geometries/materials if not handled by managers
  }
}
