// Shared GLSL for the Marswalk engine. One lighting / fog model for every material,
// driven by atmosphere_presets.json.
import { COST_CONSTANTS } from '../sim/costGrid.js';

const SLOPE_NO_GO = COST_CONSTANTS.SLOPE_LIMIT_DEG.toFixed(1), SLOPE_CAUTION = COST_CONSTANTS.SLOPE_CAUTION_DEG.toFixed(1);   // same limits as the route planner
export const COMMON = /* glsl */`
uniform vec3 uSunDir, uSunColor, uAmbSky, uAmbGround;
uniform vec3 uSkyZenith, uSkyHorizon, uHaloColor, uInscatter;
uniform float uHaloPower, uHaloStrength, uSkyIntensity, uGradEnd, uFogK;
vec3 skyColor(vec3 d){
  float t = smoothstep(0.0, uGradEnd, d.y);
  vec3 c = mix(uSkyHorizon, uSkyZenith, t);
  c += uHaloColor * uHaloStrength * pow(max(dot(d, uSunDir), 0.0), uHaloPower);
  return c * uSkyIntensity;
}
vec3 shade(vec3 albedo, vec3 n, float ao, float sun){
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 amb = mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5) * ao;
  return albedo * (uSunColor * ndl * sun + amb);
}
uniform vec3 uLamp, uCamDir, uLamp2Pos, uLamp2Dir; uniform vec2 uLampCone, uLampRange;   // uLampRange: x = half-brightness distance, y = reach (m)
vec3 spotLamp(vec3 albedo, vec3 n, vec3 toFrag, vec3 dir){
  float d = length(toFrag); vec3 L = toFrag/d;
  float spot = smoothstep(uLampCone.y, uLampCone.x, dot(L, dir));
  float q = d/uLampRange.x, w = clamp(1.0 - pow(d/uLampRange.y, 4.0), 0.0, 1.0);   // inverse-square, windowed to zero at the reach
  return albedo * uLamp * max(dot(n, -L), 0.0) * spot * w*w / (1.0 + q*q);
}
uniform vec3 uHabP0, uHabP1, uHabGlow;   // habitat floodlights at night: a warm pool of light along the habitat (P0 = rear, P1 = porch, world space)
vec3 lamp(vec3 albedo, vec3 n, vec3 toFrag){   // own helmet lamp + the partner's (uLamp2Pos / uLamp2Dir, world space) + the habitat's floodlights
  vec3 pw = toFrag + cameraPosition; vec2 ab = uHabP1.xz - uHabP0.xz; float tt = clamp(dot(pw.xz - uHabP0.xz, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0), dd = length(pw.xz - (uHabP0.xz + ab*tt));
  float hg = exp(-dd*dd / 34.0) * smoothstep(9.0, 2.0, pw.y - uHabP0.y) * (0.45 + 0.55*max(n.y, 0.0));
  return spotLamp(albedo, n, toFrag, uCamDir) + spotLamp(albedo, n, toFrag + cameraPosition - uLamp2Pos, uLamp2Dir) + albedo * uHabGlow * hg;
}
// Astronaut shadows: tCast holds each astronaut's silhouette as seen from the sun (left half = player, right half = partner).
// Anything that calls castShadow() receives the shadow: terrain, rocks, props.
uniform sampler2D tCast; uniform vec3 uCastC[3]; uniform float uCastS[3]; uniform vec3 uCastR, uCastU; uniform float uCastOn;
float castShadow(vec3 p){   // slots: 0 = player, 1 = partner (1.3 m half-size), 2 = habitat (8 m half-size)
  if(uCastOn < 0.5) return 1.0;
  float sh = 0.0;
  for(int i = 0; i < 3; i++){
    vec3 d = p - uCastC[i]; float along = dot(d, uSunDir);
    vec2 q = vec2(dot(d, uCastR), dot(d, uCastU)) / uCastS[i];
    if(abs(q.x) < 0.98 && abs(q.y) < 0.98 && along < 0.4 && along > -120.0){
      vec2 uv = q*0.5 + 0.5; uv.x = (uv.x + float(i)) / 3.0;
      float r = (0.004 + 0.0007 * max(-along, 0.0)) * 1.3 / uCastS[i];   // edge softens with distance from the caster
      float m = texture2D(tCast, uv).r * 0.36
              + (texture2D(tCast, uv + vec2(r/3.0, 0.0)).r + texture2D(tCast, uv - vec2(r/3.0, 0.0)).r + texture2D(tCast, uv + vec2(0.0, r)).r + texture2D(tCast, uv - vec2(0.0, r)).r) * 0.16;
      sh = max(sh, m * smoothstep(0.4, 0.0, along));
    }
  }
  return 1.0 - sh;
}
vec3 applyFog(vec3 c, vec3 toFrag){
  float f = 1.0 - exp(-uFogK * length(toFrag));
  return mix(c, uInscatter, f);
}
// A window seen from either side: shows the Mars sky and ground in the viewing direction, with a glass reflection on top.
float wvh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return mix(mix(wvh(i), wvh(i + vec2(1.0, 0.0)), f.x), mix(wvh(i + vec2(0.0, 1.0)), wvh(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 windowView(vec3 dir, vec3 n){
  vec3 lit = uSunColor * max(uSunDir.y, 0.08) + uAmbSky * 0.5, c;
  if(dir.y < 0.0){                                                     // the plain, seen from about 2.5 m up: light and dark patches, stones, haze with distance
    float t = 2.5 / max(-dir.y, 0.01); vec2 g = dir.xz * t;
    float pat = 0.45*wvn(g*0.25) + 0.30*wvn(g*1.3) + 0.25*wvn(g*vec2(9.0, 3.0)), stones = smoothstep(0.80, 0.88, wvn(g*6.0 + 20.0)) * exp(-t*0.06);
    c = mix(vec3(0.34, 0.227, 0.13) * (0.72 + 0.5*pat) * (1.0 - 0.75*stones) * lit, uInscatter, clamp(1.0 - exp(-t*(0.003 + uFogK)), 0.0, 0.9));
  } else {                                                             // the far crater rim as a darker band, then the sky
    float az = atan(dir.z, dir.x), ridge = 0.016 + max(0.0, 0.035*sin(az*3.0 + 1.0) + 0.02*sin(az*11.0) + 0.008*sin(az*37.0));
    c = mix(mix(vec3(0.17, 0.114, 0.065) * lit, uInscatter, 0.55), skyColor(dir), smoothstep(-0.004, 0.004, dir.y - ridge));
  }
  float fr = pow(1.0 - abs(dot(n, dir)), 3.0), streak = smoothstep(0.92, 1.0, sin((dir.x + dir.y * 1.7) * 9.0) * 0.5 + 0.5);
  return c * (1.0 - 0.45 * fr) + vec3(0.85, 0.9, 1.0) * (0.10 * fr + 0.05 * streak);
}
`;

