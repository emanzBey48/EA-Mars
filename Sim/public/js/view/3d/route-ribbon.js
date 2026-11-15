// Stage 33A — planlanan rotanın zemine oturan şerit (ribbon) geometrisi. Saf CPU veri modülü:
// DOM, WebGL, ağ ve dosya erişimi yok. Çıktı marker-mesh.js mesh sözleşmesini izler: typed positions/normals/indices,
// yerel bounds ve provenance. Render/shader Aşama 33B'dedir; bu modül yalnız geometri üretir.
// PLANLAMA GÖSTERGESİ: şerit rota görselleştirmesidir; güvenli rota, canlı telemetri veya gerçek rover izi iddiası değildir.

export const ROUTE_RIBBON_SCHEMA_VERSION = 1;

export const ROUTE_RIBBON_NOTE =
  'Planlama göstergesi — güvenli rota değildir; rota görselleştirmesidir. Nihai rota kararı ekip ve görev kontrolündedir.';
export const ROUTE_RIBBON_NOTE_EN =
  'Planning indicator, not a safe route; route visualisation only. Final route decisions rest with the crew and mission control.';

/**
 * Tasarım/senaryo parametreleri. Birincil kaynakları yoktur; görsel okunabilirlik için seçilmiştir.
 * - widthM: tam şerit genişliği (metre, yerel düzlem).
 * - groundOffsetM: zemin üstü ofset, GÖRSEL DİSPLAY metresi (dikey ölçekten sonra eklenir; z-fighting önleme).
 * - sampleSpacingM: yakın/sabit örnekleme adımı (metre); ~1 m DTM hücresi.
 * - maxSegmentTurnRad: bu açıyı aşan köşelerde miter yerine kesik (bevel) birleşim kullanılır.
 * - maxVertices: performans üst sınırı; aşılırsa adım seyreltilir, hata üretilmez.
 */
export const ROUTE_RIBBON_DEFAULTS = Object.freeze({
  widthM: 1.2,
  groundOffsetM: 0.06,
  sampleSpacingM: 1.0,
  maxSegmentTurnRad: Math.PI / 3,
  maxVertices: 200000,
});

/** Görsel/senaryo ayarları (birincil kaynak yok). Mesafe kuralları yalnız cameraXY verildiğinde açılır. */
export const ROUTE_RIBBON_TUNING = Object.freeze({
  nearM: 20,               // bu mesafe içinde en sık adım ve taban genişlik
  farM: 200,               // bu mesafe ötesinde en seyrek adım ve en büyük genişlik
  farSpacingFactor: 4,     // farSpacingM verilmezse sampleSpacingM * bu değer
  farWidthGrowthMax: 2.5,  // uzakta genişlik çarpanı üst sınırı (okunabilirlik)
  miterLimit: 2,           // 1/cos(θ/2) bu değeri aşarsa miter yerine bevel
  areaEpsM2: 1e-9,         // bu alanın altındaki üçgen dejenere sayılır
  zeroLengthM: 1e-9,       // bu uzunluktaki yol parçası atlanır
  maxSpacingPasses: 12,    // maxVertices aşılırsa adım en fazla bu kadar iki katına çıkarılır
});

