// Mars küresi (WebGL; WebGL2 yoksa WebGL1). Doku: USGS Astrogeology Viking MDIM 2.1 renkli mozaik
// (ortogörüntü DEĞİL; sunum amaçlı küresel mozaik). Saf geometri fonksiyonları DOM'suz export edilir.

const DEG = Math.PI / 180;

// ---------- Saf fonksiyonlar ----------
// Birim küre: x = cos(lat) sin(lon), y = sin(lat), z = cos(lat) cos(lon); lon 0 öne bakar, doğu +x.
export function latLonToVec3(latDeg, lonDeg, radius = 1) {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  return [radius * Math.cos(la) * Math.sin(lo), radius * Math.sin(la), radius * Math.cos(la) * Math.cos(lo)];
}

export function vec3ToLatLon(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, v[1] / len))) / DEG,
    lon: Math.atan2(v[0], v[2]) / DEG,
  };
}

export function normalizeAngle(a) {
  const t = Math.PI * 2;
  return a - t * Math.round(a / t);
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

// Otomatik dönüş: tek sabit. Kullanıcı dokunmadıkça küre bu sürede bir tam tur döner.
export const AUTO_SPIN_SECONDS_PER_TURN = 5;
export const AUTO_SPIN_RAD_PER_S = (2 * Math.PI) / AUTO_SPIN_SECONDS_PER_TURN;
export const AUTO_SPIN_RESUME_MS = 500;
export const AUTO_SPIN_RAMP_S = 0.6;
/** Dönüş çarpanını hedefe (uygun ? 1 : 0) üstel olarak yaklaştırır; ani sıçrama yok. */
export function autoSpinStep(spin, dt, eligible, rampS = AUTO_SPIN_RAMP_S) {
  const target = eligible ? 1 : 0;
  const k = 1 - Math.exp(-Math.max(0, dt) / rampS);
  return spin + (target - spin) * k;
}
// R = Rx(pitch) * Ry(yaw); satır-öncelikli 3x3 [9]. Ry(yaw) pozitif => yüzey sağa kayar.
export function rotationMatrix(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [
    cy, 0, sy,
    sp * sy, cp, -sp * cy,
    -cp * sy, sp, cp * cy,
  ];
}
export function mulMat3Vec(m, v) {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
export function mulMat3TVec(m, v) {
  return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
}

// Yönü normalize ışın ile küre kesişimi; en yakın pozitif t veya null.
export function raySphereIntersect(origin, dir, radius = 1) {
  const b = origin[0] * dir[0] + origin[1] * dir[1] + origin[2] * dir[2];
  const c = origin[0] ** 2 + origin[1] ** 2 + origin[2] ** 2 - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = -b - s, t1 = -b + s;
  if (t0 >= 0) return t0;
  if (t1 >= 0) return t1;
  return null;
}

// Kamera (0,0,distance), -z'ye bakar. ndc: -1..1 (y yukarı).
export function pointerRay({ ndcX, ndcY, fovY, aspect, distance }) {
  const th = Math.tan(fovY / 2);
  const d = [ndcX * th * aspect, ndcY * th, -1];
  const l = Math.hypot(d[0], d[1], d[2]);
  return { origin: [0, 0, distance], dir: [d[0] / l, d[1] / l, d[2] / l] };
}

// Işının küreyle kesiştiği yüzey noktasının {lat, lon} değeri (küre dönüşü yaw/pitch); yoksa null.
export function pickLatLon({ ndcX, ndcY, fovY, aspect, distance, yaw, pitch }) {
  const ray = pointerRay({ ndcX, ndcY, fovY, aspect, distance });
  const t = raySphereIntersect(ray.origin, ray.dir, 1);
  if (t === null) return null;
  const hit = [ray.origin[0] + ray.dir[0] * t, ray.origin[1] + ray.dir[1] * t, ray.origin[2] + ray.dir[2] * t];
  return vec3ToLatLon(mulMat3TVec(rotationMatrix(yaw, pitch), hit));
}

export function greatCircleAngle(a, b) {
  const va = latLonToVec3(a.lat, a.lon), vb = latLonToVec3(b.lat, b.lon);
  const dot = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2];
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

// a'dan b'ye büyük daire yayı üzerinde n+1 birim vektör (uçlar dahil).
export function greatCircleArc(a, b, n = 64) {
  const va = latLonToVec3(a.lat, a.lon), vb = latLonToVec3(b.lat, b.lon);
  const w = greatCircleAngle(a, b);
  const out = [];
  if (w < 1e-9) return [va];
  const sw = Math.sin(w);
  if (sw < 1e-6) { // karşıt noktalar: keyfi bir dik eksen seç
    const ref = Math.abs(va[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let p = [va[1] * ref[2] - va[2] * ref[1], va[2] * ref[0] - va[0] * ref[2], va[0] * ref[1] - va[1] * ref[0]];
    const pl = Math.hypot(...p); p = p.map((x) => x / pl);
    for (let i = 0; i <= n; i++) {
      const th = Math.PI * i / n;
      out.push([0, 1, 2].map((k) => va[k] * Math.cos(th) + p[k] * Math.sin(th)));
    }
    return out;
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n, s0 = Math.sin((1 - t) * w) / sw, s1 = Math.sin(t * w) / sw;
    out.push([va[0] * s0 + vb[0] * s1, va[1] * s0 + vb[1] * s1, va[2] * s0 + vb[2] * s1]);
  }
  return out;
}

// ---------- Matris yardımcıları (sütun-öncelikli 4x4) ----------
function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function translationZ(z) {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1]);
}
function rot4(m) { // satır-öncelikli 3x3 -> sütun-öncelikli 4x4
  return new Float32Array([m[0], m[3], m[6], 0, m[1], m[4], m[7], 0, m[2], m[5], m[8], 0, 0, 0, 0, 1]);
}

// ---------- Doku yükleme ----------
function loadImage(src, ImageCtor) {
  return new Promise((resolve, reject) => {
    const img = new ImageCtor();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`karo yüklenemedi: ${src}`));
    img.src = src;
  });
}

