import * as THREE from 'three';
import { TileGridManager } from '../TileGridManager';
import type { RenderingExperiment } from './RenderingExperiment';
import placeholderTerrainVert from '@/shaders/placeholderTerrain.vert.glsl?raw';
import placeholderTerrainFrag from '@/shaders/placeholderTerrain.frag.glsl?raw';

/**
 * Experiment that restores the original custom shader for the terrain
 *
 * This experiment:
 * 1. Creates a ShaderMaterial with the original vertex and fragment shaders
 * 2. Replaces the standard material with the custom shader
 * 3. Restores the original material when disabled
 *
 * This demonstrates:
 * - How to use custom ShaderMaterial for terrain
 * - How to implement procedural terrain in the vertex shader
 * - How shader-based terrain can be used as an option alongside standard materials
 */
export class CustomShaderExperiment implements RenderingExperiment {
  private scene: THREE.Scene;
  private tileManager: TileGridManager;
  public customShaderMaterial: THREE.ShaderMaterial | null = null;
  private originalMaterial: THREE.Material | null = null;

  constructor(scene: THREE.Scene, tileManager: TileGridManager) {
    this.scene = scene;
    this.tileManager = tileManager;
  }

  async initialize(): Promise<void> {
    // Create the custom shader material
    this.customShaderMaterial = new THREE.ShaderMaterial({
      vertexShader: placeholderTerrainVert,
      fragmentShader: placeholderTerrainFrag,
      uniforms: {
        uWorldOffset: { value: new THREE.Vector3() },
        // uTime: { value: 0.0 }, // If you need time in shader
        uTerrainColorBase: { value: new THREE.Color(0x335522) }, // Dark green
        uTerrainColorPeak: { value: new THREE.Color(0x99aabb) }, // Light grey/blue for peaks
        cameraPosition: { value: new THREE.Vector3() },
      },
    });

    // Replace the material on all terrain tiles and store the original
    this.originalMaterial = this.tileManager.replaceMaterial(
      this.customShaderMaterial
    );

    // Create UI controls for shader parameters
    this.createShaderControls();
  }

  update(deltaTime: number): void {
    // Update any uniforms that need to be updated per frame
    if (this.customShaderMaterial) {
      // No need to update camera position here, it will be updated in App.ts
      // Example: time-based animation if needed
      // if (this.customShaderMaterial.uniforms.uTime) {
      //   this.customShaderMaterial.uniforms.uTime.value += deltaTime;
      // }
    }
  }

  dispose(): void {
    // Restore original material
    if (this.originalMaterial) {
      this.tileManager.replaceMaterial(this.originalMaterial);
    }

    // Remove UI controls
    const experimentParams = document.getElementById('experimentParams');
    if (experimentParams) {
      experimentParams.innerHTML = '';
    }

    // Dispose of resources
    if (this.customShaderMaterial) {
      this.customShaderMaterial.dispose();
    }
  }

  private createShaderControls(): void {
    const experimentParams = document.getElementById('experimentParams');
    if (!experimentParams || !this.customShaderMaterial) return;

    experimentParams.innerHTML = '';

    // Create header
    const header = document.createElement('h4');
    header.innerText = 'Custom Shader Settings';
    header.style.margin = '0 0 8px 0';
    header.style.fontSize = '13px';
    experimentParams.appendChild(header);

    // Create color pickers for base and peak colors
    this.createColorPicker(
      experimentParams,
      'Base Color:',
      this.customShaderMaterial.uniforms.uTerrainColorBase.value,
      (color) => {
        this.customShaderMaterial!.uniforms.uTerrainColorBase.value.set(color);
      }
    );

    this.createColorPicker(
      experimentParams,
      'Peak Color:',
      this.customShaderMaterial.uniforms.uTerrainColorPeak.value,
      (color) => {
        this.customShaderMaterial!.uniforms.uTerrainColorPeak.value.set(color);
      }
    );

    // Add a note about fog in the shader
    const fogNote = document.createElement('div');
    fogNote.style.marginTop = '10px';
    fogNote.style.fontSize = '11px';
    fogNote.style.opacity = '0.8';
    fogNote.innerText =
      'Note: This shader uses its own fog calculation and is not affected by scene fog settings.';
    experimentParams.appendChild(fogNote);
  }

  private createColorPicker(
    container: HTMLElement,
    label: string,
    color: THREE.Color,
    onChange: (color: string) => void
  ): void {
    const group = document.createElement('div');
    group.style.marginBottom = '8px';

    const labelElem = document.createElement('label');
    labelElem.innerText = label;
    labelElem.style.display = 'block';
    labelElem.style.marginBottom = '2px';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = '#' + color.getHexString();
    colorPicker.style.width = '50px';
    colorPicker.style.height = '20px';
    colorPicker.style.padding = '0';
    colorPicker.style.border = 'none';
    colorPicker.style.background = 'none';

    colorPicker.addEventListener('input', (event) => {
      const newColor = (event.target as HTMLInputElement).value;
      onChange(newColor);
    });

    group.appendChild(labelElem);
    group.appendChild(colorPicker);
    container.appendChild(group);
  }
}