const COUNTER_KEYS = [
  'samples', 'skippedUnknown', 'breaks', 'degenerate', 'miterJoints', 'bevelJoints',
  'droppedRuns', 'cappedRuns', 'spacingPasses', 'invalidSegments', 'zeroLengthSegments',
];

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isPoint = (p) => p !== null && typeof p === 'object' && isFiniteNumber(p.xM) && isFiniteNumber(p.yM);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Twice the signed area of triangle (a, b, c) in the XY plane; positive = counter-clockwise.
const twiceArea = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/**
 * Builds a draped route ribbon from a planned path (local metres).
 *
 * Rules:
 * - Every path segment is split into equal pieces (count from the scenario spacing at its midpoint), so the sample
 *   set does not depend on the walk direction.
 * - Each rail point (left/right edge) is sampled separately; its Z follows the local slope.
 * - A rail point with unknown elevation (no-data, invalid, out_of_bounds, unavailable) breaks the ribbon there.
 *   No triangle spans a break, and no value is replaced with 0 or a neighbour average.
 * - Sharp turns (> maxSegmentTurnRad) use a bevel joint (outer-side triangle); milder turns use a clamped miter.
 *   Every emitted triangle has a positive XY signed area; a link that would fold is broken and counted.
 *
 * @param {object} args
 * @param {Array<{xM:number,yM:number}>} args.path planned route points in local metres (planRoute `path`)
 * @param {Array<object>} [args.segments] planRoute `segments` (segments[i] joins path[i] and path[i+1])
 * @param {(xM:number, yM:number) => {status:string, value?:number|null}} args.sampleElevation injected sampler
 * @param {{referenceElevationM:number, verticalScale:number}|null} [args.displayConfig] display Z = (zM - ref) * scale
 * @param {number} [args.widthM] full width at the camera (metres)
 * @param {number} [args.groundOffsetM] display-metre lift above the ground
 * @param {number} [args.sampleSpacingM] base sampling step (metres)
 * @param {number} [args.maxSegmentTurnRad] turn angle above which a bevel joint is used
 * @param {number} [args.maxVertices] vertex cap; exceeded -> coarser sampling, then whole runs are dropped
 * @param {{xM:number,yM:number}|null} [args.cameraXY] enables distance-based spacing and width
 * @param {number} [args.nearM] distance (m) where the finest spacing and base width apply
 * @param {number} [args.farM] distance (m) where the coarsest spacing and maximum width apply
 * @param {number} [args.nearSpacingM] spacing at nearM (defaults to sampleSpacingM)
 * @param {number} [args.farSpacingM] spacing at farM (defaults to sampleSpacingM * farSpacingFactor)
 * @param {object|null} [args.provenance] optional caller provenance, copied into meta
 */
