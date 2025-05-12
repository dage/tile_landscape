in vec3 vWorldPosition;
in float vHeight;

uniform vec3 uTerrainColorBase;
uniform vec3 uTerrainColorPeak;

void main() {
    // Basic coloring based on height
    float normalizedHeight = smoothstep(-10.0, 15.0, vHeight); // Adjust min/max based on heightScale
    vec3 color = mix(uTerrainColorBase, uTerrainColorPeak, normalizedHeight);
    
    // Simple fog
    float fogDistance = length(vWorldPosition - cameraPosition);
    float fogFactor = smoothstep(200.0, 800.0, fogDistance);
    vec3 fogColor = vec3(0.5, 0.6, 0.7);

    gl_FragColor = vec4(mix(color, fogColor, fogFactor), 1.0);
}