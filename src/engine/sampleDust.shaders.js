// GLSL for the dust kicked up when sampling (sampleDust.js, #50).
//   PUFF_*: one burst of soil from the scoop. In the thin Martian air the grains fly almost ballistically: many tiny
//           irregular grains in low hops and a few clods that drop fast, under 3.71 m/s2, gone within a second; and a
//           low, flat, ragged cloud of fine dust that rolls out along the ground and lingers a little longer. Never round
//           balls. Lit like the ground and the haze, tone mapped like the scene.
//   MARK_*: the scrape the scoop leaves in the soil, drawn like the boot prints: it multiplies the ground colour
//           (2 x mark x ground, so 0.5 leaves it unchanged), a darker scooped hollow with a lighter lip of pushed soil.
export const PUFF_VERT = /* glsl */`
attribute vec4 aSeed;                  // x: direction, y: lift, z: speed, w: kind (grain < 0.78 < clod < 0.86 < fine dust)
uniform vec3 uOrigin;
uniform float uT, uGround, uPointScale, uGravity;
varying float vAlpha; varying float vKind; varying float vSeed; varying float vFlat;
void main(){
  float clod = step(0.78, aSeed.w) * (1.0 - step(0.86, aSeed.w)), fine = step(0.86, aSeed.w);
  float ang = aSeed.x * 6.2832;
  vec3 dir = vec3(cos(ang), 0.0, sin(ang));
  // a scoop pushes soil gently: grains hop low (5 to 20 cm), clods barely rise, fine dust rolls out along the ground
  float out_ = mix(mix(0.2 + 0.7 * aSeed.z, 0.15 + 0.3 * aSeed.z, clod), 0.25 + 0.35 * aSeed.z, fine);
  float up = mix(mix(0.4 + 1.1 * aSeed.y, 0.3 + 0.4 * aSeed.y, clod), 0.06 + 0.12 * aSeed.y, fine);
  float t = fine > 0.5 ? 1.6 * (1.0 - exp(-uT / 1.6)) : uT;             // fine dust slows down in the air
  vec3 p = uOrigin + dir * out_ * t + vec3(0.0, up * t, 0.0);
  p.y -= 0.5 * uGravity * uT * uT * (1.0 - fine);                       // grains and clods fall ballistically; fine dust hangs low
  p.y = max(p.y, uGround);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float size = fine > 0.5 ? 0.12 + 0.18 * aSeed.z + 0.25 * uT               // the fine-dust cloud spreads as it drifts
             : clod > 0.5 ? 0.009 + 0.008 * aSeed.z : 0.0025 + 0.0035 * aSeed.z;   // metres: grains of 2.5 to 6 mm
  gl_PointSize = clamp(size * uPointScale / max(-mv.z, 0.05), 1.0, 160.0);
  float life = fine > 0.5 ? 2.6 : clod > 0.5 ? 0.8 : 1.0;
  float onGround = step(p.y, uGround + 0.002) * (1.0 - fine);           // landed grains vanish into the soil
  vAlpha = (1.0 - smoothstep(life * 0.45, life, uT)) * mix(1.0, 0.25, fine) * (1.0 - 0.8 * onGround);
  vKind = clod + 2.0 * fine; vSeed = aSeed.y; vFlat = fine;
  gl_Position = projectionMatrix * mv;
}
`;
export const PUFF_FRAG = /* glsl */`
uniform vec3 uSunColor, uAmbSky, uInscatter;
varying float vAlpha; varying float vKind; varying float vSeed; varying float vFlat;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  vec2 q = gl_PointCoord - 0.5;
  vec3 soil = vec3(0.34, 0.23, 0.14) * (0.75 + 0.5 * vSeed);           // regolith albedo, a little different per grain
  vec3 lit = soil * (uSunColor * 0.7 + uAmbSky);
  float a;
  if(vKind > 1.5){                                                       // fine dust: a flat, ragged cloud hugging the ground
    q.y *= 2.2;
    float r = length(q) * 2.0 + 0.45 * (n(q * 6.0 + vSeed * 13.0) - 0.5);
    a = (1.0 - smoothstep(0.2, 1.0, r)) * (0.5 + 0.5 * n(q * 3.0 + vSeed * 7.0));
    lit = mix(lit, uInscatter * 1.05, 0.45);
  } else {                                                               // grains and clods: small, irregular, not round
    float r = length(q) * 2.0 + 0.55 * (n(q * 4.0 + vSeed * 31.0) - 0.5);
    if(r > 0.9) discard;
    a = 1.0;
    lit *= 0.85 + 0.3 * (0.5 - q.y);                                     // lit from above
  }
  gl_FragColor = vec4(lit, vAlpha * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const MARK_VERT = /* glsl */`
varying vec2 vP; varying vec3 vW;
void main(){
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vP = vec2(position.x / 0.09, -position.z / 0.15);                    // -1..1 across and along the scrape
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
export const MARK_FRAG = /* glsl */`
uniform float uFogK;
varying vec2 vP; varying vec3 vW;
void main(){
  float d = length(vP * vec2(1.0, 0.85)) - 0.8;                        // an oval hollow
  if(d > 0.35) discard;
  float inside = 1.0 - smoothstep(-0.06, 0.02, d);
  float lip = smoothstep(0.0, 0.12, d) * (1.0 - smoothstep(0.12, 0.35, d)) * smoothstep(-0.2, 0.6, vP.y);   // soil pushed to the far end
  float k = mix(1.0, 0.8 + 0.06 * smoothstep(-0.8, 0.0, d), inside) * (1.0 + 0.1 * lip);
  float dist = distance(vW, cameraPosition);
  k = mix(1.0, k, (1.0 - smoothstep(25.0, 40.0, dist)) * exp(-uFogK * dist * 2.0));
  gl_FragColor = vec4(vec3(0.5 * k), 1.0);
}
`;