// Önce z0 (hızlı), sonra z2 karolarını equirectangular tuvale birleştirir; onCanvas(canvas, z) çağırır.
export async function loadMarsTexture({ dataBase = 'data/viking-mdim', levels = [0, 2], onCanvas, fetchImpl = globalThis.fetch,
  ImageCtor = globalThis.Image, makeCanvas = () => document.createElement('canvas') } = {}) {
  const manifest = await (await fetchImpl(`${dataBase}/manifest.json`)).json();
  const size = manifest.scheme.tileSize;
  let done = 0;
  for (const z of levels) {
    const lv = manifest.levels.find((l) => l.z === z && l.written);
    if (!lv) continue;
    const canvas = makeCanvas();
    canvas.width = lv.cols * size; canvas.height = lv.rows * size;
    const ctx = canvas.getContext('2d');
    const jobs = [];
    for (let r = 0; r < lv.rows; r++) for (let c = 0; c < lv.cols; c++) {
      jobs.push(loadImage(`${dataBase}/tiles/${z}/${r}/${c}.png`, ImageCtor).then((img) => ctx.drawImage(img, c * size, r * size)));
    }
    await Promise.all(jobs);
    onCanvas?.(canvas, z);
    done++;
  }
  if (!done) throw new Error('kullanılabilir Viking karo seviyesi yok');
}

function makeProceduralTexture(makeCanvas) {
  const W = 1024, H = 512, c = makeCanvas();
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#d9c7b4'); grad.addColorStop(0.12, '#b9693a'); grad.addColorStop(0.5, '#a65a32');
  grad.addColorStop(0.88, '#8b4a2b'); grad.addColorStop(1, '#d9c7b4');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W, y = H * (0.12 + 0.76 * rnd()), r = 6 + rnd() * 42;
    g.fillStyle = rnd() < 0.55 ? `rgba(60,30,18,${0.06 + rnd() * 0.12})` : `rgba(230,170,120,${0.05 + rnd() * 0.1})`;
    g.beginPath(); g.ellipse(x, y, r * 1.6, r, 0, 0, 7); g.fill();
  }
  return c;
}

