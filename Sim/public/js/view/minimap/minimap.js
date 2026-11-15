// Interactive 2D minimap presentation for an already-prepared terrain image.
// This view never samples a provider or computes route costs. Missing/outside coverage stays blank.

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function routeScoreColor(score) {
  if (!Number.isFinite(score)) return '#63e6ff';
  const value = clamp(score, 0, 100);
  if (value <= 50) {
    const t = value / 50;
    return `rgb(${Math.round(245 + 10 * t)} ${Math.round(62 + 86 * t)} ${Math.round(50 - 20 * t)})`;
  }
  const t = (value - 50) / 50;
  return `rgb(${Math.round(255 - 185 * t)} ${Math.round(148 + 74 * t)} ${Math.round(30 + 148 * t)})`;
}

function niceStep(value) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1e-9)));
  for (const factor of [1, 2, 5, 10]) if (factor * magnitude >= value) return factor * magnitude;
  return 10 * magnitude;
}

/**
 * Creates an interactive minimap controller around a canvas element.
 *
 * terrain: `{ canvas, bounds: { nwXM, nwYM, widthM, heightM } }`, as returned by
 * `buildTerrainImage()` in view/render.js. The image already encodes DTM no-data with a hatch;
 * pixels outside its bounds are left as the background and are never inferred to be traversable.
 *
 * `onPointSelected({ kind, xM, yM })` is called only after an explicit start/end selection mode
 * has been set. This module does not dispatch routing work or claim a point is walkable.
 */
