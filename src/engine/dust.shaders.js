// GLSL for the airborne dust near the helmet (dust.js). Martian storm dust is a few micrometres across, so it is never
// drawn as grains: each point is a large, very faint, soft wisp that drifts with the wind. Lit like the haze (uInscatter)
// and tone mapped like the scene, so it reads as the same dust; faded out close to the eye and at the edge of the box
// that follows the camera.
export const DUST_VERT = /* glsl */`
attribute vec4 aSeed;                  // xyz: position in the box (0..1), w: size and alpha variation (0..1)
uniform vec3 uWindOff;                 // how far the wind has carried the dust, metres
uniform float uBox, uHeight, uPointScale, uDust, uTime;
varying float vAlpha; varying float vSeed;
void main(){
  // positions wrap around the camera, so the dust never runs out wherever the player walks
  vec3 base = aSeed.xyz * vec3(uBox, uHeight, uBox) + uWindOff;
  vec3 rel = mod(base - cameraPosition + vec3(uBox, 0.0, uBox) * 0.5, vec3(uBox, 1e6, uBox)) - vec3(uBox, 0.0, uBox) * 0.5;
  vec3 p = vec3(cameraPosition.x + rel.x, cameraPosition.y - 1.7 + mod(base.y, uHeight), cameraPosition.z + rel.z);
  p.y += 0.25 * sin(uTime * 0.7 + aSeed.w * 31.0);                       // a slow lift and fall
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = -mv.z, size = 1.4 + 2.6 * aSeed.w;                        // wisp size, metres
  gl_PointSize = min(512.0, size * uPointScale / max(dist, 0.1));
  float edge = 1.0 - smoothstep(0.32, 0.5, max(abs(rel.x), abs(rel.z)) / uBox);
  vAlpha = uDust * (0.07 + 0.08 * aSeed.w) * smoothstep(1.0, 4.0, dist) * edge;
  vSeed = aSeed.w;
  gl_Position = projectionMatrix * mv;
}
`;
export const DUST_FRAG = /* glsl */`
uniform vec3 uInscatter, uSunColor;
varying float vAlpha; varying float vSeed;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  if(r > 1.0) discard;
  float soft = 1.0 - smoothstep(0.1, 1.0, r);
  float wisp = 0.55 + 0.45 * n(q * 5.0 + vSeed * 17.0);                  // uneven, not a clean disc
  vec3 c = uInscatter * 1.2 + uSunColor * 0.03;                          // a little brighter than the haze: sunlit dust
  gl_FragColor = vec4(c, vAlpha * soft * soft * wisp);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
