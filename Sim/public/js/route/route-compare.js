// Stage 34A — rota tercihleri ve segment karşılaştırması. Saf modül: DOM, ağ, dosya ve global durum yok.
//
// Aynı başlangıç/bitiş için senaryo ağırlıklı birkaç tercih ("en kısa", "dengeli", "en düşük eğim") planlanır ve
// yan yana karşılaştırılır. Her tercih, route-service.planWalkingRoute'u kendi costParams ön ayarıyla çağırır;
// böylece çözünürlük koruması, uç nokta kuralları ve no-data davranışı tek-rota akışıyla birebir aynıdır.
//
// PLANNING AID ONLY. Tercihler birer planlama göstergesidir; güvenli rota sertifikası değildir. Ağırlıklar birincil
// kaynaksız SENARYO parametreleridir (NASA eşiği değildir). Sert eğim sınırı (maxSlopeDeg) tüm tercihlerde aynıdır.
//
// Girdi:  { window, startLocal, endLocal, budget?, options?, preferences?, planner?, now? }
//   window: route-service.createDemWindow çıktısı. startLocal/endLocal: {xM,yM} yerel metre.
//   planner: (args) => planWalkingRoute benzeri sonuç (varsayılan planWalkingRoute; test/enjeksiyon için).
//   now: () => sayı (varsayılan performance.now, yoksa Date.now). Yalnız meta.totalMs/perPreferenceMs için kullanılır.
// Çıktı: { schema, version, status, reason, reasonEN, results, comparison, meta } — derin dondurulmuş.
//   results ve comparison zamana bağlı değildir; yalnız meta.totalMs ve meta.perPreferenceMs değişebilir.

import { DEFAULT_COST_PARAMS, STATUS } from './cost-model.js';
import { buildFieldForWindow, planWalkingRoute } from './route-service.js';
import { pointToSegment } from '../geo/geo.js';

export const ROUTE_COMPARE_SCHEMA = 'marswalk.route-compare.v1';
export const ROUTE_COMPARE_VERSION = '1.0.0';
export const ROUTE_PREFERENCE_IDS = Object.freeze(['shortest', 'balanced', 'gentle']);
export const REFERENCE_PREFERENCE_ID = 'balanced';
export const ROUTE_COMPARE_DISCLAIMER_TR = 'Planlama göstergesi — güvenli rota sertifikası değildir; ağırlıklar senaryo parametresidir.';
const SCENARIO_NOTE_TR = 'NASA eşiği değildir; senaryo ağırlığıdır.';
const HARD_LIMIT_NOTE_TR = 'Sert eğim sınırı (maxSlopeDeg) üç tercihte aynıdır; tercih bu sınırı gevşetmez.';
const DENSIFY_STEP_M = 1; // sapma ölçümü için yol örnekleme aralığı (metre)

// ---------------------------------------------------------------------------------------------------------------
// Tercih ağırlıkları. Yalnız YUMUŞAK maliyet ağırlıkları değişir; maxSlopeDeg 23A varsayılanından alınır ve sabittir.
// Tüm değerler TASARIM / SENARYO PARAMETRESİdir (birincil kaynak yok); eşik gibi sunulmamalıdır.

