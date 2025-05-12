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
import { NoopExperiment } from './core/rendering/experiments/RenderingExperiment';
import type { RenderingExperiment } from './core/rendering/experiments/RenderingExperiment';
import { BumpMappingExperiment } from './core/rendering/experiments/BumpMappingExperiment';
import { CustomShaderExperiment } from './core/rendering/experiments/CustomShaderExperiment';

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
  private renderingPanel: HTMLDivElement;
  private lights: {
    ambient: THREE.AmbientLight;
    directional: THREE.DirectionalLight;
    hemispheric?: THREE.HemisphereLight;
    point?: THREE.PointLight;
  } = {
    ambient: null as unknown as THREE.AmbientLight,
    directional: null as unknown as THREE.DirectionalLight,
  };
  private currentExperiment: RenderingExperiment = new NoopExperiment();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x101020); // Dark background

    this.scene = new THREE.Scene();
    // Add neutral fog (same as background)
    this.scene.fog = new THREE.Fog(0x101020, 200, 400);

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

    // Rendering debug panel
    this.renderingPanel = document.createElement('div');
    Object.assign(this.renderingPanel.style, {
      position: 'absolute',
      top: '10px',
      left: '10px',
      color: '#fff',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      fontSize: '12px',
      fontFamily: 'monospace',
      padding: '10px',
      zIndex: '100',
      borderRadius: '5px',
    });
    document.body.appendChild(this.renderingPanel);

    this.createFogControls();
    this.createRenderingExperimentControls();
    this.createWireframeToggle();
    this.createTileBoundariesToggle();
  }

  private createFogControls(): void {
    const fogSection = document.createElement('div');
    fogSection.style.marginBottom = '15px';

    const fogTitle = document.createElement('h3');
    fogTitle.innerText = 'Fog Settings';
    fogTitle.style.margin = '0 0 10px 0';
    fogTitle.style.fontSize = '14px';
    fogSection.appendChild(fogTitle);

    // Helper function to create sliders
    const createSlider = (
      label: string,
      min: number,
      max: number,
      value: number,
      step: number,
      onChange: (value: number) => void
    ) => {
      const group = document.createElement('div');
      group.style.marginBottom = '8px';

      const labelElem = document.createElement('label');
      labelElem.innerText = label;
      labelElem.style.display = 'block';
      labelElem.style.marginBottom = '2px';

      const valueDisplay = document.createElement('span');
      valueDisplay.innerText = value.toFixed(0);
      valueDisplay.style.marginLeft = '10px';
      valueDisplay.style.minWidth = '30px';
      valueDisplay.style.display = 'inline-block';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = min.toString();
      slider.max = max.toString();
      slider.step = step.toString();
      slider.value = value.toString();
      slider.style.width = '120px';
      slider.style.verticalAlign = 'middle';

      slider.addEventListener('input', (event) => {
        const newValue = parseFloat((event.target as HTMLInputElement).value);
        valueDisplay.innerText = newValue.toFixed(0);
        onChange(newValue);
      });

      group.appendChild(labelElem);
      group.appendChild(slider);
      group.appendChild(valueDisplay);

      return group;
    };

    // Get initial fog values
    const fog = this.scene.fog as THREE.Fog;
    const fogNear = fog.near;
    const fogFar = fog.far;

    // Create fog near slider
    const nearSlider = createSlider(
      'Fog Near Distance:',
      0,
      1000,
      fogNear,
      10,
      (value) => {
        if (value < fog.far) {
          fog.near = value;
        }
      }
    );
    fogSection.appendChild(nearSlider);

    // Create fog far slider
    const farSlider = createSlider(
      'Fog Far Distance:',
      0,
      2000,
      fogFar,
      10,
      (value) => {
        if (value > fog.near) {
          fog.far = value;
        }
      }
    );
    fogSection.appendChild(farSlider);

    // Add toggle checkbox for fog
    const fogToggle = document.createElement('div');
    fogToggle.style.marginTop = '10px';

    const toggleCheckbox = document.createElement('input');
    toggleCheckbox.type = 'checkbox';
    toggleCheckbox.checked = true;
    toggleCheckbox.id = 'fogToggle';

    const toggleLabel = document.createElement('label');
    toggleLabel.innerText = 'Enable Fog';
    toggleLabel.htmlFor = 'fogToggle';
    toggleLabel.style.marginLeft = '5px';

    toggleCheckbox.addEventListener('change', (event) => {
      const enabled = (event.target as HTMLInputElement).checked;
      if (enabled) {
        this.scene.fog = fog;
      } else {
        this.scene.fog = null;
      }
    });

    fogToggle.appendChild(toggleCheckbox);
    fogToggle.appendChild(toggleLabel);
    fogSection.appendChild(fogToggle);

    this.renderingPanel.appendChild(fogSection);

    // Create lighting controls
    this.createLightingControls();
  }

  private createLightingControls(): void {
    const lightingSection = document.createElement('div');
    lightingSection.style.marginBottom = '15px';

    const lightingTitle = document.createElement('h3');
    lightingTitle.innerText = 'Lighting Settings';
    lightingTitle.style.margin = '0 0 10px 0';
    lightingTitle.style.fontSize = '14px';
    lightingSection.appendChild(lightingTitle);

    // Helper function to create sliders
    const createSlider = (
      label: string,
      min: number,
      max: number,
      value: number,
      step: number,
      onChange: (value: number) => void
    ) => {
      const group = document.createElement('div');
      group.style.marginBottom = '8px';

      const labelElem = document.createElement('label');
      labelElem.innerText = label;
      labelElem.style.display = 'block';
      labelElem.style.marginBottom = '2px';

      const valueDisplay = document.createElement('span');
      valueDisplay.innerText = value.toFixed(2);
      valueDisplay.style.marginLeft = '10px';
      valueDisplay.style.minWidth = '35px';
      valueDisplay.style.display = 'inline-block';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = min.toString();
      slider.max = max.toString();
      slider.step = step.toString();
      slider.value = value.toString();
      slider.style.width = '120px';
      slider.style.verticalAlign = 'middle';

      slider.addEventListener('input', (event) => {
        const newValue = parseFloat((event.target as HTMLInputElement).value);
        valueDisplay.innerText = newValue.toFixed(2);
        onChange(newValue);
      });

      group.appendChild(labelElem);
      group.appendChild(slider);
      group.appendChild(valueDisplay);

      return group;
    };

    // Ambient light intensity slider
    const ambientSlider = createSlider(
      'Ambient Light:',
      0,
      1,
      this.lights.ambient.intensity,
      0.01,
      (value) => {
        this.lights.ambient.intensity = value;
      }
    );
    lightingSection.appendChild(ambientSlider);

    // Directional light intensity slider
    const directionalSlider = createSlider(
      'Directional Light:',
      0,
      1,
      this.lights.directional.intensity,
      0.01,
      (value) => {
        this.lights.directional.intensity = value;
      }
    );
    lightingSection.appendChild(directionalSlider);

    this.renderingPanel.appendChild(lightingSection);
  }

  private createRenderingExperimentControls(): void {
    const experimentSection = document.createElement('div');
    experimentSection.style.marginBottom = '15px';

    const experimentTitle = document.createElement('h3');
    experimentTitle.innerText = 'Rendering Experiments';
    experimentTitle.style.margin = '0 0 10px 0';
    experimentTitle.style.fontSize = '14px';
    experimentSection.appendChild(experimentTitle);

    // Dropdown for experiment selection
    const selectGroup = document.createElement('div');
    const selectLabel = document.createElement('label');
    selectLabel.innerText = 'Select Experiment:';
    selectLabel.style.display = 'block';
    selectLabel.style.marginBottom = '5px';

    const experimentSelect = document.createElement('select');
    experimentSelect.style.width = '100%';
    experimentSelect.style.padding = '3px';
    experimentSelect.style.backgroundColor = '#333';
    experimentSelect.style.color = '#fff';
    experimentSelect.style.border = '1px solid #555';

    // Add experiment options
    const experiments = [
      { name: 'None', value: 'none' },
      { name: 'Bump Mapping', value: 'bumpMapping' },
      { name: 'Custom Shader', value: 'customShader' },
      // Add more experiments as they're implemented
    ];

    experiments.forEach((exp) => {
      const option = document.createElement('option');
      option.value = exp.value;
      option.innerText = exp.name;
      experimentSelect.appendChild(option);
    });

    // Handle experiment change
    experimentSelect.addEventListener('change', (event) => {
      const value = (event.target as HTMLSelectElement).value;

      // Dispose of the current experiment if it exists
      if (this.currentExperiment) {
        this.currentExperiment.dispose();
      }

      // Create the new experiment based on selection
      switch (value) {
        case 'bumpMapping':
          this.currentExperiment = new BumpMappingExperiment(
            this.scene,
            this.tileGridManager
          );
          break;
        case 'customShader':
          this.currentExperiment = new CustomShaderExperiment(
            this.scene,
            this.tileGridManager
          );
          break;
        case 'none':
        default:
          this.currentExperiment = new NoopExperiment();
          break;
      }

      // Initialize the new experiment
      const initResult = this.currentExperiment.initialize();
      // Handle async initialization if returned a Promise
      if (initResult instanceof Promise) {
        initResult.catch((error) => {
          console.error('Failed to initialize rendering experiment:', error);
        });
      }
    });

    selectGroup.appendChild(selectLabel);
    selectGroup.appendChild(experimentSelect);
    experimentSection.appendChild(selectGroup);

    // Add experiment-specific parameters div that can be populated by the active experiment
    const experimentParams = document.createElement('div');
    experimentParams.id = 'experimentParams';
    experimentParams.style.marginTop = '10px';
    experimentSection.appendChild(experimentParams);

    this.renderingPanel.appendChild(experimentSection);
  }

  private createWireframeToggle(): void {
    const wireframeSection = document.createElement('div');
    wireframeSection.style.marginBottom = '15px';

    const wireframeTitle = document.createElement('h3');
    wireframeTitle.innerText = 'Wireframe Mode';
    wireframeTitle.style.margin = '0 0 10px 0';
    wireframeTitle.style.fontSize = '14px';
    wireframeSection.appendChild(wireframeTitle);

    const wireframeToggle = document.createElement('div');

    const toggleCheckbox = document.createElement('input');
    toggleCheckbox.type = 'checkbox';
    toggleCheckbox.id = 'wireframeToggle';

    const toggleLabel = document.createElement('label');
    toggleLabel.innerText = 'Enable Wireframe';
    toggleLabel.htmlFor = 'wireframeToggle';
    toggleLabel.style.marginLeft = '5px';

    toggleCheckbox.addEventListener('change', (event) => {
      const enabled = (event.target as HTMLInputElement).checked;
      this.tileGridManager.setWireframeMode(enabled);
    });

    wireframeToggle.appendChild(toggleCheckbox);
    wireframeToggle.appendChild(toggleLabel);
    wireframeSection.appendChild(wireframeToggle);

    this.renderingPanel.appendChild(wireframeSection);
  }

  private createTileBoundariesToggle(): void {
    const debugSection = document.createElement('div');
    debugSection.style.marginBottom = '15px';

    const debugTitle = document.createElement('h3');
    debugTitle.innerText = 'Debug Settings';
    debugTitle.style.margin = '0 0 10px 0';
    debugTitle.style.fontSize = '14px';
    debugSection.appendChild(debugTitle);

    // Create the toggle for tile boundaries
    const boundariesToggle = document.createElement('div');

    const toggleCheckbox = document.createElement('input');
    toggleCheckbox.type = 'checkbox';
    toggleCheckbox.id = 'tileBoundariesToggle';

    const toggleLabel = document.createElement('label');
    toggleLabel.innerText = 'Show Tile Boundaries';
    toggleLabel.htmlFor = 'tileBoundariesToggle';
    toggleLabel.style.marginLeft = '5px';

    toggleCheckbox.addEventListener('change', (event) => {
      const enabled = (event.target as HTMLInputElement).checked;
      this.tileGridManager.setTileBoundariesVisible(enabled);
    });

    boundariesToggle.appendChild(toggleCheckbox);
    boundariesToggle.appendChild(toggleLabel);
    debugSection.appendChild(boundariesToggle);

    this.renderingPanel.appendChild(debugSection);
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
    // Simple white ambient and directional light
    this.lights.ambient = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(this.lights.ambient);

    this.lights.directional = new THREE.DirectionalLight(0xffffff, 0.9);
    this.lights.directional.position.set(50, 100, 20);
    this.lights.directional.castShadow = false;
    this.scene.add(this.lights.directional);
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
      this.worldOriginOffset,
      this.camera.position
    );

    // Update point light position if it exists
    if (this.lights.point) {
      this.lights.point.position.copy(this.camera.position);
      this.lights.point.position.y += 50;
      this.lights.point.position.z -= 50;
    }

    // Update the current rendering experiment if active
    if (this.currentExperiment) {
      this.currentExperiment.update(deltaTime);

      // If we're using the custom shader experiment, update the camera position
      if (this.currentExperiment instanceof CustomShaderExperiment) {
        // Access the shader material directly through the experiment
        const experiment = this.currentExperiment as CustomShaderExperiment;
        if (
          experiment.customShaderMaterial &&
          experiment.customShaderMaterial.uniforms.cameraPosition
        ) {
          experiment.customShaderMaterial.uniforms.cameraPosition.value.copy(
            this.camera.position
          );
        }

        // Also update the world offset uniform
        if (
          experiment.customShaderMaterial &&
          experiment.customShaderMaterial.uniforms.uWorldOffset
        ) {
          experiment.customShaderMaterial.uniforms.uWorldOffset.value.copy(
            this.worldOriginOffset
          );
        }
      }
    }

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
    // Remove rendering panel
    if (this.renderingPanel && this.renderingPanel.parentElement) {
      this.renderingPanel.parentElement.removeChild(this.renderingPanel);
    }
    // Dispose of current experiment if any
    if (this.currentExperiment) {
      this.currentExperiment.dispose();
    }
    // Consider disposing scene geometries/materials if not handled by managers
  }
}