export function buildRouteRibbon({
  path,
  segments = null,
  sampleElevation,
  displayConfig = null,
  widthM = ROUTE_RIBBON_DEFAULTS.widthM,
  groundOffsetM = ROUTE_RIBBON_DEFAULTS.groundOffsetM,
  sampleSpacingM = ROUTE_RIBBON_DEFAULTS.sampleSpacingM,
  maxSegmentTurnRad = ROUTE_RIBBON_DEFAULTS.maxSegmentTurnRad,
  maxVertices = ROUTE_RIBBON_DEFAULTS.maxVertices,
  cameraXY = null,
  nearM,
  farM,
  nearSpacingM,
  farSpacingM,
  provenance = null,
} = {}) {
  if (typeof sampleElevation !== 'function') {
    throw new TypeError('sampleElevation(xM, yM) returning {status, value} is required');
  }
  let display = null;
  if (displayConfig !== null && displayConfig !== undefined) {
    if (!isFiniteNumber(displayConfig.referenceElevationM) || !isFiniteNumber(displayConfig.verticalScale) ||
        displayConfig.verticalScale <= 0) {
      throw new TypeError('displayConfig requires finite referenceElevationM and positive verticalScale');
    }
    display = { ref: displayConfig.referenceElevationM, scale: displayConfig.verticalScale };
  }
  if (!isFiniteNumber(widthM) || widthM <= 0) throw new RangeError('widthM must be a positive finite number');
  if (!isFiniteNumber(groundOffsetM) || groundOffsetM < 0) throw new RangeError('groundOffsetM must be a finite number >= 0');
  if (!isFiniteNumber(sampleSpacingM) || sampleSpacingM <= 0) throw new RangeError('sampleSpacingM must be > 0');
  if (!isFiniteNumber(maxSegmentTurnRad) || maxSegmentTurnRad <= 0 || maxSegmentTurnRad > Math.PI) {
    throw new RangeError('maxSegmentTurnRad must be in (0, PI]');
  }
  if (!Number.isInteger(maxVertices) || maxVertices < 1) throw new RangeError('maxVertices must be a positive integer');

  const T = ROUTE_RIBBON_TUNING;
  let cam = null;
  let nearDist = null;
  let farDist = null;
  if (cameraXY !== null && cameraXY !== undefined) {
    if (!isPoint(cameraXY)) throw new TypeError('cameraXY must be {xM, yM} finite');
    cam = { xM: cameraXY.xM, yM: cameraXY.yM };
    nearDist = nearM ?? T.nearM;
    farDist = farM ?? T.farM;
    if (!isFiniteNumber(nearDist) || !isFiniteNumber(farDist) || nearDist < 0 || farDist <= nearDist) {
      throw new RangeError('nearM/farM require 0 <= nearM < farM');
    }
  }
  for (const [name, v] of [['nearSpacingM', nearSpacingM], ['farSpacingM', farSpacingM]]) {
    if (v !== undefined && (!isFiniteNumber(v) || v <= 0)) throw new RangeError(`${name} must be > 0`);
  }

  const opt = {
    sampleElevation, display, widthM, groundOffsetM, sampleSpacingM, maxSegmentTurnRad, maxVertices,
    cam, nearM: nearDist, farM: farDist, nearSpacingM: nearSpacingM ?? null, farSpacingM: farSpacingM ?? null,
    segments: Array.isArray(segments) ? segments : null,
    segmentsProvided: segments !== null && segments !== undefined,
    pathLength: Array.isArray(path) ? path.length : 0,
    provenance,
  };

  if (!Array.isArray(path)) return finish(opt, emptyPass(), null, 'path_not_array', 1);
  if (path.length < 2) return finish(opt, emptyPass(), null, 'path_too_short', 1);
  const prep = prepareChains(path);
  if (prep.chains.length === 0) return finish(opt, emptyPass(prep), prep, 'no_valid_segments', 1);

  // Adım seyreltme: maxVertices aşılırsa örnekleme aralığı iki katına çıkar (hata yok).
  let mult = 1;
  let pass = 0;
  let result = buildPass(prep, opt, mult);
  while (result.potentialVertices > opt.maxVertices && pass < T.maxSpacingPasses) {
    mult *= 2;
    pass++;
    result = buildPass(prep, opt, mult);
  }
  result.counters.spacingPasses = pass;
  return finish(opt, result, prep, null, mult);
}

// ------------------------------------------------------------------------------------------------------------
// Path preparation

function prepareChains(path) {
  const chains = [];
  let current = null;
  let sCum = 0;
  let invalidSegments = 0;
  let zeroLengthSegments = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (!isPoint(a) || !isPoint(b)) {
      invalidSegments++;
      if (current !== null) { chains.push(current); current = null; }
      continue;
    }
    const dx = b.xM - a.xM;
    const dy = b.yM - a.yM;
    const len = Math.hypot(dx, dy);
    if (len <= ROUTE_RIBBON_TUNING.zeroLengthM) { zeroLengthSegments++; continue; }
    const ux = dx / len;
    const uy = dy / len;
    const seg = { idx: i, x0: a.xM, y0: a.yM, x1: b.xM, y1: b.yM, len, ux, uy, nx: -uy, ny: ux, s0: sCum };
    sCum += len;
    if (current === null) current = [];
    current.push(seg);
  }
  if (current !== null) chains.push(current);
  return { chains, totalLengthM: sCum, invalidSegments, zeroLengthSegments };
}

