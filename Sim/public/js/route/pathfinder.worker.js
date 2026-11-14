// Yalnız kablolama: mantık pathfinder.js içindedir. Modül Worker olarak başlatılır: new Worker(url, { type: 'module' }).
import { handlePlanMessage } from './pathfinder.js';

/** scope.onmessage'ı planlayıcıya bağlar. Başarıyla bağlandıysa true. */
export function attachWorker(scope) {
  if (!scope || typeof scope.postMessage !== 'function') return false;
  scope.onmessage = (e) => scope.postMessage(handlePlanMessage(e.data));
  return true;
}

// Yalnız gerçek bir WorkerGlobalScope içinde bağlan: ana iş parçacığında (window) veya Node'da içe aktarmak
// window.onmessage'ı ezmez.
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  attachWorker(self);
}