// ---------- Shaders (GLSL ES 1.00: WebGL1 ve WebGL2'de çalışır) ----------
const SPHERE_VS = `
attribute vec3 a_pos; attribute vec2 a_uv;
uniform mat4 u_proj, u_view, u_rot; uniform float u_scale;
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_w;
void main(){ vec4 w = u_rot*vec4(a_pos*u_scale,1.0); v_w=w.xyz; v_n=(u_rot*vec4(a_pos,0.0)).xyz; v_uv=a_uv; gl_Position=u_proj*u_view*w; }`;
const SPHERE_FS = `
precision mediump float;
uniform sampler2D u_tex; uniform vec3 u_cam;
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_w;
void main(){
  vec3 n = normalize(v_n); vec3 v = normalize(u_cam - v_w);
  vec3 L = normalize(vec3(-0.55,0.35,0.75));
  float d = max(dot(n,L),0.0);
  vec3 c = texture2D(u_tex, v_uv).rgb * (0.28 + 0.85*d);
  float f = pow(1.0 - max(dot(n,v),0.0), 3.0);
  c += mix(vec3(0.25,0.45,0.9), vec3(1.0,0.55,0.25), d) * f * 0.55;
  gl_FragColor = vec4(c,1.0);
}`;
const ATMO_FS = `
precision mediump float;
uniform vec3 u_cam;
varying vec2 v_uv; varying vec3 v_n; varying vec3 v_w;
void main(){
  vec3 n = normalize(v_n); vec3 v = normalize(u_cam - v_w);
  float k = dot(n,v); if (k > 0.0) discard;
  float f = clamp(-k/0.46, 0.0, 1.0); float g = f*f;
  float lit = 0.35 + 0.65*max(dot(n, normalize(vec3(-0.55,0.35,0.75))), 0.0);
  vec3 col = mix(vec3(0.35,0.6,1.0), vec3(1.0,0.55,0.25), g);
  gl_FragColor = vec4(col * g * lit * 0.9, 1.0);
}`;
// ---------- Prosedürel uzay arka planı (harici görsel yok; tohumlu, deterministik) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, seed + i * 17); n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}

export const STAR_COUNT = 3200;
// Yıldız alanı: çoğu sönük, birkaç parlak; hafif renk sıcaklığı. Dönüş: { pos(xyz*radius), data(size,bright), color(rgb) }.
export function makeStarField(n = STAR_COUNT, seed = 987654321, radius = 40) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(n * 3), data = new Float32Array(n * 2), color = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    pos.set([radius * r * Math.cos(a), radius * z, radius * r * Math.sin(a)], i * 3);
    const m = rnd();
    data[i * 2] = 1 + 2.4 * Math.pow(rnd(), 7) + (m > 0.985 ? 0.8 : 0); // boyut (px): çoğu ~1
    data[i * 2 + 1] = 0.1 + 0.55 * Math.pow(m, 3) + (m > 0.985 ? 0.3 : 0);  // parlaklık: çoğu sönük
    const t = rnd(); // 0..1 sıcaklık: soluk mavi-beyaz / sıcak beyaz / çok az soluk turuncu
    const c = t < 0.55 ? [0.80, 0.87, 1.0] : t < 0.95 ? [1.0, 0.96, 0.90] : [1.0, 0.82, 0.64];
    color.set(c, i * 3);
  }
  return { pos, data, color, count: n };
}