// Parameters t in [0, 1) at which a segment is sampled.
// Without a camera: equal pieces, so the sample set is identical when the path is reversed.
// With a camera: stepped from the segment start using the spacing at the current distance (dense near, sparse far).
function segmentParameters(seg, spacingAt, distTo, adaptive) {
  if (!adaptive) {
    const n = Math.max(1, Math.ceil(seg.len / spacingAt(0)));
    const ts = new Array(n);
    for (let j = 0; j < n; j++) ts[j] = j / n;
    return ts;
  }
  const ts = [0];
  let sd = 0;
  for (;;) {
    sd += spacingAt(distTo(seg.x0 + seg.ux * sd, seg.y0 + seg.uy * sd));
    if (sd >= seg.len - 1e-9) break;
    ts.push(sd / seg.len);
  }
  return ts;
}

// Sharp or highly folded corner: bevel (two cross-sections at the vertex, outer-side triangle later).
// Milder corner: one miter cross-section whose rails meet on the bisector.
function addJoin(cross, prev, seg, x, y, s, hw, opt, counters) {
  const dot = clamp(prev.ux * seg.ux + prev.uy * seg.uy, -1, 1);
  const theta = Math.acos(dot);
  const cosHalf = Math.cos(theta / 2);
  const turnSign = Math.sign(prev.ux * seg.uy - prev.uy * seg.ux); // > 0: left turn (outer side = right)
  if (theta <= opt.maxSegmentTurnRad && cosHalf >= 1 / ROUTE_RIBBON_TUNING.miterLimit) {
    let mx = prev.nx + seg.nx;
    let my = prev.ny + seg.ny;
    const ml = Math.hypot(mx, my); // = 2 cos(theta/2) > 0 because theta < PI here
    mx /= ml;
    my /= ml;
    cross.push({ kind: 'miter', x, y, vx: mx, vy: my, hw: hw / cosHalf, s, segIdx: seg.idx, turnSign });
    counters.miterJoints++;
  } else {
    cross.push({ kind: 'bevelIn', x, y, vx: prev.nx, vy: prev.ny, hw, s, segIdx: prev.idx, turnSign });
    cross.push({ kind: 'bevelOut', x, y, vx: seg.nx, vy: seg.ny, hw, s, segIdx: seg.idx, turnSign });
    counters.bevelJoints++;
  }
}

// ------------------------------------------------------------------------------------------------------------
// One sampling/meshing pass at a given spacing multiplier

