export const TILE_SIZE = 100; // Width/Depth of a single terrain tile
export const GRID_DIMENSION = 9; // Results in a GRID_DIMENSION x GRID_DIMENSION grid of tiles (use odd number for a center tile)

export const CAMERA_SPEED = 30.0; // Units per second
export const CAMERA_INITIAL_HEIGHT = 50.0;
export const CAMERA_LOOK_AHEAD_DISTANCE = 200.0; // How far the camera looks ahead

export const FLOATING_ORIGIN_SHIFT_THRESHOLD = TILE_SIZE * 1.5; // When camera scene pos exceeds this, shift origin
