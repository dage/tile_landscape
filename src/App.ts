import * as THREE from 'three';
import { TileGridManager } from '@/core/rendering/TileGridManager';
import {
  TILE_SIZE,
  CAMERA_SPEED,
  CAMERA_INITIAL_HEIGHT,
  CAMERA_LOOK_AHEAD_DISTANCE,
  FLOATING_ORIGIN_SHIFT_THRESHOLD,
} from '@/core/constants';
import { computeShiftDelta } from '@/core/rendering/originShift';

export class App {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;

  private tileGridManager: TileGridManager;

  private conceptualCameraPosition: THREE.Vector3;
  private worldOriginOffset: THREE.Vector3; // How much the world has shifted to keep camera near scene origin
  private sceneLookAtTarget: THREE.Vector3; // For camera.lookAt, in scene coordinates
  private infoBox: HTMLDivElement;

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

    this.setupCamera();
    this.setupLighting();

    this.tileGridManager = new TileGridManager(this.scene);

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
    // --- Start: Hello World modification ---
    // const canvas = this.renderer.domElement;
    // const context = canvas.getContext('2d');
    //
    // if (context) {
    //   // Clear canvas (Three.js renderer usually does this, but we are bypassing it)
    //   context.fillStyle = 'white';
    //   context.fillRect(0, 0, canvas.width, canvas.height);
    //
    //   // Style text
    //   context.font = 'bold 72px Arial';
    //   context.fillStyle = 'black';
    //   context.textAlign = 'center';
    //   context.textBaseline = 'middle';
    //
    //   // Draw text
    //   context.fillText('Hello world', canvas.width / 2, canvas.height / 2);
    // } else {
    //   // Fallback or error if 2D context isn't available (shouldn't happen with WebGLRenderer's canvas)
    //   // For this test, we'll just let Three.js render an empty scene if context is null.
    //   this.renderer.render(this.scene, this.camera);
    // }
    // --- End: Hello World modification ---

    // Original animation logic
    const deltaTime = this.clock.getDelta();

    // 1. Update conceptual camera position (auto-forward)
    this.conceptualCameraPosition.z += CAMERA_SPEED * deltaTime; // Moving along positive Z

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

    // 4. Update camera's lookAt target
    const conceptualLookAt = new THREE.Vector3(
      this.conceptualCameraPosition.x, // Follow camera's X
      0, // Look towards the horizon (or a bit below camera height)
      this.conceptualCameraPosition.z + CAMERA_LOOK_AHEAD_DISTANCE // Look ahead along Z
    );
    this.sceneLookAtTarget.subVectors(conceptualLookAt, this.worldOriginOffset);
    this.camera.lookAt(this.sceneLookAtTarget);

    // 5. Update tile grid (recycles tiles, updates their scene positions)
    this.tileGridManager.update(
      this.conceptualCameraPosition,
      this.worldOriginOffset
    );

    // 6. Render
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
    this.renderer.dispose();
    // Remove debug info box
    document.body.removeChild(this.infoBox);
    // Consider disposing scene geometries/materials if not handled by managers
  }
}