function buildPass(prep, opt, mult) {
  const T = ROUTE_RIBBON_TUNING;
  const counters = Object.fromEntries(COUNTER_KEYS.map((k) => [k, 0]));
  const cam = opt.cam;
  const distTo = (x, y) => (cam ? Math.hypot(x - cam.xM, y - cam.yM) : 0);

  // Scenario spacing: fixed without a camera; near->far interpolation with a camera (dense near, sparse far).
  const spacingAt = (d) => {
    if (!cam) return mult * opt.sampleSpacingM;
    const near = opt.nearSpacingM ?? opt.sampleSpacingM;
    const far = opt.farSpacingM ?? opt.sampleSpacingM * T.farSpacingFactor;
    const t = clamp((d - opt.nearM) / (opt.farM - opt.nearM), 0, 1);
    return mult * (near + (far - near) * t);
  };
  // Half width; scenario choice: grows with distance up to farWidthGrowthMax for readability.
  const halfWidthAt = (d) => {
    if (!cam) return opt.widthM / 2;
    const t = clamp((d - opt.nearM) / (opt.farM - opt.nearM), 0, 1);
    return (opt.widthM / 2) * (1 + (T.farWidthGrowthMax - 1) * t);
  };

  // 1. Cross-sections (stations) along every chain.
  const cross = [];
  const chainStarts = new Set();
  for (const chain of prep.chains) {
    chainStarts.add(cross.length);
    for (let k = 0; k < chain.length; k++) {
      const seg = chain[k];
      const ts = segmentParameters(seg, spacingAt, distTo, cam !== null);
      for (let j = 0; j < ts.length; j++) {
        const t = ts[j];
        const x = seg.x0 + (seg.x1 - seg.x0) * t;
        const y = seg.y0 + (seg.y1 - seg.y0) * t;
        const s = seg.s0 + seg.len * t;
        const hw = halfWidthAt(distTo(x, y));
        if (j === 0 && k > 0) {
          addJoin(cross, chain[k - 1], seg, x, y, s, hw, opt, counters);
        } else {
          cross.push({ kind: 'single', x, y, vx: seg.nx, vy: seg.ny, hw, s, segIdx: seg.idx, turnSign: 0 });
        }
      }
    }
    const last = chain[chain.length - 1];
    cross.push({
      kind: 'single', x: last.x1, y: last.y1, vx: last.nx, vy: last.ny,
      hw: halfWidthAt(distTo(last.x1, last.y1)), s: last.s0 + last.len, segIdx: last.idx, turnSign: 0,
    });
  }

  for (let i = 0; i < cross.length; i++) {
    const c = cross[i];
    if (chainStarts.has(i)) c.link = 'none';
    else if (cross[i - 1].kind === 'bevelIn' && c.kind === 'bevelOut') c.link = 'bevel';
    else c.link = 'strip';
  }

  // 2. Sample every rail point independently. Unknown -> the cross-section is invalid (no value is invented).
  const sampleAt = (x, y) => {
    const r = opt.sampleElevation(x, y);
    if (r && r.status === 'ok' && isFiniteNumber(r.value)) return { ok: true, z: r.value };
    counters.skippedUnknown++;
    return { ok: false, z: null };
  };
  for (let i = 0; i < cross.length; i++) {
    const c = cross[i];
    counters.samples++;
    c.Lx = c.x + c.vx * c.hw; c.Ly = c.y + c.vy * c.hw;
    c.Rx = c.x - c.vx * c.hw; c.Ry = c.y - c.vy * c.hw;
    c.L = sampleAt(c.Lx, c.Ly);
    c.R = sampleAt(c.Rx, c.Ry);
    if (c.kind === 'bevelIn') c.C = sampleAt(c.x, c.y);
    else if (c.kind === 'bevelOut') c.C = cross[i - 1].C;
    else c.C = null;
    c.valid = c.L.ok && c.R.ok && (c.C === null || c.C.ok);
  }

  // 3. Links between consecutive cross-sections. A link is kept only if both ends are valid and its triangles
  //    have positive XY area (no fold, no degenerate triangle).
  const eps = 2 * T.areaEpsM2; // compared against twice-area values
  const linkOk = new Uint8Array(cross.length);
  for (let i = 1; i < cross.length; i++) {
    const p = cross[i - 1];
    const c = cross[i];
    if (c.link === 'none') continue;
    if (!p.valid || !c.valid) { counters.breaks++; continue; }
    if (c.link === 'strip') {
      const a1 = twiceArea(p.Lx, p.Ly, p.Rx, p.Ry, c.Lx, c.Ly);
      const a2 = twiceArea(p.Rx, p.Ry, c.Rx, c.Ry, c.Lx, c.Ly);
      if (a1 > eps && a2 > eps) linkOk[i] = 1;
      else { counters.degenerate++; counters.breaks++; }
    } else {
      const [ax, ay, bx, by] = c.turnSign > 0 ? [p.Rx, p.Ry, c.Rx, c.Ry] : [p.Lx, p.Ly, c.Lx, c.Ly];
      const area = Math.abs(twiceArea(ax, ay, bx, by, c.x, c.y));
      if (area > eps) linkOk[i] = 1;
      else { counters.degenerate++; counters.breaks++; }
    }
  }

  // 4. Runs: maximal chains of valid cross-sections joined by valid links.
  const rawRuns = [];
  let start = -1;
  for (let i = 0; i < cross.length; i++) {
    if (!cross[i].valid) {
      if (start >= 0) { rawRuns.push([start, i - 1]); start = -1; }
      continue;
    }
    if (start < 0) start = i;
    else if (!linkOk[i]) { rawRuns.push([start, i - 1]); start = i; }
  }
  if (start >= 0) rawRuns.push([start, cross.length - 1]);

  const keep = [];
  let potentialVertices = 0;
  for (const [a, b] of rawRuns) {
    const lengthM = cross[b].s - cross[a].s;
    if (b - a < 1 || !(lengthM > T.zeroLengthM)) { counters.droppedRuns++; continue; }
    let bevels = 0;
    for (let i = a + 1; i <= b; i++) if (cross[i].link === 'bevel') bevels++;
    const need = 2 * (b - a + 1) + bevels;
    keep.push({ a, b, need });
    potentialVertices += need;
  }

  // 5. Emit vertices, triangles and run records (vertex cap: whole runs are dropped, never a partial run).
  const outPos = [];
  const outUv = [];
  const outSource = [];
  const outIdx = [];
  const runs = [];
  let vertexCount = 0;
  const toDisplayZ = (zM) => (opt.display
    ? (zM - opt.display.ref) * opt.display.scale + opt.groundOffsetM
    : zM + opt.groundOffsetM);
  const pushVertex = (x, y, zM, u, v) => {
    outPos.push(Math.fround(x), Math.fround(y), Math.fround(toDisplayZ(zM)));
    outUv.push(Math.fround(u), Math.fround(v));
    outSource.push(Math.fround(zM));
    return vertexCount++;
  };

  for (const { a, b, need } of keep) {
    if (vertexCount + need > opt.maxVertices) { counters.cappedRuns++; continue; }
    const startIndex = vertexCount;
    const indexStart = outIdx.length;
    const L = [];
    const R = [];
    const Cv = [];
    const segSet = new Set();
    let bevelJoints = 0;
    for (let i = a; i <= b; i++) {
      const c = cross[i];
      segSet.add(c.segIdx);
      Cv[i - a] = -1;
      if (i > a && c.link === 'bevel') {
        Cv[i - a] = pushVertex(c.x, c.y, c.C.z, c.s, 0.5);
        bevelJoints++;
      }
      L[i - a] = pushVertex(c.Lx, c.Ly, c.L.z, c.s, 0);
      R[i - a] = pushVertex(c.Rx, c.Ry, c.R.z, c.s, 1);
    }
    for (let i = a + 1; i <= b; i++) {
      const p = cross[i - 1];
      const c = cross[i];
      const pi = i - 1 - a;
      const ci = i - a;
      if (c.link === 'strip') {
        outIdx.push(L[pi], R[pi], L[ci], R[pi], R[ci], L[ci]);
      } else {
        const outerPrev = c.turnSign > 0 ? [p.Rx, p.Ry, R[pi]] : [p.Lx, p.Ly, L[pi]];
        const outerCur = c.turnSign > 0 ? [c.Rx, c.Ry, R[ci]] : [c.Lx, c.Ly, L[ci]];
        const C = Cv[ci];
        const area = twiceArea(outerPrev[0], outerPrev[1], outerCur[0], outerCur[1], c.x, c.y);
        if (area > 0) outIdx.push(outerPrev[2], outerCur[2], C);
        else outIdx.push(outerPrev[2], C, outerCur[2]);
      }
    }
    runs.push({
      startIndex,
      vertexCount: vertexCount - startIndex,
      indexStart,
      indexCount: outIdx.length - indexStart,
      triangleCount: (outIdx.length - indexStart) / 3,
      lengthM: cross[b].s - cross[a].s,
      startU: cross[a].s,
      endU: cross[b].s,
      crossSectionCount: b - a + 1,
      bevelJoints,
      segmentScores: segmentScoresFor(opt, segSet),
    });
  }

  return {
    counters,
    runs,
    positions: new Float32Array(outPos),
    uvs: new Float32Array(outUv),
    sourceElevationsM: new Float32Array(outSource),
    indices: Uint32Array.from(outIdx),
    vertexCount,
    potentialVertices,
  };
}

