// GLSL for the shelter highlight (shelterHighlight.js), in the green the HUD mockups use for the shelter.
// Like the route glow, these materials only use the fog uniforms (uFogK, uInscatter) and uTime, not the lighting in COMMON.
//   SHELTER_ZONE_*:   the safe zone draped on the ground: faint fill, bright edge, a ring pulsing outward.
//                     The zone and the wall fade out (uZone) once the player has reached the shelter.
//   SHELTER_WALL_*:   a low see-through wall of light around the zone, as in the radiation mockup, so the safe area
//                     reads from eye height where the ground ring is seen almost edge-on.
//   SHELTER_BEACON_*: a vertical column of light above the shelter, turned to face the camera, so it can be found
//                     from hundreds of metres away and through the dust storm.
// Fog is applied at reduced strength so the shelter stays findable in haze. Not tone mapped (a display).
const GREEN = /* glsl */`
const vec3 GREEN = vec3(0.10, 0.80, 0.42);           // shelter green (linear)
const vec3 GREEN_HOT = vec3(0.70, 1.0, 0.82);
`;

export const SHELTER_ZONE_VERT = /* glsl */`
attribute float aR;                                  // distance from the centre, in zone radii
varying float vR; varying vec3 vW;
void main(){
  vR = aR; vW = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;
export const SHELTER_ZONE_FRAG = /* glsl */`
uniform vec3 uInscatter; uniform float uFogK; uniform float uTime; uniform float uOn; uniform float uZone;
varying float vR; varying vec3 vW;
${GREEN}
void main(){
  float edge = 1.0 - smoothstep(0.0, 0.035, abs(vR - 1.0));
  float fill = (1.0 - smoothstep(0.97, 1.0, vR)) * 0.16;
  float ph = fract(uTime * 0.45);                      // a ring pulsing outward every ~2 s
  float pulse = (1.0 - smoothstep(0.0, 0.03, abs(vR - (1.0 + ph * 0.35)))) * (1.0 - ph);
  float a = max(max(edge * 0.9, fill), pulse * 0.6) * uOn * uZone;
  if(a < 0.005) discard;
  vec3 c = mix(GREEN, GREEN_HOT, edge * 0.4 + pulse * 0.3);
  c = mix(c, uInscatter, (1.0 - exp(-uFogK * distance(vW, cameraPosition))) * 0.4);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}
`;

export const SHELTER_WALL_VERT = /* glsl */`
attribute float aV;                                  // 0 at the ground, 1 at the top of the wall
varying float vV; varying vec3 vW;
void main(){
  vV = aV; vW = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;
export const SHELTER_WALL_FRAG = /* glsl */`
uniform vec3 uInscatter; uniform float uFogK; uniform float uTime; uniform float uOn; uniform float uZone;
varying float vV; varying vec3 vW;
${GREEN}
void main(){
  float base = 1.0 - smoothstep(0.0, 0.08, vV);         // bright line where the wall meets the ground
  float body = pow(1.0 - vV, 2.0) * 0.32;              // fades out upward
  float scan = smoothstep(0.92, 1.0, fract(vV * 3.0 - uTime * 0.5)) * (1.0 - vV) * 0.25;   // slow bands rising
  float a = (max(base * 0.85, body) + scan) * uOn * uZone;
  if(a < 0.005) discard;
  vec3 c = mix(GREEN, GREEN_HOT, base * 0.5);
  c = mix(c, uInscatter, (1.0 - exp(-uFogK * distance(vW, cameraPosition))) * 0.4);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}
`;

export const SHELTER_BEACON_VERT = /* glsl */`
attribute vec2 aCorner;                              // x: -1..1 across, y: 0..1 up
uniform float uBeaconH;
varying vec2 vUv; varying vec3 vW;
void main(){
  vec3 toCam = cameraPosition - position;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5, 0.0, 0.0));   // horizontal, facing the camera
  float d = length(toCam.xz);
  float w = max(0.8, d * 0.011);                        // half-width: about 8 px wide on screen far away
  vec3 p = position + right * aCorner.x * w + vec3(0.0, aCorner.y * uBeaconH, 0.0);
  vUv = aCorner; vW = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
export const SHELTER_BEACON_FRAG = /* glsl */`
uniform vec3 uInscatter; uniform float uFogK; uniform float uTime; uniform float uOn; uniform float uBeaconH;
varying vec2 vUv; varying vec3 vW;
${GREEN}
void main(){
  float x = abs(vUv.x), y = vUv.y;
  float core = exp(-x * x * 14.0), glow = exp(-x * x * 2.5) * 0.45;
  float fadeUp = pow(1.0 - y, 0.8);                   // still strong well above a ridge that hides the base
  float d = distance(vW, cameraPosition);
  float nearFade = smoothstep(8.0, 30.0, d);           // close to the shelter the column would only get in the way
  float rise = smoothstep(0.85, 1.0, fract(y * uBeaconH / 18.0 - uTime * 0.6)) * 0.5;   // bands of light rising
  float a = min(1.0, core * (0.9 + rise) + glow) * fadeUp * nearFade * uOn;
  if(a < 0.005) discard;
  vec3 c = mix(GREEN, GREEN_HOT, core * 0.6);
  c = mix(c, uInscatter, (1.0 - exp(-uFogK * d)) * 0.15);   // a light, not a surface: the dust dims it only a little
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}
`;
