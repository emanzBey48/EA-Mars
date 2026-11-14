// Interactive 2D minimap presentation for an already-prepared terrain image.
// This view never samples a provider or computes route costs. Missing/outside coverage stays blank.

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
    terrainPixels: null,
    terrainPixelsReadable: false,
    descriptor,
    endpoints: { start: endpoints.start ?? null, end: endpoints.end ?? null },
    overlays: {
      geologySegments: [],
      archiveTraverse: null,
      geologyVisible: false,
      archiveVisible: false,
      orthoOverlay: null,
      orthoVisible: true,
    },
    planning: { heatmap: null, route: null, heatmapVisible: false },
    selectionMode: selectionMode === 'start' || selectionMode === 'end' ? selectionMode : null,
    centerXM: 0,
    centerYM: 0,
    pxPerM: 1,
    minPxPerM: 0.02,
    maxPxPerM: 64,
    dragging: false,
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

  const bounds = () => state.terrain?.bounds ?? null;
  const validBounds = (b) => b && [b.nwXM, b.nwYM, b.widthM, b.heightM].every(Number.isFinite) && b.widthM > 0 && b.heightM > 0;

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

  function fit() {
    const b = bounds();
    if (!validBounds(b)) return;
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

  function screenToWorld(x, y) {
    return {
      xM: state.centerXM + (x - state.width / 2) / state.pxPerM,
      yM: state.centerYM - (y - state.height / 2) / state.pxPerM,
    };
  }

  function drawMarker(point, label, color) {
    if (!point || !Number.isFinite(point.xM) || !Number.isFinite(point.yM)) return;
    const p = worldToScreen(point.xM, point.yM);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
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
    const title = d?.title ?? 'HiRISE DTM';
    const attribution = d?.attribution ?? 'USGS Astrogeology / NASA / JPL-Caltech / Univ. of Arizona';
    const text = `${title} · ${attribution}`;
    ctx.font = '11px system-ui, sans-serif';
    const maxWidth = Math.max(40, state.width - 20);
    const shown = ctx.measureText(text).width > maxWidth ? `${title} · kaynak atfı` : text;
    ctx.fillStyle = 'rgba(10, 12, 16, .78)';
    ctx.fillRect(10, 10, Math.min(maxWidth, ctx.measureText(shown).width + 12), 23);
    ctx.fillStyle = '#eee';
    ctx.fillText(shown, 16, 26);
  }

  function draw() {
    if (state.destroyed) return;
    resize();
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = '#17191d';
    ctx.fillRect(0, 0, state.width, state.height);

    const b = bounds();
    if (validBounds(b) && state.terrain?.canvas) {
      const topLeft = worldToScreen(b.nwXM, b.nwYM);
      ctx.imageSmoothingEnabled = state.pxPerM < 1.5;
      ctx.drawImage(state.terrain.canvas, topLeft.x, topLeft.y, b.widthM * state.pxPerM, b.heightM * state.pxPerM);
    } else {
      ctx.fillStyle = '#ddd';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('HiRISE yüzey katmanı kullanılamıyor', 16, 42);
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
      ctx.save(); ctx.beginPath(); ctx.strokeStyle = '#63e6ff'; ctx.lineWidth = 3;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      state.planning.route.forEach((point, i) => {
        const p = worldToScreen(point.xM, point.yM);
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      });
      ctx.stroke(); ctx.restore();
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

    const start = state.endpoints.start;
    const end = state.endpoints.end;
    drawMarker(start, 'Başlangıç', '#52c7a5');
    drawMarker(end, 'Bitiş', '#ffb04a');
    drawNorth();
    drawScale();
    drawAttribution();

    if (state.selectionMode) {
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(10, 39, Math.min(state.width - 20, 280), 23);
      ctx.fillStyle = '#fff';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(`${state.selectionMode === 'start' ? 'Başlangıç' : 'Bitiş'} noktasını seçin`, 16, 55);
    }
    if (state.selectionMessage) {
      const y = state.selectionMode ? 86 : 39;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(70, 22, 20, .92)';
      ctx.fillRect(10, y, Math.min(state.width - 20, ctx.measureText(state.selectionMessage).width + 14), 24);
      ctx.fillStyle = '#fff';
      ctx.fillText(state.selectionMessage, 16, y + 16);
    }
  }

  function localPointer(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const p = localPointer(event);
    state.dragging = true;
    state.pointerId = event.pointerId;
    state.downX = p.x;
    state.downY = p.y;
    state.lastX = p.x;
    state.lastY = p.y;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    const p = localPointer(event);
    state.centerXM -= (p.x - state.lastX) / state.pxPerM;
    state.centerYM += (p.y - state.lastY) / state.pxPerM;
    state.lastX = p.x;
    state.lastY = p.y;
    draw();
  }

  function onPointerUp(event) {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    const p = localPointer(event);
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
      onPointSelected({ kind, ...point });
      draw();
      return;
    }
    onCellClick(world);
  }

  function onWheel(event) {
    event.preventDefault();
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
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    state.dragging = false;
    state.pointerId = null;
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
  if (validBounds(bounds())) fit(); else draw();

  return Object.freeze({
    draw,
    fit,
    setTerrain(nextTerrain) {
      state.terrain = nextTerrain ?? null;
      cacheTerrainMask();
      state.selectionMessage = '';
      if (validBounds(bounds())) fit(); else draw();
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
        heatmapVisible: Boolean(nextPlanning.heatmapVisible),
      };
      draw();
    },
    getView() { return Object.freeze({ centerXM: state.centerXM, centerYM: state.centerYM, pxPerM: state.pxPerM }); },
    destroy() {
      state.destroyed = true;
      resizeObserver?.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
    },
  });
}
