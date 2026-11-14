import { compareToStraightLine, polylineSurfaceLengthM, projectTraverse, selectTraverseSubset } from '../geo/traverse.js';
import { buildIntermediateSolMarkers } from './3d/marker-mesh.js';

export function prepareArchiveTraverse(traverseJson, waypointsJson, adapter, route) {
  const subset = selectTraverseSubset(traverseJson, waypointsJson);
  const projected = projectTraverse(subset, adapter);
  if (!subset.contiguous || subset.counts.segmentsSkipped || subset.counts.verticesSkippedInvalid ||
      subset.counts.stopsMissingWaypoint || subset.counts.stopsInvalidCoordinate || projected.skippedPoints ||
      projected.startStop?.rmc !== '4_1250' || projected.startStop.sol !== 116 ||
      projected.stops.at(-1)?.rmc !== '6_0' || projected.stops.at(-1).sol !== 157) {
    throw new Error('MMGIS arşiv zinciri veya durak kimlikleri doğrulanamadı.');
  }
  return {
    ...projected,
    archiveSurfaceLengthM: polylineSurfaceLengthM(projected.polyline),
    comparison: compareToStraightLine(projected.polyline, route.a, route.b, {
      corridorHalfWidthM: route.corridorHalfWidthM,
    }),
  };
}

export function combineTraverseMarkers(base, archive) {
  if (!archive?.indices.length) return base;
  if (!base) return archive;
  function join(a, b) {
    const joined = new Float32Array(a.length + b.length);
    joined.set(a);
    joined.set(b, a.length);
    return joined;
  }
  const indices = new Uint32Array(base.indices.length + archive.indices.length);
  indices.set(base.indices);
  const vertexOffset = base.positions.length / 3;
  archive.indices.forEach((index, i) => { indices[base.indices.length + i] = index + vertexOffset; });
  return {
    ...base,
    positions: join(base.positions, archive.positions),
    normals: join(base.normals, archive.normals),
    colorsRgb: join(base.colorsRgb, archive.colorsRgb),
    indices,
  };
}

/** Prepare world-space lines and markers with the active DTM before entering the renderer. */
export function prepareArchiveTraverse3d(archive, surfaceProvider, displayConfig) {
  const stepM = surfaceProvider.cellSizeM * 0.25;
  if (!Number.isFinite(stepM) || stepM <= 0) return null;
  const positions = [];
  for (const { points } of archive.segments) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / stepM));
      let previous = null;
      for (let j = 0; j <= steps; j++) {
        const fraction = j / steps;
        const x = a.x + (b.x - a.x) * fraction;
        const y = a.y + (b.y - a.y) * fraction;
        const sample = surfaceProvider.sampleElevation(x, y);
        if (sample.status !== 'ok' || !Number.isFinite(sample.value)) {
          previous = null;
          continue;
        }
        const z = (sample.value - displayConfig.referenceElevationM) * displayConfig.verticalScale + 0.08;
        const current = [x, y, z];
        if (previous) positions.push(...previous, ...current);
        previous = current;
      }
    }
  }
  return {
    linePositions: new Float32Array(positions),
    markers: buildIntermediateSolMarkers({
      stops: archive.stops.filter((stop) => !stop.isArrival), surfaceProvider, displayConfig,
    }),
  };
}
