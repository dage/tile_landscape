/**
 * Interface for rendering experiments that can be added to the scene
 */
export interface RenderingExperiment {
  /**
   * Initialize the experiment (set up shaders, materials, etc.)
   */
  initialize(): void | Promise<void>;

  /**
   * Update the experiment per frame
   * @param deltaTime Time elapsed since last frame in seconds
   */
  update(deltaTime: number): void;

  /**
   * Clean up the experiment (dispose of materials, textures, etc.)
   */
  dispose(): void;
}

/**
 * The "None" experiment does nothing - used as a placeholder when no experiment is active
 */
export class NoopExperiment implements RenderingExperiment {
  initialize(): void {
    // No-op
  }

  update(deltaTime: number): void {
    // No-op
  }

  dispose(): void {
    // No-op
  }
}
