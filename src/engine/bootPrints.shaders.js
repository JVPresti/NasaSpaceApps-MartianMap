// GLSL for the boot prints (bootPrints.js). Each print is a small quad lying on the ground; the fragment shader draws a
// Z-2 boot sole with tread, as a dent in the regolith: it multiplies the colour underneath (blending 2 x src x dst, so 0.5
// leaves the ground unchanged), so it matches any ground colour. The wall of the dent that faces the sun is lit and the
// floor next to the wall on the sun side is in shadow, like the Apollo boot-print photos. In a storm (uDust, #142) fine dust
// settles in: the tread and walls lose contrast and the inside gets a little lighter, but the print never disappears.
export const PRINT_VERT = /* glsl */`
attribute float aSide;                 // 1 right foot, -1 left foot (mirrors the sole)
attribute float aSeed;                 // 0..1, small differences between prints
uniform vec3 uSunDir;
varying vec2 vP; varying vec2 vSun; varying float vSeed; varying vec3 vW;
void main(){
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  // the quad's own axes in the world: x across the boot, z along it (toe toward -z)
  vec3 across = normalize((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
  vec3 along = normalize((modelMatrix * instanceMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  vSun = vec2(dot(uSunDir, across) * aSide, dot(uSunDir, along));   // sun direction in sole coordinates
  vP = vec2(position.x / 0.075 * aSide, -position.z / 0.17);        // -1..1 across and along the sole
  vSeed = aSeed; vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
export const PRINT_FRAG = /* glsl */`
uniform float uFogK, uFadeFar, uDust;
varying vec2 vP; varying vec2 vSun; varying float vSeed; varying vec3 vW;
// signed distance to the sole outline (negative inside): one rounded sole, narrow at the heel, wider at the toe
float sole(vec2 p){
  float w = mix(0.6, 0.86, smoothstep(-0.4, 0.4, p.y));            // half-width along the sole
  vec2 q = vec2(abs(p.x) - w + 0.45, abs(p.y) - 0.95 + 0.45);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.45;
}
void main(){
  float d = sole(vP);
  if(d > 0.35) discard;
  // the floor of the dent, with tread lugs across the sole
  float inside = 1.0 - smoothstep(-0.04, 0.02, d);
  float lug = smoothstep(0.35, 0.5, fract(vP.y * 6.0)) * (1.0 - smoothstep(0.6, 0.62, fract(vP.y * 6.0)));   // tread bars
  float instep = 1.0 - smoothstep(0.0, 0.1, abs(vP.y + 0.18));      // the gap between heel and forefoot tread
  float floorShade = 0.83 + 0.11 * lug * (1.0 - instep);
  // which way the edge here faces, and whether the sun lights that wall or the floor next to it is in shadow
  vec2 e = vec2(0.01, 0.0);
  vec2 grad = normalize(vec2(sole(vP + e.xy) - sole(vP - e.xy), sole(vP + e.yx) - sole(vP - e.yx)) + 1e-6);
  vec2 sun = normalize(vSun + 1e-6);
  float facing = dot(-grad, sun);                                     // > 0: this edge's wall faces the sun
  float wall = 1.0 - smoothstep(0.0, 0.12, abs(d));                   // the narrow band around the outline
  float rim = smoothstep(0.02, 0.2, d) * (1.0 - smoothstep(0.2, 0.35, d));   // pushed-up soil just outside
  float k = mix(1.0, floorShade, inside);
  float sunLeft = 1.0 - 0.85 * uDust;                                 // the storm dims the sun (stormLight.js): weaker light and shadow
  k *= 1.0 + 0.18 * sunLeft * wall * facing;                          // lit wall brighter, shaded wall darker
  k *= 1.0 - 0.18 * sunLeft * inside * smoothstep(-0.25, 0.0, d) * max(-facing, 0.0);   // shadow inside, along the sun-side wall
  k *= 1.0 + 0.06 * rim;
  k = mix(1.0, k, 0.85 + 0.15 * vSeed);
  // dust settling in: softer, and a little lighter inside; at most 55 % of the contrast goes, so the trail stays readable
  k = mix(k, 1.0, 0.55 * uDust);
  k *= 1.0 + 0.05 * uDust * inside;
  // fade out with distance and in the haze
  float dist = distance(vW, cameraPosition);
  float fade = (1.0 - smoothstep(uFadeFar * 0.6, uFadeFar, dist)) * exp(-uFogK * dist * 2.0);
  k = mix(1.0, k, fade);
  gl_FragColor = vec4(vec3(0.5 * k), 1.0);
}
`;
