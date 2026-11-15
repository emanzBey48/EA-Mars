// Canvas rendering. Converts local metres -> screen pixels via a camera; never mutates simulation state.
import { STATUS } from '../surface/layers.js';

export class Camera {
  constructor() { this.cx = 0; this.cy = 0; this.pxPerM = 2; this.min = 0.3; this.max = 16; }
  zoom(f) { this.pxPerM = Math.min(this.max, Math.max(this.min, this.pxPerM * f)); }
  toScreen(x, y, w, h) { return { sx: w / 2 + (x - this.cx) * this.pxPerM, sy: h / 2 - (y - this.cy) * this.pxPerM }; }
}

/**
 * Builds a visual-only terrain image (hillshade × elevation tint) from a GridElevationLayer.
 * Uses `layer.cellState` and `layer.cellGradient` so no-data rules, row orientation and metre/pixel scale
 * are identical to `sampleElevation` / `sampleSlope`.
 */
export function buildTerrainImage(layer) {
  const { rows, cols, rowOffset, colOffset } = layer;
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(cols, rows);
  let zMin = Infinity, zMax = -Infinity;
  const cellValues = new Float32Array(rows * cols);
  const ok = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const st = layer.cellState(r + rowOffset, c + colOffset);
    if (st.status === STATUS.OK) {
      const i = r * cols + c;
      ok[i] = 1; cellValues[i] = st.value;
      if (st.value < zMin) zMin = st.value;
      if (st.value > zMax) zMax = st.value;
    }
  }
  const az = 315 * Math.PI / 180, alt = 42 * Math.PI / 180;
  const lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt);
  const azFill = 60 * Math.PI / 180, altFill = 55 * Math.PI / 180;
  const fx = Math.sin(azFill) * Math.cos(altFill), fy = Math.cos(azFill) * Math.cos(altFill), fz = Math.sin(altFill);
  const ramp = [
    [0.00, [74, 42, 34]],
    [0.25, [132, 68, 44]],
    [0.50, [178, 98, 58]],
    [0.75, [214, 138, 84]],
    [1.00, [244, 198, 152]],
  ];
  const tint = (t) => {
    for (let k = 1; k < ramp.length; k++) if (t <= ramp[k][0]) {
      const [t0, c0] = ramp[k - 1], [t1, c1] = ramp[k]; const u = (t - t0) / (t1 - t0);
      return [c0[0] + u * (c1[0] - c0[0]), c0[1] + u * (c1[1] - c0[1]), c0[2] + u * (c1[2] - c0[2])];
    }
    return ramp[ramp.length - 1][1];
  };
  const range = zMax - zMin || 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, p = i * 4;
    if (!ok[i]) { // no-data / invalid: magenta hatch, never painted as terrain
      const hatch = ((r + c) & 7) < 2; img.data[p] = hatch ? 255 : 90; img.data[p + 1] = 0; img.data[p + 2] = hatch ? 255 : 90; img.data[p + 3] = 255; continue;
    }
    let shade = 0.74;
    let slopeDarken = 1.0;
    const g = layer.cellGradient(r + rowOffset, c + colOffset);
    if (g.status === STATUS.OK) {
      const nlen = Math.hypot(g.dzdx, g.dzdy, 1);
      const primary = Math.max(0, (-g.dzdx * lx - g.dzdy * ly + lz) / nlen);
      const fill = Math.max(0, (-g.dzdx * fx - g.dzdy * fy + fz) / nlen);
      shade = 0.78 * primary + 0.22 * fill;
      const cosSlope = 1 / nlen;
      slopeDarken = 0.72 + 0.28 * cosSlope;
    }
    const normZ = (cellValues[i] - zMin) / range;
    const [R, G, B] = tint(normZ);
    const k = (0.30 + 0.82 * shade) * slopeDarken;
    img.data[p] = Math.min(255, R * k); img.data[p + 1] = Math.min(255, G * k); img.data[p + 2] = Math.min(255, B * k); img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Precompute local-metre placement of the visual terrain asset so render() needs no live layer or adapter.
  const nw = layer.adapter.pixelToLocal(rowOffset - 0.5, colOffset - 0.5);
  const bounds = Object.freeze({
    nwXM: nw.x,
    nwYM: nw.y,
    widthM: cols * layer.cellSizeM,
    heightM: rows * layer.cellSizeM,
  });
  return { canvas, zMin, zMax, ramp, bounds };
}

