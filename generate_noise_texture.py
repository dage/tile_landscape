# generate_noise_texture.py
import numpy as np
from PIL import Image
import noise # For Perlin/Simplex noise

def generate_simplex_noise_texture(width=256, height=256, scale=50.0, octaves=4, persistence=0.5, lacunarity=2.0, seed=None, output_path="public/assets/normal.png"):
    """
    Generates a grayscale simplex noise image and saves it.
    This will be used as a bump map, so grayscale is appropriate.
    """
    if seed is None:
        seed = np.random.randint(0, 100)

    world = np.zeros((height, width))
    for i in range(height):
        for j in range(width):
            # noise.pnoise2 params: x, y, octaves, persistence, lacunarity, repeatx, repeaty, base
            world[i][j] = noise.pnoise2(i / scale,
                                        j / scale,
                                        octaves=octaves,
                                        persistence=persistence,
                                        lacunarity=lacunarity,
                                        repeatx=width, # Make it tileable
                                        repeaty=height, # Make it tileable
                                        base=seed)

    # Normalize to 0-1 range first
    min_val = np.min(world)
    max_val = np.max(world)
    if max_val == min_val: # Avoid division by zero if noise is flat
        normalized_world = np.zeros_like(world)
    else:
        normalized_world = (world - min_val) / (max_val - min_val)

    # Scale to 0-255 and convert to uint8
    img_array = (normalized_world * 255).astype(np.uint8)

    # Create grayscale image
    img = Image.fromarray(img_array, 'L')

    # Ensure the output directory exists
    import os
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    img.save(output_path)
    print(f"Generated noise texture saved to {output_path}")

if __name__ == "__main__":
    generate_simplex_noise_texture() 