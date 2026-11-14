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
  vAlpha = uDust * (0.09 + 0.09 * aSeed.w) * smoothstep(1.0, 4.0, dist) * edge;
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

// Fine dust blowing past the helmet (#142): small soft streaks, stretched along the wind as it appears on screen
// (uWindScreen.xy) and shorter when the wind blows toward or away from the eye (uWindScreen.z). Denser and more
// visible as the storm thickens; brighter than the haze around them, like sunlit dust.
export const STREAK_VERT = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uWindOff;
uniform float uBox, uHeight, uPointScale, uDust, uTime;
varying float vAlpha; varying float vSeed;
void main(){
  vec3 base = aSeed.xyz * vec3(uBox, uHeight, uBox) + uWindOff * (0.8 + 0.4 * aSeed.w);   // not all at the same speed
  vec3 rel = mod(base - cameraPosition + vec3(uBox, 0.0, uBox) * 0.5, vec3(uBox, 1e6, uBox)) - vec3(uBox, 0.0, uBox) * 0.5;
  vec3 p = vec3(cameraPosition.x + rel.x, cameraPosition.y - 1.6 + mod(base.y + 0.3 * sin(uTime * 1.3 + aSeed.w * 40.0), uHeight), cameraPosition.z + rel.z);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = -mv.z, len = 0.5 + 0.8 * aSeed.w;                         // streak length, metres
  gl_PointSize = min(256.0, len * uPointScale / max(dist, 0.1));
  float edge = 1.0 - smoothstep(0.3, 0.5, max(abs(rel.x), abs(rel.z)) / uBox);
  // only a share of the streaks show at low levels, so the dust gets denser as the storm builds
  float share = step(aSeed.w, uDust * 1.15);
  vAlpha = share * pow(uDust, 0.6) * (0.16 + 0.2 * aSeed.y) * smoothstep(0.8, 2.5, dist) * edge;
  vSeed = aSeed.w;
  gl_Position = projectionMatrix * mv;
}
`;
export const STREAK_FRAG = /* glsl */`
uniform vec3 uInscatter, uSunColor, uWindScreen;
varying float vAlpha; varying float vSeed;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  q.y = -q.y;                                                            // gl_PointCoord runs down the screen
  vec2 along = uWindScreen.xy, across = vec2(-along.y, along.x);
  vec2 r = vec2(dot(q, along) / (0.5 * uWindScreen.z), dot(q, across) / 0.07);   // a thin ellipse along the wind
  float d = length(r);
  if(d > 1.0) discard;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * (0.6 + 0.4 * smoothstep(-1.0, 0.6, r.x));   // a soft head, a fading tail
  vec3 c = uInscatter * 1.45 + uSunColor * 0.05;
  gl_FragColor = vec4(c, vAlpha * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