const HARD_MAX_SLOPE_DEG = DEFAULT_COST_PARAMS.maxSlopeDeg.value;
// "En kısa": eğim cezası en düşük. Konfor platosu geniş (14°'ye kadar ceza yok), pürüzlülük cezası zayıf, maliyet
// aralığı 1..2 — rota neredeyse düz uzunluk minimizasyonu.
const SHORTEST_COMFORTABLE_SLOPE_DEG = 14; // tasarım/senaryo parametresi
const SHORTEST_ROUGHNESS_REF_M = 0.5; // tasarım/senaryo parametresi
const SHORTEST_COST_K = 1; // tasarım/senaryo parametresi
const SHORTEST_COST_P = 1; // tasarım/senaryo parametresi
// "En düşük eğim": eğim ve pürüzlülük cezası yüksek; konfor platosu dar; uzun dolambaç kabul edilir.
const GENTLE_COMFORTABLE_SLOPE_DEG = 4; // tasarım/senaryo parametresi
const GENTLE_ROUGHNESS_REF_M = 0.12; // tasarım/senaryo parametresi
const GENTLE_COST_K = 30; // tasarım/senaryo parametresi
const GENTLE_COST_P = 2; // tasarım/senaryo parametresi

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o) && !ArrayBuffer.isView(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

function scenarioLeaf(value, unit, source) {
  return { value, unit, status: 'scenario', source };
}

const DEFAULT_LEAF_SRC = 'Referans senaryo: mevcut varsayılan costParams (cost-model DEFAULT_COST_PARAMS); tasarım/senaryo değeri';
const HARD_SRC = `Sert kısıt (23A varsayılanı, senaryo değeri): ${HARD_LIMIT_NOTE_TR}`;

/** Derin dondurulmuş tercih ön ayarları. Sıra: shortest, balanced, gentle. */
export const ROUTE_PREFERENCES = deepFreeze({
  shortest: {
    id: 'shortest',
    label: 'En kısa',
    description: 'Eğim ve pürüzlülük cezası en düşük; yol uzunluğuna öncelik verir. Sert eğim sınırı aynıdır.',
    status: 'scenario',
    source: 'Senaryo ağırlığı: en kısa tercih (route-compare.js sabitleri)',
    note: SCENARIO_NOTE_TR,
    costParams: {
      maxSlopeDeg: scenarioLeaf(HARD_MAX_SLOPE_DEG, 'deg', HARD_SRC),
      comfortableSlopeDeg: scenarioLeaf(SHORTEST_COMFORTABLE_SLOPE_DEG, 'deg', 'Senaryo ağırlığı: en kısa tercihte eğim cezası geniş konfor platosuyla geç başlar'),
      roughnessRefM: scenarioLeaf(SHORTEST_ROUGHNESS_REF_M, 'm', 'Senaryo ağırlığı: pürüzlülük cezası zayıf'),
      costK: scenarioLeaf(SHORTEST_COST_K, '1', 'Senaryo ağırlığı: maliyet aralığı 1..2 (neredeyse düz)'),
      costP: scenarioLeaf(SHORTEST_COST_P, '1', 'Senaryo ağırlığı: maliyet eğrisi üssü'),
    },
  },
  balanced: {
    id: 'balanced',
    label: 'Dengeli',
    description: 'Mevcut varsayılan ağırlıklar (referans). Uzunluk ile eğim/pürüzlülük arasında orta bir denge kurar.',
    status: 'scenario',
    source: 'Referans: mevcut varsayılan costParams (cost-model DEFAULT_COST_PARAMS)',
    note: SCENARIO_NOTE_TR,
    costParams: {
      maxSlopeDeg: scenarioLeaf(HARD_MAX_SLOPE_DEG, 'deg', HARD_SRC),
      comfortableSlopeDeg: scenarioLeaf(DEFAULT_COST_PARAMS.comfortableSlopeDeg.value, 'deg', DEFAULT_LEAF_SRC),
      roughnessRefM: scenarioLeaf(DEFAULT_COST_PARAMS.roughnessRefM.value, 'm', DEFAULT_LEAF_SRC),
      costK: scenarioLeaf(DEFAULT_COST_PARAMS.costK.value, '1', DEFAULT_LEAF_SRC),
      costP: scenarioLeaf(DEFAULT_COST_PARAMS.costP.value, '1', DEFAULT_LEAF_SRC),
    },
  },
  gentle: {
    id: 'gentle',
    label: 'En düşük eğim',
    description: 'Eğim ve pürüzlülük cezası yüksek; daha uzun bir yol pahasına eğimden kaçınır. Sert eğim sınırı aynıdır.',
    status: 'scenario',
    source: 'Senaryo ağırlığı: en düşük eğim tercihi (route-compare.js sabitleri)',
    note: SCENARIO_NOTE_TR,
    costParams: {
      maxSlopeDeg: scenarioLeaf(HARD_MAX_SLOPE_DEG, 'deg', HARD_SRC),
      comfortableSlopeDeg: scenarioLeaf(GENTLE_COMFORTABLE_SLOPE_DEG, 'deg', 'Senaryo ağırlığı: en düşük eğim tercihinde eğim cezası dar platodan başlar'),
      roughnessRefM: scenarioLeaf(GENTLE_ROUGHNESS_REF_M, 'm', 'Senaryo ağırlığı: pürüzlülük cezası yüksek'),
      costK: scenarioLeaf(GENTLE_COST_K, '1', 'Senaryo ağırlığı: en kötü hücre maliyeti 1+30'),
      costP: scenarioLeaf(GENTLE_COST_P, '1', 'Senaryo ağırlığı: maliyet eğrisi üssü 2'),
    },
  },
});

// Plan çağrısına geçen sayısal parametreler (cost-model resolveParams sayı kabul eder; status 'scenario' olur).
function paramsFor(id) {
  const cp = ROUTE_PREFERENCES[id].costParams;
  return { maxSlopeDeg: cp.maxSlopeDeg.value, comfortableSlopeDeg: cp.comfortableSlopeDeg.value,
    roughnessRefM: cp.roughnessRefM.value, costK: cp.costK.value, costP: cp.costP.value };
}

/** Dış tercih takma adları (UI kimlikleri). `flattest` = en düşük eğim (`gentle`). */
export const ROUTE_PREFERENCE_ALIASES = Object.freeze({ flattest: 'gentle' });

/** Tercih kimliğini kanonik id'ye çevirir (takma ad dahil). Bilinmeyen kimlik için null; fırlatmaz. */
export function resolveRoutePreferenceId(id) {
  const canon = Object.prototype.hasOwnProperty.call(ROUTE_PREFERENCE_ALIASES, id) ? ROUTE_PREFERENCE_ALIASES[id] : id;
  return ROUTE_PREFERENCE_IDS.includes(canon) ? canon : null;
}

/** Kanonik tercihin sayısal cost parametreleri (planWalkingRoute `params`). Bilinmeyen id için TypeError. */
export function routePreferenceParams(id) {
  if (!ROUTE_PREFERENCE_IDS.includes(id)) throw new TypeError(`Bilinmeyen rota tercihi: ${String(id)}`);
  return paramsFor(id);
}

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v) => (isFiniteNum(v) ? v : null);
const errMsg = (err) => { try { return String(err && err.message ? err.message : err); } catch { return 'açıklanamayan hata'; } };