// Attaches planner scores only when `segments` lines up with `path`; absent values stay null (no invented score).
function segmentScoresFor(opt, segSet) {
  if (!opt.segmentsProvided) return null;
  if (!opt.segments || opt.segments.length !== opt.pathLength - 1) return null;
  const finiteOrNull = (v) => (isFiniteNumber(v) ? v : null);
  return [...segSet].filter((i) => Number.isInteger(i) && i >= 0 && i < opt.segments.length).sort((x, y) => x - y)
    .map((i) => {
      const s = opt.segments[i] ?? {};
      return { segmentIndex: i, score: finiteOrNull(s.score), cost: finiteOrNull(s.cost), lengthM: finiteOrNull(s.lengthM) };
    });
}

function emptyPass(prep = null) {
  const counters = Object.fromEntries(COUNTER_KEYS.map((k) => [k, 0]));
  if (prep) {
    counters.invalidSegments = prep.invalidSegments;
    counters.zeroLengthSegments = prep.zeroLengthSegments;
  }
  return {
    counters, runs: [], positions: new Float32Array(0), uvs: new Float32Array(0),
    sourceElevationsM: new Float32Array(0), indices: new Uint32Array(0), vertexCount: 0, potentialVertices: 0,
  };
}

// ------------------------------------------------------------------------------------------------------------
// Result assembly

