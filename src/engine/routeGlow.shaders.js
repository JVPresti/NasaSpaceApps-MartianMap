// GLSL for the route glow (routeGlow.js), styled as a projection of the visor (HUD cyan, as in the team's mockups).
// Kept apart from shaders.js: these materials do not use the shared lighting in COMMON, only fog and uTime.
//   ROUTE_GLOW_*: close to the player, a dotted line lying on the ground; further away (or seen from the side), a thin
//                 solid line with a dark outline and a near-constant width on screen. The walked part is a faint grey trail.
//   ROUTE_CHEV_*: chevrons floating about 0.8 m above the ground, a few tens of metres ahead of the player, pointing along
//                 the route. Each one turns to face the camera around its cross-route axis, so it always shows its arrow.
// Fog is applied at half strength so the route stays findable in the dust storm. Not tone mapped (a display).
export const ROUTE_GLOW_VERT = /* glsl */`
attribute vec3 aDir; attribute float aSide; attribute float aLen; attribute float aLift;
varying float vLen; varying float vSide; varying float vUp; varying vec3 vW;
void main(){
  vec3 perp = normalize(vec3(-aDir.z, 0.0, aDir.x));
  vec3 toCam = cameraPosition - position;
  float d = length(toCam);
  float w = max(0.26, d*0.004);                      // half-width, metres: about 6 px on screen far away
  // Width axis faces the camera: flat on the ground when you look along the route, tilted up like a stripe when you
  // see it from the side (a flat decal seen at a grazing angle would be a pixel thin).
  vec3 side = cross(aDir, toCam / d);
  side = length(side) > 0.05 ? normalize(side) : perp;
  side *= sign(dot(side, perp) + 1e-4);              // keep the same edge on the same side
  float up = abs(side.y);
  vec3 p = position + side*aSide*w;
  p.y += w*up + w*aLift*(1.0 - up) + d*0.0004;       // rest the raised stripe on the ground; clear side slopes; far lift
  vW = p; vLen = aLen; vSide = aSide; vUp = up;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
export const ROUTE_GLOW_FRAG = /* glsl */`
uniform vec3 uInscatter; uniform float uFogK; uniform float uTime; uniform float uWalked; uniform float uTotal;
varying float vLen; varying float vSide; varying float vUp; varying vec3 vW;
const vec3 HUD = vec3(0.22, 0.68, 0.92);             // HUD cyan of the mockups, a little more saturated to stand out on pale ground (linear)
const vec3 HOT = vec3(0.75, 0.95, 1.0);
const vec3 DARK = vec3(0.03, 0.04, 0.05);
const float DOT_EVERY = 1.6;                         // metres between dots
const float NEAR_W = 0.26;                           // half-width close up (matches the vertex shader)
void main(){
  float d = distance(vW, cameraPosition), s = abs(vSide);
  float ahead = smoothstep(-0.8, 0.8, vLen - uWalked);
  // dots only where the line lies flat and close; elsewhere a solid line (dots there would be blobs or ovals)
  float solid = max(smoothstep(18.0, 35.0, d), smoothstep(0.25, 0.5, vUp));
  float r = length(vec2((fract(vLen / DOT_EVERY) - 0.5) * DOT_EVERY / NEAR_W, vSide));   // in half-widths
  float dotCore = 1.0 - smoothstep(0.45, 0.58, r), dotRing = 1.0 - smoothstep(0.6, 1.0, r);
  float lineCore = 1.0 - smoothstep(0.32, 0.46, s);
  float lineRing = smoothstep(0.34, 0.46, s) * (1.0 - smoothstep(0.7, 0.92, s));   // thin dark outline
  float shape = mix(dotCore, lineCore, solid);
  float ring = mix(dotRing, lineRing, solid);
  // a light wave running toward the goal (every 30 m, 6 m/s), near the player only
  float wave = smoothstep(0.85, 1.0, fract((vLen - uTime*6.0) / 30.0)) * (1.0 - smoothstep(60.0, 150.0, d));
  vec3 c = mix(DARK, mix(HUD, HOT, 0.3*(1.0 - solid) + 0.5*wave), shape);
  float a = max(shape, 0.55*ring) * (0.85 + 0.15*wave);
  // walked: faint grey trail
  c = mix(vec3(0.55, 0.58, 0.6), c, ahead);
  a *= mix(0.3, 1.0, ahead);
  a *= smoothstep(0.0, 1.0, uTotal - vLen + 0.3) * smoothstep(-0.3, 0.7, vLen);   // soft ends
  c = mix(c, uInscatter, (1.0 - exp(-uFogK*d)) * 0.5);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}
`;
export const ROUTE_CHEV_VERT = /* glsl */`
attribute vec3 aDir; attribute vec2 aCorner; attribute float aLen;
uniform float uTime;
varying vec2 vUv; varying float vLen; varying vec3 vW;
void main(){
  vec3 perp = normalize(vec3(-aDir.z, 0.0, aDir.x));
  vec3 anchor = position + vec3(0.0, 0.04*sin(uTime*2.0 + aLen*0.35), 0.0);   // slow bob
  vec3 toCam = normalize(cameraPosition - anchor);
  vec3 up = -cross(perp, toCam);                      // in the plane facing the camera, pointing along the route
  float l = length(up); up = l > 1e-3 ? up / l : vec3(0.0, 1.0, 0.0);
  float s = max(0.32, distance(anchor, cameraPosition)*0.012);                    // half-size, metres
  vec3 p = anchor + perp*aCorner.x*s + up*aCorner.y*s*0.75;
  vUv = aCorner; vLen = aLen; vW = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
export const ROUTE_CHEV_FRAG = /* glsl */`
uniform vec3 uInscatter; uniform float uFogK; uniform float uTime; uniform float uWalked; uniform float uChevOn;
varying vec2 vUv; varying float vLen; varying vec3 vW;
const vec3 HUD = vec3(0.22, 0.68, 0.92);
const vec3 HOT = vec3(0.75, 0.95, 1.0);
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0)); }
void main(){
  float k = vLen - uWalked;                            // metres ahead of the player along the route
  float vis = uChevOn * smoothstep(3.0, 8.0, k) * (1.0 - smoothstep(55.0, 80.0, k));
  if(vis < 0.01) discard;
  float dd = min(seg(vUv, vec2(-0.85, -0.35), vec2(0.0, 0.45)), seg(vUv, vec2(0.85, -0.35), vec2(0.0, 0.45)));
  float core = 1.0 - smoothstep(0.10, 0.16, dd);
  float edge = (1.0 - smoothstep(0.16, 0.30, dd)) * 0.5;   // dark outline: contrast on the pale ground and the sky
  float a = max(core, edge);
  if(a < 0.01) discard;
  float wave = smoothstep(0.8, 1.0, fract((vLen - uTime*6.0) / 30.0));   // same wave as the dots
  vec3 c = mix(vec3(0.03, 0.04, 0.05), mix(HUD, HOT, 0.4 + 0.5*wave), core);
  c = mix(c, uInscatter, (1.0 - exp(-uFogK*distance(vW, cameraPosition))) * 0.5);
  gl_FragColor = vec4(c, a * vis * (0.8 + 0.2*wave));
  #include <colorspace_fragment>
}
`;
