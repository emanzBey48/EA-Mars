// Worker boundary for route planning. Cost-field preparation stays off the UI thread.
import { handlePlanMessage } from './pathfinder.js';
import { buildFieldForWindow, createDemWindow, explainLocal, planWalkingRoute } from './route-service.js';

function workerError(id, err) {
  let message;
  try { message = String(err && err.message ? err.message : err); } catch { message = 'açıklanamayan hata'; }
  return { type: 'error', id, message };
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
        const result = planWalkingRoute({ window, field, params, startLocal: message.startLocal, endLocal: message.endLocal, options: message.options });
        scope.postMessage({ type: 'result', id, result });
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