// ---------------------------------------------------------------------------------------------------------------
// Tercih metni (UI için; Alparslan 34B kullanır)

/** Türkçe UI metni: ad, kısa açıklama, senaryo notu ve feragat. Bilinmeyen id için açık hata. */
export function describeRoutePreference(id) {
  if (!ROUTE_PREFERENCE_IDS.includes(id)) throw new TypeError(`Bilinmeyen rota tercihi: ${String(id)}`);
  const p = ROUTE_PREFERENCES[id];
  return deepFreeze({
    id,
    label: p.label,
    description: p.description,
    note: SCENARIO_NOTE_TR,
    disclaimerTR: ROUTE_COMPARE_DISCLAIMER_TR,
    text: `${p.label}. ${p.description} ${SCENARIO_NOTE_TR} ${ROUTE_COMPARE_DISCLAIMER_TR}`,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Girdi doğrulama

function normalisePreferences(list) {
  if (list === undefined) return { ok: true, ids: [...ROUTE_PREFERENCE_IDS] };
  if (!Array.isArray(list) || list.length === 0) return { ok: false, reason: 'preferences boş olmayan bir dizi olmalı' };
  const seen = new Set();
  for (const id of list) {
    if (!ROUTE_PREFERENCE_IDS.includes(id)) return { ok: false, reason: `Bilinmeyen rota tercihi: ${String(id)}` };
    if (seen.has(id)) return { ok: false, reason: `Tekrarlanan rota tercihi: ${id}` };
    seen.add(id);
  }
  return { ok: true, ids: ROUTE_PREFERENCE_IDS.filter((id) => seen.has(id)) }; // sabit sıra
}

function defaultNow() {
  return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now() : Date.now();
}

// ---------------------------------------------------------------------------------------------------------------
// Özet ve segment

// Puan kaynağı: önce planner'ın stats'ı (yalnız eva_walkability); yoksa yol hücrelerinin cost-model puanı.
// Bölgesel ön planlamada puan üretilmez (dürüstlük koruması) — null döner.
// NOT: Puan tercihin KENDİ ağırlıklarıyla hesaplanır; tercihler arası puan farkı bu yüzden anlamsızdır. Karşılaştırma
// için ortak ölçek compareAll içinde (referans ağırlıkları, yol hücreleri) ayrıca hesaplanır.
function scoreSummary(win, params, res) {
  const st = res.stats;
  if (res.mode !== 'eva_walkability') return { minScore: null, meanScore: null, scoreSource: 'yok (bölgesel ön planlama: yürünebilirlik puanı üretilmez)' };
  const minS = numOrNull(st.minScore), meanS = numOrNull(st.meanScore);
  if (minS !== null && meanS !== null) {
    return { minScore: minS, meanScore: meanS, scoreSource: 'stats; tercihin kendi ağırlıklarıyla (izlenen hücreler)' };
  }
  const field = buildFieldForWindow(win, params);
  let mn = Infinity, sum = 0, cnt = 0;
  for (const p of res.path) {
    const idx = p.row * win.cols + p.col;
    if (field.status[idx] !== STATUS.OK) continue;
    const s = field.score[idx];
    if (s < mn) mn = s;
    sum += s; cnt++;
  }
  if (cnt === 0) return { minScore: null, meanScore: null, scoreSource: 'yok (yol hücrelerinde geçilebilir puan yok)' };
  return { minScore: mn, meanScore: sum / cnt, scoreSource: 'hücre puanları; tercihin kendi ağırlıklarıyla (yol hücreleri, stats puanı yoktu)' };
}

// Ortak ölçek: verilen alanın (referans ağırlıkları) puanı, yalnız yol hücrelerinde. Yol geçilebilir hücrelerdedir.
function minScoreOnPath(field, win, path) {
  let mn = Infinity;
  for (const p of path) {
    const idx = p.row * win.cols + p.col;
    if (field.status[idx] !== STATUS.OK) continue;
    if (field.score[idx] < mn) mn = field.score[idx];
  }
  return mn === Infinity ? null : mn;
}

// En zor segment: segment başına ortalama maliyet çarpanı (cost / lengthM) en yüksek olan; eşitlikte ilk.
function hardestSegment(segments) {
  let best = null;
  segments.forEach((s, i) => {
    if (!(s.lengthM > 0)) return;
    const perM = s.cost / s.lengthM;
    if (best === null || perM > best.costPerM) {
      best = { index: i, from: s.from, to: s.to, lengthM: s.lengthM, cost: s.cost, costPerM: perM, score: numOrNull(s.score) };
    }
  });
  return best;
}

function summarise(win, params, res) {
  const st = res.stats;
  const eva = res.mode === 'eva_walkability';
  const sc = scoreSummary(win, params, res);
  return {
    lengthM: st.lengthM,
    estimatedDurationS: eva ? numOrNull(st.estimatedDurationS) : null,
    durationSource: eva && numOrNull(st.estimatedDurationS) !== null
      ? 'stats.estimatedDurationS (senaryo hızı; eğim ve giysi modellenmez)' : null,
    elevationGainM: numOrNull(st.elevationGainM),
    elevationLossM: numOrNull(st.elevationLossM),
    maxSlopeDeg: numOrNull(st.maxSlopeDeg),
    meanScore: sc.meanScore,
    minScore: sc.minScore,
    scoreSource: sc.scoreSource,
    totalCost: numOrNull(st.totalCost),
    costMetric: st.costMetric ?? null,
    costComparable: false, // tercihler farklı ağırlık ölçeklerinde; toplam maliyet tercihler arası karşılaştırılmaz
    hardestSegment: hardestSegment(res.segments),
  };
}

function entryFor(win, id, params, res) {
  const base = { id, label: ROUTE_PREFERENCES[id].label, status: res.status, reason: res.reason ?? null, reasonEN: res.reasonEN ?? null, mode: res.mode ?? null };
  if (res.status !== 'ok') return deepFreeze({ ...base, path: [], segments: [], stats: null, summary: null });
  return deepFreeze({
    ...base,
    modeNote: res.modeNote ?? null,
    path: res.path,
    segments: res.segments,
    stats: res.stats,
    summary: summarise(win, params, res),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Karşılaştırma

function pathsIdentical(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].row !== b[i].row || a[i].col !== b[i].col) return false;
  return true;
}

function densify(points, step) {
  const out = [];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / step));
    for (let s = 0; s < n; s++) out.push({ x: a.x + (b.x - a.x) * s / n, y: a.y + (b.y - a.y) * s / n });
  }
  if (points.length) out.push(points[points.length - 1]);
  return out;
}

function distanceToPolyline(p, line) {
  if (line.length === 1) return Math.hypot(p.x - line[0].x, p.y - line[0].y);
  let d = Infinity;
  for (let k = 1; k < line.length; k++) {
    const q = pointToSegment(p.x, p.y, line[k - 1].x, line[k - 1].y, line[k].x, line[k].y);
    if (q.distance < d) d = q.distance;
  }
  return d;
}

/** Tek yönlü (aday -> referans) yanal sapma: aday yolu 1 m aralıkla örneklenir; her örneğin referansa uzaklığı. */
function lateralDeviation(candPath, refPath) {
  const line = refPath.map((p) => ({ x: p.xM, y: p.yM }));
  const pts = densify(candPath.map((p) => ({ x: p.xM, y: p.yM })), DENSIFY_STEP_M);
  let sum = 0, max = 0;
  for (const p of pts) {
    const d = distanceToPolyline(p, line);
    sum += d;
    if (d > max) max = d;
  }
  return { direction: 'candidate_to_reference', meanM: sum / pts.length, maxM: max };
}

const diffOrNull = (a, b) => (a === null || b === null ? null : a - b);

function compareOne(id, cand, ref, commonMin) {
  const identical = pathsIdentical(cand.path, ref.path);
  const cs = cand.summary, rs = ref.summary;
  const pct = rs.lengthM > 0 ? (100 * (cs.lengthM - rs.lengthM)) / rs.lengthM : null;
  const cMin = commonMin(cand.path), rMin = commonMin(ref.path);
  return {
    id, label: cand.label, available: true, reason: null,
    identicalPath: identical,
    identicalNote: identical
      ? 'Bu tercih referansla aynı yolu üretti. Eşiğin ayırt ediciliği bu çiftte düşük olabilir; fark yokluğu normal bir sonuçtur.'
      : null,
    deltaLengthM: cs.lengthM - rs.lengthM,
    deltaLengthPct: pct,
    deltaMaxSlopeDeg: diffOrNull(cs.maxSlopeDeg, rs.maxSlopeDeg),
    deltaMinScore: diffOrNull(cMin, rMin),
    minScoreBasis: 'ortak ölçek: referans (dengeli) ağırlıkları, yalnız yol hücreleri',
    lateralDeviation: identical
      ? { direction: 'candidate_to_reference', meanM: 0, maxM: 0 }
      : lateralDeviation(cand.path, ref.path),
  };
}

function compareAll(results, ids, win) {
  const ref = REFERENCE_PREFERENCE_ID;
  if (!ids.includes(ref)) {
    return { referenceId: ref, available: false, reason: 'Karşılaştırma referansı (dengeli) istenen tercihler arasında değil', items: {} };
  }
  const refRes = results[ref];
  if (refRes.status !== 'ok') {
    return { referenceId: ref, available: false, reason: `Referans tercih (dengeli) başarısız: ${refRes.reason}`, items: {} };
  }
  // Puan Δ'ları ortak ölçekte: bölgesel pencerede puan yoktur; EVA'da referans alanı (aynı ağırlıklar) kullanılır.
  let refField = null;
  if (win && win.resolutionClass === 'eva_walkability') {
    try { refField = buildFieldForWindow(win, paramsFor(ref)); } catch { refField = null; }
  }
  const commonMin = (path) => (refField ? minScoreOnPath(refField, win, path) : null);
  const items = {};
  for (const id of ids) {
    if (id === ref) continue;
    const cand = results[id];
    items[id] = cand.status === 'ok'
      ? compareOne(id, cand, refRes, commonMin)
      : { id, label: cand.label, available: false, reason: `Tercih başarısız: ${cand.reason}` };
  }
  return { referenceId: ref, available: true, reason: null, items };
}

// ---------------------------------------------------------------------------------------------------------------
// Genel API

function invalidOutput(ids, reasonTR, reasonEN, totalMs) {
  const results = {};
  for (const id of ids) results[id] = deepFreeze({ id, label: ROUTE_PREFERENCES[id].label, status: 'invalid_input', reason: reasonTR, reasonEN, mode: null, path: [], segments: [], stats: null, summary: null });
  return deepFreeze({
    schema: ROUTE_COMPARE_SCHEMA, version: ROUTE_COMPARE_VERSION,
    status: 'invalid_input', reason: reasonTR, reasonEN, results,
    comparison: { referenceId: REFERENCE_PREFERENCE_ID, available: false, reason: reasonTR, items: {} },
    meta: { requested: ids, referenceId: REFERENCE_PREFERENCE_ID, plannerCalls: 0, totalMs, perPreferenceMs: {}, caveatTR: ROUTE_COMPARE_DISCLAIMER_TR },
  });
}

function aggregate(ids, results) {
  const failed = ids.filter((id) => results[id].status !== 'ok');
  if (failed.length === 0) return { status: 'ok', reason: null, reasonEN: null };
  const okCount = ids.length - failed.length;
  const trs = [...new Set(failed.map((id) => results[id].reason))];
  const ens = [...new Set(failed.map((id) => results[id].reasonEN))];
  if (okCount === 0 && trs.length === 1) {
    return { status: 'failed', reason: trs[0], reasonEN: ens[0] };
  }
  const label = (id) => results[id].label;
  return {
    status: okCount === 0 ? 'failed' : 'partial',
    reason: failed.map((id) => `${label(id)}: ${results[id].reason}`).join(' | '),
    reasonEN: failed.map((id) => `${label(id)}: ${results[id].reasonEN}`).join(' | '),
  };
}

/**
 * Aynı başlangıç/bitiş için seçili tercihleri planlar ve karşılaştırır. Hiçbir zaman istisna fırlatmaz.
 * Bir tercihin başarısızlığı diğerlerini engellemez; planner nedenleri AYNEN iletilir.
 */
export function planRouteVariants(input) {
  let now;
  try {
    now = input && typeof input === 'object' && input.now !== undefined ? input.now : defaultNow;
    if (typeof now !== 'function') throw new TypeError('now bir fonksiyon olmalı');
  } catch (err) {
    return invalidOutput(ROUTE_PREFERENCE_IDS, errMsg(err), errMsg(err), 0);
  }
  const t0 = now();
  const totalMs = () => now() - t0;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalidOutput(ROUTE_PREFERENCE_IDS, 'planRouteVariants argümanı nesne olmalı', 'planRouteVariants argument must be an object', totalMs());
  }
  const pref = normalisePreferences(input.preferences);
  if (!pref.ok) return invalidOutput(ROUTE_PREFERENCE_IDS, pref.reason, pref.reason, totalMs());
  const ids = pref.ids;
  const planner = input.planner === undefined ? planWalkingRoute : input.planner;
  if (typeof planner !== 'function') return invalidOutput(ids, 'planner bir fonksiyon olmalı', 'planner must be a function', totalMs());

  const results = {};
  const perPreferenceMs = {};
  for (const id of ids) {
    const params = paramsFor(id);
    const t1 = now();
    let res;
    try {
      res = planner({
        window: input.window, params, startLocal: input.startLocal, endLocal: input.endLocal,
        budget: input.budget, options: input.options,
      });
    } catch (err) {
      res = { status: 'invalid_input', reason: `beklenmeyen hata: ${errMsg(err)}`, reasonEN: `unexpected error: ${errMsg(err)}`, path: [], segments: [], stats: null };
    }
    perPreferenceMs[id] = now() - t1;
    results[id] = (res && res.status === 'ok')
      ? entryFor(input.window, id, params, res)
      : deepFreeze({ id, label: ROUTE_PREFERENCES[id].label, status: res?.status ?? 'invalid_input', reason: res?.reason ?? null, reasonEN: res?.reasonEN ?? null, mode: res?.mode ?? null, path: [], segments: [], stats: null, summary: null });
  }

  const agg = aggregate(ids, results);
  return deepFreeze({
    schema: ROUTE_COMPARE_SCHEMA, version: ROUTE_COMPARE_VERSION,
    status: agg.status, reason: agg.reason, reasonEN: agg.reasonEN,
    results,
    comparison: compareAll(results, ids, input.window),
    meta: {
      requested: ids, referenceId: REFERENCE_PREFERENCE_ID, plannerCalls: ids.length,
      totalMs: totalMs(), perPreferenceMs,
      caveatTR: ROUTE_COMPARE_DISCLAIMER_TR,
      caveatEN: 'Planning aid, not a safety certificate. Preference weights are scenario parameters, not NASA thresholds.',
    },
  });
}