export const TERRAIN_VERT = /* glsl */`
varying vec3 vW;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
`;

export const TERRAIN_FRAG = /* glsl */`
${COMMON}
uniform sampler2D tOrtho, tNrmAo, tMask, tGravel, tSlab, tRing, tShadow;
uniform vec2 uSize; uniform float uFadeStart, uFadeEnd, uLayer, uRelief, uRingSize;
varying vec3 vW;
vec3 ramp(float g){
  vec3 c0=vec3(0.068,0.042,0.021), c1=vec3(0.228,0.143,0.072), c2=vec3(0.468,0.298,0.152), c3=vec3(0.705,0.479,0.262), c4=vec3(0.845,0.633,0.372);   // hues measured on Perseverance Mastcam-Z frames, sol 1217 (see README, Colour)
  if(g<0.35) return mix(c0,c1,g/0.35);
  if(g<0.60) return mix(c1,c2,(g-0.35)/0.25);
  if(g<0.82) return mix(c2,c3,(g-0.60)/0.22);
  return mix(c3,c4,(g-0.82)/0.18);
}
void main(){
  vec2 uv = vec2(vW.x/uSize.x + 0.5, 0.5 - vW.z/uSize.y);
  float g = texture2D(tOrtho, uv).r;
  // blend to the CTX background near the tile edge so the square does not show
  float e = min(uSize.x*0.5 - abs(vW.x), uSize.y*0.5 - abs(vW.z));
  float gr = texture2D(tRing, vec2(vW.x/uRingSize + 0.5, 0.5 - vW.z/uRingSize)).r;
  g = mix(g, gr, 1.0 - smoothstep(0.0, 70.0, e));
  vec3 na = texture2D(tNrmAo, uv).rgb;
  vec3 n; n.x = na.r*2.0-1.0; n.z = na.b*2.0-1.0; n.y = sqrt(max(1.0 - n.x*n.x - n.z*n.z, 0.0));
  float slope = degrees(acos(clamp(n.y, 0.0, 1.0)));
  float ao = clamp(1.0 - (1.0 - na.g)*2.2, 0.25, 1.0);
  vec3 alb = ramp(g);

  vec3 toFrag = vW - cameraPosition;
  float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, length(toFrag));
  vec2 p = vec2(vW.x, -vW.z);
  // gravel: 2 m tile, luminance multiplies the HiRISE colour, GL normal map perturbs the DEM normal
  vec3 gv = texture2D(tGravel, p*0.5).rgb;
  float gm = clamp(gv.b*gv.b/0.165, 0.55, 1.5);
  float dist = length(toFrag);
  // fine tile only close up; a second, 16 m-wide octave hides the repetition further out
  vec3 gv2 = texture2D(tGravel, p*0.061).rgb;
  float gm2 = clamp(gv2.b*gv2.b/0.165, 0.7, 1.35);
  alb *= mix(1.0, gm, 1.0 - smoothstep(12.0, 55.0, dist)) * mix(1.0, gm2, 0.6*(1.0 - smoothstep(60.0, 260.0, dist)));
  vec2 dn = (gv.rg*2.0-1.0) * fade;
  // outcrop slabs where the HiRISE-derived mask says so (texture rotated 0.7 rad like in Blender)
  float mask = smoothstep(0.05, 0.45, texture2D(tMask, uv).r) * fade;
  const float cs = 0.7648, sn = 0.6442;
  vec3 sl = texture2D(tSlab, vec2(cs*p.x - sn*p.y, sn*p.x + cs*p.y)*0.5).rgb;
  vec3 slabCol = mix(vec3(0.31,0.207,0.12), vec3(0.698,0.537,0.34), smoothstep(0.06, 0.34, sl.b*sl.b));
  vec2 sN = (sl.rg*2.0-1.0) * 2.2;
  vec2 sNw = vec2(cs*sN.x + sn*sN.y, -sn*sN.x + cs*sN.y);
  alb = mix(alb, slabCol, mask);
  dn = mix(dn, sNw, mask);
  vec3 nd = normalize(n + vec3(dn.x, 0.0, -dn.y));

  float sun = texture2D(tShadow, uv).r;
  vec3 col = shade(alb, nd, ao, sun * castShadow(vW)) + lamp(alb, nd, toFrag);
  if(uLayer > 0.5){
    vec3 lay = vec3(0.0); float a = 0.0;
    if(uLayer < 1.5){            // slope hazard (from the 1 m DEM)
      float hatch = step(0.5, fract((vW.x + vW.z)/3.0));
      if(slope > ${SLOPE_NO_GO}){ lay = vec3(0.9,0.08,0.05); a = mix(0.35,0.7,hatch); }
      else if(slope > ${SLOPE_CAUTION}){ lay = vec3(0.95,0.6,0.1); a = 0.32; }
      else { lay = vec3(0.2,0.8,0.4); a = 0.10; }
    } else if(uLayer < 2.5){     // elevation bands + 5 m contours
      float t = clamp(vW.y/uRelief, 0.0, 1.0);
      lay = mix(vec3(0.1,0.3,0.9), vec3(0.2,0.85,0.5), smoothstep(0.0,0.35,t));
      lay = mix(lay, vec3(0.98,0.85,0.2), smoothstep(0.35,0.7,t));
      lay = mix(lay, vec3(0.9,0.2,0.1), smoothstep(0.7,1.0,t)); a = 0.42;
      float c = vW.y/5.0; float line = 1.0 - smoothstep(0.0, 1.5, abs(fract(c-0.5)-0.5)/fwidth(c));
      lay = mix(lay, vec3(1.0), line*0.8); a = max(a, line*0.75);
    } else if(uLayer < 3.5){     // rock abundance estimate (HiRISE brightness -> Golombek density factor)
      float d = clamp(0.08 + (g-0.25)/0.55*0.92, 0.08, 1.0);
      lay = mix(vec3(0.15,0.2,0.6), vec3(1.0,0.75,0.1), d); a = 0.5;
    } else {                     // science targets: light-toned outcrop
      lay = vec3(0.3,0.9,0.95); a = smoothstep(0.05,0.45,texture2D(tMask,uv).r)*0.5;
    }
    col = mix(col, lay*(0.35 + dot(col, vec3(0.6))), a);
  }
  gl_FragColor = vec4(applyFog(col, toFrag), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const RING_VERT = /* glsl */`