// Samanyolu benzeri soluk çapraz bant + toz şeritleri + çok hafif nebula. RGBA Uint8Array (w*h*4).
// Her kanal en çok ~0.25 (bant) / ~0.12 (nebula) düzeyinde tutulur; doygunluk düşük.
export function makeGalaxyPixels(w = 1024, h = 512, seed = 4242) {
  const out = new Uint8Array(w * h * 4), rnd = mulberry32(seed ^ 0x9e37);
  const ang = -0.38, ca = Math.cos(ang), sa = Math.sin(ang), asp = w / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h, px = (u - 0.5) * asp, py = v - 0.5;
      const along = px * ca + py * sa;
      let across = -px * sa + py * ca;
      across += (fbm(u * 3, v * 3, seed + 1, 3) - 0.5) * 0.22; // dalgalı bant
      const core = Math.exp(-Math.pow(across / 0.11, 2)), halo = Math.exp(-Math.pow(across / 0.3, 2));
      const lump = 0.55 + 0.9 * fbm(along * 2.6 + 5, across * 2.6, seed + 2, 4);
      let lum = (0.62 * core + 0.3 * halo) * lump * Math.exp(-along * along * 0.35);
      const dustN = fbm(u * 14, v * 14, seed + 3, 5), lane = Math.exp(-Math.pow((across - 0.015) / 0.035, 2));
      lum *= 1 - Math.min(0.85, lane * smooth(0.42, 0.62, dustN) * 1.1);
      const fine = fbm(u * 40, v * 40, seed + 4, 3); // ince toz şeritleri
      lum *= 0.82 + 0.3 * fine;
      const warm = fbm(u * 2.2 + 9, v * 2.2, seed + 5, 3);
      // koyu mavi-gri <-> hafif mor-kahve
      let r = 0.17 + 0.10 * warm, g = 0.20 + 0.03 * warm, b = 0.30 - 0.07 * warm;
      r *= lum; g *= lum; b *= lum;
      // bant içi ince yıldız tozu
      if (rnd() < 0.05 * core * lump) { const s = 0.04 + 0.14 * rnd(); r += s; g += s; b += s * 1.05; }
      // nebula lekeleri (<=0.12)
      const n1 = blob(u, v, 0.3, 0.68, 0.17, asp) * smooth(0.4, 0.75, fbm(u * 6, v * 6, seed + 6, 4));
      const n2 = blob(u, v, 0.74, 0.3, 0.14, asp) * smooth(0.4, 0.75, fbm(u * 6 + 3, v * 6, seed + 7, 4));
      r += 0.10 * n1 + 0.05 * n2; g += 0.035 * n1 + 0.06 * n2; b += 0.08 * n1 + 0.10 * n2;
      const dither = (rnd() - 0.5) / 255;
      const i = (y * w + x) * 4;
      out[i] = Math.max(0, Math.min(255, Math.round((Math.min(0.25, r) + dither) * 255)));
      out[i + 1] = Math.max(0, Math.min(255, Math.round((Math.min(0.25, g) + dither) * 255)));
      out[i + 2] = Math.max(0, Math.min(255, Math.round((Math.min(0.25, b) + dither) * 255)));
      out[i + 3] = 255;
    }
  }
  return out;
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function blob(u, v, cx, cy, r, asp) { const dx = (u - cx) * asp, dy = v - cy; return Math.exp(-(dx * dx + dy * dy) / (r * r)); }

const BG_VS = `
attribute vec2 a_p; varying vec2 v_uv;
void main(){ v_uv = a_p*0.5+0.5; gl_Position = vec4(a_p, 0.9999, 1.0); }`;
const BG_FS = `
precision mediump float;
uniform sampler2D u_bg; uniform vec2 u_off; varying vec2 v_uv;
void main(){
  vec3 c = texture2D(u_bg, vec2(v_uv.x, 1.0 - v_uv.y) * 0.94 + 0.03 + u_off).rgb;
  float vg = length((v_uv - 0.5) * vec2(1.15, 1.0));
  c *= 1.0 - 0.55 * smoothstep(0.45, 1.05, vg);
  gl_FragColor = vec4(c + vec3(0.006, 0.008, 0.016), 1.0);
}`;
const STAR_VS = `
attribute vec3 a_pos; attribute vec2 a_data; attribute vec3 a_col;
uniform mat4 u_proj, u_view, u_rot; uniform float u_dpr, u_time, u_twinkle;
varying float v_b; varying vec3 v_c;
void main(){
  float ph = a_pos.x*40.0 + a_pos.y*17.0 + a_pos.z*9.0;
  float tw = 1.0 - u_twinkle*0.18*(0.5 + 0.5*sin(u_time*(0.8 + fract(ph)*1.6) + ph));
  v_b = a_data.y * tw; v_c = a_col;
  gl_PointSize = a_data.x * u_dpr;
  gl_Position = u_proj*u_view*(u_rot*vec4(a_pos,1.0));
}`;
const STAR_FS = `
precision mediump float;
varying float v_b; varying vec3 v_c;
void main(){
  float d = length(gl_PointCoord-0.5);
  float a = exp(-d*d*26.0) + 0.22*smoothstep(0.5,0.0,d);
  gl_FragColor = vec4(v_c, clamp(a*v_b,0.0,1.0));
}`;