function finish(opt, pass, prep, emptyReason, spacingMultiplier) {
  const counters = pass.counters;
  if (prep) {
    counters.invalidSegments = prep.invalidSegments;
    counters.zeroLengthSegments = prep.zeroLengthSegments;
  }
  const normals = computeNormals(pass.positions, pass.indices);
  const triangleCount = pass.indices.length / 3;
  const bounds = pass.vertexCount > 0 ? boundsOf(pass.positions) : null;
  const sourceRange = pass.vertexCount > 0 ? rangeOf(pass.sourceElevationsM) : null;
  const reason = emptyReason ?? (pass.vertexCount === 0 ? 'no_valid_samples' : null);
  const meta = buildMeta(opt, prep, counters, {
    vertexCount: pass.vertexCount, triangleCount, spacingMultiplier, emptyReason: reason, sourceRange,
  });
  return deepFreeze({
    positions: pass.positions,
    normals,
    uvs: pass.uvs,
    indices: pass.indices,
    sourceElevationsM: pass.sourceElevationsM,
    vertexCount: pass.vertexCount,
    triangleCount,
    bounds,
    runs: pass.runs,
    counters: { ...counters },
    meta,
  });
}

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const abX = positions[b] - positions[a];
    const abY = positions[b + 1] - positions[a + 1];
    const abZ = positions[b + 2] - positions[a + 2];
    const acX = positions[c] - positions[a];
    const acY = positions[c + 1] - positions[a + 1];
    const acZ = positions[c + 2] - positions[a + 2];
    const nx = abY * acZ - abZ * acY;
    const ny = abZ * acX - abX * acZ;
    const nz = abX * acY - abY * acX;
    normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
    normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
    normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (len > 0) {
      normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
    } else {
      normals[i + 2] = 1; // vertex not used by any triangle
    }
  }
  return normals;
}

function boundsOf(positions) {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < positions.length; i += 3) {
    b.minX = Math.min(b.minX, positions[i]); b.maxX = Math.max(b.maxX, positions[i]);
    b.minY = Math.min(b.minY, positions[i + 1]); b.maxY = Math.max(b.maxY, positions[i + 1]);
    b.minZ = Math.min(b.minZ, positions[i + 2]); b.maxZ = Math.max(b.maxZ, positions[i + 2]);
  }
  return b;
}

function rangeOf(values) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) { min = Math.min(min, values[i]); max = Math.max(max, values[i]); }
  return { min, max };
}

