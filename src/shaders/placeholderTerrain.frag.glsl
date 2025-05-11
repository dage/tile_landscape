#version 300 es
precision mediump float;

in vec3 vWorldPosition;
in float vHeight;

uniform vec3 uTerrainColorBase;
uniform vec3 uTerrainColorPeak;

out vec4 FragColor;

void main() {
    // Basic coloring based on height
    float normalizedHeight = smoothstep(-10.0, 15.0, vHeight); // Adjust min/max based on heightScale
    vec3 color = mix(uTerrainColorBase, uTerrainColorPeak, normalizedHeight);
    
    // Simple fog
    float fogDistance = length(vWorldPosition - cameraPosition); // cameraPosition is a built-in uniform in Three.js r169+ for GLSL 300
    float fogFactor = smoothstep(200.0, 800.0, fogDistance); // Start fog, end fog
    vec3 fogColor = vec3(0.5, 0.6, 0.7); // Light blueish-grey fog

    FragColor = vec4(mix(color, fogColor, fogFactor), 1.0);
}