export function createMinimap({
  canvas,
  terrain = null,
  descriptor = null,
  endpoints = { start: null, end: null },
  selectionMode = null,
  onPointSelected = () => {},
  onCellClick = () => {},
} = {}) {
  if (!canvas?.getContext) throw new Error('Minimap için canvas öğesi gereklidir.');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Minimap canvas 2D context oluşturulamadı.');

  const state = {
    terrain,
    globalBase: null,
    terrainPixels: null,
    terrainPixelsReadable: false,
    descriptor,
    endpoints: { start: endpoints.start ?? null, end: endpoints.end ?? null },
    overlays: {
      geologySegments: [],
      archiveTraverse: null,
      footprintTrail: null,
      geologyVisible: false,
      archiveVisible: false,
      orthoOverlay: null,
      orthoVisible: true,
    },
    planning: { heatmap: null, route: null, segments: null, heatmapVisible: false },
    selectionMode: selectionMode === 'start' || selectionMode === 'end' ? selectionMode : null,
    centerXM: 0,
    centerYM: 0,
    pxPerM: 1,
    minPxPerM: 0.00001,
    maxPxPerM: 64,
    dragging: false,
    draggingEndpoint: null,
    draggedPos: null,
    hoverEndpoint: null,
    pointerId: null,
    downX: 0,
    downY: 0,
    lastX: 0,
    lastY: 0,
    dpr: 1,
    width: 0,
    height: 0,
    destroyed: false,
    selectionMessage: '',
  };
  let routeAnimationFrame = null;

  const bounds = () => state.terrain?.bounds ?? null;
  const validBounds = (b) => b && [b.nwXM, b.nwYM, b.widthM, b.heightM].every(Number.isFinite) && b.widthM > 0 && b.heightM > 0;
  let preserveUserViewOnTerrainLoad = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || canvas.clientWidth || canvas.width || 1);
    const height = Math.max(1, rect.height || canvas.clientHeight || canvas.height || 1);
    state.dpr = Math.max(1, window.devicePixelRatio || 1);
    state.width = width;
    state.height = height;
    const pixelWidth = Math.round(width * state.dpr);
    const pixelHeight = Math.round(height * state.dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function fitLocal() {
    const b = bounds();
    if (!validBounds(b)) return;
    resize();
    state.centerXM = b.nwXM + b.widthM / 2;
    state.centerYM = b.nwYM - b.heightM / 2;
    state.pxPerM = clamp(Math.min(state.width / b.widthM, state.height / b.heightM) * 0.94, state.minPxPerM, state.maxPxPerM);
    draw();
  }

  function fit() {
    preserveUserViewOnTerrainLoad = true;
    fitLocal();
  }

  function fitGlobal() {
    const b = state.globalBase?.bounds;
    if (!validBounds(b)) return;
    preserveUserViewOnTerrainLoad = true;
    resize();
    state.centerXM = b.nwXM + b.widthM / 2;
    state.centerYM = b.nwYM - b.heightM / 2;
    state.pxPerM = clamp(Math.min(state.width / b.widthM, state.height / b.heightM) * 0.94, state.minPxPerM, state.maxPxPerM);
    draw();
  }

  // The prepared terrain image marks non-OK DTM cells with a magenta hatch.
  // Cache that visual-only mask; interaction must not start surface sampling.
  function cacheTerrainMask() {
    state.terrainPixels = null;
    state.terrainPixelsReadable = false;
    const source = state.terrain?.canvas;
    if (!source || !Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width < 1 || source.height < 1) return;
    try {
      const image = source.getContext('2d')?.getImageData(0, 0, source.width, source.height);
      if (!image) return;
      state.terrainPixels = image;
      state.terrainPixelsReadable = true;
    } catch {
      // Fail closed when the image cannot be inspected.
    }
  }

  function selectionRejection(xM, yM) {
    const b = bounds();
    if (!state.terrain?.canvas || !validBounds(b)) return 'DTM kapsamı yüklenmedi; nokta seçilemez.';
    if (xM < b.nwXM || xM >= b.nwXM + b.widthM || yM > b.nwYM || yM <= b.nwYM - b.heightM) return 'Nokta yüklenen DTM kapsamının dışında.';
    if (!state.terrainPixelsReadable || !state.terrainPixels) return 'DTM hücresinin durumu okunamıyor; nokta seçilemez.';
    const { width, height, data } = state.terrainPixels;
    const col = Math.min(width - 1, Math.floor((xM - b.nwXM) / b.widthM * width));
    const row = Math.min(height - 1, Math.floor((b.nwYM - yM) / b.heightM * height));
    const offset = (row * width + col) * 4;
    // buildTerrainImage paints non-OK cells as (255,0,255) or (90,0,90).
    if (data[offset + 1] === 0 && data[offset] === data[offset + 2]) return 'Bu hücre no-data veya geçersiz; başka bir nokta seçin.';
    return '';
  }

  function worldToScreen(xM, yM) {
    return {
      x: state.width / 2 + (xM - state.centerXM) * state.pxPerM,
      y: state.height / 2 - (yM - state.centerYM) * state.pxPerM,
    };
  }

  function visibleWorldBounds() {
    const halfWidth = state.width / (2 * state.pxPerM);
    const halfHeight = state.height / (2 * state.pxPerM);
    return {
      minX: state.centerXM - halfWidth,
      maxX: state.centerXM + halfWidth,
      minY: state.centerYM - halfHeight,
      maxY: state.centerYM + halfHeight,
    };
  }

  function drawWorldImage(image, imageBounds) {
    if (!image || !validBounds(imageBounds)) return;
    const view = visibleWorldBounds();
    const left = Math.max(imageBounds.nwXM, view.minX);
    const right = Math.min(imageBounds.nwXM + imageBounds.widthM, view.maxX);
    const top = Math.min(imageBounds.nwYM, view.maxY);
    const bottom = Math.max(imageBounds.nwYM - imageBounds.heightM, view.minY);
    if (!(right > left && top > bottom)) return;
    const sx = (left - imageBounds.nwXM) / imageBounds.widthM * image.width;
    const sy = (imageBounds.nwYM - top) / imageBounds.heightM * image.height;
    const sw = (right - left) / imageBounds.widthM * image.width;
    const sh = (top - bottom) / imageBounds.heightM * image.height;
    const p = worldToScreen(left, top);
    ctx.drawImage(image, sx, sy, sw, sh, p.x, p.y, (right - left) * state.pxPerM, (top - bottom) * state.pxPerM);
  }

  function drawGlobalBase() {
    const base = state.globalBase;
    if (!base || !Array.isArray(base.levels) || base.levels.length === 0) return;
    const targetMPerPx = 1 / state.pxPerM;
    const level = base.levels.reduce((best, item) =>
      Math.abs(Math.log(item.mPerPx / targetMPerPx)) < Math.abs(Math.log(best.mPerPx / targetMPerPx)) ? item : best,
    );
    ctx.imageSmoothingEnabled = true;
    for (const tile of level.tiles) drawWorldImage(tile.image, tile.bounds);
    if (base.regional) drawWorldImage(base.regional.image, base.regional.bounds);
  }

  function screenToWorld(x, y) {
    return {
      xM: state.centerXM + (x - state.width / 2) / state.pxPerM,
      yM: state.centerYM - (y - state.height / 2) / state.pxPerM,
    };
  }

  function hitEndpoint(px, py, threshold = 18) {
    for (const kind of ['start', 'end']) {
      const pt = state.endpoints[kind];
      if (pt && Number.isFinite(pt.xM) && Number.isFinite(pt.yM)) {
        const scr = worldToScreen(pt.xM, pt.yM);
        if (Math.hypot(scr.x - px, scr.y - py) <= threshold) {
          return kind;
        }
      }
    }
    return null;
  }

  function drawMarker(point, label, color, isDragged = false) {
    if (!point || !Number.isFinite(point.xM) || !Number.isFinite(point.yM)) return;
    const p = worldToScreen(point.xM, point.yM);
    if (isDragged) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = color === '#52c7a5' ? 'rgba(82, 199, 165, 0.35)' : 'rgba(255, 176, 74, 0.35)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, isDragged ? 9 : 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.strokeText(label, p.x + 11, p.y - 9);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, p.x + 11, p.y - 9);
  }

  function drawScale() {
    const meters = niceStep(110 / state.pxPerM);
    const px = meters * state.pxPerM;
    const label = meters >= 1000 ? `${(meters / 1000).toLocaleString('en-US')} km` : `${meters} m`;
    const y = state.height - 22;
    ctx.fillStyle = 'rgba(10, 12, 16, .78)';
    ctx.fillRect(10, y - 21, px + 25, 29);
    ctx.fillStyle = '#fff';
    ctx.fillRect(17, y - 6, px, 3);
    ctx.fillRect(17, y - 9, 2, 9);
    ctx.fillRect(17 + px - 2, y - 9, 2, 9);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(label, 20 + px, y - 4);
  }

  function drawNorth() {
    const x = state.width - 25;
    ctx.fillStyle = 'rgba(10, 12, 16, .78)';
    ctx.fillRect(x - 18, 10, 36, 49);
    ctx.beginPath();
    ctx.moveTo(x, 16); ctx.lineTo(x - 8, 36); ctx.lineTo(x, 32); ctx.lineTo(x + 8, 36);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', x, 53);
    ctx.textAlign = 'start';
  }

  function drawAttribution() {
    const d = state.descriptor;
    const title = state.globalBase
      ? `Viking MDIM 2.1 · ${Math.round(state.globalBase.nativeMPerPx)} m/px · lisans: ${state.globalBase.license}`
      : (d?.title ?? 'HiRISE DTM');
    const attribution = state.globalBase?.attribution ?? d?.attribution ?? 'USGS Astrogeology / NASA / JPL-Caltech / Univ. of Arizona';
    const text = `${title} · ${attribution}`;
    ctx.font = '11px system-ui, sans-serif';
    const maxWidth = Math.max(40, state.width - 80); // Leave room for the north arrow.
    const shown = ctx.measureText(text).width > maxWidth ? `${title} · kaynak atfı` : text;
    ctx.fillStyle = 'rgba(10, 12, 16, .78)';
    ctx.fillRect(10, 10, Math.min(maxWidth, ctx.measureText(shown).width + 12), 23);
    ctx.fillStyle = '#eee';
    ctx.fillText(shown, 16, 26, maxWidth - 12);
  }

  function drawGlobalKey() {
    const base = state.globalBase;
    if (!base) return;
    const mPerPx = 1 / state.pxPerM;
    const localAvailable = Boolean(state.terrain?.canvas && validBounds(bounds()));
    const text = mPerPx < base.nativeMPerPx
      ? `Viking ${Math.round(base.nativeMPerPx)} m/px: yerel ayrıntı yok${localAvailable ? '; HiRISE DTM üstte' : ''}. Orto/kot verisi değildir.`
      : `Viking MDIM renk mozaiği: bağlam katmanı, orto/kot verisi değildir.${localAvailable ? ' HiRISE DTM yerel ayrıntı verir.' : ''}`;
    const maxWidth = Math.max(40, state.width - 80);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(10, 12, 16, .78)';
    ctx.fillRect(10, 37, Math.min(maxWidth, 410), 20);
    ctx.fillStyle = '#eee';
    ctx.fillText(text, 16, 51, maxWidth - 12);
  }

  function draw() {
    if (state.destroyed) return;
    resize();
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = '#17191d';
    ctx.fillRect(0, 0, state.width, state.height);

    const b = bounds();
    if (state.globalBase) drawGlobalBase();
    if (validBounds(b) && state.terrain?.canvas) {
      const topLeft = worldToScreen(b.nwXM, b.nwYM);
      ctx.imageSmoothingEnabled = state.pxPerM < 1.5;
      ctx.drawImage(state.terrain.canvas, topLeft.x, topLeft.y, b.widthM * state.pxPerM, b.heightM * state.pxPerM);
    } else if (!state.globalBase) {
      ctx.fillStyle = '#ddd';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('HiRISE yüzey katmanı kullanılamıyor', 16, 42);
    } else {
      ctx.fillStyle = '#eee';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('HiRISE DTM yok; Viking MDIM yalnız 232 m/piksel renkli bağlam sağlar.', 16, 42);
    }

    if (state.overlays.orthoVisible && state.overlays.orthoOverlay && state.overlays.orthoOverlay.mode !== 'hillshade') {
      const overlay = state.overlays.orthoOverlay;
      const isHybrid = overlay.mode === 'hybrid';
      ctx.save();
      ctx.globalAlpha = isHybrid ? 0.58 : 0.88;
      if (isHybrid) {
        ctx.globalCompositeOperation = 'multiply';
      }
      for (const tier of [overlay.coarse, overlay.fine]) {
        const image = tier?.image;
        const rb = tier?.renderBoundsM || tier?.layer?.renderBoundsM;
        if (image && validBounds(rb)) {
          const topLeft = worldToScreen(rb.nwXM, rb.nwYM);
          ctx.drawImage(image, topLeft.x, topLeft.y, rb.widthM * state.pxPerM, rb.heightM * state.pxPerM);
        }
      }
      ctx.restore();
    }

    if (state.overlays.geologyVisible) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 220, 90, .95)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      for (const segment of state.overlays.geologySegments ?? []) {
        if (!Array.isArray(segment.xy) || segment.xy.length < 2) continue;
        ctx.beginPath();
        segment.xy.forEach(([xM, yM], i) => {
          const p = worldToScreen(xM, yM);
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        });
        ctx.stroke();
      }
      ctx.restore();
    }
    if (state.overlays.archiveVisible && state.overlays.archiveTraverse) {
      ctx.save();
      ctx.strokeStyle = '#ceabff';
      ctx.lineWidth = 1.7;
      for (const segment of state.overlays.archiveTraverse.segments ?? []) {
        if (!Array.isArray(segment.points) || segment.points.length < 2) continue;
        ctx.beginPath();
        segment.points.forEach(({ x, y }, i) => {
          const p = worldToScreen(x, y);
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        });
        ctx.stroke();
      }
      ctx.restore();
    }
    if (state.planning.heatmapVisible && state.planning.heatmap) {
      const { canvas: image, bounds: heatBounds } = state.planning.heatmap;
      if (image && validBounds(heatBounds)) {
        const p = worldToScreen(heatBounds.nwXM, heatBounds.nwYM);
        ctx.save(); ctx.globalAlpha = 0.58; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, p.x, p.y, heatBounds.widthM * state.pxPerM, heatBounds.heightM * state.pxPerM);
        ctx.restore();
      }
    }
    if (state.planning.route?.length) {
      const route = state.planning.route;
      const scores = state.planning.segments;
      const hasAlignedScores = Array.isArray(scores) && scores.length === route.length - 1;
      const phase = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.012;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (let i = 1; i < route.length; i++) {
        const a = worldToScreen(route[i - 1].xM, route[i - 1].yM);
        const b = worldToScreen(route[i].xM, route[i].yM);
        const color = routeScoreColor(hasAlignedScores ? scores[i - 1]?.score : null);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.shadowBlur = 8; ctx.shadowColor = color;
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.shadowBlur = 0; ctx.strokeStyle = color; ctx.lineWidth = 3.2;
        ctx.setLineDash([7, 6]); ctx.lineDashOffset = -phase; ctx.stroke();
      }
      ctx.setLineDash([]); ctx.restore();
    }
    if (state.overlays.footprintTrail?.count > 0) {
      const trail = state.overlays.footprintTrail;
      const quads = trail.quads, instances = trail.instances;
      if (quads instanceof Float32Array && instances instanceof Float32Array) {
        ctx.save();
        ctx.fillStyle = '#34251e';
        for (let i = 0; i < trail.count; i++) {
          const offset = i * 12;
          const alpha = Math.max(0, Math.min(1, instances[i * 10 + 5]));
          if (alpha <= 0) continue;
          ctx.globalAlpha = 0.75 * alpha;
          ctx.beginPath();
          const p0 = worldToScreen(quads[offset], quads[offset + 1]);
          const p1 = worldToScreen(quads[offset + 3], quads[offset + 4]);
          const p3 = worldToScreen(quads[offset + 9], quads[offset + 10]);
          const projectedWidth = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          const projectedHeight = Math.hypot(p3.x - p0.x, p3.y - p0.y);
          if (Math.min(projectedWidth, projectedHeight) < 2.5) {
            const p = worldToScreen(instances[i * 10], instances[i * 10 + 1]);
            ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
            ctx.fill();
            continue;
          }
          for (let corner = 0; corner < 4; corner++) {
            const p = worldToScreen(quads[offset + corner * 3], quads[offset + corner * 3 + 1]);
            if (corner === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    if (!state.terrain?.canvas) {
      ctx.fillStyle = '#ddd';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('Kapsam verisi yok; harita alanı boş bırakıldı.', 16, 62);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.84)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('Eflatun tarama: DTM no-data / geçersiz hücre', 16, state.height - 49);
    }

    const startPoint = (state.draggingEndpoint === 'start' && state.draggedPos) ? state.draggedPos : state.endpoints.start;
    const endPoint = (state.draggingEndpoint === 'end' && state.draggedPos) ? state.draggedPos : state.endpoints.end;
    drawMarker(startPoint, 'Başlangıç', '#52c7a5', state.draggingEndpoint === 'start');
    drawMarker(endPoint, 'Bitiş', '#ffb04a', state.draggingEndpoint === 'end');
    drawNorth();
    drawScale();
    drawAttribution();
    drawGlobalKey();

    if (state.selectionMode) {
      const y = state.globalBase ? 64 : 39;
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(10, y, Math.min(state.width - 20, 280), 23);
      ctx.fillStyle = '#fff';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(`${state.selectionMode === 'start' ? 'Başlangıç' : 'Bitiş'} noktasını seçin`, 16, y + 16);
    }
    if (state.selectionMessage) {
      const y = state.selectionMode ? (state.globalBase ? 91 : 66) : (state.globalBase ? 64 : 39);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(70, 22, 20, .92)';
      ctx.fillRect(10, y, Math.min(state.width - 20, ctx.measureText(state.selectionMessage).width + 14), 24);
      ctx.fillStyle = '#fff';
      ctx.fillText(state.selectionMessage, 16, y + 16);
    }
    if (state.planning.route?.length) {
      const legend = 'Renk: yürünebilirlik puanı • planlama göstergesi; güvenli rota sertifikası değildir';
      ctx.fillStyle = 'rgba(7, 16, 22, .78)';
      ctx.fillRect(10, state.height - 61, Math.min(state.width - 20, 420), 21);
      ctx.fillStyle = '#e9fbff';
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(legend, 16, state.height - 47, Math.max(1, state.width - 32));
      if (routeAnimationFrame === null && typeof requestAnimationFrame === 'function') {
        routeAnimationFrame = requestAnimationFrame(() => { routeAnimationFrame = null; draw(); });
      }
    }
  }

  function localPointer(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const p = localPointer(event);
    state.pointerId = event.pointerId;
    state.downX = p.x;
    state.downY = p.y;
    state.lastX = p.x;
    state.lastY = p.y;

    const hit = hitEndpoint(p.x, p.y, 18);
    if (hit) {
      state.draggingEndpoint = hit;
      state.dragging = false;
      const pt = state.endpoints[hit];
      state.draggedPos = { xM: pt.xM, yM: pt.yM };
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture?.(event.pointerId);
      draw();
      return;
    }

    state.draggingEndpoint = null;
    state.draggedPos = null;
    state.dragging = true;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    const p = localPointer(event);

    if (state.draggingEndpoint && event.pointerId === state.pointerId) {
      const world = screenToWorld(p.x, p.y);
      state.draggedPos = { xM: world.xM, yM: world.yM };
      const rejection = selectionRejection(world.xM, world.yM);
      state.selectionMessage = rejection || '';
      draw();
      return;
    }

    if (state.dragging && event.pointerId === state.pointerId) {
      preserveUserViewOnTerrainLoad = true;
      state.centerXM -= (p.x - state.lastX) / state.pxPerM;
      state.centerYM += (p.y - state.lastY) / state.pxPerM;
      state.lastX = p.x;
      state.lastY = p.y;
      draw();
      return;
    }

    if (!state.dragging && !state.draggingEndpoint) {
      const hit = hitEndpoint(p.x, p.y, 18);
      if (hit !== state.hoverEndpoint) {
        state.hoverEndpoint = hit;
        canvas.style.cursor = hit ? 'grab' : (state.selectionMode ? 'crosshair' : '');
      }
    }
  }

  function onPointerUp(event) {
    if (event.pointerId !== state.pointerId) return;
    const p = localPointer(event);

    if (state.draggingEndpoint) {
      const kind = state.draggingEndpoint;
      const world = screenToWorld(p.x, p.y);
      const rejection = selectionRejection(world.xM, world.yM);

      state.draggingEndpoint = null;
      state.draggedPos = null;
      canvas.style.cursor = '';
      state.pointerId = null;

      if (!rejection) {
        state.endpoints[kind] = { xM: world.xM, yM: world.yM };
        state.selectionMessage = '';
        onPointSelected({ kind, xM: world.xM, yM: world.yM, byDrag: true });
      } else {
        state.selectionMessage = rejection;
      }
      draw();
      return;
    }

    if (!state.dragging) return;
    const moved = Math.hypot(p.x - state.downX, p.y - state.downY);
    state.dragging = false;
    state.pointerId = null;
    if (moved > 4) { draw(); return; }
    const world = screenToWorld(p.x, p.y);
    if (state.selectionMode) {
      const kind = state.selectionMode;
      const point = { xM: world.xM, yM: world.yM };
      const rejection = selectionRejection(point.xM, point.yM);
      if (rejection) {
        state.selectionMessage = rejection;
        draw();
        return;
      }
      state.selectionMessage = '';
      state.endpoints[kind] = point;
      onPointSelected({ kind, ...point, byDrag: false });
      draw();
      return;
    }
    onCellClick(world);
  }

  function onWheel(event) {
    event.preventDefault();
    preserveUserViewOnTerrainLoad = true;
    const p = localPointer(event);
    const before = screenToWorld(p.x, p.y);
    const factor = Math.exp(-event.deltaY * 0.0015);
    state.pxPerM = clamp(state.pxPerM * factor, state.minPxPerM, state.maxPxPerM);
    const after = screenToWorld(p.x, p.y);
    state.centerXM += before.xM - after.xM;
    state.centerYM += before.yM - after.yM;
    draw();
  }

  function onPointerCancel(event) {
    if (!state.dragging && !state.draggingEndpoint) return;
    if (event.pointerId !== state.pointerId) return;
    state.dragging = false;
    state.draggingEndpoint = null;
    state.draggedPos = null;
    state.pointerId = null;
    canvas.style.cursor = '';
    draw();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
  resizeObserver?.observe(canvas);

  cacheTerrainMask();
  if (validBounds(bounds())) fitLocal(); else draw();

  return Object.freeze({
    draw,
    fit,
    setTerrain(nextTerrain) {
      state.terrain = nextTerrain ?? null;
      cacheTerrainMask();
      state.selectionMessage = '';
      if (validBounds(bounds()) && !preserveUserViewOnTerrainLoad) fitLocal(); else draw();
    },
    setGlobalBase(nextBase) {
      state.globalBase = nextBase ?? null;
      draw();
    },
    setDescriptor(nextDescriptor) { state.descriptor = nextDescriptor ?? null; draw(); },
    setSelectionMode(mode) { state.selectionMode = mode === 'start' || mode === 'end' ? mode : null; draw(); },
    setEndpoints(nextEndpoints = {}) {
      state.endpoints = { start: nextEndpoints.start ?? null, end: nextEndpoints.end ?? null };
      draw();
    },
    setOverlays(nextOverlays = {}) {
      state.overlays = {
        geologySegments: nextOverlays.geologySegments ?? state.overlays.geologySegments ?? [],
        archiveTraverse: nextOverlays.archiveTraverse ?? state.overlays.archiveTraverse ?? null,
        footprintTrail: nextOverlays.footprintTrail !== undefined ? nextOverlays.footprintTrail : state.overlays.footprintTrail,
        geologyVisible: nextOverlays.geologyVisible !== undefined ? Boolean(nextOverlays.geologyVisible) : state.overlays.geologyVisible,
        archiveVisible: nextOverlays.archiveVisible !== undefined ? Boolean(nextOverlays.archiveVisible) : state.overlays.archiveVisible,
        orthoOverlay: nextOverlays.orthoOverlay !== undefined ? nextOverlays.orthoOverlay : state.overlays.orthoOverlay,
        orthoVisible: nextOverlays.orthoVisible !== undefined ? Boolean(nextOverlays.orthoVisible) : state.overlays.orthoVisible,
      };
      draw();
    },
    setPlanning(nextPlanning = {}) {
      state.planning = {
        heatmap: nextPlanning.heatmap ?? null,
        route: Array.isArray(nextPlanning.route) ? nextPlanning.route : null,
        segments: Array.isArray(nextPlanning.segments) ? nextPlanning.segments : null,
        heatmapVisible: Boolean(nextPlanning.heatmapVisible),
      };
      if (!state.planning.route?.length && routeAnimationFrame !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(routeAnimationFrame);
        routeAnimationFrame = null;
      }
      draw();
    },
    getView() { return Object.freeze({ centerXM: state.centerXM, centerYM: state.centerYM, pxPerM: state.pxPerM }); },
    fitGlobal,
    destroy() {
      state.destroyed = true;
      if (routeAnimationFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(routeAnimationFrame);
      routeAnimationFrame = null;
      canvas.style.cursor = '';
      resizeObserver?.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
    },
  });
}