function buildMeta(opt, prep, counters, extra) {
  const T = ROUTE_RIBBON_TUNING;
  const display = opt.display;
  const exaggerated = display !== null && display.scale !== 1;
  const provenance = opt.provenance ? JSON.parse(JSON.stringify(opt.provenance)) : null;
  return deepFreeze({
    schemaVersion: ROUTE_RIBBON_SCHEMA_VERSION,
    kind: 'route-ribbon (görsel planlama şeridi)',
    note: ROUTE_RIBBON_NOTE,
    noteEN: ROUTE_RIBBON_NOTE_EN,
    units: {
      xM: 'local metres (x east, y north)',
      zM: 'source elevation, Mars 2000 metres (sourceElevationsM)',
      positionsZ: display
        ? 'display metres: (zM - referenceElevationM) * verticalScale + groundOffsetM'
        : 'source metres: zM + groundOffsetM (no displayConfig given)',
      uvs: 'u = cumulative path length in metres (path start = 0); v = 0 left rail, 0.5 bevel apex, 1 right rail',
    },
    displayConfig: display ? { referenceElevationM: display.ref, verticalScale: display.scale } : null,
    verticalScaleApplied: display !== null,
    verticalExaggerated: exaggerated,
    verticalExaggerationLabel: exaggerated ? `görsel dikey abartı ×${display.scale}` : null,
    parameters: {
      widthM: opt.widthM,
      groundOffsetM: opt.groundOffsetM,
      sampleSpacingM: opt.sampleSpacingM,
      sampleSpacingUsedM: opt.sampleSpacingM * extra.spacingMultiplier,
      spacingMultiplier: extra.spacingMultiplier,
      maxSegmentTurnRad: opt.maxSegmentTurnRad,
      maxVertices: opt.maxVertices,
      cameraXY: opt.cam ? { ...opt.cam } : null,
      nearM: opt.cam ? opt.nearM : null,
      farM: opt.cam ? opt.farM : null,
      nearSpacingM: opt.cam ? opt.nearSpacingM : null,
      farSpacingM: opt.cam ? opt.farSpacingM : null,
      farWidthGrowthMax: opt.cam ? T.farWidthGrowthMax : null,
      miterLimit: T.miterLimit,
      labels: {
        widthM: 'görsel/senaryo parametresi',
        groundOffsetM: 'görsel parametre (display metresi)',
        sampleSpacingM: 'görsel örnekleme parametresi (~1 m DTM)',
        maxSegmentTurnRad: 'görsel birleşim eşiği (senaryo)',
        maxVertices: 'performans üst sınırı (senaryo)',
        farWidthGrowthMax: 'okunabilirlik çarpanı (senaryo)',
      },
    },
    source: {
      pathPoints: opt.pathLength,
      pathLengthM: prep ? prep.totalLengthM : 0,
      segmentsProvided: opt.segmentsProvided,
      segmentScoresAvailable: opt.segmentsProvided && Array.isArray(opt.segments) &&
        opt.segments.length === opt.pathLength - 1,
    },
    provenance,
    sourceElevationRangeM: extra.sourceRange,
    vertexCount: extra.vertexCount,
    triangleCount: extra.triangleCount,
    emptyReason: extra.emptyReason,
    counters: { ...counters },
    caveats: [
      'Planlama göstergesi; güvenli rota veya güvenlik sertifikası değildir.',
      'Şerit planlanan rota çizgisini zemine oturtan görsel geometridir; gerçek rover izi veya insan adım izi değildir.',
      'No-data/bilinmeyen kot üzerinde şerit kırılır; boşluk üzerinde üçgen kurulmaz ve kot 0 veya komşu ortalaması ile doldurulmaz.',
      'Görsel dikey abartı yalnız display Z değerini etkiler; kaynak kot (zM) değişmez.',
      'Genişlik ve adım değerleri görsel/senaryo parametreleridir; birincil kaynağı yoktur.',
    ],
  });
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value)) return value; // typed arrays cannot be frozen
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
