// Viking MDIM colour is global visual context, not elevation or local orthoimagery.
// Globe picks return planetocentric coordinates; the caller decides data coverage and route validity.

const DEFAULT_TILES = Object.freeze([
  'data/viking-mdim/tiles/0/0/0.png',
  'data/viking-mdim/tiles/0/0/1.png',
]);
const DEG = Math.PI / 180;
const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 256;
const SPHERE_PIXELS = 384;

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function wrapLongitude(value) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Viking tile unavailable: ${url}`));
    image.src = url;
  });
}

function pointVector(lonDeg, latDeg) {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}

/**
 * Draws a draggable orthographic Mars globe into an existing canvas.
 * `marker` is a known local coverage anchor, e.g. a Jezero waypoint in planetocentric degrees.
 * A/B picks are planetocentric coordinates, subject to validation by the caller.
 */
export function createMarsGlobe({
  canvas,
  marker,
  statusElement = null,
  onJezeroSelect = () => {},
  onSelect = () => {},
  tileUrls = DEFAULT_TILES,
  centerLonDeg = marker?.lonDeg,
  centerLatDeg = marker?.latDeg,
} = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('Mars globe needs a canvas');
  if (!marker || !Number.isFinite(marker.lonDeg) || !Number.isFinite(marker.latDeg)
      || Math.abs(marker.latDeg) > 90) {
    throw new TypeError('Mars globe needs a valid Jezero marker');
  }
  if (!Array.isArray(tileUrls) || tileUrls.length !== 2) {
    throw new TypeError('Mars globe needs two Viking z0 tile URLs');
  }

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  const sphereCanvas = document.createElement('canvas');
  sphereCanvas.width = SPHERE_PIXELS;
  sphereCanvas.height = SPHERE_PIXELS;
  const sphereContext = sphereCanvas.getContext('2d');
  if (!sphereContext) throw new Error('Canvas 2D is unavailable');

  let longitude = wrapLongitude(Number.isFinite(centerLonDeg) ? centerLonDeg : marker.lonDeg);
  let latitude = clamp(Number.isFinite(centerLatDeg) ? centerLatDeg : marker.latDeg, -85, 85);
  let zoom = 1;
  let texture = null;
  let textureUnavailable = false;
  let destroyed = false;
  let frame = 0;
  let pointer = null;
  let markerScreen = null;
  let selectionMode = null;
  let endpoints = { start: null, end: null };

  function setStatus(message) {
    if (statusElement) statusElement.textContent = message;
  }

  function updateStatus() {
    const textureNote = textureUnavailable ? 'Viking renk mozaiği yüklenemedi. ' : '';
    const action = selectionMode === 'start'
      ? 'Küre üzerinde Başlangıç (A) noktasını seçin.'
      : selectionMode === 'end'
        ? 'Küre üzerinde Bitiş (B) noktasını seçin.'
        : 'Küreyi döndürün; A/B seçimi veya Jezero yerel haritası için ilgili denetimi kullanın.';
    setStatus(textureNote + action);
    canvas.setAttribute('aria-label', `Döndürülebilir Mars küresi. ${action} Ok tuşlarıyla döndürün, artı ve eksi ile yakınlaştırın, Enter ile kürenin merkezini seçin.`);
  }

  canvas.tabIndex = canvas.tabIndex < 0 ? 0 : canvas.tabIndex;
  canvas.style.touchAction = 'none';
  canvas.setAttribute('role', 'button');
  updateStatus();

  function requestRender() {
    if (!destroyed && !frame) frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    requestRender();
  }

  function renderSphere(front, east, north) {
    const output = sphereContext.createImageData(SPHERE_PIXELS, SPHERE_PIXELS);
    const data = output.data;
    const src = texture;
    for (let py = 0; py < SPHERE_PIXELS; py++) {
      const sy = 1 - (py + 0.5) * 2 / SPHERE_PIXELS;
      for (let px = 0; px < SPHERE_PIXELS; px++) {
        const sx = (px + 0.5) * 2 / SPHERE_PIXELS - 1;
        const r2 = sx * sx + sy * sy;
        if (r2 > 1) continue;
        const depth = Math.sqrt(1 - r2);
        const vx = front[0] * depth + east[0] * sx + north[0] * sy;
        const vy = front[1] * depth + east[1] * sx + north[1] * sy;
        const vz = front[2] * depth + east[2] * sx + north[2] * sy;
        const lon = Math.atan2(vy, vx);
        const lat = Math.asin(clamp(vz, -1, 1));
        const tx = clamp(Math.floor((lon / (2 * Math.PI) + 0.5) * TEXTURE_WIDTH), 0, TEXTURE_WIDTH - 1);
        const ty = clamp(Math.floor((0.5 - lat / Math.PI) * TEXTURE_HEIGHT), 0, TEXTURE_HEIGHT - 1);
        const sourceOffset = (ty * TEXTURE_WIDTH + tx) * 4;
        const valid = src && src[sourceOffset + 3] > 0;
        const shade = clamp(0.38 + 0.62 * (depth * 0.68 - sx * 0.24 + sy * 0.48), 0.28, 1);
        const edge = clamp(depth * 5, 0, 1);
        const offset = (py * SPHERE_PIXELS + px) * 4;
        data[offset] = Math.round((valid ? src[sourceOffset] : 112) * shade);
        data[offset + 1] = Math.round((valid ? src[sourceOffset + 1] : 73) * shade);
        data[offset + 2] = Math.round((valid ? src[sourceOffset + 2] : 56) * shade);
        data[offset + 3] = Math.round(255 * edge);
      }
    }
    sphereContext.putImageData(output, 0, 0);
  }

  function basis() {
    const front = pointVector(longitude, latitude);
    const lonRad = longitude * DEG;
    const latRad = latitude * DEG;
    return {
      front,
      east: [-Math.sin(lonRad), Math.cos(lonRad), 0],
      north: [-Math.sin(latRad) * Math.cos(lonRad), -Math.sin(latRad) * Math.sin(lonRad), Math.cos(latRad)],
    };
  }

  function project(point, frame, midX, midY, radius) {
    if (!point) return null;
    const location = pointVector(point.lonDeg, point.latDeg);
    const dot = (axis) => location[0] * axis[0] + location[1] * axis[1] + location[2] * axis[2];
    const depth = dot(frame.front);
    if (depth <= 0.04) return null;
    return { x: midX + radius * dot(frame.east), y: midY - radius * dot(frame.north) };
  }

  function drawEndpoint(point, label, color, frame, midX, midY, radius) {
    const pos = project(point, frame, midX, midY, radius);
    if (!pos) return;
    const size = clamp(radius * 0.043, 11, 20);
    context.beginPath();
    context.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.lineWidth = Math.max(2, size * 0.16);
    context.strokeStyle = '#fff';
    context.stroke();
    context.font = `bold ${Math.max(12, Math.round(size * 1.15))}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#10151b';
    context.fillText(label, pos.x, pos.y + 1);
    context.textAlign = 'start';
  }

  function pickSurface(pos) {
    const radius = Math.min(canvas.width, canvas.height) * 0.43 * zoom;
    if (!radius) return null;
    const sx = (pos.x - canvas.width / 2) / radius;
    const sy = (canvas.height / 2 - pos.y) / radius;
    const r2 = sx * sx + sy * sy;
    if (r2 > 1) return null; // Space or the hidden hemisphere is never selectable.
    const depth = Math.sqrt(Math.max(0, 1 - r2));
    const frame = basis();
    const vector = [0, 1, 2].map((i) => frame.front[i] * depth + frame.east[i] * sx + frame.north[i] * sy);
    return {
      lonDeg: wrapLongitude(Math.atan2(vector[1], vector[0]) / DEG),
      latDeg: Math.asin(clamp(vector[2], -1, 1)) / DEG,
    };
  }

  function render() {
    if (destroyed || !canvas.width || !canvas.height) return;
    const width = canvas.width;
    const height = canvas.height;
    const midX = width / 2;
    const midY = height / 2;
    const radius = Math.min(width, height) * 0.43 * zoom;
    context.clearRect(0, 0, width, height);
    const background = context.createRadialGradient(midX, midY, radius * 0.3, midX, midY, Math.max(width, height) * 0.7);
    background.addColorStop(0, '#17202b');
    background.addColorStop(1, '#090d14');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const frame = basis();
    renderSphere(frame.front, frame.east, frame.north);
    context.save();
    context.shadowColor = 'rgba(255, 134, 75, 0.27)';
    context.shadowBlur = radius * 0.11;
    context.drawImage(sphereCanvas, midX - radius, midY - radius, radius * 2, radius * 2);
    context.restore();

    markerScreen = project(marker, frame, midX, midY, radius);
    if (markerScreen) {
      const { x, y } = markerScreen;
      const markerRadius = clamp(radius * 0.028, 6, 12);
      context.beginPath();
      context.arc(x, y, markerRadius * 2.4, 0, Math.PI * 2);
      context.fillStyle = 'rgba(37, 224, 218, 0.16)';
      context.fill();
      context.beginPath();
      context.arc(x, y, markerRadius, 0, Math.PI * 2);
      context.fillStyle = '#4ff0df';
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = '#f3fffc';
      context.stroke();
      context.font = `${Math.max(12, Math.round(width / 38))}px system-ui, sans-serif`;
      context.fillStyle = '#f4ffff';
      context.textBaseline = 'middle';
      context.fillText(marker.label || 'Jezero', x + markerRadius * 1.8, y);
    }
    drawEndpoint(endpoints.start, 'A', '#65ede1', frame, midX, midY, radius);
    drawEndpoint(endpoints.end, 'B', '#ffc277', frame, midX, midY, radius);
    if (textureUnavailable) {
      context.fillStyle = 'rgba(10, 13, 20, 0.82)';
      context.fillRect(0, height - 38, width, 38);
      context.font = `${Math.max(11, Math.round(width / 42))}px system-ui, sans-serif`;
      context.textAlign = 'center';
      context.fillStyle = '#f3d8cb';
      context.fillText('Viking renk mozaiği yüklenemedi · Jezero konumu gösteriliyor', midX, height - 18);
      context.textAlign = 'start';
    }
  }

  function setZoom(value) {
    zoom = clamp(value, 0.75, 1.8);
    requestRender();
  }

  function focusJezero() {
    longitude = wrapLongitude(marker.lonDeg);
    latitude = clamp(marker.latDeg, -85, 85);
    zoom = 1;
    requestRender();
  }

  function setSelectionMode(kind) {
    if (kind !== null && kind !== 'start' && kind !== 'end') {
      throw new TypeError('Selection mode must be start, end, or null');
    }
    selectionMode = kind;
    updateStatus();
    requestRender();
  }

  function setEndpoints(next) {
    const check = (point) => {
      if (point == null) return null;
      if (!Number.isFinite(point.lonDeg) || !Number.isFinite(point.latDeg) || Math.abs(point.latDeg) > 90) {
        throw new TypeError('Globe endpoint must have finite planetocentric latitude and longitude');
      }
      return { lonDeg: wrapLongitude(point.lonDeg), latDeg: point.latDeg };
    };
    endpoints = { start: check(next?.start), end: check(next?.end) };
    requestRender();
  }

  function eventPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / (rect.width || 1),
      y: (event.clientY - rect.top) * canvas.height / (rect.height || 1),
    };
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    canvas.focus();
    const pos = eventPosition(event);
    pointer = { id: event.pointerId, x: pos.x, y: pos.y, startX: pos.x, startY: pos.y, moved: false };
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const pos = eventPosition(event);
    const dx = pos.x - pointer.x;
    const dy = pos.y - pointer.y;
    if (Math.hypot(pos.x - pointer.startX, pos.y - pointer.startY) > 5) pointer.moved = true;
    if (pointer.moved) {
      longitude = wrapLongitude(longitude - dx * 0.35 / zoom);
      latitude = clamp(latitude + dy * 0.32 / zoom, -85, 85);
      requestRender();
    }
    pointer.x = pos.x;
    pointer.y = pos.y;
  }

  function onPointerUp(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const pos = eventPosition(event);
    const clicked = event.type !== 'pointercancel' && !pointer.moved;
    const clickedMarker = clicked && markerScreen
      && Math.hypot(pos.x - markerScreen.x, pos.y - markerScreen.y) <= Math.max(28, canvas.width * 0.045);
    pointer = null;
    if (!clicked) return;
    if (selectionMode) {
      const picked = pickSurface(pos);
      if (picked) onSelect({ kind: selectionMode, ...picked });
      else setStatus('Küre dışı seçilemez. Mars yüzeyinde bir nokta seçin.');
    } else if (clickedMarker) onJezeroSelect();
  }

  function onWheel(event) {
    event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
  }

  function onKeyDown(event) {
    const step = event.shiftKey ? 15 : 5;
    if (event.key === 'ArrowLeft') longitude = wrapLongitude(longitude - step);
    else if (event.key === 'ArrowRight') longitude = wrapLongitude(longitude + step);
    else if (event.key === 'ArrowUp') latitude = clamp(latitude + step, -85, 85);
    else if (event.key === 'ArrowDown') latitude = clamp(latitude - step, -85, 85);
    else if (event.key === '+' || event.key === '=') setZoom(zoom * 1.12);
    else if (event.key === '-' || event.key === '_') setZoom(zoom / 1.12);
    else if (event.key === 'Enter' || event.key === ' ') {
      if (selectionMode) onSelect({ kind: selectionMode, latDeg: latitude, lonDeg: longitude });
      else onJezeroSelect();
    }
    else return;
    event.preventDefault();
    requestRender();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKeyDown);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);

  const ready = Promise.all(tileUrls.map(loadImage)).then((tiles) => {
    if (destroyed) return false;
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = TEXTURE_WIDTH;
    textureCanvas.height = TEXTURE_HEIGHT;
    const textureContext = textureCanvas.getContext('2d', { willReadFrequently: true });
    if (!textureContext) throw new Error('Canvas texture context unavailable');
    textureContext.drawImage(tiles[0], 0, 0, 256, 256);
    textureContext.drawImage(tiles[1], 256, 0, 256, 256);
    texture = textureContext.getImageData(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT).data;
    updateStatus();
    requestRender();
    return true;
  }).catch(() => {
    textureUnavailable = true;
    updateStatus();
    requestRender();
    return false;
  });

  setStatus('Mars küresi yükleniyor…');
  resize();
  return Object.freeze({
    ready,
    resize,
    render,
    focusJezero,
    setSelectionMode,
    setEndpoints,
    zoomIn: () => setZoom(zoom * 1.12),
    zoomOut: () => setZoom(zoom / 1.12),
    setZoom,
    destroy() {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKeyDown);
    },
  });
}