varying vec3 vW; varying vec3 vN;
void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * wp; }
`;
export const RING_FRAG = /* glsl */`
${COMMON}
uniform sampler2D tRing; uniform float uRingSize;
varying vec3 vW; varying vec3 vN;
vec3 ramp(float g){
  vec3 c0=vec3(0.068,0.042,0.021), c1=vec3(0.228,0.143,0.072), c2=vec3(0.468,0.298,0.152), c3=vec3(0.705,0.479,0.262), c4=vec3(0.845,0.633,0.372);   // hues measured on Perseverance Mastcam-Z frames, sol 1217 (see README, Colour)
  if(g<0.35) return mix(c0,c1,g/0.35);
  if(g<0.60) return mix(c1,c2,(g-0.35)/0.25);
  if(g<0.82) return mix(c2,c3,(g-0.60)/0.22);
  return mix(c3,c4,(g-0.82)/0.18);
}
void main(){
  float g = texture2D(tRing, vec2(vW.x/uRingSize + 0.5, 0.5 - vW.z/uRingSize)).r;
  vec3 col = shade(ramp(g), normalize(vN), 1.0, 1.0);
  gl_FragColor = vec4(applyFog(col, vW - cameraPosition), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const ROCK_VERT = /* glsl */`
uniform sampler2D tShadow; uniform vec2 uSize; uniform float uRockH; uniform vec3 uRockR;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vH; varying float vSun;
void main(){
  #ifdef USE_INSTANCING
    mat4 m = modelMatrix * instanceMatrix;
  #else
    mat4 m = modelMatrix;
  #endif
  vec3 o = m[3].xyz;
  // rocks grow in over the last 20 % of their class draw radius instead of popping
  float D = length(m[0].xyz);
  float R = D < 0.1 ? uRockR.x : (D < 0.3 ? uRockR.y : (D < 1.0 ? uRockR.z : 1.0e6));
  float k = 1.0 - smoothstep(R*0.8, R, distance(o, cameraPosition));
  vec4 wp = m * vec4(position * k, 1.0);
  vW = wp.xyz; vN = normalize(mat3(m) * normal); vUv = uv; vH = position.y / uRockH;
  vSun = texture2D(tShadow, vec2(o.x/uSize.x + 0.5, 0.5 - o.z/uSize.y)).r;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const ROCK_FRAG = /* glsl */`
${COMMON}
uniform sampler2D tMap;
#ifdef HERO
uniform sampler2D tNao;
#endif
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vH; varying float vSun;
void main(){
  vec3 n = normalize(vN);
  vec3 c = texture2D(tMap, vUv).rgb;
  float ao = mix(0.5, 1.0, smoothstep(0.0, 0.3, vH));
  #ifdef HERO
    vec3 nao = texture2D(tNao, vUv).rgb;
    vec3 mapN = vec3(nao.rg*2.0-1.0, 0.0); mapN.z = sqrt(max(1.0 - dot(mapN.xy, mapN.xy), 0.0));
    vec3 q0 = dFdx(vW), q1 = dFdy(vW); vec2 st0 = dFdx(vUv), st1 = dFdy(vUv);
    vec3 q1p = cross(q1, n), q0p = cross(n, q0);
    vec3 T = q1p*st0.x + q0p*st1.x, B = q1p*st0.y + q0p*st1.y;
    float det = max(dot(T,T), dot(B,B)); float sc = det == 0.0 ? 0.0 : inversesqrt(det);
    n = normalize(T*(mapN.x*sc) + B*(mapN.y*sc) + n*mapN.z);
    ao *= clamp(1.0 - (1.0 - nao.b)*1.5, 0.3, 1.0);
  #else
    // same Mars tint as the Blender rock materials, plus a dust coat on upward faces
    c = mix(c, dot(c, vec3(0.2126,0.7152,0.0722)) * vec3(1.45,0.98,0.57), 0.8) * 1.5;   // Earth rock scans pulled to the tan measured on Mastcam-Z frames (rocks there are as pale as the soil or paler)
    c = mix(c, vec3(0.43,0.29,0.167), 0.35*smoothstep(0.45, 1.0, n.y));
  #endif
  vec3 col = shade(c, n, ao, vSun * castShadow(vW)) + lamp(c, n, vW - cameraPosition);
  gl_FragColor = vec4(applyFog(col, vW - cameraPosition), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const BLOB_VERT = /* glsl */`
uniform sampler2D tShadow; uniform vec2 uSize;
varying vec2 vUv; varying float vA;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vec3 o = m[3].xyz;
  float sun = texture2D(tShadow, vec2(o.x/uSize.x + 0.5, 0.5 - o.z/uSize.y)).r;
  vA = sun * (1.0 - smoothstep(60.0, 90.0, distance(wp.xyz, cameraPosition)));
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const BLOB_FRAG = /* glsl */`
uniform float uBlob;
varying vec2 vUv; varying float vA;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.25, 1.0, r)) * uBlob * vA;
  gl_FragColor = vec4(0.03, 0.012, 0.006, a);
}
`;

export const SKY_VERT = /* glsl */`
varying vec3 vD;
void main(){ vD = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }
`;
export const SKY_FRAG = /* glsl */`
${COMMON}
uniform float uSunDisc, uSunCos, uStars;
varying vec3 vD;
void main(){
  vec3 d = normalize(vD);
  vec3 c = skyColor(vec3(d.x, max(d.y, 0.0), d.z));
  c += uSunColor * uSunDisc * smoothstep(uSunCos, mix(uSunCos, 1.0, 0.5), dot(d, uSunDir));
  if(uStars > 0.0){
    vec3 q = floor(d*220.0); float h = fract(sin(dot(q, vec3(12.9898,78.233,37.719)))*43758.5453);
    c += vec3(0.9,0.92,1.0) * step(0.9975, h) * (0.3 + 0.7*fract(h*91.7)) * uStars * 0.25 * smoothstep(0.0, 0.15, d.y);
  }
  float path = min(1300.0 / max(d.y, 0.02), 7000.0);
  c = mix(c, uInscatter, 1.0 - exp(-uFogK * path));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const SUIT_VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
uniform sampler2D tShadow; uniform vec2 uSize;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vSun; varying vec3 vRest;
void main(){
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * objectNormal); vUv = uv; vRest = position;
  vSun = texture2D(tShadow, vec2(wp.x/uSize.x + 0.5, 0.5 - wp.z/uSize.y)).r;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const SUIT_FRAG = /* glsl */`
${COMMON}
uniform sampler2D tMap, tAccent; uniform vec3 uPlayer; uniform float uSuitDust;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vSun; varying vec3 vRest;
void main(){
  vec3 c = texture2D(tMap, vUv).rgb;
  float k = texture2D(tAccent, vUv).r;
  c = mix(c, uPlayer * (0.35 + 0.95*dot(c, vec3(0.2126,0.7152,0.0722))), k);
  // regolith clinging to boots and shins: strongest at the sole, gone by the knee (rest-pose height, metres)
  float dn = 0.55 + 0.45*sin(vRest.x*83.0 + sin(vRest.z*61.0)*2.0)*sin(vRest.y*97.0 + vRest.z*45.0);
  float dust = (1.0 - smoothstep(0.02, 0.50, vRest.y)) * uSuitDust * mix(0.75, 1.0, dn);
  c = mix(c, vec3(0.317, 0.212, 0.121), clamp(dust, 0.0, 0.9));
  vec3 n = normalize(vN);
  vec3 col = shade(c, n, 1.0, vSun) + lamp(c, n, vW - cameraPosition);
  gl_FragColor = vec4(applyFog(col, vW - cameraPosition), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const ARM_VERT = /* glsl */`
#include <common>
#include <color_pars_vertex>
#include <skinning_pars_vertex>
uniform sampler2D tShadow; uniform vec2 uSize;
varying vec3 vW; varying vec3 vN; varying vec3 vP; varying float vAccent; varying float vClass; varying float vSun;
void main(){
  #include <color_vertex>
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * objectNormal); vP = position; vAccent = uv.x; vClass = 1.0 - uv.y;   // glTF flips v
  vSun = texture2D(tShadow, vec2(wp.x/uSize.x + 0.5, 0.5 - wp.z/uSize.y)).r;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const ARM_FRAG = /* glsl */`
${COMMON}
#include <color_pars_fragment>
uniform vec3 uPlayer;
varying vec3 vW; varying vec3 vN; varying vec3 vP; varying float vAccent; varying float vClass; varying float vSun;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z);
}
void main(){
  vec3 c = vColor.rgb;
  // colours and dirt measured from the Z-2 suit texture: off-white cloth with soft soot smudges, dark gloves
  float n1 = vnoise(vP*13.0), n2 = vnoise(vP*41.0), n3 = vnoise(vP*5.0 + 3.1);
  if(vClass > 0.75){
    float soot = smoothstep(0.50, 0.80, n1*0.7 + n2*0.3);
    c = mix(c, vec3(0.035, 0.022, 0.014), soot*0.85);
    c = mix(c, vec3(0.27, 0.18, 0.105), 0.30*smoothstep(0.35, 0.75, n3));
    c *= 0.88 + 0.24*n2;
  } else if(vClass > 0.25){
    c *= 0.55 + 1.1*n1;
    c = mix(c, vec3(0.20, 0.13, 0.076), 0.35*smoothstep(0.4, 0.8, n3));
  }
  if(vClass > 0.25){ float weave = sin(vP.x*2600.0)*sin(vP.z*2600.0 + vP.y*900.0); c *= 1.0 + 0.08*weave; }
  c = mix(c, uPlayer*0.85, step(0.5, vAccent));
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 col = shade(c, n, 1.0, vSun) + lamp(c, n, vW - cameraPosition);
  gl_FragColor = vec4(applyFog(col, vW - cameraPosition), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Rigid props (tools, cases, habitat): flat vertex colours, shared lighting. Double-sided so mirrored (right-hand) copies shade correctly.
export const PROP_VERT = /* glsl */`
#include <common>
#include <color_pars_vertex>
uniform sampler2D tShadow; uniform vec2 uSize;
varying vec3 vW; varying vec3 vN; varying float vSun; varying vec3 vP;
void main(){
  #include <color_vertex>
  vP = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vSun = texture2D(tShadow, vec2(wp.x/uSize.x + 0.5, 0.5 - wp.z/uSize.y)).r;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const PROP_FRAG = /* glsl */`
${COMMON}
#include <color_pars_fragment>
uniform float uSuitDust;
varying vec3 vW; varying vec3 vN; varying float vSun; varying vec3 vP;
float ph(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float pn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(ph(i), ph(i+vec3(1,0,0)), f.x), mix(ph(i+vec3(0,1,0)), ph(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(ph(i+vec3(0,0,1)), ph(i+vec3(1,0,1)), f.x), mix(ph(i+vec3(0,1,1)), ph(i+vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  vec3 c = vColor.rgb;
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  float kind = vColor.a;   // vertex alpha: 1 = hardware, 0.5 = rock sample, 0 = loose soil
  if(kind > 0.55 && kind < 0.70){ vec3 wd = normalize(vW - cameraPosition);
    // 0.62 = a window you look through (hatch); 0.58 = a porthole seen from outside: dark glass that mirrors the sky and ground
    gl_FragColor = vec4(kind < 0.60 ? windowView(reflect(wd, n * sign(-dot(n, wd))), n) * vec3(0.17, 0.21, 0.25) + vec3(0.010, 0.012, 0.014) : windowView(wd, n), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return; }
  if(kind < 0.25){         // soil: grains and small clods, bumped normal
    float g1 = pn(vP*900.0), g2 = pn(vP*2600.0), g3 = pn(vP*240.0);
    c *= 0.62 + 0.55*g1 + 0.35*g2; c = mix(c, c*vec3(1.35, 1.2, 1.05), smoothstep(0.62, 0.8, g2)*0.6); c *= 0.8 + 0.4*g3;
    n = normalize(n + (vec3(pn(vP*1500.0), pn(vP*1500.0 + 7.0), pn(vP*1500.0 + 13.0)) - 0.5) * 0.9);
  } else if(kind < 0.75){  // rock chips: mottled red mudstone, pale veins, dark specks (after the Cheyava Falls rock)
    float m = pn(vP*320.0), v = abs(pn(vP*190.0 + 3.0) - 0.5), sp = pn(vP*1400.0);
    c *= 0.7 + 0.6*m; c = mix(c, vec3(0.62, 0.55, 0.47), smoothstep(0.035, 0.012, v)*0.85); c = mix(c, vec3(0.05, 0.035, 0.03), smoothstep(0.86, 0.93, sp)*0.8);
    n = normalize(n + (vec3(pn(vP*800.0), pn(vP*800.0 + 7.0), pn(vP*800.0 + 13.0)) - 0.5) * 0.45);
  } else
  c = mix(c, vec3(0.317, 0.212, 0.121), 0.18 * uSuitDust * (0.6 + 0.4*n.y));   // a light film of dust, more on upward faces
  vec3 v = normalize(cameraPosition - vW), hv = normalize(v + uSunDir);
  float sunV = vSun * castShadow(vW);
  vec3 col = shade(c, n, 1.0, sunV) + lamp(c, n, vW - cameraPosition) + uSunColor * sunV * 0.06 * pow(max(dot(n, hv), 0.0), 40.0);
  gl_FragColor = vec4(applyFog(col, vW - cameraPosition), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Habitat shell: the NASA HDU texture with shared lighting and a dust skirt near the ground.
export const HAB_VERT = /* glsl */`
uniform sampler2D tShadow; uniform vec2 uSize;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vSun; varying float vH;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vH = position.y;
  vSun = texture2D(tShadow, vec2(wp.x/uSize.x + 0.5, 0.5 - wp.z/uSize.y)).r;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const HAB_FRAG = /* glsl */`
${COMMON}
uniform sampler2D tMap; uniform float uSuitDust;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vSun; varying float vH;
void main(){
  vec3 c = texture2D(tMap, vUv).rgb;
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  c = mix(c, vec3(0.317, 0.212, 0.121), uSuitDust * (0.12 + 0.45 * (1.0 - smoothstep(0.3, 2.2, vH))));   // dust settles and splashes up low on the shell
  vec3 col = shade(c, n, 1.0, vSun) + lamp(c, n, vW - cameraPosition);
  gl_FragColor = vec4(applyFog(col, vW - cameraPosition), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Habitat interior. The room itself is lit by a baked lightmap (real lamp light, bounce light and soft shadows, computed once
// in Blender); furniture uses a matching computed shade. Vertex alpha: below 0.5 = glowing panel or screen, 0.55-0.7 = window.
const INTERIOR_COMMON = /* glsl */`
uniform float uInterior; uniform float uTime;
float ih(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
// Light volume: the cabin's real light (lamps, bounce, shadows of walls and furniture) baked on a 15 cm grid, six directions
// per point (interior_lightvolume.png). Anything standing in the cabin reads its light from here by position and facing, so
// furniture - and anything that moves - is lit like the room around it. pH, nH = position and normal in habitat space.
uniform sampler2D tVol;
vec3 volTex(vec3 g, float d){
  float k0 = clamp(floor(g.z), 0.0, 15.0), k1 = min(k0 + 1.0, 15.0), f = clamp(g.z - k0, 0.0, 1.0);
  vec2 xy = vec2(clamp(g.x, 0.0, 64.0) + 0.5, clamp(g.y, 0.0, 32.0) + 0.5); float v = (d*33.0 + xy.y) / 198.0;
  return mix(texture2D(tVol, vec2((k0*65.0 + xy.x) / 1040.0, v)).rgb, texture2D(tVol, vec2((k1*65.0 + xy.x) / 1040.0, v)).rgb, f);
}
vec3 volLight(vec3 pH, vec3 nH){
  vec3 pb = vec3(pH.x, -pH.z, pH.y), nb = vec3(nH.x, -nH.z, nH.y), w = nb*nb;          // to the bake's axes (z up)
  vec3 g = (pb + nb*0.07 - vec3(-2.4, -2.4, 1.10)) / 0.15;
  vec3 L = w.x*volTex(g, nb.x > 0.0 ? 0.0 : 1.0) + w.y*volTex(g, nb.y > 0.0 ? 2.0 : 3.0) + w.z*volTex(g, nb.z > 0.0 ? 4.0 : 5.0);
  return pow(L, vec3(2.2)) * 2.0;
}
vec3 furnLight(vec3 c, vec3 nH, vec3 pH, vec3 p){
  return c * uInterior * volLight(pH, nH) * (0.96 + 0.08*ih(floor(p*300.0)));
}
// What a pane of glass adds on top of whatever is behind it: the room mirrored in it (dark floor, bright ceiling, stronger at
// grazing angles) and soft light bands that slide across the pane as the viewer moves. v = direction from the eye to the point.
vec3 glassSheen(vec3 n, vec3 v, vec3 p){
  vec3 r = reflect(v, n); float fr = 0.05 + 0.95*pow(1.0 - abs(dot(n, v)), 4.0);
  vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-4, 0.0, 2e-4)); float s = dot(p, t), d = s*2.2 + p.y*1.3;
  float streak = smoothstep(0.72, 1.0, sin(d*3.0 + dot(v, t)*5.0 + v.y*3.0))*0.26 + smoothstep(0.94, 1.0, sin(d*7.0 + dot(v, t)*9.0 + 1.7))*0.45;
  vec3 room = mix(vec3(0.10, 0.11, 0.12), vec3(0.75, 0.72, 0.66), smoothstep(-0.4, 0.8, r.y));
  return uInterior * (room * fr * 0.55 + vec3(1.0, 0.97, 0.90) * streak * (0.05 + 0.25*fr));
}
`;
export const INTERIOR_VERT = /* glsl */`
#include <color_pars_vertex>
uniform mat4 uHabInv;
varying vec3 vW; varying vec3 vN; varying vec3 vP; varying vec2 vUv; varying vec3 vH; varying vec3 vNH;
void main(){
  #include <color_vertex>
  vP = position; vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vH = (uHabInv * wp).xyz; vNH = mat3(uHabInv) * vN;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const INTERIOR_FRAG = /* glsl */`
${COMMON}
${INTERIOR_COMMON}
#include <color_pars_fragment>
uniform float uRoom; uniform sampler2D tLM;
varying vec3 vW; varying vec3 vN; varying vec3 vP; varying vec2 vUv; varying vec3 vH; varying vec3 vNH;
void main(){
  vec3 c = vColor.rgb; vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); vec3 v = normalize(vW - cameraPosition); vec3 col;
  if(vColor.a < 0.5){                                                                                                    // light panels and small indicator lights
    float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); vec3 cellp = floor(vP*3.0);
    float blink = mix(1.0, 0.35 + 0.65*step(0.0, sin(uTime*(1.2 + 3.0*ih(cellp)) + 6.28*ih(cellp + 5.0))), step(0.3, sat)*step(0.6, ih(cellp + 9.0)));   // some coloured ones blink
    col = c * 1.45 * uInterior * blink; }
  else if(vColor.a < 0.70){                                                                                               // porthole: the view outside through a thick pane
    float rr = length(vec2(vP.x, vP.y - 2.25)) / 0.145;
    col = windowView(v, n) * (1.0 - 0.6*smoothstep(0.70, 1.0, rr));
    vec2 rd = vec2(vP.x * sign(-vP.z), vP.y - 2.25) / (0.145 * max(rr, 0.01));
    float cres = smoothstep(0.50, 0.72, rr) * smoothstep(0.98, 0.80, rr) * max(0.0, dot(rd, normalize(vec2(-0.55, 0.83)) + 0.25 * v.xy));   // bright crescent where the pane's bevel catches the ceiling lights
    col += vec3(0.45, 0.30, 0.20) * 0.10 * smoothstep(0.45, 1.0, rr) * ih(floor(vP*500.0)) + glassSheen(n, v, vP) * 0.8 + vec3(1.0, 0.97, 0.9) * 0.22 * cres * uInterior; }
  else if(uRoom > 0.5){
    vec3 lm = pow(texture2D(tLM, vUv).rgb, vec3(2.2)) * 2.0;                                                              // baked lamp light + bounce + soft shadows
    float studs = n.y > 0.6 ? 0.92 + 0.08*step(0.5, fract(vP.x*9.0))*step(0.5, fract(vP.z*9.0)) : 1.0;
    float grain = 0.95 + 0.10*ih(floor(vP*240.0)), brushed = 0.97 + 0.03*sin(vP.y*900.0 + ih(floor(vP*40.0))*6.0);
    col = c * lm * uInterior * studs * grain * brushed;
    col += vec3(0.9, 0.85, 0.75) * 0.05 * lm * pow(max(dot(reflect(v, n), vec3(0.0, 1.0, 0.0)), 0.0), 12.0);               // faint sheen from the ceiling lights
  } else {
    vec3 nh = normalize(vNH) * (gl_FrontFacing ? 1.0 : -1.0);
    col = furnLight(c, nh, vH, vP) + vec3(0.9, 0.85, 0.75) * 0.04 * uInterior * pow(max(dot(reflect(v, n), vec3(0.0, 1.0, 0.0)), 0.0), 12.0);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export const INTERIOR_TEX_VERT = /* glsl */`
uniform mat4 uHabInv;
varying vec3 vN; varying vec2 vUv; varying vec3 vP; varying vec3 vH; varying vec3 vNH;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vP = position; vH = (uHabInv * wp).xyz; vNH = mat3(uHabInv) * vN; gl_Position = projectionMatrix * viewMatrix * wp; }
`;
export const INTERIOR_TEX_FRAG = /* glsl */`
${INTERIOR_COMMON}
uniform sampler2D tMap;
varying vec3 vN; varying vec2 vUv; varying vec3 vP; varying vec3 vH; varying vec3 vNH;
void main(){
  vec3 nh = normalize(vNH) * (gl_FrontFacing ? 1.0 : -1.0);
  gl_FragColor = vec4(furnLight(texture2D(tMap, vUv).rgb, nh, vH, vP), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// A see-through pane (the sample glovebox window): only what the glass itself adds, blended over whatever is behind it.
export const GLASS_FRAG = /* glsl */`
${INTERIOR_COMMON}
varying vec3 vW; varying vec3 vN; varying vec3 vP;
void main(){
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0), v = normalize(vW - cameraPosition);
  float a = 0.10 + 0.25*pow(1.0 - abs(dot(n, v)), 3.0);
  gl_FragColor = vec4(glassSheen(n, v, vP) * 1.3 + vec3(0.05, 0.09, 0.10) * a * uInterior, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
