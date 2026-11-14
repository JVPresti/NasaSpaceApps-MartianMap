// GLSL for the slope grid (slopeGrid.js, #50): thin lines every 2 m draped on the ground around the player, each coloured
// by the slope there with the slope layer's legend (green, amber, red at the route planner's limits). It fades out toward
// the edge of the patch so it never ends in a hard square. Not tone mapped: it is a display, like the route.
import { COST_CONSTANTS } from '../sim/costGrid.js';

const NO_GO = COST_CONSTANTS.SLOPE_LIMIT_DEG.toFixed(1), CAUTION = COST_CONSTANTS.SLOPE_CAUTION_DEG.toFixed(1);

export const GRID_VERT = /* glsl */`
attribute float aSlope;
varying float vSlope; varying vec3 vW;
void main(){
  vSlope = aSlope; vW = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;
export const GRID_FRAG = /* glsl */`
uniform vec3 uInscatter; uniform float uFogK, uOn, uSpacing, uFadeFrom, uFadeTo;
uniform vec2 uPlayer;
varying float vSlope; varying vec3 vW;
void main(){
  vec2 g = vW.xz / uSpacing;
  vec2 w = fwidth(g) * 1.2;                                            // about one pixel wide at any distance
  vec2 l = 1.0 - smoothstep(vec2(0.0), w, abs(fract(g - 0.5) - 0.5));
  float line = max(l.x, l.y);
  float fade = 1.0 - smoothstep(uFadeFrom, uFadeTo, distance(vW.xz, uPlayer));
  float a = line * fade * uOn;
  if(a < 0.01) discard;
  vec3 c = vSlope > ${NO_GO} ? vec3(0.95, 0.12, 0.08) : vSlope > ${CAUTION} ? vec3(1.0, 0.65, 0.12) : vec3(0.25, 0.9, 0.45);
  c = mix(c, uInscatter, (1.0 - exp(-uFogK * distance(vW, cameraPosition))) * 0.5);
  gl_FragColor = vec4(c, a * (vSlope > ${CAUTION} ? 0.85 : 0.55));      // flat ground quieter, hazards stronger
  #include <colorspace_fragment>
}
`;
