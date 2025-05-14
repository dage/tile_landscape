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
  MINIMUM_CAMERA_OFFSET_ABOVE_TERRAIN,
} from '@/core/constants';
import { NoopExperiment } from './core/rendering/experiments/RenderingExperiment';
import type { RenderingExperiment } from './core/rendering/experiments/RenderingExperiment';
import { BumpMappingExperiment } from './core/rendering/experiments/BumpMappingExperiment';
import { CustomShaderExperiment } from './core/rendering/experiments/CustomShaderExperiment';
import { getHeight } from '@/core/terrain/terrainApi';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'; // Removed
import { generateHeightmap } from './core/terrain/heightmapGenerator';
// import { Water } from './core/water/Water'; // Removed
// import { setupGUI } from './core/gui/gui'; // Removed
import {
  BackSide,
  BoxGeometry,
  Mesh,
  ShaderMaterial,
  TextureLoader,
  Points,
  PointsMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Vector3,
  SphereGeometry,
} from 'three';

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
  private lastUserControlsHeight: number;
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
  private starField: THREE.Points;
  private groundLightParticles: {
    particles: Mesh[];
    velocities: number[];
    maxHeights: number[];
    basePositions: Vector3[];
    normals: Vector3[];
    activeCount: number;
    spawnTimer: number;
    initialSizes: number[];
    fadeDurations: number[];
    lifeTimes: number[];
    ages: number[];
  } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Define a single uniform color for sky, fog, and clear color
    const uniformSkyAndFogColor = new THREE.Color(0x040410);

    this.renderer.setClearColor(uniformSkyAndFogColor.clone());

    // Initialize camera first as fog depends on its .far property
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    );

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(
      uniformSkyAndFogColor.clone(), // Use the uniform color for fog
      200, // Near distance for fog start (no change, already 200)
      400 // Far distance for full fog (changed from 500)
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
    this.lastUserControlsHeight = CAMERA_INITIAL_HEIGHT;

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
    this.createLightingControls();
    this.createRenderingExperimentControls();
    this.createWireframeToggle();

    this.scene.add(this.camera);

    // Simple uniform sky color using MeshBasicMaterial
    const skyGeo = new BoxGeometry(1, 1, 1);
    const skyMat = new MeshBasicMaterial({
      color: uniformSkyAndFogColor.clone(),
      side: BackSide,
      fog: false,
      depthWrite: false,
    });
    const skyMesh = new Mesh(skyGeo, skyMat);
    skyMesh.scale.set(5000, 5000, 5000);
    this.scene.add(skyMesh);

    // Sprinkle 1 k random stars
    const starGeo = new BufferGeometry();
    const starVertices = [];
    const STAR_RADIUS = 4900; // Place stars on a large sphere

    for (let i = 0; i < 3000; i++) {
      // Generate points on a sphere
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1); // Ensures uniform spherical distribution

      const x = STAR_RADIUS * Math.sin(phi) * Math.cos(theta);
      const y = STAR_RADIUS * Math.sin(phi) * Math.sin(theta);
      const z = STAR_RADIUS * Math.cos(phi);
      starVertices.push(x, y, z);
    }
    starGeo.setAttribute(
      'position',
      new Float32BufferAttribute(starVertices, 3)
    );
    this.starField = new Points(
      starGeo,
      new PointsMaterial({ size: 1, color: 0xffffff, fog: false })
    );
    this.scene.add(this.starField);
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
      displayFormatter: (val: number) => string = (val) => val.toFixed(0),
      onChange: (value: number) => void
    ) => {
      const group = document.createElement('div');
      group.style.marginBottom = '8px';

      const labelElem = document.createElement('label');
      labelElem.innerText = label;
      labelElem.style.display = 'block';
      labelElem.style.marginBottom = '2px';

      const valueDisplay = document.createElement('span');
      valueDisplay.innerText = displayFormatter(value);
      valueDisplay.style.marginLeft = '10px';
      valueDisplay.style.minWidth = '40px'; // Adjusted for potentially larger numbers
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
        valueDisplay.innerText = displayFormatter(newValue);
        onChange(newValue);
      });

      group.appendChild(labelElem);
      group.appendChild(slider);
      group.appendChild(valueDisplay);

      return group;
    };

    // Get initial fog values
    const fog = this.scene.fog as THREE.Fog;
    let fogNear = fog.near; // Use let as it might be updated if far changes
    let fogFar = fog.far;

    // Create fog near slider
    const nearSlider = createSlider(
      'Fog Near Distance:',
      0,
      2000, // Max changed to 2000
      fogNear,
      10,
      (val) => val.toFixed(0),
      (value) => {
        if (value < fog.far) {
          fog.near = value;
          fogNear = value; // Keep local var in sync for other slider's validation
        }
      }
    );
    fogSection.appendChild(nearSlider);

    // Create fog far slider
    const farSlider = createSlider(
      'Fog Far Distance:',
      0,
      2000, // Max changed to 2000
      fogFar,
      10,
      (val) => val.toFixed(0),
      (value) => {
        if (value > fog.near) {
          fog.far = value;
          fogFar = value; // Keep local var in sync
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

    // Hemisphere light intensity slider
    if (this.lights.hemispheric) {
      const hemiSlider = createSlider(
        'Hemisphere Light:',
        0,
        2, // Max intensity
        this.lights.hemispheric.intensity,
        0.01,
        (value: number) => {
          if (this.lights.hemispheric) {
            this.lights.hemispheric.intensity = value;
          }
        }
      );
      lightingSection.appendChild(hemiSlider);
    }

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

    // Add HemisphereLight for more natural ambient lighting
    this.lights.hemispheric = new THREE.HemisphereLight(
      0x7799bb, // skyColor
      0x332211, // groundColor
      0.5 // intensity
    );
    this.scene.add(this.lights.hemispheric);

    // Create emissive particle lights from ground
    this.createGroundLightParticles(300); // Create 300 visible spheres
  }

  private createGroundLightParticles(count: number): void {
    // Initialize arrays to hold our particles
    const particles: THREE.Mesh[] = [];
    const velocities: number[] = [];
    const maxHeights: number[] = [];
    const basePositions: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];
    const initialSizes: number[] = [];
    const fadeDurations: number[] = [];
    const lifeTimes: number[] = [];
    const ages: number[] = [];

    // Define colors for our particles
    const colorOptions = [
      0xff2097, // Bright pink
      0x20aaff, // Bright blue
      0xaaff20, // Bright green
      0xff7700, // Orange
      0x9900ff, // Purple
      0x00ffff, // Cyan
      0xff00ff, // Magenta
    ];

    // Create a higher detail sphere geometry for all particles
    const sphereGeometry = new THREE.SphereGeometry(1, 12, 12);

    // Pre-create particles but don't actually spawn them yet
    for (let i = 0; i < count; i++) {
      // Create material with random color
      const color =
        colorOptions[Math.floor(Math.random() * colorOptions.length)];
      const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending, // Add additive blending for a glowing effect
      });

      // Create mesh but place it below ground to hide it initially
      const sphere = new THREE.Mesh(sphereGeometry, material);
      sphere.position.y = -1000; // Hide it underground

      // Randomize initial size for variety
      const size = 1.5 + Math.random() * 2.5; // Random size between 1.5 and 4
      sphere.scale.set(size, size, size);

      // Add to the scene
      this.scene.add(sphere);

      // Store the particle data with initial dummy values
      particles.push(sphere);
      velocities.push(0);
      maxHeights.push(0);
      basePositions.push(new THREE.Vector3(0, -1000, 0));
      normals.push(new THREE.Vector3(0, 1, 0));
      initialSizes.push(size);
      fadeDurations.push(0.5 + Math.random() * 1.5); // Fade duration between 0.5 and 2 seconds
      lifeTimes.push(0);
      ages.push(0);
    }

    // Store everything - initially no particles are active
    this.groundLightParticles = {
      particles,
      velocities,
      maxHeights,
      basePositions,
      normals,
      activeCount: 0,
      spawnTimer: 0,
      initialSizes,
      fadeDurations,
      lifeTimes,
      ages,
    };
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
    const deltaTime = this.clock.getDelta();
    const elapsedTime = this.clock.elapsedTime;
    const previousActualCameraY = this.conceptualCameraPosition.y; // Actual Y from end of previous frame

    // Update ground light particles
    this.updateGroundLightParticles(deltaTime);

    // Update camera controls (gets user's current absolute desired height)
    this.controls = this.cameraController.update(deltaTime);
    const currentUserAbsoluteDesiredY = this.controls.height;

    // 1. Update conceptual camera XZ position based on controls
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyEuler(new THREE.Euler(0, this.controls.rotationY, 0, 'YXZ'));
    direction.multiplyScalar(this.controls.speed * deltaTime);
    this.conceptualCameraPosition.add(direction);
    // Y position is handled next

    // 2. Determine new Y position with stickiness
    let newActualCameraY = previousActualCameraY; // Default to staying at the same height

    if (currentUserAbsoluteDesiredY !== this.lastUserControlsHeight) {
      // User actively changed their desired height this frame (Q or Z pressed)
      // The new target is the user's explicitly set desired height.
      newActualCameraY = currentUserAbsoluteDesiredY;
    }
    // Update for next frame comparison
    this.lastUserControlsHeight = currentUserAbsoluteDesiredY;

    // Apply terrain floor collision (bumping up only)
    const terrainHeight = getHeight(
      this.conceptualCameraPosition.x,
      this.conceptualCameraPosition.z
    );
    const terrainFloorY = terrainHeight + MINIMUM_CAMERA_OFFSET_ABOVE_TERRAIN;

    newActualCameraY = Math.max(newActualCameraY, terrainFloorY);
    this.conceptualCameraPosition.y = newActualCameraY;

    // Synchronize the camera controller's height with the actual clamped height
    this.cameraController.setHeight(newActualCameraY);

    // 3. Floating Origin Check & Shift
    const shiftDelta = computeShiftDelta(
      this.conceptualCameraPosition,
      this.worldOriginOffset,
      FLOATING_ORIGIN_SHIFT_THRESHOLD,
      TILE_SIZE
    );
    if (shiftDelta.lengthSq() > 0) {
      this.worldOriginOffset.add(shiftDelta);

      // When the origin shifts, we need to update all particles to maintain their positions
      // relative to the terrain
      if (this.groundLightParticles) {
        const { particles, basePositions } = this.groundLightParticles;

        // Update all active particles
        for (let i = 0; i < this.groundLightParticles.activeCount; i++) {
          // Adjust the scene position of the particle to compensate for the origin shift
          // This ensures the particle remains at the same world position
          particles[i].position.sub(shiftDelta);

          // Also update the base position (spawn point) to maintain correct height calculation
          basePositions[i].sub(shiftDelta);
        }
      }
    }

    // 4. Update camera's actual scene position
    this.camera.position.subVectors(
      this.conceptualCameraPosition,
      this.worldOriginOffset
    );

    // 5. Update camera's rotation
    this.camera.rotation.set(
      this.controls.rotationX,
      this.controls.rotationY,
      0,
      'YXZ'
    );

    // 6. Update tile grid (recycles tiles, updates their scene positions)
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

    // Re-center star field on camera to avoid jitter during floating origin
    if (this.starField) {
      this.starField.position.copy(this.camera.position);
    }

    // Update debug info box
    this.updateInfoBox();
    this.renderer.render(this.scene, this.camera);
  }

  private updateInfoBox(): void {
    const camPos = this.conceptualCameraPosition;
    const originOffset = this.worldOriginOffset;
    const camScenePos = this.camera.position;

    this.infoBox.innerText = `
Conceptual Camera: X: ${camPos.x.toFixed(2)}, Y: ${camPos.y.toFixed(
      2
    )}, Z: ${camPos.z.toFixed(2)}
World Origin Offset: X: ${originOffset.x.toFixed(2)}, Y: ${originOffset.y.toFixed(
      2
    )}, Z: ${originOffset.z.toFixed(2)}
Camera Scene Pos: X: ${camScenePos.x.toFixed(2)}, Y: ${camScenePos.y.toFixed(
      2
    )}, Z: ${camScenePos.z.toFixed(2)}

Grid Coords (Cam): X: ${Math.round(camPos.x / TILE_SIZE)}, Z: ${Math.round(
      camPos.z / TILE_SIZE
    )}
Fractional Tile Pos: X: ${((camPos.x % TILE_SIZE) / TILE_SIZE).toFixed(
      2
    )}, Z: ${((camPos.z % TILE_SIZE) / TILE_SIZE).toFixed(2)}
Shift Threshold: ${FLOATING_ORIGIN_SHIFT_THRESHOLD.toFixed(2)}

Active Particles: ${this.groundLightParticles ? this.groundLightParticles.activeCount : 0}/${this.groundLightParticles ? this.groundLightParticles.particles.length : 0}

Controls:
Speed: ${this.controls.speed.toFixed(2)} (W/S or Mouse Wheel)
Rotation X: ${this.controls.rotationX.toFixed(2)} (Mouse Y / Q/Z)
Rotation Y: ${this.controls.rotationY.toFixed(2)} (Mouse X / A/D)
Height: ${this.controls.height.toFixed(2)} (R/F)
    `;
  }

  private updateGroundLightParticles(deltaTime: number): void {
    if (!this.groundLightParticles) return;

    const {
      particles,
      velocities,
      maxHeights,
      basePositions,
      normals,
      initialSizes,
      fadeDurations,
      lifeTimes,
      ages,
    } = this.groundLightParticles;

    // Use conceptual camera position in world coordinates
    const cameraPosition = this.conceptualCameraPosition;

    // Get camera direction to spawn particles in front of camera
    const lookDirection = new THREE.Vector3(0, 0, -1);
    lookDirection.applyEuler(
      new THREE.Euler(0, this.controls.rotationY, 0, 'YXZ')
    );

    // First, update existing active particles
    for (let i = 0; i < this.groundLightParticles.activeCount; i++) {
      const particle = particles[i];
      const velocity = velocities[i];
      const maxHeight = maxHeights[i];
      const basePosition = basePositions[i];
      const normal = normals[i];
      const initialSize = initialSizes[i];
      const fadeTime = fadeDurations[i];

      // Update particle age
      ages[i] += deltaTime;
      const age = ages[i];
      const lifeTime = lifeTimes[i];

      // Calculate remaining life percentage (0 to 1)
      const lifePercentage = Math.min(age / lifeTime, 1.0);

      // Calculate world coordinates for this particle (conceptual position)
      const worldPos = new THREE.Vector3();
      worldPos.copy(particle.position);
      worldPos.add(this.worldOriginOffset);

      // Move the particle along its normal vector in world space
      worldPos.x += normal.x * velocity * deltaTime;
      worldPos.y += normal.y * velocity * deltaTime;
      worldPos.z += normal.z * velocity * deltaTime;

      // Convert back to scene coordinates for rendering
      particle.position.copy(worldPos);
      particle.position.sub(this.worldOriginOffset);

      // Apply visual effects based on lifetime

      // 1. Fade out as the particle reaches end of life
      if (lifePercentage > 0.7) {
        // Start fading out at 70% of life
        const fadePercentage = (lifePercentage - 0.7) / 0.3;
        if (particle.material instanceof MeshBasicMaterial) {
          particle.material.opacity = 0.8 * (1 - fadePercentage);
        }
      }

      // 2. Gradually decrease size
      const sizeFactor = 1 - lifePercentage * 0.9; // Shrink to 10% of original size at end of life
      particle.scale.set(
        initialSize * sizeFactor,
        initialSize * sizeFactor,
        initialSize * sizeFactor
      );

      // 3. Add a pulsating effect
      const pulseFreq = 2 + Math.sin(age * 3) * 0.2; // Pulsation frequency
      const pulseAmp = 0.1; // Pulsation amplitude
      const pulseFactor = 1 + Math.sin(age * pulseFreq) * pulseAmp;
      particle.scale.multiplyScalar(pulseFactor);

      // Check if particle has completed its lifetime or shrunk too small
      if (age >= lifeTime || sizeFactor < 0.1) {
        // Reset this particle
        this.resetParticle(i);
        // Adjust index since resetParticle might have swapped this particle
        i--;
      }
    }

    // Try to spawn new particles
    this.groundLightParticles.spawnTimer += deltaTime;

    // Only try spawning if we have inactive particles and enough time has passed
    const spawnProbability = 0.8; // 80% chance per second
    const spawnInterval = 1.0 / 15; // At most 15 particles per second

    if (
      this.groundLightParticles.spawnTimer >= spawnInterval &&
      this.groundLightParticles.activeCount < particles.length &&
      Math.random() < spawnProbability * deltaTime
    ) {
      // Reset spawn timer
      this.groundLightParticles.spawnTimer = 0;

      // Activate next particle
      const index = this.groundLightParticles.activeCount;
      this.groundLightParticles.activeCount++;

      // Position in front of the camera
      const distance = 100 + Math.random() * 100; // Between 100-200 units in front
      const sideways = (Math.random() - 0.5) * 60; // Up to 30 units to either side

      // Calculate spawn position in front of camera
      const spawnPos = new THREE.Vector3();
      spawnPos.copy(cameraPosition);

      // Move forward in the camera's looking direction
      spawnPos.x += lookDirection.x * distance;
      spawnPos.z += lookDirection.z * distance;

      // Add sideways offset
      const rightVector = new THREE.Vector3()
        .crossVectors(lookDirection, new THREE.Vector3(0, 1, 0))
        .normalize();
      spawnPos.x += rightVector.x * sideways;
      spawnPos.z += rightVector.z * sideways;

      // Get terrain height and normal at this position
      const terrainHeight = getHeight(spawnPos.x, spawnPos.z);
      spawnPos.y = terrainHeight;

      // Calculate terrain normal
      const sampleDistance = 1.0;
      const hL = getHeight(spawnPos.x - sampleDistance, spawnPos.z);
      const hR = getHeight(spawnPos.x + sampleDistance, spawnPos.z);
      const hU = getHeight(spawnPos.x, spawnPos.z - sampleDistance);
      const hD = getHeight(spawnPos.x, spawnPos.z + sampleDistance);

      // Calculate normal vector from height differences
      const newNormal = new THREE.Vector3(
        (hL - hR) / (2 * sampleDistance),
        1.0, // Y component is always up somewhat
        (hU - hD) / (2 * sampleDistance)
      ).normalize();

      // Reset particle age
      ages[index] = 0;

      // Randomize particle lifetime - how long it will live
      const particleLifetime = 5 + Math.random() * 5; // 5-10 seconds lifespan
      lifeTimes[index] = particleLifetime;

      // Set initial material properties
      if (particles[index].material instanceof MeshBasicMaterial) {
        particles[index].material.opacity = 0.8;
      }

      // Update particle properties
      basePositions[index].copy(spawnPos);
      normals[index].copy(newNormal);
      velocities[index] = 8 + Math.random() * 17; // Slightly slower velocities for longer visibility

      // Randomize the max height based on lifespan rather than a fixed value
      const riseHeight = 40 + Math.random() * 40;
      maxHeights[index] = terrainHeight + riseHeight;

      // Set initial scale based on the stored initial size
      const initialSize = initialSizes[index];
      particles[index].scale.set(initialSize, initialSize, initialSize);

      // Position the particle in scene coordinates
      particles[index].position.copy(spawnPos);
      particles[index].position.sub(this.worldOriginOffset);
    }
  }

  private resetParticle(index: number): void {
    if (!this.groundLightParticles) return;

    // Get the last active particle
    const lastActiveIndex = this.groundLightParticles.activeCount - 1;

    if (index === lastActiveIndex) {
      // If it's already the last active particle, just decrement the count
      this.groundLightParticles.activeCount--;
      this.groundLightParticles.particles[index].position.y = -1000; // Hide it
    } else if (lastActiveIndex > 0) {
      // Swap with the last active particle for efficiency
      // This way we keep all active particles at the beginning of the array

      // Swap particle objects
      const temp = this.groundLightParticles.particles[index];
      this.groundLightParticles.particles[index] =
        this.groundLightParticles.particles[lastActiveIndex];
      this.groundLightParticles.particles[lastActiveIndex] = temp;

      // Swap velocities
      const tempVel = this.groundLightParticles.velocities[index];
      this.groundLightParticles.velocities[index] =
        this.groundLightParticles.velocities[lastActiveIndex];
      this.groundLightParticles.velocities[lastActiveIndex] = tempVel;

      // Swap max heights
      const tempMax = this.groundLightParticles.maxHeights[index];
      this.groundLightParticles.maxHeights[index] =
        this.groundLightParticles.maxHeights[lastActiveIndex];
      this.groundLightParticles.maxHeights[lastActiveIndex] = tempMax;

      // Swap base positions
      const tempBase = this.groundLightParticles.basePositions[index].clone();
      this.groundLightParticles.basePositions[index].copy(
        this.groundLightParticles.basePositions[lastActiveIndex]
      );
      this.groundLightParticles.basePositions[lastActiveIndex].copy(tempBase);

      // Swap normals
      const tempNormal = this.groundLightParticles.normals[index].clone();
      this.groundLightParticles.normals[index].copy(
        this.groundLightParticles.normals[lastActiveIndex]
      );
      this.groundLightParticles.normals[lastActiveIndex].copy(tempNormal);

      // Swap initial sizes
      const tempSize = this.groundLightParticles.initialSizes[index];
      this.groundLightParticles.initialSizes[index] =
        this.groundLightParticles.initialSizes[lastActiveIndex];
      this.groundLightParticles.initialSizes[lastActiveIndex] = tempSize;

      // Swap fade durations
      const tempFade = this.groundLightParticles.fadeDurations[index];
      this.groundLightParticles.fadeDurations[index] =
        this.groundLightParticles.fadeDurations[lastActiveIndex];
      this.groundLightParticles.fadeDurations[lastActiveIndex] = tempFade;

      // Swap lifetimes
      const tempLife = this.groundLightParticles.lifeTimes[index];
      this.groundLightParticles.lifeTimes[index] =
        this.groundLightParticles.lifeTimes[lastActiveIndex];
      this.groundLightParticles.lifeTimes[lastActiveIndex] = tempLife;

      // Swap ages
      const tempAge = this.groundLightParticles.ages[index];
      this.groundLightParticles.ages[index] =
        this.groundLightParticles.ages[lastActiveIndex];
      this.groundLightParticles.ages[lastActiveIndex] = tempAge;

      // Decrement active count and hide the now inactive particle
      this.groundLightParticles.activeCount--;
      this.groundLightParticles.particles[lastActiveIndex].position.y = -1000; // Hide it
    }
  }

  private updateRGBLights(time: number): void {
    // This method is no longer used since we replaced it with updateGroundLightParticles
  }

  public dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.tileGridManager.dispose();
    this.cameraController.dispose();

    // Clean up ground light particles
    if (this.groundLightParticles) {
      this.groundLightParticles.particles.forEach((particle) => {
        this.scene.remove(particle);
        particle.geometry.dispose();
        if (particle.material instanceof MeshBasicMaterial) {
          particle.material.dispose();
        }
      });
    }

    this.renderer.dispose();
    if (this.infoBox.parentElement) {
      this.infoBox.parentElement.removeChild(this.infoBox);
    }
    if (this.renderingPanel && this.renderingPanel.parentElement) {
      this.renderingPanel.parentElement.removeChild(this.renderingPanel);
    }
    if (this.currentExperiment) {
      this.currentExperiment.dispose();
    }
  }
}