/**
 * Pure canvas renderer. Accepts only an immutable `snapshot` (`WorldSnapshot`), `camera`, and
 * the prepared visual `terrain` asset. Never receives live `sim`, `layer`, or `adapter` instances,
 * and performs no raster sampling or route/deviation math.
 */
export function render(ctx, w, h, {
  camera,
  snapshot,
  terrain,
  orthoOverlay = null,
  geologySegments = [],
  archiveTraverse = null,
  plannedRoute = null,
  routeEndpoints = null,
  footprintTrail = null,
}) {
  ctx.save();
  ctx.fillStyle = '#121216'; ctx.fillRect(0, 0, w, h);
  const T = (x, y) => camera.toScreen(x, y, w, h);
  const z = camera.pxPerM;

  // Terrain (visual only). Placement uses precomputed world bounds on the prepared terrain asset.
  if (terrain?.bounds) {
    const p = T(terrain.bounds.nwXM, terrain.bounds.nwYM);
    ctx.imageSmoothingEnabled = z < 3;
    ctx.drawImage(terrain.canvas, p.sx, p.sy, terrain.bounds.widthM * z, terrain.bounds.heightM * z);
  } else {
    drawGrid(ctx, w, h, camera);
  }

  // HiRISE WMTS Orthomosaic overlay (Stage 39B)
  if (orthoOverlay && orthoOverlay.mode !== 'hillshade') {
    const isHybrid = orthoOverlay.mode === 'hybrid';
    ctx.save();
    ctx.globalAlpha = isHybrid ? 0.62 : 0.88;
    if (isHybrid) {
      ctx.globalCompositeOperation = 'multiply';
    }
    for (const tier of [orthoOverlay.coarse, orthoOverlay.fine]) {
      const image = tier?.image;
      const b = tier?.renderBoundsM || tier?.layer?.renderBoundsM;
      if (image && b && Number.isFinite(b.nwXM) && Number.isFinite(b.nwYM) && b.widthM > 0 && b.heightM > 0) {
        const p = T(b.nwXM, b.nwYM);
        ctx.drawImage(image, p.sx, p.sy, b.widthM * z, b.heightM * z);
      }
    }
    ctx.restore();
  }

  // Only source unit boundaries are drawn; bbox clip edges are filtered upstream.
  for (const segment of geologySegments) {
    if (!Array.isArray(segment.xy) || segment.xy.length < 2) continue;
    ctx.beginPath();
    segment.xy.forEach(([x, y], i) => { const p = T(x, y); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); });
    ctx.strokeStyle = 'rgba(255,220,90,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]);
  }

  if (archiveTraverse) {
    ctx.strokeStyle = '#ceabff';
    ctx.lineWidth = 2;
    for (const { points } of archiveTraverse.segments) {
      ctx.beginPath();
      points.forEach(({ x, y }, i) => {
        const { sx, sy } = T(x, y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
    ctx.fillStyle = '#ceabff';
    for (const stop of archiveTraverse.stops) {
      if (stop.isArrival) continue;
      const { sx, sy } = T(stop.xM, stop.yM);
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  const { route, astronaut, trail } = snapshot;
  const { a, b, corridorHalfWidthM: hw, routeNote, waypoints } = route;
  // Corridor capsule outline (visual geometry around segment a->b).
  const ux = b.xM - a.xM, uy = b.yM - a.yM, L = route.routeLengthM || Math.hypot(ux, uy) || 1;
  const dx = ux / L, dy = uy / L, nx = -dy, ny = dx;
  const pts = [];
  const base = Math.atan2(ny, nx);
  for (let k = 0; k <= 16; k++) { const t = base - Math.PI * k / 16; pts.push([b.xM + hw * Math.cos(t), b.yM + hw * Math.sin(t)]); }
  for (let k = 0; k <= 16; k++) { const t = base + Math.PI - Math.PI * k / 16; pts.push([a.xM + hw * Math.cos(t), a.yM + hw * Math.sin(t)]); }
  ctx.beginPath();
  pts.forEach(([x, y], i) => { const p = T(x, y); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); });
  ctx.closePath();
  ctx.fillStyle = 'rgba(90,200,255,0.16)'; ctx.fill();
  ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(120,215,255,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();

  // Simplified route line
  const pa = T(a.xM, a.yM), pb = T(b.xM, b.yM);
  ctx.setLineDash([10, 6]); ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke(); ctx.setLineDash([]);
  // Route label at midpoint
  const pm = T((a.xM + b.xM) / 2, (a.yM + b.yM) / 2);
  label(ctx, routeNote, pm.sx + 14, pm.sy, '#ffd34d', 'rgba(0,0,0,0.65)', 12);

  // Waypoints
  waypoints.forEach((wp) => {
    const p = T(wp.xM, wp.yM);
    ctx.beginPath(); ctx.arc(p.sx, p.sy, 7, 0, Math.PI * 2); ctx.fillStyle = '#ffd34d'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
    label(ctx, `${wp.label} (tarihsel waypoint)`, p.sx + 12, p.sy - 12, '#fff', 'rgba(0,0,0,0.65)', 12);
  });

  // Planned route & start/goal markers (distinct cyan/aquamarine layer above mission corridor)
  drawPlannedRoute(ctx, camera, w, h, plannedRoute, routeEndpoints);

  // Player trail
  if (trail.length > 1) {
    ctx.beginPath(); trail.forEach((q, i) => { const p = T(q.xM, q.yM); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); });
    const pp = T(astronaut.xM, astronaut.yM); ctx.lineTo(pp.sx, pp.sy);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // Presentation-only boot soles: each contour was sampled against the active DTM provider upstream.
  if (footprintTrail?.count > 0 && footprintTrail.quads instanceof Float32Array && footprintTrail.instances instanceof Float32Array) {
    ctx.save();
    ctx.fillStyle = '#24130e';
    const shapePointCount = footprintTrail.shapePointCount;
    const soleContours = footprintTrail.soleContours;
    const hasSoleContours = Number.isInteger(shapePointCount) && shapePointCount >= 3 &&
      soleContours instanceof Float32Array && soleContours.length === footprintTrail.count * (shapePointCount + 1) * 3;
    for (let i = 0; i < footprintTrail.count; i++) {
      const offset = i * 12;
      const alpha = Math.max(0, Math.min(1, footprintTrail.instances[i * 10 + 5]));
      if (alpha <= 0) continue;
      ctx.globalAlpha = 0.84 * alpha;
      const p0 = T(footprintTrail.quads[offset], footprintTrail.quads[offset + 1]);
      const p1 = T(footprintTrail.quads[offset + 3], footprintTrail.quads[offset + 4]);
      const p3 = T(footprintTrail.quads[offset + 9], footprintTrail.quads[offset + 10]);
      const projectedWidth = Math.hypot(p1.sx - p0.sx, p1.sy - p0.sy);
      const projectedHeight = Math.hypot(p3.sx - p0.sx, p3.sy - p0.sy);
      ctx.beginPath();
      if (Math.min(projectedWidth, projectedHeight) < 2.5) {
        const p = T(footprintTrail.instances[i * 10], footprintTrail.instances[i * 10 + 1]);
        ctx.arc(p.sx, p.sy, 2.0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const shapeOffset = hasSoleContours ? i * (shapePointCount + 1) * 3 : 0;
      const pointCount = hasSoleContours ? shapePointCount : 4;
      for (let point = 0; point < pointCount; point++) {
        const source = hasSoleContours ? shapeOffset + (point + 1) * 3 : offset + point * 3;
        const p = T(hasSoleContours ? soleContours[source] : footprintTrail.quads[source],
          hasSoleContours ? soleContours[source + 1] : footprintTrail.quads[source + 1]);
        if (point === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Deviation segment (uses precomputed closestPoint and deviationM from snapshot)
  const pp = T(astronaut.xM, astronaut.yM);
  if (route.outsideCorridor) {
    const cpt = T(route.closestPoint.xM, route.closestPoint.yM);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pp.sx, pp.sy); ctx.lineTo(cpt.sx, cpt.sy); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, `sapma ${route.deviationM.toFixed(1)} m`, pp.sx + 18, pp.sy + 26, '#fff', 'rgba(170,20,20,0.85)', 12);
  }

  // Astronaut (screen size fixed; position & heading from snapshot)
  ctx.save(); ctx.translate(pp.sx, pp.sy); ctx.rotate(-astronaut.headingRad);
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-7, 7); ctx.lineTo(-3, 0); ctx.lineTo(-7, -7); ctx.closePath();
  ctx.fillStyle = route.outsideCorridor ? '#ff5a5a' : '#ffffff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); ctx.arc(pp.sx, pp.sy, 4, 0, Math.PI * 2); ctx.fillStyle = '#2a7fff'; ctx.fill();

  drawScaleBar(ctx, w, h, z);
  drawNorth(ctx, w);
  ctx.restore();
}

function drawGrid(ctx, w, h, camera) {
  const step = niceStep(80 / camera.pxPerM);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  const x0 = camera.cx - w / 2 / camera.pxPerM, x1 = camera.cx + w / 2 / camera.pxPerM;
  const y0 = camera.cy - h / 2 / camera.pxPerM, y1 = camera.cy + h / 2 / camera.pxPerM;
  for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const p = camera.toScreen(x, 0, w, h); ctx.beginPath(); ctx.moveTo(p.sx, 0); ctx.lineTo(p.sx, h); ctx.stroke(); }
  for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const p = camera.toScreen(0, y, w, h); ctx.beginPath(); ctx.moveTo(0, p.sy); ctx.lineTo(w, p.sy); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,200,120,0.85)'; ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Raster verisi kullanılamıyor — zemin gösterilmiyor (yalnız metre ızgarası)', 16, h - 50);
}

function niceStep(v) { const p = 10 ** Math.floor(Math.log10(v)); for (const k of [1, 2, 5, 10]) if (k * p >= v) return k * p; return 10 * p; }

function drawScaleBar(ctx, w, h, z) {
  const m = niceStep(120 / z); const px = m * z;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(12, h - 36, px + 70, 26);
  ctx.fillStyle = '#fff'; ctx.fillRect(20, h - 22, px, 4);
  ctx.font = '12px system-ui, sans-serif'; ctx.fillText(`${m} m`, 26 + px, h - 17);
}

function drawNorth(ctx, w) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(w - 44, 12, 32, 44);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(w - 28, 18); ctx.lineTo(w - 36, 38); ctx.lineTo(w - 20, 38); ctx.closePath(); ctx.fill();
  ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillText('K', w - 32, 52);
}

function label(ctx, text, x, y, fg, bg, size) {
  ctx.font = `${size}px system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = bg; ctx.fillRect(x - 4, y - size, tw + 8, size + 6);
  ctx.fillStyle = fg; ctx.fillText(text, x, y);
}

/**
 * Draws the user-planned route and S/G endpoints on the main 2D map canvas.
 * Uses a double-layered cyan/aquamarine stroke (`#63e6be` / `rgba(99, 230, 190, 0.92)`) so it
 * remains visually distinct from the yellow mission corridor (`#ffd34d`) and purple archive traverse (`#ceabff`).
 */
export function drawPlannedRoute(ctx, camera, w, h, plannedRoute, routeEndpoints = null) {
  const hasRoute = Array.isArray(plannedRoute) && plannedRoute.length >= 2;
  const startPt = routeEndpoints?.start ?? (hasRoute ? plannedRoute[0] : null);
  const goalPt = routeEndpoints?.goal ?? routeEndpoints?.end ?? (hasRoute ? plannedRoute[plannedRoute.length - 1] : null);
  if (!hasRoute && !startPt && !goalPt) return;

  ctx.save();
  if (hasRoute) {
    const screenPts = [];
    for (const pt of plannedRoute) {
      const xM = pt?.xM ?? pt?.x;
      const yM = pt?.yM ?? pt?.y;
      if (!Number.isFinite(xM) || !Number.isFinite(yM)) continue;
      screenPts.push(camera.toScreen(xM, yM, w, h));
    }
    if (screenPts.length >= 2) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // Dark halo underlay for contrast over bright hillshade slopes
      ctx.beginPath();
      screenPts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(8, 28, 34, 0.82)';
      ctx.lineWidth = 5;
      ctx.stroke();

      // Primary cyan/aquamarine dashed planned route stroke
      ctx.beginPath();
      screenPts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
      ctx.setLineDash([8, 4]);
      ctx.strokeStyle = 'rgba(99, 230, 190, 0.92)';
      ctx.lineWidth = 2.75;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const drawEndpoint = (pt, tag, fill) => {
    const xM = pt?.xM ?? pt?.x;
    const yM = pt?.yM ?? pt?.y;
    if (!Number.isFinite(xM) || !Number.isFinite(yM)) return;
    const p = camera.toScreen(xM, yM, w, h);
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    label(ctx, tag, p.sx + 9, p.sy - 6, fill, 'rgba(0,0,0,0.75)', 11);
  };

  if (startPt) drawEndpoint(startPt, 'S', '#63e6be');
  if (goalPt) drawEndpoint(goalPt, 'G', '#ffb04a');
  ctx.restore();
}