const POINT_VS = `
attribute vec3 a_pos; attribute vec2 a_data;
uniform mat4 u_proj, u_view, u_rot; uniform float u_dpr, u_time, u_twinkle, u_pulse;
varying float v_b;
void main(){
  float tw = 1.0 + u_twinkle*(0.3*sin(u_time*2.0 + a_pos.x*40.0 + a_pos.y*17.0) - 0.3);
  v_b = a_data.y * tw;
  gl_PointSize = a_data.x * u_dpr * (1.0 + u_pulse*0.4*sin(u_time*4.0));
  gl_Position = u_proj*u_view*(u_rot*vec4(a_pos,1.0));
}`;
const POINT_FS = `
precision mediump float;
uniform vec3 u_color; uniform float u_round;
varying float v_b;
void main(){
  float a = 1.0;
  if (u_round > 0.5) { float d = length(gl_PointCoord-0.5); a = smoothstep(0.5,0.0,d); a = a*a + smoothstep(0.12,0.0,d); }
  gl_FragColor = vec4(u_color, clamp(a*v_b,0.0,1.0));
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
  return sh;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

function buildSphere(latSeg = 64, lonSeg = 128) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= latSeg; i++) {
    const lat = 90 - (180 * i) / latSeg;
    for (let j = 0; j <= lonSeg; j++) {
      const lon = -180 + (360 * j) / lonSeg;
      pos.push(...latLonToVec3(lat, lon)); uv.push(j / lonSeg, i / latSeg);
    }
  }
  const row = lonSeg + 1;
  for (let i = 0; i < latSeg; i++) for (let j = 0; j < lonSeg; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
}

const FOV = 45 * DEG;
const DIST_MIN = 1.7, DIST_MAX = 4.5;

// createGlobe({ canvas, dataBase, onPick({lat,lon}), onHover({lat,lon,clientX,clientY}|null) })
// -> { setMarkers({start,end}), flyTo(lat,lon,ms,zoom), setActive(bool), setAutoRotatePaused(bool), resetView(), dispose(), usesFallbackTexture() }
export function createGlobe({ canvas, dataBase = 'data/viking-mdim', onPick, onHover, makeCanvas = () => document.createElement('canvas') }) {
  const gl = canvas.getContext('webgl2', { antialias: true }) || canvas.getContext('webgl', { antialias: true });
  if (!gl) throw new Error('WebGL kullanılamıyor');
  const sph = program(gl, SPHERE_VS, SPHERE_FS);
  const atm = program(gl, SPHERE_VS, ATMO_FS);
  const pts = program(gl, POINT_VS, POINT_FS);

  const mesh = buildSphere();
  const mkBuf = (target, data) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
  const posBuf = mkBuf(gl.ARRAY_BUFFER, mesh.pos), uvBuf = mkBuf(gl.ARRAY_BUFFER, mesh.uv), idxBuf = mkBuf(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);

  // yıldızlar
  const stars = makeStarField();
  const N = stars.count;
  const starPos = mkBuf(gl.ARRAY_BUFFER, stars.pos), starData = mkBuf(gl.ARRAY_BUFFER, stars.data), starCol = mkBuf(gl.ARRAY_BUFFER, stars.color);
  const starPrg = program(gl, STAR_VS, STAR_FS), bgPrg = program(gl, BG_VS, BG_FS);
  const reducedMotion = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const bgQuad = mkBuf(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
  const bgTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, bgTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, makeGalaxyPixels(1024, 512));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const dyn = { pos: gl.createBuffer(), data: gl.createBuffer() };
  const marker = { start: null, end: null };
  let arc = [];

  const tex = gl.createTexture();
  let fallbackTexture = false;
  const upload = (cv) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    const pot = (n) => (n & (n - 1)) === 0;
    if (pot(cv.width) && pot(cv.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  upload(makeProceduralTexture(makeCanvas)); fallbackTexture = true;
  let disposed = false;
  loadMarsTexture({ dataBase, makeCanvas, onCanvas: (cv) => { if (!disposed) { upload(cv); fallbackTexture = false; } } })
    .catch((e) => console.warn('[globe] Viking dokusu yüklenemedi, prosedürel yedek kullanılıyor:', e.message));

  // görünüm durumu
  const view = { yaw: 0.6, pitch: 0.35, dist: 3.2 };
  const vel = { yaw: 0, pitch: 0 };
  let dragging = false, lastX = 0, lastY = 0, lastT = 0, moved = 0, idleSince = 0;
  let spin = 0; // 0..1 otomatik dönüş çarpanı (yumuşak hızlanma)
  let autoPaused = false, active = true, fly = null, w = 1, h = 1, dpr = 1, raf = 0;

  function resize() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width * dpr)); h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(canvas); resize();

  function pickAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    return pickLatLon({
      ndcX: ((cx - r.left) / r.width) * 2 - 1, ndcY: 1 - ((cy - r.top) / r.height) * 2,
      fovY: FOV, aspect: r.width / r.height, distance: view.dist, yaw: view.yaw, pitch: view.pitch,
    });
  }

  const onDown = (e) => {
    if (fly) return;
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; lastT = performance.now(); vel.yaw = vel.pitch = 0;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY, now = performance.now(), dt = Math.max(1, now - lastT) / 1000;
      moved += Math.abs(dx) + Math.abs(dy);
      const k = 0.0055 * (view.dist / 3.2);
      view.yaw += dx * k; view.pitch = Math.max(-1.3, Math.min(1.3, view.pitch + dy * k));
      vel.yaw = 0.6 * vel.yaw + 0.4 * (dx * k / dt); vel.pitch = 0.6 * vel.pitch + 0.4 * (dy * k / dt);
      lastX = e.clientX; lastY = e.clientY; lastT = now;
      onHover?.(null);
    } else if (onHover) {
      const ll = pickAt(e.clientX, e.clientY);
      onHover(ll ? { ...ll, clientX: e.clientX, clientY: e.clientY } : null);
    }
  };
  const onUp = (e) => {
    if (!dragging) return;
    dragging = false; idleSince = performance.now();
    if (moved < 5) { vel.yaw = vel.pitch = 0; const ll = pickAt(e.clientX, e.clientY); if (ll) onPick?.(ll); }
  };
  const onLeave = () => { if (!dragging) onHover?.(null); };
  const onWheel = (e) => { e.preventDefault(); if (!fly) view.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, view.dist * Math.exp(e.deltaY * 0.001))); };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('wheel', onWheel, { passive: false });

  function rebuildDynamic() {
    const P = [], D = [];
    const add = (v, lift, size, b) => { P.push(v[0] * lift, v[1] * lift, v[2] * lift); D.push(size, b); };
    arc = [];
    if (marker.start && marker.end) {
      const pts_ = greatCircleArc(marker.start, marker.end, 96);
      const ang = greatCircleAngle(marker.start, marker.end);
      for (let i = 0; i < pts_.length; i++) arc.push({ v: pts_[i], lift: 1.006 + 0.1 * (ang / Math.PI) * Math.sin(Math.PI * i / (pts_.length - 1)) });
    }
    const arcN = arc.length; arc.forEach((a) => add(a.v, a.lift, 3, 0.9));
    const mk = (m) => { if (m) add(latLonToVec3(m.lat, m.lon), 1.012, 30, 1); };
    mk(marker.start); mk(marker.end);
    gl.bindBuffer(gl.ARRAY_BUFFER, dyn.pos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, dyn.data); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(D), gl.DYNAMIC_DRAW);
    dyn.arcN = arcN;
    dyn.base = new Float32Array(D); // yay parıltısı için taban boyut/parlaklık (yalnız görsel)
  }
  // Seçili iki nokta arasındaki yay boyunca akan parıltı (saf görsel; veri/rota anlamı yok).
  function animateArc(now) {
    const n = dyn.arcN || 0;
    if (n < 2 || !dyn.base) return;
    const phase = (now / 2600) % 1.3 - 0.15, d = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const g = Math.exp(-Math.pow((i / (n - 1) - phase) / 0.07, 2));
      d[i * 2] = dyn.base[i * 2] * (1 + 1.6 * g); d[i * 2 + 1] = Math.min(1, dyn.base[i * 2 + 1] * (0.55 + 0.9 * g));
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, dyn.data); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d);
  }
  rebuildDynamic();

  function bindAttr(buf, loc, size) { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
  function setMats(pr, proj, viewM, rot) {
    gl.uniformMatrix4fv(pr.u.u_proj, false, proj); gl.uniformMatrix4fv(pr.u.u_view, false, viewM); gl.uniformMatrix4fv(pr.u.u_rot, false, rot);
  }

  let lastFrame = performance.now();
  function frame(now) {
    raf = 0;
    if (!active || disposed) { lastFrame = now; return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    if (fly) {
      const t = Math.min(1, (now - fly.t0) / fly.ms), e = easeInOutCubic(t);
      view.yaw = fly.yaw0 + (fly.yaw1 - fly.yaw0) * e; view.pitch = fly.pitch0 + (fly.pitch1 - fly.pitch0) * e;
      spin = 0;
      view.dist = fly.dist0 + (fly.dist1 - fly.dist0) * e;
      if (t >= 1) { const r = fly.resolve; fly = null; r(); }
    } else if (dragging) {
      spin = 0;
    } else {
      view.yaw += vel.yaw * dt; view.pitch = Math.max(-1.3, Math.min(1.3, view.pitch + vel.pitch * dt));
      const decay = Math.exp(-2.5 * dt); vel.yaw *= decay; vel.pitch *= decay;
      const eligible = !autoPaused && active && now - idleSince > AUTO_SPIN_RESUME_MS && Math.hypot(vel.yaw, vel.pitch) < 0.3;
      spin = autoSpinStep(spin, dt, eligible);
      view.yaw += AUTO_SPIN_RAD_PER_S * spin * dt;
    }
    resize();
    const aspect = w / h, proj = perspective(FOV, aspect, 0.1, 200), viewM = translationZ(-view.dist);
    const rot = rot4(rotationMatrix(view.yaw, view.pitch));
    gl.viewport(0, 0, w, h); gl.clearColor(0.01, 0.012, 0.025, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // yıldızlar
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    // galaksi bandı (tek seferlik prosedürel doku; kare başına tek dörtgen)
    gl.useProgram(bgPrg.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bgTex); gl.uniform1i(bgPrg.u.u_bg, 0);
    const par = reducedMotion ? 0 : 1;
    gl.uniform2f(bgPrg.u.u_off, par * (0.010 * Math.sin(now / 1000 * 0.03) + 0.008 * Math.sin(view.yaw * 0.25)), par * 0.006 * Math.sin(now / 1000 * 0.021));
    bindAttr(bgQuad, gl.getAttribLocation(bgPrg.p, 'a_p'), 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // yıldızlar: kürenin dönüşünden bağımsız çok yavaş sürüklenme + hafif bağ
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(starPrg.p);
    const drift = reducedMotion ? 0 : now / 1000 * 0.004;
    setMats(starPrg, proj, viewM, rot4(rotationMatrix(view.yaw * 0.04 + drift, view.pitch * 0.04)));
    gl.uniform1f(starPrg.u.u_dpr, dpr); gl.uniform1f(starPrg.u.u_time, now / 1000); gl.uniform1f(starPrg.u.u_twinkle, reducedMotion ? 0 : 1);
    bindAttr(starPos, gl.getAttribLocation(starPrg.p, 'a_pos'), 3); bindAttr(starData, gl.getAttribLocation(starPrg.p, 'a_data'), 2);
    bindAttr(starCol, gl.getAttribLocation(starPrg.p, 'a_col'), 3);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.disableVertexAttribArray(gl.getAttribLocation(starPrg.p, 'a_col'));

    // gezegen
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.useProgram(sph.p); setMats(sph, proj, viewM, rot);
    gl.uniform1f(sph.u.u_scale, 1); gl.uniform3f(sph.u.u_cam, 0, 0, view.dist);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(sph.u.u_tex, 0);
    const aPos = gl.getAttribLocation(sph.p, 'a_pos'), aUv = gl.getAttribLocation(sph.p, 'a_uv');
    bindAttr(posBuf, aPos, 3); bindAttr(uvBuf, aUv, 2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);

    // atmosfer
    gl.useProgram(atm.p); setMats(atm, proj, viewM, rot);
    gl.uniform1f(atm.u.u_scale, 1.1); gl.uniform3f(atm.u.u_cam, 0, 0, view.dist);
    bindAttr(posBuf, gl.getAttribLocation(atm.p, 'a_pos'), 3); bindAttr(uvBuf, gl.getAttribLocation(atm.p, 'a_uv'), 2);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);

    // işaretler + yay
    const total = (dyn.arcN || 0) + (marker.start ? 1 : 0) + (marker.end ? 1 : 0);
    if (total) {
      animateArc(now);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(pts.p); setMats(pts, proj, viewM, rot);
      gl.uniform1f(pts.u.u_twinkle, 0);
      const aP = gl.getAttribLocation(pts.p, 'a_pos'), aD = gl.getAttribLocation(pts.p, 'a_data');
      bindAttr(dyn.pos, aP, 3); bindAttr(dyn.data, aD, 2);
      gl.uniform1f(pts.u.u_pulse, 0); gl.uniform1f(pts.u.u_round, 1); gl.uniform3f(pts.u.u_color, 0.8, 0.95, 1);
      if (dyn.arcN) { gl.drawArrays(gl.POINTS, 0, dyn.arcN); gl.uniform1f(pts.u.u_round, 0); gl.drawArrays(gl.LINE_STRIP, 0, dyn.arcN); }
      gl.uniform1f(pts.u.u_round, 1); gl.uniform1f(pts.u.u_pulse, 1);
      let o = dyn.arcN;
      if (marker.start) { gl.uniform3f(pts.u.u_color, 0.3, 0.9, 1); gl.drawArrays(gl.POINTS, o, 1); o++; }
      if (marker.end) { gl.uniform3f(pts.u.u_color, 1, 0.6, 0.2); gl.drawArrays(gl.POINTS, o, 1); }
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    setMarkers({ start = null, end = null } = {}) { marker.start = start; marker.end = end; rebuildDynamic(); },
    flyTo(lat, lon, ms = 1200, zoom = 1.75) {
      return new Promise((resolve) => {
        const yaw1 = -lon * DEG;
        fly = { t0: performance.now(), ms, resolve, yaw0: view.yaw, yaw1: view.yaw + normalizeAngle(yaw1 - view.yaw),
          pitch0: view.pitch, pitch1: Math.max(-1.3, Math.min(1.3, lat * DEG)), dist0: view.dist, dist1: zoom };
        vel.yaw = vel.pitch = 0;
      });
    },
    resetView() { view.dist = 3.2; },
    setActive(on) {
      active = !!on;
      if (!active) { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
      else if (!raf && !disposed) { lastFrame = performance.now(); raf = requestAnimationFrame(frame); }
    },
    setAutoRotatePaused(on) { autoPaused = !!on; },
    usesFallbackTexture: () => fallbackTexture,
    dispose() {
      disposed = true; if (raf) cancelAnimationFrame(raf); raf = 0; ro?.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('wheel', onWheel);
      if (fly) { fly.resolve(); fly = null; }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

