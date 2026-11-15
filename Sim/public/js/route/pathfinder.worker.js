// Worker boundary for route planning. Cost-field preparation stays off the UI thread.
import { handlePlanMessage } from './pathfinder.js';
import { buildFieldForWindow, createDemWindow, explainLocal, planWalkingRoute } from './route-service.js';
import { planDeadlineRoutes } from './deadline-planner.js';
import {
  REFERENCE_PREFERENCE_ID, describeRoutePreference, planRouteVariants,
  resolveRoutePreferenceId, routePreferenceParams,
} from './route-compare.js';

function workerError(id, err) {
  let message;
  try { message = String(err && err.message ? err.message : err); } catch { message = 'açıklanamayan hata'; }
  return { type: 'error', id, message };
}

// main.js `options.preference` / `options.costParams` ve üst düzey `costParams` gönderir. Maliyet modelinde bu
// alanların karşılığı yoktur; tercih parametreleri yalnız tercih kimliğinden (route-compare) gelir. Bu iki anahtar
// planWalkingRoute'a ASLA geçmez (planRoute bilinmeyen options anahtarını reddeder).
const PREFERENCE_OPTION_KEYS = ['preference', 'costParams'];

function plannerOptionsOf(options) {
  if (options === undefined || options === null || typeof options !== 'object' || Array.isArray(options)) return options;
  const out = {};
  for (const k of Object.keys(options)) if (!PREFERENCE_OPTION_KEYS.includes(k)) out[k] = options[k];
  return out;
}

// Çözüm sırası: message.preference → message.options.preference → yok (undefined).
function requestedPreferenceOf(message) {
  if (message.preference !== undefined) return message.preference;
  const o = message.options;
  if (o && typeof o === 'object' && !Array.isArray(o) && o.preference !== undefined) return o.preference;
  return undefined;
}

/** Bind the versioned worker protocol; legacy `plan` messages remain supported. */
export function attachWorker(scope) {
  if (!scope || typeof scope.postMessage !== 'function') return false;
  let window = null;
  let field = null;
  let params;

  scope.onmessage = (e) => {
    const message = e?.data;
    const id = message && typeof message === 'object' ? message.id : undefined;
    try {
      if (!message || typeof message !== 'object') throw new TypeError('worker mesajı nesne olmalı');
      if (message.type === 'plan') {
        // Backwards-compatible low-level A* request.
        scope.postMessage(handlePlanMessage(message));
        return;
      }
      if (message.type === 'init-window') {
        // Clear first so a failed replacement can never leave an old DEM active by accident.
        window = null; field = null; params = undefined;
        if (!message.window || typeof message.window !== 'object') throw new TypeError('window nesnesi gerekli');
        const candidate = createDemWindow(message.window);
        const candidateField = buildFieldForWindow(candidate, message.params);
        window = candidate;
        field = candidateField;
        params = message.params;
        // Keep worker-owned arrays intact for route/explain calls; send snapshots to the UI.
        const heatmap = {
          score: field.score.slice(), status: field.status.slice(), rows: window.rows, cols: window.cols,
          nwXM: window.nwXM, nwYM: window.nwYM, cellSizeM: window.cellSizeM,
        };
        scope.postMessage({ type: 'window-ready', id, heatmap });
        return;
      }
      if (message.type === 'plan-walking-route') {
        if (!window) throw new Error('önce init-window gönderilmeli');
        const requested = requestedPreferenceOf(message);
        const options = plannerOptionsOf(message.options);
        const budget = message.budget;
        if (requested === undefined) {
          // Tercih belirtilmedi: eski davranış (init-window params + field), mesaj biçimi değişmez.
          const result = planWalkingRoute({ window, field, params, startLocal: message.startLocal, endLocal: message.endLocal, options, budget });
          scope.postMessage({ type: 'result', id, result });
          return;
        }
        const preference = resolveRoutePreferenceId(requested);
        if (preference === null) throw new Error(`Bilinmeyen rota tercihi: ${String(requested)}`);
        const meta = { type: 'result', id, preference, requestedPreference: requested, preferenceNote: describeRoutePreference(preference).text };
        if (preference === REFERENCE_PREFERENCE_ID) {
          // Dengeli = init-window alanı (referans); yeni alan kurulmaz.
          const result = planWalkingRoute({ window, field, params, startLocal: message.startLocal, endLocal: message.endLocal, options, budget });
          scope.postMessage({ ...meta, result });
          return;
        }
        // Diğer tercihler kendi ön ayar parametreleriyle; alan window önbelleğinden gelir (aynı params tekrar kurulmaz).
        const prefParams = routePreferenceParams(preference);
        const prefField = buildFieldForWindow(window, prefParams);
        const result = planWalkingRoute({ window, field: prefField, params: prefParams, startLocal: message.startLocal, endLocal: message.endLocal, options, budget });
        scope.postMessage({ ...meta, result });
        return;
      }
      if (message.type === 'plan-route-variants') {
        if (!window) throw new Error('önce init-window gönderilmeli');
        const preferences = Array.isArray(message.preferences)
          ? message.preferences.map((p) => resolveRoutePreferenceId(p) ?? p)
          : message.preferences;
        // planRouteVariants her tercih için planWalkingRoute'u params ile çağırır; alan window önbelleğinden gelir.
        const result = planRouteVariants({
          window, startLocal: message.startLocal, endLocal: message.endLocal, budget: message.budget, preferences,
        });
        scope.postMessage({ type: 'variants-result', id, result });
        return;
      }
      if (message.type === 'plan-deadline-routes') {
        if (!window) throw new Error('önce init-window gönderilmeli');
        const result = planDeadlineRoutes({
          window,
          referenceField: field,
          startLocal: message.startLocal,
          endLocal: message.endLocal,
          deadlineSeconds: message.deadlineSeconds,
          walkSpeedMps: message.walkSpeedMps,
          timeScale: message.timeScale,
        });
        scope.postMessage({ type: 'deadline-result', id, result });
        return;
      }
      if (message.type === 'explain-cell') {
        if (!window) throw new Error('önce init-window gönderilmeli');
        const p = message.point;
        const result = explainLocal(window, field, p?.xM, p?.yM);
        scope.postMessage({ type: 'cell-result', id, result });
        return;
      }
      throw new Error(`Bilinmeyen mesaj tipi: ${String(message.type)}`);
    } catch (err) {
      scope.postMessage(workerError(id, err));
    }
  };
  return true;
}

// Yalnız gerçek bir WorkerGlobalScope içinde bağlan: ana iş parçacığında (window) veya Node'da içe aktarmak
// window.onmessage'ı ezmez.
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  attachWorker(self);
}
