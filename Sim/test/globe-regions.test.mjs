import test from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, REGION_TYPES, typeSafetyWeight, TYPE_SAFETY_WEIGHT_LABEL, findRegionAt, greatCircleDistanceKm } from '../public/js/view/globe/regions.js';
import {
  latLonToVec3, vec3ToLatLon, raySphereIntersect, pointerRay, pickLatLon, greatCircleArc, greatCircleAngle, rotationMatrix, mulMat3Vec,
} from '../public/js/view/globe/globe.js';

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} !~ ${b}`);

test('regions şeması', () => {
  const typeIds = new Set(REGION_TYPES.map((t) => t.id));
  const ids = new Set();
  assert.ok(REGIONS.length >= 14);
  for (const r of REGIONS) {
    assert.ok(!ids.has(r.id), `yinelenen id ${r.id}`); ids.add(r.id);
    assert.ok(r.lat >= -90 && r.lat <= 90, r.id);
    assert.ok(r.lon >= -180 && r.lon <= 180, r.id);
    assert.ok(r.radiusKm > 0, r.id);
    assert.ok(typeIds.has(r.type), `${r.id} türü REGION_TYPES içinde değil`);
    assert.ok(r.name && r.description && r.hazardNote, r.id);
  }
  for (const t of REGION_TYPES) { assert.ok(t.label && t.icon); assert.ok(t.id in typeSafetyWeight); }
  for (const w of Object.values(typeSafetyWeight)) assert.ok(w >= 0 && w <= 1);
  assert.match(TYPE_SAFETY_WEIGHT_LABEL, /senaryo parametresi/);
});

test('findRegionAt', () => {
  assert.equal(findRegionAt(18.44, 77.45).region.id, 'jezero');
  assert.equal(findRegionAt(18.65, -133.8).region.id, 'olympus');
  assert.equal(findRegionAt(0, 0).region.id, 'meridiani');
  assert.equal(findRegionAt(60, -40, { snapKm: 1 }), null);
  close(greatCircleDistanceKm(0, 0, 0, 90), Math.PI / 2 * 3396.19, 1e-6);
});

test('lat/lon <-> vec3 gidiş-dönüş', () => {
  for (const [lat, lon] of [[0, 0], [18.4, 77.5], [-45, -170], [89, 10], [-30, 179]]) {
    const v = latLonToVec3(lat, lon);
    close(Math.hypot(...v), 1);
    const b = vec3ToLatLon(v);
    close(b.lat, lat, 1e-9); close(b.lon, lon, 1e-9);
  }
  assert.deepEqual(latLonToVec3(0, 0).map((x) => Math.round(x)), [0, 0, 1]);
  assert.ok(latLonToVec3(0, 90)[0] > 0.99);
});

test('ışın-küre kesişimi', () => {
  close(raySphereIntersect([0, 0, 3], [0, 0, -1], 1), 2);
  assert.equal(raySphereIntersect([0, 0, 3], [0, 1, 0], 1), null);
  assert.equal(raySphereIntersect([0, 0, 3], [0, 0, 1], 1), null);
  close(raySphereIntersect([0, 0, 0], [0, 0, 1], 1), 1);
});

test('ekran merkezi, dönüşten bağımsız olarak yaw/pitch ile odaklanan noktayı verir', () => {
  const base = { ndcX: 0, ndcY: 0, fovY: 0.78, aspect: 1.5, distance: 3 };
  const p0 = pickLatLon({ ...base, yaw: 0, pitch: 0 });
  close(p0.lat, 0, 1e-9); close(p0.lon, 0, 1e-9);
  // flyTo kuralı: yaw=-lon, pitch=lat => merkez bu noktayı gösterir
  const p = pickLatLon({ ...base, yaw: -77.45 * Math.PI / 180, pitch: 18.44 * Math.PI / 180 });
  close(p.lat, 18.44, 1e-6); close(p.lon, 77.45, 1e-6);
  assert.equal(pickLatLon({ ...base, ndcX: 1, ndcY: 1, yaw: 0, pitch: 0 }), null);
  const ray = pointerRay(base); close(Math.hypot(...ray.dir), 1);
});

test('rotationMatrix ortonormal', () => {
  const m = rotationMatrix(0.7, -0.4);
  close(Math.hypot(...mulMat3Vec(m, [0.3, 0.5, 0.8])), Math.hypot(0.3, 0.5, 0.8), 1e-12);
});

test('büyük daire yayı', () => {
  const a = { lat: 0, lon: 0 }, b = { lat: 0, lon: 90 };
  const arc = greatCircleArc(a, b, 10);
  assert.equal(arc.length, 11);
  close(greatCircleAngle(a, b), Math.PI / 2);
  for (const v of arc) close(Math.hypot(...v), 1, 1e-9);
  const mid = vec3ToLatLon(arc[5]); close(mid.lon, 45, 1e-9); close(mid.lat, 0, 1e-9);
  const k = greatCircleArc({ lat: 10, lon: 0 }, { lat: 80, lon: 100 }, 8);
  close(vec3ToLatLon(k[0]).lat, 10, 1e-9); close(vec3ToLatLon(k[8]).lon, 100, 1e-9);
  const anti = greatCircleArc({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }, 4);
  for (const v of anti) assert.ok(Number.isFinite(v[0]) && Math.abs(Math.hypot(...v) - 1) < 1e-9);
  assert.equal(greatCircleArc(a, a, 4).length, 1);
});

