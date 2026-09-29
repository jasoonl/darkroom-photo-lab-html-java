/* Darkroom engine: WebGL2 develop pipeline, crop, frames, date stamps, export.
   Everything runs locally in the browser. Exposes window.Darkroom. */
(function () {
  'use strict';
  const D = (window.Darkroom = window.Darkroom || {});
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
  D.BANDS = BANDS;

  /* ------------------------------------------------------------------ */
  /* Parameter model                                                     */
  /* ------------------------------------------------------------------ */
  const ID = () => [[0, 0], [255, 255]];
  function defaults() {
    return {
      temp: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
      texture: 0, clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
      hue: [0, 0, 0, 0, 0, 0, 0, 0], hsat: [0, 0, 0, 0, 0, 0, 0, 0], hlum: [0, 0, 0, 0, 0, 0, 0, 0],
      bw: [0, 0, 0, 0, 0, 0, 0, 0], mono: 0,
      gsh: [220, 0, 0], gmi: [40, 0, 0], ghi: [45, 0, 0], ggl: [40, 0, 0], gblend: 50, gbal: 0,
      calSh: 0, calR: [0, 0], calG: [0, 0], calB: [0, 0],
      crgb: ID(), cr: ID(), cg: ID(), cb: ID(), pc: [0, 0, 0, 0], fade: 0,
      sharpen: 0, nr: 0,
      vignette: 0, vigMid: 50, vigRound: 0, vigFeather: 50,
      grain: 0, grainSize: 25, grainRough: 50, grainColor: 0,
      halation: 0, bloom: 0, diffusion: 0,
      leak: 0, leakHue: 28, leakPos: 8,
      dust: 0, ca: 0, warp: 0, scanlines: 0, tracking: 0, bleed: 0
    };
  }
  D.defaults = defaults;
  D.defaultCrop = () => ({ aspect: 'orig', angle: 0, rot: 0, flipH: false, flipV: false, zoom: 1, x: 0, y: 0 });
  D.defaultFrame = () => ({ type: 'none', size: 5, color: '#ffffff', radius: 4, texture: 0, caption: '', font: 'hand', edge: 'DARKROOM 400', keyline: false });
  D.defaultStamp = () => ({ on: false, style: 'film', color: '#ff7a1a', date: '', fmt: 'yy m d', pos: 'br', size: 100 });
  D.newEdit = () => ({ look: null, amount: 100, p: defaults(), crop: D.defaultCrop(), frame: D.defaultFrame(), stamp: D.defaultStamp(), fxApplied: null, frameFromLook: false, stampFromLook: false });

  // FX keys come from looks into the user's Effects sliders. Amount keys scale with the look amount.
  D.FX_KEYS = ['vignette', 'vigMid', 'vigRound', 'vigFeather', 'grain', 'grainSize', 'grainRough', 'grainColor', 'halation', 'bloom', 'diffusion', 'leak', 'leakHue', 'leakPos', 'dust', 'ca', 'warp', 'scanlines', 'tracking', 'bleed'];
  D.FX_AMOUNT = ['vignette', 'grain', 'halation', 'bloom', 'diffusion', 'leak', 'dust', 'ca', 'warp', 'scanlines', 'tracking', 'bleed'];
  const SHAPE = new Set(['vigMid', 'vigRound', 'vigFeather', 'grainSize', 'grainRough', 'grainColor', 'leakHue', 'leakPos', 'gblend', 'gbal']);

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  D.clone = clone;

  // Expand a compact look definition to a full parameter set.
  function expandLook(def) {
    const P = defaults();
    const p = def.p || {};
    for (const k in p) {
      if (k === 'hsl') {
        for (const b in p.hsl) { const i = BANDS.indexOf(b); const v = p.hsl[b]; P.hue[i] = v[0] || 0; P.hsat[i] = v[1] || 0; P.hlum[i] = v[2] || 0; }
      } else if (k === 'bwmix') {
        for (const b in p.bwmix) P.bw[BANDS.indexOf(b)] = p.bwmix[b];
      } else if (k === 'grade') {
        const g = p.grade; if (g.sh) P.gsh = g.sh.concat([0, 0, 0]).slice(0, 3); if (g.mi) P.gmi = g.mi.concat([0, 0, 0]).slice(0, 3); if (g.hi) P.ghi = g.hi.concat([0, 0, 0]).slice(0, 3); if (g.gl) P.ggl = g.gl.concat([0, 0, 0]).slice(0, 3);
        if (g.blend != null) P.gblend = g.blend; if (g.bal != null) P.gbal = g.bal;
      } else if (k === 'cal') {
        const c = p.cal; if (c.sh != null) P.calSh = c.sh; if (c.r) P.calR = c.r; if (c.g) P.calG = c.g; if (c.b) P.calB = c.b;
      } else if (k === 'curve') {
        const c = p.curve; if (c.rgb) P.crgb = c.rgb; if (c.r) P.cr = c.r; if (c.g) P.cg = c.g; if (c.b) P.cb = c.b;
      } else P[k] = clone(p[k]);
    }
    const fx = def.fx || {};
    for (const k in fx) P[k] = fx[k];
    return P;
  }
  D.expandLook = expandLook;

  // Scale a full parameter set toward neutral by amount a (0..1.5).
  function scaleParams(P, a) {
    const N = defaults(), O = {};
    for (const k in N) {
      const v = P[k], n = N[k];
      if (typeof n === 'number') O[k] = SHAPE.has(k) ? v : n + (v - n) * a;
      else if (k === 'crgb' || k === 'cr' || k === 'cg' || k === 'cb') O[k] = v.map(([x, y]) => [x, clamp(x + (y - x) * a, 0, 255)]);
      else if (k === 'gsh' || k === 'gmi' || k === 'ghi' || k === 'ggl') O[k] = [v[0], v[1] * a, v[2] * a];
      else if (Array.isArray(n)) O[k] = v.map((x) => x * a);
    }
    return O;
  }
  D.scaleParams = scaleParams;

  /* ------------------------------------------------------------------ */
  /* Curves                                                              */
  /* ------------------------------------------------------------------ */
  function monotone(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0]).map(([x, y]) => [x / 255, y / 255]);
    const n = p.length;
    if (n < 2) return (x) => x;
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(d[i]) < 1e-9) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return function (x) {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }
  D.monotone = monotone;
  const LUTN = 1024;
  function curveLUT(P) {
    const fm = monotone(P.crgb), fr = monotone(P.cr), fg = monotone(P.cg), fb = monotone(P.cb);
    const pc = P.pc || [0, 0, 0, 0], fade = (P.fade || 0) / 100;
    const out = new Float32Array(LUTN * 4);
    const centers = [0.875, 0.625, 0.375, 0.125];
    let prev = -1;
    for (let i = 0; i < LUTN; i++) {
      const x = i / (LUTN - 1);
      let y = fm(x);
      let add = 0;
      for (let k = 0; k < 4; k++) {
        if (!pc[k]) continue;
        const u = (y - centers[k]) / 0.32;
        if (Math.abs(u) < 1) add += (pc[k] / 100) * 0.13 * Math.pow(1 - u * u, 2) * Math.sqrt(Math.sin(Math.PI * clamp(y, 0, 1)));
      }
      y = clamp(y + add, 0, 1);
      if (fade) y = y + fade * 0.2 * Math.pow(1 - y, 1.7) - fade * 0.04 * Math.pow(y, 3);
      y = Math.max(y, prev); prev = y;
      out[i * 4 + 3] = clamp(y, 0, 1);
      out[i * 4 + 0] = clamp(fr(x), 0, 1);
      out[i * 4 + 1] = clamp(fg(x), 0, 1);
      out[i * 4 + 2] = clamp(fb(x), 0, 1);
    }
    return out;
  }
  D.curveLUT = curveLUT;

  /* ------------------------------------------------------------------ */
  /* Colour helpers (CPU)                                                */
  /* ------------------------------------------------------------------ */
  function hsv2rgb(h, s, v) {
    h = ((h % 360) + 360) % 360 / 60;
    const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  }
  D.hsv2rgb = hsv2rgb;
  const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  function gradeVec(w, k) {
    const c = hsv2rgb(w[0], 1, 1), l = luma(c), s = (w[1] || 0) / 100;
    return [(c[0] - l) * s * k, (c[1] - l) * s * k, (c[2] - l) * s * k];
  }
  function wbGains(temp, tint) {
    const t = temp / 100, m = tint / 100;
    let g = [1 + t * 0.2, 1 + t * 0.03 - m * 0.16, 1 - t * 0.26];
    g[0] *= 1 + m * 0.05; g[2] *= 1 + m * 0.05;
    const l = luma(g); return g.map((x) => x / l);
  }
  function calibMatrix(P) {
    const prim = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], baseH = [0, 120, 240], set = [P.calR, P.calG, P.calB];
    const cols = prim.map((e, i) => {
      const hs = (set[i][0] || 0) / 100 * 30, ss = 1 + (set[i][1] || 0) / 100 * 0.7;
      let c = hsv2rgb(baseH[i] + hs, 1, 1);
      const lc = luma(c); c = c.map((x) => lc + (x - lc) * ss);
      const k = luma(e) / Math.max(1e-4, luma(c)); return c.map((x) => x * k);
    });
    // M (column-major for GL): row r = [cols[0][r], cols[1][r], cols[2][r]]
    const rows = [0, 1, 2].map((r) => [cols[0][r], cols[1][r], cols[2][r]]);
    rows.forEach((row) => { const s = row[0] + row[1] + row[2]; for (let j = 0; j < 3; j++) row[j] /= s; });
    return new Float32Array([rows[0][0], rows[1][0], rows[2][0], rows[0][1], rows[1][1], rows[2][1], rows[0][2], rows[1][2], rows[2][2]]);
  }

  /* ------------------------------------------------------------------ */
  /* Crop geometry                                                       */
  /* ------------------------------------------------------------------ */
  function aspectOf(crop, W, H) {
    const r = ((crop.rot % 360) + 360) % 360, sw = r % 180 ? H : W, sh = r % 180 ? W : H;
    if (!crop.aspect || crop.aspect === 'orig') return sw / sh;
    const [a, b] = String(crop.aspect).split(':').map(Number);
    let A = a / b;
    // Aspect follows the photo's orientation for symmetric presets
    if (crop.aspectLock !== true && (sw < sh) !== (A < 1) && a !== b) A = 1 / A;
    return A;
  }
  // Returns {xf (mat3 column-major: out uv -> src uv), w, h (crop size in source px)}
  function cropGeometry(crop, W, H) {
    const r = ((crop.rot % 360) + 360) % 360, sw = r % 180 ? H : W, sh = r % 180 ? W : H;
    const A = aspectOf(crop, W, H), th = (crop.angle || 0) * Math.PI / 180, cs = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th));
    const hmax = Math.min(sw / (A * cs + sn), sh / (A * sn + cs));
    const h = hmax / Math.max(1, crop.zoom || 1), w = A * h;
    const slackX = Math.max(0, (sw - (w * cs + h * sn)) / 2), slackY = Math.max(0, (sh - (w * sn + h * cs)) / 2);
    const cx = sw / 2 + clamp(crop.x || 0, -1, 1) * slackX, cy = sh / 2 + clamp(crop.y || 0, -1, 1) * slackY;
    // o -> flipped o -> px in rotated frame
    const fx = crop.flipH ? -1 : 1, fy = crop.flipV ? -1 : 1;
    const c = Math.cos(th), s = Math.sin(th);
    // a = ((o - .5) * f) * (w,h); b = R a; p = b + center; u' = p / (sw, sh)
    // u'x = (c*w*fx*(ox-.5) - s*h*fy*(oy-.5) + cx)/sw
    // u'y = (s*w*fx*(ox-.5) + c*h*fy*(oy-.5) + cy)/sh
    const m = [
      [c * w * fx / sw, -s * h * fy / sw, (cx - 0.5 * c * w * fx + 0.5 * s * h * fy) / sw],
      [s * w * fx / sh, c * h * fy / sh, (cy - 0.5 * s * w * fx - 0.5 * c * h * fy) / sh]
    ];
    // rotated-frame uv -> source uv for clockwise rotation r
    let R;
    if (r === 90) R = [[0, 1, 0], [-1, 0, 1]];
    else if (r === 180) R = [[-1, 0, 1], [0, -1, 1]];
    else if (r === 270) R = [[0, -1, 1], [1, 0, 0]];
    else R = [[1, 0, 0], [0, 1, 0]];
    const mul = (Rr) => [Rr[0] * m[0][0] + Rr[1] * m[1][0], Rr[0] * m[0][1] + Rr[1] * m[1][1], Rr[0] * m[0][2] + Rr[1] * m[1][2] + Rr[2]];
    const ux = mul(R[0]), uy = mul(R[1]);
    return { xf: new Float32Array([ux[0], uy[0], 0, ux[1], uy[1], 0, ux[2], uy[2], 1]), w, h, A };
  }
  D.cropGeometry = cropGeometry;
  D.aspectOf = aspectOf;

  /* ------------------------------------------------------------------ */
  /* Shaders                                                             */
  /* ------------------------------------------------------------------ */
  const VS = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uSize; uniform vec2 uStep; uniform float uW[13];
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 acc = texture(uTex, uv) * uW[0];
  for (int i = 1; i < 13; i++) {
    vec2 d = uStep * float(i);
    acc += (texture(uTex, uv + d) + texture(uTex, uv - d)) * uW[i];
  }
  o = acc;
}`;

  const FS = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 fragColor;
uniform sampler2D uSrc, uB1, uB2, uB3, uLutL, uLutU;
uniform mat3 uXf;
uniform vec2 uOut; uniform vec4 uTile; uniform vec2 uVp;
uniform float uSrcLod, uPxLod, uSeed;
uniform int uBypass;
uniform vec3 uGain;
uniform float uHi, uSh, uWh, uBl, uTex, uClar, uDehaze, uSharp, uNR;
struct Stage {
  float on; float con; float vib; float sat; float mono;
  float hue[8]; float hs[8]; float hl[8]; float bw[8];
  vec3 gSh; vec3 gMi; vec3 gHi; vec3 gGl; vec4 gLum; float gBlend; float gBal;
  mat3 cal; float calSh;
};
uniform Stage uL, uU;
uniform vec4 uVig, uGrain; uniform vec3 uGlow, uLeak, uVHS; uniform float uDust, uCA, uWarp;

const float HC[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 225.0, 270.0, 315.0);
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 s2l(vec3 c){ c = max(c, 0.0); return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 l2s(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y); float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c){
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x), mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}
// Roll off a luminance push so it approaches, but never hits, white or black (film-like shoulder and toe).
float softPush(float p, float room){ room = max(room, 1e-4); float r = abs(p) / room; return p / pow(1.0 + r * r * r, 1.0 / 3.0); }
vec3 protectRange(vec3 cin, vec3 c){
  float Li = clamp(luma(cin), 0.0, 1.0), Lo = luma(c);
  float p = Lo - Li;
  float Lt = Li + (p > 0.0 ? softPush(p, 1.0 - Li) : softPush(p, Li));
  if (Lo > 1e-4) c *= Lt / Lo; else c = vec3(Lt);
  // gamut: pull chroma in toward luminance instead of clipping one channel
  float L = clamp(luma(c), 0.0, 1.0), mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float k = 1.0;
  if (mx > 0.985) k = min(k, (0.985 - L) / max(mx - L, 1e-4));
  if (mn < 0.004) k = min(k, (L - 0.004) / max(L - mn, 1e-4));
  return L + (c - L) * clamp(k, 0.0, 1.0);
}
vec3 screen(vec3 a, vec3 b){ return 1.0 - (1.0 - a) * (1.0 - clamp(b, 0.0, 1.0)); }
float lut1(sampler2D t, float x, int ch){
  vec4 v = texture(t, vec2(clamp(x, 0.0, 1.0) * (1023.0/1024.0) + 0.5/1024.0, 0.5));
  return ch == 0 ? v.r : ch == 1 ? v.g : ch == 2 ? v.b : v.a;
}
void hueW(float h, out float w[8]){
  for (int i = 0; i < 8; i++) w[i] = 0.0;
  for (int i = 0; i < 8; i++){
    int j = i == 7 ? 0 : i + 1;
    float a = HC[i]; float b = j == 0 ? 360.0 : HC[j];
    if (h >= a && h < b){ float t = (h - a) / (b - a); t = t * t * (3.0 - 2.0 * t); w[i] = 1.0 - t; w[j] = t; }
  }
}
vec3 stage(vec3 c, Stage P, sampler2D lut){
  if (P.on < 0.5) return c;
  vec3 cin = c;
  if (P.con != 0.0){
    float k = exp(P.con * 0.85);
    vec3 x = clamp(c, 0.0, 1.0);
    vec3 lo = 0.5 * pow(2.0 * x, vec3(k));
    vec3 hi = 1.0 - 0.5 * pow(max(2.0 - 2.0 * x, 0.0), vec3(k));
    c = mix(lo, hi, step(0.5, x)) + max(c - 1.0, 0.0);
  }
  vec3 hsv = rgb2hsv(max(c, 0.0));
  float w[8]; hueW(hsv.x * 360.0, w);
  float dh = 0.0, ds = 0.0, dl = 0.0, dbw = 0.0;
  for (int i = 0; i < 8; i++){ dh += w[i] * P.hue[i]; ds += w[i] * P.hs[i]; dl += w[i] * P.hl[i]; dbw += w[i] * P.bw[i]; }
  float smask = smoothstep(0.03, 0.25, hsv.y);
  if (abs(dh) + abs(ds) + abs(dl) > 0.0){
    hsv.x = fract(hsv.x + dh * (30.0 / 360.0) * smask);
    hsv.y = clamp(hsv.y * (1.0 + ds * smask), 0.0, 1.0);
    hsv.z *= 1.0 + dl * 0.45 * smask * hsv.y;
    c = hsv2rgb(hsv);
  }
  c = P.cal * c;
  float L = luma(c);
  if (P.calSh != 0.0){ float m = pow(1.0 - clamp(L, 0.0, 1.0), 2.0); c.g += P.calSh * 0.06 * m; c.rb -= P.calSh * 0.03 * m; }
  if (P.sat != 0.0) c = mix(vec3(L), c, 1.0 + P.sat);
  if (P.vib != 0.0){
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    float s = (mx - mn) / max(mx, 1e-4);
    float amt = P.vib > 0.0 ? P.vib * pow(1.0 - clamp(s, 0.0, 1.0), 1.5) * (1.0 - 0.5 * w[1]) : P.vib;
    c = mix(vec3(L), c, 1.0 + amt);
  }
  if (P.mono > 0.0){
    float g = L * (1.0 + dbw * 0.95 * smask * hsv.y);
    c = mix(c, vec3(max(g, 0.0)), clamp(P.mono, 0.0, 1.0));
  }
  {
    float x = clamp(luma(c), 0.0, 1.0);
    float p = clamp(0.5 - P.gBal * 0.3, 0.2, 0.8);
    float soft = mix(0.55, 1.05, P.gBlend);
    float shM = 1.0 - smoothstep(0.0, p * 2.0 * soft, x);
    float hiM = smoothstep(1.0 - (1.0 - p) * 2.0 * soft, 1.0, x);
    float dm = (x - p) / (0.2 + 0.22 * P.gBlend);
    float miM = exp(-dm * dm);
    c += P.gSh * shM + P.gMi * miM + P.gHi * hiM + P.gGl;
    c += (P.gLum.x * shM + P.gLum.y * miM + P.gLum.z * hiM + P.gLum.w) * 0.22;
  }
  c = clamp(protectRange(cin, c), 0.0, 1.0);
  c = vec3(lut1(lut, c.r, 3), lut1(lut, c.g, 3), lut1(lut, c.b, 3));
  c = vec3(lut1(lut, c.r, 0), lut1(lut, c.g, 1), lut1(lut, c.b, 2));
  return clamp(protectRange(cin, c), 0.0, 1.0);
}
// pre-stage tone on a gamma-encoded colour; detail terms passed in
vec3 tone(vec3 c, float dClar, float dTex, float dSharp, vec3 haze){
  float L = luma(c);
  float Ln = L;
  float hm = smoothstep(0.42, 1.0, L);
  Ln += uHi * 0.34 * hm * (uHi < 0.0 ? min(L, 1.8) : (1.0 - min(L, 1.0) * 0.55));
  float sm = 1.0 - smoothstep(0.0, 0.55, L);
  Ln += uSh * 0.26 * sm * (uSh > 0.0 ? (1.0 - L * 0.8) : L * 1.2);
  Ln += uWh * 0.16 * smoothstep(0.5, 1.05, L);
  Ln += uBl * 0.11 * (1.0 - smoothstep(0.0, 0.38, L));
  float mt = 1.0 - pow(abs(2.0 * clamp(L, 0.0, 1.0) - 1.0), 2.0);
  Ln += uClar * 0.9 * dClar * (0.35 + 0.65 * mt);
  Ln += uTex * 1.2 * dTex;
  Ln += uSharp * 1.5 * dSharp;
  float r = Ln / max(L, 1e-4);
  c = mix(c + (Ln - L), c * r, smoothstep(0.015, 0.12, L));
  if (uDehaze > 0.0){
    float A = min(haze.r, min(haze.g, haze.b));
    float t = uDehaze * 0.75 * A;
    c = (c - t) / max(1.0 - t, 0.1);
    float l2 = luma(c); c = mix(vec3(l2), c, 1.0 + uDehaze * 0.25);
  } else if (uDehaze < 0.0){
    c = mix(c, vec3(0.83, 0.85, 0.87), -uDehaze * 0.45 * (0.35 + 0.65 * (1.0 - clamp(L, 0.0, 1.0))));
  }
  return c;
}
vec3 develop(vec3 srgb, float dClar, float dTex, float dSharp, vec3 haze){
  vec3 c = l2s(s2l(srgb) * uGain);
  c = protectRange(srgb, tone(c, dClar, dTex, dSharp, haze));
  c = stage(c, uL, uLutL);
  c = stage(c, uU, uLutU);
  return c;
}
vec2 toSrc(vec2 o){ return (uXf * vec3(o, 1.0)).xy; }
void main(){
  vec2 f = gl_FragCoord.xy - uVp;
  vec2 opx = vec2(uTile.x + f.x, uTile.y + (uTile.w - f.y));
  vec2 o = opx / uOut;
  float ar = uOut.x / uOut.y;
  vec2 o0 = o;
  if (uBypass == 1){ fragColor = vec4(texture(uSrc, toSrc(o)).rgb, 1.0); return; }
  if (uVHS.y > 0.0){
    float band = vnoise(vec2(o.y * 7.0, uSeed * 3.1));
    float t = smoothstep(0.72, 0.95, band);
    o.x += (t * 0.022 + (hash12(vec2(floor(opx.y * 480.0 / uOut.y), uSeed)) - 0.5) * 0.003) * uVHS.y;
  }
  if (uWarp != 0.0){
    vec2 q = (o - 0.5) * vec2(ar, 1.0);
    float r2 = dot(q, q) / (0.25 * (ar * ar + 1.0));
    o = 0.5 + (o - 0.5) * (1.0 + uWarp * 0.3 * r2) / (1.0 + max(uWarp, 0.0) * 0.3);
  }
  vec2 s = toSrc(o);
  vec3 src;
  if (uCA > 0.0){
    vec2 dir = (o - 0.5) * uCA * 0.012;
    src = vec3(texture(uSrc, toSrc(o + dir)).r, texture(uSrc, s).g, texture(uSrc, toSrc(o - dir)).b);
  } else src = texture(uSrc, s).rgb;
  if (uVHS.z > 0.0){
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 6; i++) acc += texture(uSrc, toSrc(o - vec2(float(i) * 0.0022 * uVHS.z, 0.0))).rgb;
    acc /= 6.0;
    src = luma(src) + mix(src - luma(src), (acc - luma(acc)) * 1.1, clamp(uVHS.z * 1.2, 0.0, 1.0));
  }
  if (uNR > 0.0){
    vec3 cb = textureLod(uSrc, s, max(uPxLod, 0.0) + 1.8).rgb;
    src = src - (src - luma(src)) * uNR + (cb - luma(cb)) * uNR;
    float d = luma(src) - luma(cb);
    float edge = smoothstep(0.015, 0.07, abs(d));
    src -= d * (1.0 - edge) * uNR * 0.75;
  }
  float Ls = luma(src);
  vec3 b1 = texture(uB1, s).rgb, b2 = texture(uB2, s).rgb, b3 = texture(uB3, s).rgb;
  float dClar = Ls - luma(b2);
  float dTex = uTex != 0.0 ? Ls - luma(textureLod(uSrc, s, uSrcLod + 1.4).rgb) : 0.0;
  float dSharp = uSharp != 0.0 ? Ls - luma(textureLod(uSrc, s, max(uPxLod, 0.0) + 0.9).rgb) : 0.0;
  vec3 c = develop(src, dClar, dTex, dSharp, b3);
  // glow family
  if (uGlow.z > 0.0){
    vec3 dc = develop(b1, 0.0, 0.0, 0.0, b3);
    c = mix(c, screen(c, dc * 0.55), uGlow.z * 0.8);
  }
  if (uGlow.y > 0.0){
    vec3 bc = develop(b2, 0.0, 0.0, 0.0, b3);
    c = screen(c, bc * smoothstep(0.45, 1.0, luma(bc)) * uGlow.y * 0.9);
  }
  if (uGlow.x > 0.0){
    float glowM = smoothstep(0.6, 0.95, luma(b1)) * 0.55 + smoothstep(0.5, 0.9, luma(b2)) * 0.75;
    float own = smoothstep(0.78, 1.0, Ls);
    float hal = max(glowM - own * 0.5, 0.0) * uGlow.x;
    c = screen(c, vec3(1.0, 0.24, 0.07) * hal * 0.95);
  }
  // vignette
  if (uVig.x != 0.0){
    vec2 q = abs((o0 - 0.5) * 2.0);
    float rnd = uVig.z;
    float n = rnd < 0.0 ? 2.0 - rnd * 6.0 : 2.0;
    float dE = pow(pow(q.x, n) + pow(q.y, n), 1.0 / n) / pow(2.0, 1.0 / n);
    vec2 qc = q * vec2(ar, 1.0) / max(ar, 1.0);
    float dC = length(qc) / length(vec2(ar, 1.0) / max(ar, 1.0));
    float d = mix(dE, dC, max(rnd, 0.0));
    float st = 0.12 + uVig.y * 0.72, wd = 0.08 + uVig.w * 0.9;
    float v = smoothstep(st, st + wd, d);
    if (uVig.x < 0.0) c *= 1.0 - v * (-uVig.x) * 0.92;
    else c = mix(c, vec3(1.0), v * uVig.x * 0.9);
  }
  // light leak
  if (uLeak.x > 0.0){
    float ang = uLeak.z * 6.2831853;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 qa = (o0 - 0.5) * vec2(ar, 1.0);
    vec2 anc = dir * vec2(ar * 0.5, 0.5) * 1.05;
    vec2 perp = vec2(-dir.y, dir.x);
    vec2 dd = qa - anc;
    float along = dot(dd, perp), across = dot(dd, dir);
    float blob = exp(-dot(dd, dd) / 0.11);
    float streak = exp(-across * across / 0.03) * exp(-along * along / 0.45);
    vec2 d2 = qa - anc * 0.78 - perp * 0.22;
    float blob2 = exp(-dot(d2, d2) / 0.035);
    vec3 c1 = hsv2rgb(vec3(uLeak.y / 360.0, 0.92, 1.0));
    vec3 c2 = hsv2rgb(vec3(fract(uLeak.y / 360.0 - 0.06), 0.85, 1.0));
    float nz = 0.75 + 0.5 * vnoise(qa * 3.0 + uSeed * 7.0);
    vec3 lk = (c1 * (blob * 0.85 + streak * 0.55) + c2 * blob2 * 0.7) * uLeak.x * nz;
    c = screen(c, lk);
  }
  // dust and scratches
  if (uDust > 0.0){
    vec2 p = o0 * vec2(ar, 1.0) * 70.0;
    vec2 cell = floor(p), fr = fract(p);
    float h = hash12(cell + uSeed * 13.1);
    if (h < uDust * 0.09){
      vec2 ctr = vec2(hash12(cell + 3.7), hash12(cell + 9.1)) * 0.6 + 0.2;
      float rr = mix(0.035, 0.15, pow(hash12(cell + 1.3), 2.0));
      vec2 dv = (fr - ctr) * vec2(1.0, mix(0.4, 1.0, hash12(cell + 2.2)));
      float a = 1.0 - smoothstep(rr * 0.55, rr, length(dv));
      float bright = step(0.3, hash12(cell + 5.5));
      c = mix(c, vec3(mix(0.06, 0.96, bright)), a * 0.85);
    }
    float sx = o0.x * 260.0; float sc = floor(sx);
    if (hash12(vec2(sc, uSeed + 4.0)) < uDust * 0.02){
      float line = 1.0 - smoothstep(0.0, 0.07, abs(fract(sx) - 0.5));
      float gap = smoothstep(0.35, 0.65, vnoise(vec2(sc * 1.7, o0.y * 5.0 + uSeed)));
      c = mix(c, vec3(0.93), line * gap * 0.45);
    }
  }
  if (uVHS.x > 0.0){
    float sl = 0.5 + 0.5 * cos(o0.y * 3.14159265 * 2.0 * 240.0);
    c *= 1.0 - uVHS.x * 0.32 * sl;
  }
  // grain
  if (uGrain.x > 0.0){
    float lg = max(uOut.x, uOut.y);
    float fsz = 0.7 + uGrain.y * 3.3;
    vec2 gp = opx * (2400.0 / lg) / fsz + uSeed * 91.0;
    float n1 = vnoise(gp), n2 = vnoise(gp * 2.13 + 17.0);
    float n = mix(n1, n1 * 0.45 + n2 * 0.55, uGrain.z) - 0.5;
    vec3 ng = vec3(n);
    if (uGrain.w > 0.0){
      vec3 nc = vec3(vnoise(gp + 31.0), vnoise(gp + 57.0), vnoise(gp + 83.0)) - 0.5;
      ng = mix(ng, nc, uGrain.w * 0.7);
    }
    float L = clamp(luma(c), 0.0, 1.0);
    float wgt = 0.3 + 0.7 * (4.0 * L * (1.0 - L));
    c += ng * uGrain.x * 0.3 * wgt;
  }
  c += (hash12(gl_FragCoord.xy + uSeed * 17.0) - 0.5) / 255.0;
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

  /* ------------------------------------------------------------------ */
  /* Renderer                                                            */
  /* ------------------------------------------------------------------ */
  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
    return p;
  }
  function gaussW(sigma) {
    const w = []; let s = 0;
    for (let i = 0; i < 13; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); w.push(v); s += i ? 2 * v : v; }
    return new Float32Array(w.map((v) => v / s));
  }

  function createRenderer() {
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 8;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    const floatOK = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    const R = { canvas, gl, maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), srcW: 0, srcH: 0 };
    const prog = program(gl, FS), blurProg = program(gl, BLUR_FS);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = {}; const loc = (n) => (n in U ? U[n] : (U[n] = gl.getUniformLocation(prog, n)));
    const BU = {}; const bloc = (n) => (n in BU ? BU[n] : (BU[n] = gl.getUniformLocation(blurProg, n)));

    function tex(w, h, internal, type, data, mip) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (data !== undefined) gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, internal === gl.RGBA16F ? gl.RGBA : gl.RGBA, type, data);
      return t;
    }
    const lutL = tex(LUTN, 1, gl.RGBA16F, gl.FLOAT, curveLUT(defaults()));
    const lutU = tex(LUTN, 1, gl.RGBA16F, gl.FLOAT, curveLUT(defaults()));
    let src = null, b1 = null, b2 = null, b3 = null;
    const fbo = gl.createFramebuffer();
    const blurFmt = floatOK ? [gl.RGBA16F, gl.HALF_FLOAT] : [gl.RGBA8, gl.UNSIGNED_BYTE];

    function uploadImage(img, mip) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
      return t;
    }
    function blurPass(input, iw, ih, ow, oh, dir, sigma) {
      const [ifmt, ity] = blurFmt;
      const out = tex(ow, oh, ifmt, ity, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
      gl.viewport(0, 0, ow, oh);
      gl.useProgram(blurProg);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, input); gl.uniform1i(bloc('uTex'), 0);
      gl.uniform2f(bloc('uSize'), ow, oh);
      gl.uniform2f(bloc('uStep'), dir[0] / iw, dir[1] / ih);
      gl.uniform1fv(bloc('uW[0]'), gaussW(sigma));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return out;
    }
    function buildBlurs(img, W, H) {
      [b1, b2, b3].forEach((t) => t && gl.deleteTexture(t));
      const ar = W / H, w0 = ar >= 1 ? 512 : Math.round(512 * ar), h0 = ar >= 1 ? Math.round(512 / ar) : 512;
      const cv = document.createElement('canvas'); cv.width = w0; cv.height = h0;
      const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, w0, h0);
      const base = uploadImage(cv, false);
      let t = blurPass(base, w0, h0, w0, h0, [1, 0], 2.5); let u = blurPass(t, w0, h0, w0, h0, [0, 1], 2.5); gl.deleteTexture(t); b1 = u;
      const w1 = Math.max(1, w0 >> 1), h1 = Math.max(1, h0 >> 1);
      t = blurPass(b1, w0, h0, w1, h1, [1, 0], 3.2); u = blurPass(t, w1, h1, w1, h1, [0, 1], 3.2); gl.deleteTexture(t); b2 = u;
      const w2 = Math.max(1, w1 >> 1), h2 = Math.max(1, h1 >> 1);
      t = blurPass(b2, w1, h1, w2, h2, [1, 0], 4.5); u = blurPass(t, w2, h2, w2, h2, [0, 1], 4.5); gl.deleteTexture(t); b3 = u;
      gl.deleteTexture(base);
    }
    R.setSource = function (img, opts) {
      opts = opts || {};
      const W = img.width || img.videoWidth, H = img.height || img.videoHeight;
      const nt = uploadImage(img, true);
      if (src && !opts.keepOld) gl.deleteTexture(src);
      const old = src; src = nt; R.srcW = W; R.srcH = H;
      if (!opts.noBlur) buildBlurs(img, W, H);
      return old;
    };
    R.restoreSource = function (old, W, H) { if (src) gl.deleteTexture(src); src = old; R.srcW = W; R.srcH = H; };
    R.hasSource = () => !!src;

    function setStage(prefix, P, on) {
      gl.uniform1f(loc(prefix + '.on'), on ? 1 : 0);
      if (!on) return;
      gl.uniform1f(loc(prefix + '.con'), P.contrast / 100);
      gl.uniform1f(loc(prefix + '.vib'), P.vibrance / 100);
      gl.uniform1f(loc(prefix + '.sat'), P.saturation / 100);
      gl.uniform1f(loc(prefix + '.mono'), P.mono);
      gl.uniform1fv(loc(prefix + '.hue[0]'), P.hue.map((v) => v / 100));
      gl.uniform1fv(loc(prefix + '.hs[0]'), P.hsat.map((v) => v / 100));
      gl.uniform1fv(loc(prefix + '.hl[0]'), P.hlum.map((v) => v / 100));
      gl.uniform1fv(loc(prefix + '.bw[0]'), P.bw.map((v) => v / 100));
      gl.uniform3fv(loc(prefix + '.gSh'), gradeVec(P.gsh, 0.34));
      gl.uniform3fv(loc(prefix + '.gMi'), gradeVec(P.gmi, 0.26));
      gl.uniform3fv(loc(prefix + '.gHi'), gradeVec(P.ghi, 0.3));
      gl.uniform3fv(loc(prefix + '.gGl'), gradeVec(P.ggl, 0.32));
      gl.uniform4f(loc(prefix + '.gLum'), P.gsh[2] / 100, P.gmi[2] / 100, P.ghi[2] / 100, P.ggl[2] / 100);
      gl.uniform1f(loc(prefix + '.gBlend'), P.gblend / 100);
      gl.uniform1f(loc(prefix + '.gBal'), P.gbal / 100);
      gl.uniformMatrix3fv(loc(prefix + '.cal'), false, calibMatrix(P));
      gl.uniform1f(loc(prefix + '.calSh'), P.calSh / 100);
    }
    function lutUpload(t, P) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, LUTN, 1, 0, gl.RGBA, gl.FLOAT, curveLUT(P));
    }
    let lastLutL = '', lastLutU = '';
    const curveKey = (P) => JSON.stringify([P.crgb, P.cr, P.cg, P.cb, P.pc, P.fade]);

    // Resolve an edit into the parameter sets the shader needs.
    R.resolve = function (edit, lookOverride) {
      const lookId = lookOverride !== undefined ? lookOverride : edit.look;
      const def = lookId ? D.lookById(lookId) : null;
      const amt = (edit.amount == null ? 100 : edit.amount) / 100;
      const Lp = def ? scaleParams(expandLook(def), amt) : null;
      let U = edit.p;
      if (lookOverride !== undefined && lookOverride !== edit.look && def) {
        // hover preview: show the look's own effects instead of the current ones
        U = clone(edit.p); const fx = def.fx || {};
        D.FX_KEYS.forEach((k) => { U[k] = D.defaults()[k]; });
        for (const k in fx) U[k] = D.FX_AMOUNT.includes(k) ? fx[k] * amt : fx[k];
      }
      return { Lp, U };
    };

    // Draw one tile (or the whole frame) of the output.
    function draw(edit, o) {
      const { Lp, U } = o.resolved || R.resolve(edit, o.lookOverride);
      const geo = cropGeometry(edit.crop, R.srcW, R.srcH);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      const units = [src, b1, b2, b3, lutL, lutU], names = ['uSrc', 'uB1', 'uB2', 'uB3', 'uLutL', 'uLutU'];
      if (Lp) { const k = curveKey(Lp); if (k !== lastLutL) { lutUpload(lutL, Lp); lastLutL = k; } }
      { const k = curveKey(U); if (k !== lastLutU) { lutUpload(lutU, U); lastLutU = k; } }
      units.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc(names[i]), i); });
      gl.uniformMatrix3fv(loc('uXf'), false, geo.xf);
      gl.uniform2f(loc('uOut'), o.outW, o.outH);
      gl.uniform4f(loc('uTile'), o.tx || 0, o.ty || 0, o.tw || o.outW, o.th || o.outH);
      gl.uniform2f(loc('uVp'), o.vpx || 0, o.vpy || 0);
      const srcLong = Math.max(R.srcW, R.srcH), outLong = Math.max(o.outW, o.outH) / Math.max(1e-3, Math.max(geo.w, geo.h) / srcLong);
      gl.uniform1f(loc('uSrcLod'), Math.log2(Math.max(srcLong, 1) / 2048));
      gl.uniform1f(loc('uPxLod'), Math.log2(srcLong / Math.max(outLong, 1)));
      gl.uniform1f(loc('uSeed'), edit.seed != null ? edit.seed : 0.37);
      gl.uniform1i(loc('uBypass'), o.bypass ? 1 : 0);
      const sum = (k) => (U[k] || 0) + (Lp ? Lp[k] || 0 : 0);
      const g1 = wbGains(U.temp, U.tint), g2 = Lp ? wbGains(Lp.temp, Lp.tint) : [1, 1, 1], ex = Math.pow(2, sum('exposure'));
      gl.uniform3f(loc('uGain'), g1[0] * g2[0] * ex, g1[1] * g2[1] * ex, g1[2] * g2[2] * ex);
      gl.uniform1f(loc('uHi'), clamp(sum('highlights'), -100, 100) / 100);
      gl.uniform1f(loc('uSh'), clamp(sum('shadows'), -100, 100) / 100);
      gl.uniform1f(loc('uWh'), clamp(sum('whites'), -100, 100) / 100);
      gl.uniform1f(loc('uBl'), clamp(sum('blacks'), -100, 100) / 100);
      gl.uniform1f(loc('uTex'), clamp(sum('texture'), -100, 100) / 100);
      gl.uniform1f(loc('uClar'), clamp(sum('clarity'), -100, 100) / 100);
      gl.uniform1f(loc('uDehaze'), clamp(sum('dehaze'), -100, 100) / 100);
      gl.uniform1f(loc('uSharp'), clamp(sum('sharpen'), 0, 150) / 100);
      gl.uniform1f(loc('uNR'), clamp(sum('nr'), 0, 100) / 100);
      setStage('uL', Lp || defaults(), !!Lp);
      setStage('uU', U, true);
      gl.uniform4f(loc('uVig'), U.vignette / 100, U.vigMid / 100, U.vigRound / 100, U.vigFeather / 100);
      gl.uniform4f(loc('uGrain'), U.grain / 100, U.grainSize / 100, U.grainRough / 100, U.grainColor / 100);
      gl.uniform3f(loc('uGlow'), U.halation / 100, U.bloom / 100, U.diffusion / 100);
      gl.uniform3f(loc('uLeak'), U.leak / 100, U.leakHue, U.leakPos / 100);
      gl.uniform3f(loc('uVHS'), U.scanlines / 100, U.tracking / 100, U.bleed / 100);
      gl.uniform1f(loc('uDust'), U.dust / 100);
      gl.uniform1f(loc('uCA'), U.ca / 100);
      gl.uniform1f(loc('uWarp'), U.warp / 100);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Render the whole output into R.canvas at w x h.
    R.render = function (edit, o) {
      if (!src) return;
      if (canvas.width !== o.w || canvas.height !== o.h) { canvas.width = o.w; canvas.height = o.h; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, o.w, o.h);
      draw(edit, { outW: o.w, outH: o.h, bypass: o.bypass, lookOverride: o.lookOverride });
    };

    // Render into an offscreen framebuffer and return pixels as a canvas (for thumbnails, histograms).
    const rtCache = {};
    R.renderPixels = function (edit, w, h, o) {
      o = o || {};
      const key = w + 'x' + h;
      let rt = rtCache[key];
      if (!rt) { const t = tex(w, h, gl.RGBA8, gl.UNSIGNED_BYTE, null); rt = rtCache[key] = { t }; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt.t, 0);
      gl.viewport(0, 0, w, h);
      draw(edit, { outW: w, outH: h, bypass: o.bypass, lookOverride: o.lookOverride, resolved: o.resolved });
      const px = new Uint8ClampedArray(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // flip rows (GL rows are bottom-up; our shader wrote the image bottom row first)
      const out = new Uint8ClampedArray(w * h * 4), row = w * 4;
      for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
      return new ImageData(out, w, h);
    };
    R.thumb = function (edit, w, h, lookId) {
      const img = R.renderPixels(edit, w, h, { lookOverride: lookId });
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').putImageData(img, 0, 0);
      return cv.toDataURL('image/jpeg', 0.82);
    };

    // Tiled render of the full output into a 2D context at (dx, dy).
    R.renderTiled = async function (edit, outW, outH, ctx, dx, dy, onProgress) {
      const T = Math.min(2048, R.maxTex);
      const tw0 = Math.min(T, outW), th0 = Math.min(T, outH);
      canvas.width = tw0; canvas.height = th0;
      const resolved = R.resolve(edit);
      const nx = Math.ceil(outW / tw0), ny = Math.ceil(outH / th0);
      let n = 0;
      for (let ty = 0; ty < outH; ty += th0) {
        for (let tx = 0; tx < outW; tx += tw0) {
          const tw = Math.min(tw0, outW - tx), th = Math.min(th0, outH - ty);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, th0 - th, tw, th);
          draw(edit, { outW, outH, tx, ty, tw, th, vpx: 0, vpy: th0 - th, resolved });
          ctx.drawImage(canvas, 0, 0, tw, th, dx + tx, dy + ty, tw, th);
          n++; if (onProgress) onProgress(n / (nx * ny));
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    };
    R.lose = function () { const e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); };
    return R;
  }
  D.createRenderer = createRenderer;

  /* ------------------------------------------------------------------ */
  /* Output sizing, frames, date stamps                                  */
  /* ------------------------------------------------------------------ */
  // Frame geometry relative to photo size. Returns {W, H, x, y, pw, ph}.
  function frameLayout(frame, pw, ph) {
    const t = frame.type, s = Math.min(pw, ph), L = Math.max(pw, ph);
    let l = 0, r = 0, tp = 0, b = 0;
    const k = (frame.size == null ? 5 : frame.size) / 100;
    if (t === 'classic' || t === 'rounded') { l = r = tp = b = Math.round(s * k); }
    else if (t === 'gallery') { l = r = tp = Math.round(s * Math.max(k, 0.04)); b = Math.round(s * Math.max(k, 0.04) * 2.6); }
    else if (t === 'polaroid') { l = r = Math.round(pw * 0.057); tp = Math.round(pw * 0.074); b = Math.round(pw * 0.29); }
    else if (t === 'instaxMini') { l = r = Math.round(pw * 0.087); tp = Math.round(pw * 0.148); b = Math.round(pw * 0.374); }
    else if (t === 'instaxWide') { l = r = Math.round(pw * 0.045); tp = Math.round(pw * 0.069); b = Math.round(pw * 0.174); }
    else if (t === 'strip') { if (pw >= ph) { tp = b = Math.round(ph * 0.24); l = r = Math.round(pw * 0.045); } else { l = r = Math.round(pw * 0.24); tp = b = Math.round(ph * 0.045); } }
    else if (t === 'carrier') { l = r = tp = b = Math.round(L * 0.035); }
    return { W: pw + l + r, H: ph + tp + b, x: l, y: tp, pw, ph };
  }
  D.frameLayout = frameLayout;

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  let noiseTile = null;
  function paperNoise() {
    if (noiseTile) return noiseTile;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), d = x.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); noiseTile = c; return c;
  }
  function seeded(seed) { let s = Math.floor(seed * 1e6) || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

  // Paint the frame background (before the photo is drawn).
  D.paintFrameBack = function (ctx, frame, lay) {
    const t = frame.type;
    if (t === 'none') return;
    ctx.save();
    if (t === 'strip' || t === 'carrier') ctx.fillStyle = t === 'strip' ? '#0d0b0a' : '#050505';
    else ctx.fillStyle = frame.color || '#ffffff';
    ctx.fillRect(0, 0, lay.W, lay.H);
    if (frame.texture > 0 && t !== 'strip' && t !== 'carrier') {
      ctx.globalAlpha = frame.texture / 100 * 0.12; ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = ctx.createPattern(paperNoise(), 'repeat'); ctx.fillRect(0, 0, lay.W, lay.H);
    }
    ctx.restore();
  };
  // Clip region for the photo (rounded corners), call before drawing the photo.
  D.photoClip = function (ctx, frame, lay) {
    const t = frame.type, s = Math.min(lay.pw, lay.ph);
    let r = 0;
    if (t === 'rounded') r = s * (frame.radius || 0) / 100;
    else if (t === 'instaxMini' || t === 'instaxWide') r = s * 0.012;
    else if (t === 'polaroid') r = s * 0.004;
    if (r > 0) { rrect(ctx, lay.x, lay.y, lay.pw, lay.ph, r); ctx.clip(); }
  };
  // Paint frame overlays (after the photo): sprockets, carrier edges, captions, keylines.
  D.paintFrameFront = function (ctx, frame, lay, meta) {
    const t = frame.type;
    meta = meta || {};
    ctx.save();
    if (t === 'rounded' && frame.radius > 0) { /* clip handled before */ }
    if (frame.keyline && (t === 'classic' || t === 'gallery')) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1, Math.min(lay.pw, lay.ph) * 0.0015);
      ctx.strokeRect(lay.x - ctx.lineWidth / 2, lay.y - ctx.lineWidth / 2, lay.pw + ctx.lineWidth, lay.ph + ctx.lineWidth);
    }
    if (t === 'polaroid' || t === 'instaxMini' || t === 'instaxWide') {
      // subtle inner shadow where the print sits in the card
      const g = Math.max(1, Math.min(lay.pw, lay.ph) * 0.004);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = g; ctx.strokeRect(lay.x + g / 2, lay.y + g / 2, lay.pw - g, lay.ph - g);
    }
    if (t === 'strip') {
      const horiz = lay.pw >= lay.ph;
      const bandH = horiz ? lay.y : lay.x, len = horiz ? lay.W : lay.H;
      const mm = (horiz ? lay.ph : lay.pw) / 24; // 24mm frame height
      const hw = 2.8 * mm, hh = 1.98 * mm, pitch = 4.75 * mm, off = (bandH - hh) * 0.55;
      ctx.fillStyle = '#e9e4dc';
      for (let p = pitch * 0.3; p < len; p += pitch) {
        for (const side of [0, 1]) {
          const a = side ? (horiz ? lay.H : lay.W) - off - hh : off;
          if (horiz) { rrect(ctx, p, a, hw, hh, hh * 0.18); } else { rrect(ctx, a, p, hh, hw, hh * 0.18); }
          ctx.fill();
        }
      }
      // edge print
      const fs = Math.max(8, mm * 1.25);
      ctx.fillStyle = '#e39a36'; ctx.font = '600 ' + fs + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
      ctx.textBaseline = 'middle';
      const label = (frame.edge || 'DARKROOM 400') + '     ' + (meta.index != null ? meta.index + 1 : 1) + '  ▸ ' + (meta.index != null ? meta.index + 1 : 1) + 'A';
      if (horiz) {
        const y = lay.H - off - hh - (bandH - off - hh) * 0.5 + hh * 0.1;
        const yb = lay.y + lay.ph + (lay.H - lay.y - lay.ph - off - hh) * 0.5;
        ctx.fillText(label, lay.x + mm * 2, yb);
        void y;
      } else {
        ctx.translate(lay.x + lay.pw + (lay.W - lay.x - lay.pw - off - hh) * 0.5, lay.y + mm * 2); ctx.rotate(Math.PI / 2); ctx.fillText(label, 0, 0);
      }
    }
    if (t === 'carrier') {
      // irregular filed edge of a negative carrier
      const rnd = seeded(meta.seed || 0.37), L = Math.max(lay.pw, lay.ph), j = L * 0.006;
      ctx.fillStyle = '#050505';
      const edge = (x0, y0, x1, y1, nx, ny) => {
        const n = 60; ctx.beginPath(); ctx.moveTo(x0 - nx * L, y0 - ny * L);
        for (let i = 0; i <= n; i++) { const u = i / n, d = (rnd() * 0.7 + Math.sin(u * 23 + rnd()) * 0.3) * j; ctx.lineTo(x0 + (x1 - x0) * u + nx * d, y0 + (y1 - y0) * u + ny * d); }
        ctx.lineTo(x1 - nx * L, y1 - ny * L); ctx.closePath(); ctx.fill();
      };
      edge(lay.x, lay.y, lay.x + lay.pw, lay.y, 0, 1);
      edge(lay.x, lay.y + lay.ph, lay.x + lay.pw, lay.y + lay.ph, 0, -1);
      edge(lay.x, lay.y, lay.x, lay.y + lay.ph, 1, 0);
      edge(lay.x + lay.pw, lay.y, lay.x + lay.pw, lay.y + lay.ph, -1, 0);
      // corner notch, like a real filed carrier
      ctx.fillStyle = '#050505'; const nw = L * 0.02; ctx.beginPath(); ctx.moveTo(lay.x + lay.pw * 0.12, lay.y); ctx.lineTo(lay.x + lay.pw * 0.12 + nw, lay.y + nw * 0.6); ctx.lineTo(lay.x + lay.pw * 0.12 + nw * 2, lay.y); ctx.fill();
    }
    if (frame.caption && (t === 'polaroid' || t === 'instaxMini' || t === 'instaxWide' || t === 'gallery')) {
      const bottom = lay.H - lay.y - lay.ph;
      const hand = frame.font !== 'clean';
      const fs = Math.round(bottom * (hand ? 0.34 : 0.2));
      ctx.fillStyle = hand ? '#2b2a33' : '#3a3a3a';
      ctx.font = (hand ? '400 ' : '500 ') + fs + 'px ' + (hand ? '"Caveat", "Segoe Print", "Bradley Hand", cursive' : 'Inter, system-ui, sans-serif');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(frame.caption, lay.W / 2, lay.y + lay.ph + bottom * 0.5, lay.pw * 0.92);
    }
    ctx.restore();
  };

  /* Seven-segment date stamp */
  const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
  function sevenSeg(ctx, text, x, y, h, color, glow) {
    const w = h * 0.52, th = h * 0.13, gap = h * 0.3;
    ctx.save();
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = glow;
    let cx = x;
    const seg = (sx, sy, horiz) => {
      ctx.beginPath();
      if (horiz) { const l = w - th * 0.6; ctx.moveTo(sx, sy); ctx.lineTo(sx + th / 2, sy - th / 2); ctx.lineTo(sx + l - th / 2, sy - th / 2); ctx.lineTo(sx + l, sy); ctx.lineTo(sx + l - th / 2, sy + th / 2); ctx.lineTo(sx + th / 2, sy + th / 2); }
      else { const l = h / 2 - th * 0.5; ctx.moveTo(sx, sy); ctx.lineTo(sx - th / 2, sy + th / 2); ctx.lineTo(sx - th / 2, sy + l - th / 2); ctx.lineTo(sx, sy + l); ctx.lineTo(sx + th / 2, sy + l - th / 2); ctx.lineTo(sx + th / 2, sy + th / 2); }
      ctx.closePath(); ctx.fill();
    };
    const sk = h * 0.08; // italic skew like LCD stamps
    for (const ch of text) {
      if (ch === "'") { ctx.fillRect(cx + sk, y, th * 0.9, h * 0.28); cx += th * 2.4; continue; }
      if (ch === '.' || ch === ':') { ctx.fillRect(cx, y + h - th, th, th); if (ch === ':') ctx.fillRect(cx + sk * 0.5, y + h * 0.3, th, th); cx += th * 2.4; continue; }
      if (ch === '/') { ctx.save(); ctx.lineWidth = th; ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(cx, y + h); ctx.lineTo(cx + w * 0.55, y); ctx.stroke(); ctx.restore(); cx += w * 0.75; continue; }
      const s = SEG[ch];
      if (s === undefined) { cx += w * 0.6; continue; }
      const L = cx + th * 0.3, Rr = cx + w - th * 0.3, mid = y + h / 2;
      const skx = (yy) => ((y + h - yy) / h) * sk;
      if (s.includes('a')) seg(L + skx(y), y, true);
      if (s.includes('g')) seg(L + skx(mid), mid, true);
      if (s.includes('d')) seg(L + skx(y + h), y + h, true);
      if (s.includes('f')) seg(L + skx(y), y + th * 0.5, false);
      if (s.includes('b')) seg(Rr + skx(y), y + th * 0.5, false);
      if (s.includes('e')) seg(L + skx(mid), mid + th * 0.05, false);
      if (s.includes('c')) seg(Rr + skx(mid), mid + th * 0.05, false);
      cx += w + gap;
    }
    ctx.restore();
    return cx - x;
  }
  function stampText(st, now) {
    let d = st.date ? new Date(st.date + 'T12:00:00') : (now || new Date());
    if (isNaN(d)) d = new Date();
    const y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate(), yy = String(y).slice(2);
    const p2 = (n) => String(n).padStart(2, '0');
    switch (st.fmt) {
      case 'm d yy': return m + ' ' + dd + " '" + yy;
      case 'd m yy': return dd + ' ' + m + " '" + yy;
      case 'yyyy.mm.dd': return y + '.' + p2(m) + '.' + p2(dd);
      case 'mm/dd/yy': return p2(m) + '/' + p2(dd) + '/' + yy;
      default: return "'" + yy + ' ' + m + ' ' + dd;
    }
  }
  D.stampText = stampText;
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  D.paintStamp = function (ctx, st, lay, meta) {
    if (!st || !st.on) return;
    const s = Math.min(lay.pw, lay.ph), k = (st.size || 100) / 100;
    ctx.save();
    if (st.style === 'camcorder') {
      let d = st.date ? new Date(st.date + 'T12:00:00') : (meta && meta.date) || new Date(); if (isNaN(d)) d = new Date();
      const fs = s * 0.058 * k, pad = s * 0.05;
      ctx.font = '400 ' + fs + 'px "VT323", ui-monospace, Menlo, monospace';
      ctx.fillStyle = '#f4f4f4'; ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowOffsetX = fs * 0.06; ctx.shadowOffsetY = fs * 0.06; ctx.shadowBlur = 0;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('PLAY ▶', lay.x + pad, lay.y + pad + fs);
      const hh = 10 + ((d.getDate() * 7) % 12), mi = (d.getMonth() * 13 + 7) % 60;
      const time = (hh > 12 ? hh - 12 : hh) + ':' + String(mi).padStart(2, '0') + (hh >= 12 ? ' PM' : ' AM');
      ctx.fillText(time, lay.x + pad, lay.y + lay.ph - pad - fs * 1.1);
      ctx.fillText(MONTHS[d.getMonth()] + '. ' + d.getDate() + ' ' + d.getFullYear(), lay.x + pad, lay.y + lay.ph - pad);
      ctx.restore(); return;
    }
    let text = stampText(st, meta && meta.date);
    const h = s * 0.042 * k, glow = h * 0.35;
    // measure
    ctx.globalAlpha = 0;
    const tw = sevenSeg(ctx, text, 0, 0, h, st.color, 0);
    ctx.globalAlpha = 1;
    const pad = s * 0.055;
    const x = st.pos === 'bl' ? lay.x + pad : lay.x + lay.pw - pad - tw;
    const y = lay.y + lay.ph - pad - h;
    ctx.globalCompositeOperation = 'screen';
    sevenSeg(ctx, text, x, y, h, st.color, glow);
    ctx.globalAlpha = 0.55; sevenSeg(ctx, text, x, y, h, st.color, glow * 2.2);
    ctx.restore();
  };

  // Compose a rendered photo (canvas) with frame + stamp into ctx sized lay.W x lay.H.
  D.compose = function (ctx, photo, frame, stamp, lay, meta) {
    D.paintFrameBack(ctx, frame, lay);
    ctx.save(); D.photoClip(ctx, frame, lay);
    ctx.drawImage(photo, 0, 0, photo.width, photo.height, lay.x, lay.y, lay.pw, lay.ph);
    ctx.restore();
    D.paintStamp(ctx, stamp, lay, meta);
    D.paintFrameFront(ctx, frame, lay, meta);
  };

  /* ------------------------------------------------------------------ */
  /* Files: decode, EXIF, RAW previews                                   */
  /* ------------------------------------------------------------------ */
  function readAscii(dv, off, len) { let s = ''; for (let i = 0; i < len; i++) { const c = dv.getUint8(off + i); if (!c) break; s += String.fromCharCode(c); } return s.trim(); }
  function parseTiff(dv, tiff) {
    const le = dv.getUint16(tiff) === 0x4949;
    const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
    const out = {}; const jpegs = [];
    const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const val = (e) => {
      const type = u16(e + 2), count = u32(e + 4), sz = (typeSize[type] || 1) * count;
      const vo = sz > 4 ? tiff + u32(e + 8) : e + 8;
      if (type === 2) return readAscii(dv, vo, count);
      if (type === 3) return u16(vo);
      if (type === 4) return u32(vo);
      if (type === 5 || type === 10) { const n = u32(vo), d = u32(vo + 4); return d ? n / d : 0; }
      return null;
    };
    const seen = new Set();
    const walk = (ifdOff, depth) => {
      if (!ifdOff || depth > 4 || seen.has(ifdOff) || tiff + ifdOff + 2 > dv.byteLength) return;
      seen.add(ifdOff);
      const base = tiff + ifdOff, n = u16(base);
      let jo = 0, jl = 0;
      for (let i = 0; i < n && base + 2 + i * 12 + 12 <= dv.byteLength; i++) {
        const e = base + 2 + i * 12, tag = u16(e);
        try {
          if (tag === 0x010f) out.make = val(e);
          else if (tag === 0x0110) out.model = val(e);
          else if (tag === 0x9003) out.date = val(e);
          else if (tag === 0x829a) out.shutter = val(e);
          else if (tag === 0x829d) out.fnum = val(e);
          else if (tag === 0x8827) out.iso = val(e);
          else if (tag === 0x920a) out.focal = val(e);
          else if (tag === 0xa434) out.lens = val(e);
          else if (tag === 0x0201) jo = val(e);
          else if (tag === 0x0202) jl = val(e);
          else if (tag === 0x8769) walk(u32(e + 8), depth + 1);
          else if (tag === 0x014a) { const cnt = u32(e + 4); if (cnt === 1) walk(u32(e + 8), depth + 1); else { const po = tiff + u32(e + 8); for (let k = 0; k < cnt && k < 8; k++) walk(u32(po + k * 4), depth + 1); } }
        } catch (err) { /* ignore bad tag */ }
      }
      if (jo && jl) jpegs.push([tiff + jo, jl]);
      const next = base + 2 + n * 12;
      if (next + 4 <= dv.byteLength) walk(u32(next), depth + 1);
    };
    walk(u32(tiff + 4), 0);
    out.jpegs = jpegs;
    return out;
  }
  // EXIF from a JPEG file.
  D.readExif = async function (file) {
    try {
      const buf = await file.slice(0, 256 * 1024).arrayBuffer();
      const dv = new DataView(buf);
      if (dv.getUint16(0) === 0xffd8) {
        let o = 2;
        while (o + 4 < dv.byteLength) {
          const m = dv.getUint16(o), len = dv.getUint16(o + 2);
          if (m === 0xffe1 && readAscii(dv, o + 4, 4) === 'Exif') return parseTiff(dv, o + 10);
          if ((m & 0xff00) !== 0xff00) break;
          o += 2 + len;
        }
        return {};
      }
      const b0 = dv.getUint16(0);
      if (b0 === 0x4949 || b0 === 0x4d4d) return parseTiff(dv, 0);
      return {};
    } catch (e) { return {}; }
  };
  const RAW_EXT = /\.(raf|arw|nef|nrw|cr2|dng|orf|rw2|pef|srw)$/i;
  D.isRaw = (name) => RAW_EXT.test(name || '');
  // Largest embedded JPEG preview from a RAW file.
  async function rawPreview(file) {
    const head = new DataView(await file.slice(0, 128).arrayBuffer());
    if (readAscii(head, 0, 8) === 'FUJIFILM') {
      const off = head.getUint32(84), len = head.getUint32(88);
      return { blob: file.slice(off, off + len, 'image/jpeg'), exifFrom: file.slice(off, off + Math.min(len, 256 * 1024)), fuji: readAscii(head, 28, 32) };
    }
    const buf = await file.arrayBuffer();
    const dv = new DataView(buf);
    const info = parseTiff(dv, 0);
    const best = (info.jpegs || []).filter(([o, l]) => o + l <= buf.byteLength).sort((a, b) => b[1] - a[1])[0];
    if (!best) throw new Error('No preview inside this RAW file');
    return { blob: new Blob([buf.slice(best[0], best[0] + best[1])], { type: 'image/jpeg' }), exif: info };
  }
  async function toBitmap(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { /* fall through */ }
    }
    return await new Promise((res, rej) => {
      const u = URL.createObjectURL(blob), im = new Image();
      im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(u), 1000); };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('This browser could not decode the file.')); };
      im.src = u;
    });
  }
  // Decode any supported file. Returns {img, exif, note}.
  D.decode = async function (file) {
    let exif = {}, note = '', img;
    if (D.isRaw(file.name)) {
      const r = await rawPreview(file);
      img = await toBitmap(r.blob);
      exif = r.exif || (r.exifFrom ? await D.readExif(new File([r.exifFrom], 'x.jpg')) : {});
      if (r.fuji !== undefined) { exif.make = exif.make || 'FUJIFILM'; exif.model = exif.model || r.fuji || ''; }
      note = 'Using the ' + img.width + '×' + img.height + ' JPEG embedded in this RAW file.';
    } else {
      exif = await D.readExif(file);
      img = await toBitmap(file);
    }
    return { img, exif, note };
  };
  const SONY = { 'ILCE-7M4': 'a7 IV', 'ILCE-7M3': 'a7 III', 'ILCE-7CM2': 'a7C II', 'ILCE-7CR': 'a7CR', 'ILCE-7C': 'a7C', 'ILCE-7RM5': 'a7R V', 'ILCE-7RM4': 'a7R IV', 'ILCE-7RM4A': 'a7R IVA', 'ILCE-7SM3': 'a7S III', 'ILCE-1': 'a1', 'ILCE-1M2': 'a1 II', 'ILCE-9M3': 'a9 III', 'ILCE-6700': 'a6700', 'ILCE-6400': 'a6400', 'ILCE-6600': 'a6600', 'ILCE-7': 'a7', 'ILCE-7M2': 'a7 II', 'ZV-E10': 'ZV-E10', 'ZV-E1': 'ZV-E1' };
  // Friendly camera name, e.g. "Sony a7 IV", "Fujifilm X100VI".
  D.cameraName = function (x) {
    if (!x || (!x.make && !x.model)) return '';
    const mk = (x.make || '').trim(), md = (x.model || '').trim(), M = mk.toUpperCase();
    const brand = M.includes('FUJI') ? 'Fujifilm' : M.includes('SONY') ? 'Sony' : M.includes('CANON') ? 'Canon' : M.includes('NIKON') ? 'Nikon' : mk.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());
    let model = SONY[md] || md;
    model = model.replace(new RegExp('^' + brand + '\\s*', 'i'), '').replace(/^(NIKON|CANON)\s+/i, '');
    return (brand + ' ' + model).trim();
  };
  D.fmtExif = function (x) {
    if (!x) return '';
    const parts = [];
    const cam = D.cameraName(x);
    if (cam) parts.push(cam);
    if (x.focal) parts.push(Math.round(x.focal) + 'mm');
    if (x.fnum) parts.push('f/' + (Math.round(x.fnum * 10) / 10));
    if (x.shutter) parts.push(x.shutter >= 1 ? x.shutter + 's' : '1/' + Math.round(1 / x.shutter));
    if (x.iso) parts.push('ISO ' + x.iso);
    return parts.join(' · ');
  };
  D.brandOf = function (x) {
    const m = ((x && x.make) || '').toUpperCase();
    if (m.includes('FUJI')) return 'fujifilm';
    if (m.includes('SONY')) return 'sony';
    if (m.includes('CANON')) return 'canon';
    if (m.includes('NIKON')) return 'nikon';
    return null;
  };
  D.exifDate = function (x) {
    if (!x || !x.date) return '';
    const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(x.date); return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
  };
  // Downscale an image into a canvas no larger than maxLong.
  D.fit = function (img, maxLong) {
    const W = img.width, H = img.height, k = Math.min(1, maxLong / Math.max(W, H));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
    return c;
  };

  /* ------------------------------------------------------------------ */
  /* Export                                                              */
  /* ------------------------------------------------------------------ */
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  D.maxCanvasArea = isIOS ? 16.7e6 : 120e6;
  // Output pixel size of the photo area for an export request.
  D.outputSize = function (edit, srcW, srcH, longEdge) {
    const g = cropGeometry(edit.crop, srcW, srcH);
    const native = Math.max(g.w, g.h);
    let L = longEdge && longEdge !== 'orig' ? Math.min(Number(longEdge), native) : native;
    const A = g.w / g.h;
    let w = A >= 1 ? L : L * A, h = A >= 1 ? L / A : L;
    const lay = frameLayout(edit.frame, w, h), area = lay.W * lay.H;
    if (area > D.maxCanvasArea) { const k = Math.sqrt(D.maxCanvasArea / area); w *= k; h *= k; }
    return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  };
  // Render a full-quality file. img = full resolution image; preview blurs are rebuilt from it.
  D.exportImage = async function (R, img, edit, opts, meta, onProgress) {
    let source = img;
    if (Math.max(img.width, img.height) > R.maxTex) source = D.fit(img, R.maxTex);
    const prevW = R.srcW, prevH = R.srcH;
    const old = R.setSource(source, { keepOld: true, noBlur: true });
    try {
      const { w, h } = D.outputSize(edit, source.width, source.height, opts.size);
      const lay = frameLayout(edit.frame, w, h);
      const out = document.createElement('canvas'); out.width = lay.W; out.height = lay.H;
      const ctx = out.getContext('2d');
      D.paintFrameBack(ctx, edit.frame, lay);
      ctx.save(); D.photoClip(ctx, edit.frame, lay);
      await R.renderTiled(edit, w, h, ctx, lay.x, lay.y, onProgress);
      ctx.restore();
      D.paintStamp(ctx, edit.stamp, lay, meta);
      D.paintFrameFront(ctx, edit.frame, lay, meta);
      const type = opts.format === 'png' ? 'image/png' : opts.format === 'webp' ? 'image/webp' : 'image/jpeg';
      const q = (opts.quality || 92) / 100;
      const blob = await new Promise((res) => out.toBlob(res, type, q));
      out.width = out.height = 1;
      if (!blob) throw new Error('The browser could not encode the image.');
      return { blob, w: lay.W, h: lay.H };
    } finally {
      R.restoreSource(old, prevW, prevH);
    }
  };

  /* Store-only ZIP (JPEGs are already compressed) */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  D.zip = async function (files) {
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + (p.byteLength || p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  };

  // Offer a file to the viewer: platform downloads first, then a plain link.
  D.saveFile = async function (blob, filename) {
    try {
      if (window.claude && window.claude.use) {
        const dl = await Promise.race([window.claude.use('downloads'), new Promise((r) => setTimeout(() => r(null), 2500))]);
        if (dl) { await dl.save({ filename, data: blob }); return 'saved'; }
      }
    } catch (e) {
      if (e && e.code === 'declined') return 'declined';
      if (e && e.code === 'rate_limited') return 'busy';
    }
    try {
      const u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = filename; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 60000); return 'link';
    } catch (e) { return 'failed'; }
  };

  // Simple auto tone from an ImageData sample.
  D.autoTone = function (img) {
    const d = img.data, n = d.length / 4, hist = new Uint32Array(256); let sum = 0;
    for (let i = 0; i < d.length; i += 4) { const l = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); hist[l]++; sum += l; }
    const pct = (p) => { let a = 0; for (let i = 0; i < 256; i++) { a += hist[i]; if (a >= n * p) return i; } return 255; };
    const lo = pct(0.005), hi = pct(0.995), mean = sum / n / 255;
    const exposure = clamp(Math.log2(0.46 / Math.max(0.05, mean)) * 0.7, -1.5, 1.5);
    return {
      exposure: Math.round(exposure * 100) / 100,
      whites: Math.round(clamp((245 - hi) / 2.2, -40, 60)),
      blacks: Math.round(clamp((6 - lo) / 1.4, -50, 30)),
      highlights: hi > 250 ? -25 : 0, shadows: lo < 8 ? 15 : 0
    };
  };
  D.histogram = function (img) {
    const d = img.data, r = new Uint32Array(64), g = new Uint32Array(64), b = new Uint32Array(64), l = new Uint32Array(64);
    for (let i = 0; i < d.length; i += 4) { r[d[i] >> 2]++; g[d[i + 1] >> 2]++; b[d[i + 2] >> 2]++; l[(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) >> 2]++; }
    return { r, g, b, l };
  };

  // Test chart for trying looks without a photo.
  D.testChart = function () {
    const W = 1800, H = 1200, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, H * 0.55); sky.addColorStop(0, '#3f6fa8'); sky.addColorStop(1, '#bcd3e6'); x.fillStyle = sky; x.fillRect(0, 0, W, H * 0.55);
    const sun = x.createRadialGradient(W * 0.78, H * 0.2, 5, W * 0.78, H * 0.2, 220); sun.addColorStop(0, 'rgba(255,248,225,1)'); sun.addColorStop(0.18, 'rgba(255,236,190,0.9)'); sun.addColorStop(1, 'rgba(255,236,190,0)'); x.fillStyle = sun; x.fillRect(0, 0, W, H * 0.55);
    x.fillStyle = '#5b7a3a'; x.beginPath(); x.moveTo(0, H * 0.5); for (let i = 0; i <= 20; i++) x.lineTo(W * i / 20, H * (0.44 + 0.05 * Math.sin(i * 1.3))); x.lineTo(W, H * 0.55); x.lineTo(0, H * 0.55); x.fill();
    const pats = ['#735244', '#c29682', '#627a9d', '#576c43', '#8580b1', '#67bdaa', '#d67e2c', '#505ba6', '#c15a63', '#5e3c6c', '#9dbc40', '#e0a32e', '#383d96', '#469449', '#af363c', '#e7c71f', '#bb5695', '#0885a1', '#f3f3f2', '#c8c8c8', '#a0a0a0', '#7a7a79', '#555555', '#343434'];
    const pw = W / 6 - 20, ph = (H * 0.4 - 40) / 4;
    pats.forEach((col, i) => { x.fillStyle = col; const cx = 10 + (i % 6) * (W / 6), cy = H * 0.57 + Math.floor(i / 6) * (ph + 8); x.fillRect(cx + 5, cy, pw, ph); });
    const ramp = x.createLinearGradient(0, 0, W, 0); ramp.addColorStop(0, '#000'); ramp.addColorStop(1, '#fff'); x.fillStyle = ramp; x.fillRect(0, H - 22, W, 22);
    return c;
  };
})();
