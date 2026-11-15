// Stage Visual-B: Viking MDIM 2.1 regional crop palette measurement (independent of terrain-material.js).
// Usage: node measure-viking.mjs <SimDir>
import { decodePng } from './png.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sim = process.argv[2];
const img = decodePng(join(sim, 'data/viking-mdim/regional-jezero-4deg-native.png'));
const LON0 = 75.44921875, LAT0 = 20.44140625, PPD = 256, M_PER_PX = 231.5417872;
const s2l = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const l2s = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const lumaL = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const pct = (sorted, p) => { const h = (sorted.length - 1) * p; const lo = Math.floor(h); return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (h - lo); };
function hsv(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 0) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); } if (h < 0) h += 360; return { h, s: mx > 0 ? d / mx : 0, v: mx / 255 }; }

// WB1 (config.js WAYPOINTS[0]) centre pixel per manifest: (512,512)
const cx = 512, cy = 512;
const regions = {
  dtmWindow: (x, y) => { const lon = LON0 + (x + 0.5) / PPD, lat = LAT0 - (y + 0.5) / PPD; return lon >= 77.44095190355284 && lon <= 77.4601000400668 && lat >= 18.419242031065906 && lat <= 18.447517164808104; },
  wb1Disc20km: (x, y) => Math.hypot(x - cx, y - cy) * M_PER_PX <= 20000,
  fullCrop4deg: () => true,
};
const result = { source: 'data/viking-mdim/regional-jezero-4deg-native.png', width: img.width, height: img.height, centrePixelRaw: Array.from(img.data.subarray((cy * img.width + cx) * 4, (cy * img.width + cx) * 4 + 3)), regions: {} };
for (const [name, inside] of Object.entries(regions)) {
  const R = [], G = [], B = [], Y = [], H = [], S = []; const lin = []; let n = 0; const sum = [0, 0, 0];
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (!inside(x, y)) continue; const o = (y * img.width + x) * 4; if (img.data[o + 3] === 0) continue;
    const r = img.data[o], g = img.data[o + 1], b = img.data[o + 2]; if (r === 0 && g === 0 && b === 0) continue; // GDAL_NODATA 0
    R.push(r); G.push(g); B.push(b); const lr = s2l(r), lg = s2l(g), lb = s2l(b); lin.push([lr, lg, lb]); const yl = lumaL(lr, lg, lb); Y.push(yl);
    sum[0] += lr; sum[1] += lg; sum[2] += lb; n++; const hv = hsv(r, g, b); H.push(hv.h); S.push(hv.s);
  }
  const srt = (a) => Float64Array.from(a).sort();
  const [sR, sG, sB, sY, sS] = [srt(R), srt(G), srt(B), srt(Y), srt(S)];
  const meanLin = sum.map((v) => v / n);
  const yP = (p) => pct(sY, p);
  const band = (lo, hi) => { const a = yP(lo), b = yP(hi); const acc = [0, 0, 0]; let k = 0; for (let i = 0; i < lin.length; i++) if (Y[i] >= a && Y[i] <= b) { acc[0] += lin[i][0]; acc[1] += lin[i][1]; acc[2] += lin[i][2]; k++; } return { count: k, yRange: [a, b], meanLinear: acc.map((v) => v / k) }; };
  // circular mean hue
  let hs = 0, hc = 0; for (const h of H) { hs += Math.sin(h * Math.PI / 180); hc += Math.cos(h * Math.PI / 180); }
  const hueMean = (Math.atan2(hs, hc) * 180 / Math.PI + 360) % 360;
  const reg = {
    pixels: n,
    srgb8: { mean: [R, G, B].map((a) => a.reduce((s, v) => s + v, 0) / a.length), median: [sR, sG, sB].map((s) => pct(s, 0.5)), p10: [sR, sG, sB].map((s) => pct(s, 0.1)), p90: [sR, sG, sB].map((s) => pct(s, 0.9)) },
    linearMean: meanLin, linearMeanAsSrgb8: meanLin.map((v) => l2s(v) * 255),
    luminanceLinear: { mean: Y.reduce((s, v) => s + v, 0) / n, p10: yP(0.1), p50: yP(0.5), p90: yP(0.9) },
    chromaticityLinear: meanLin.map((v) => v / (meanLin[0] + meanLin[1] + meanLin[2])),
    hueDegMeanCircular: hueMean, saturationMedian: pct(sS, 0.5),
    brightBandP60_P90: band(0.6, 0.9), darkBandP10_P40: band(0.1, 0.4),
  };
  result.regions[name] = reg;
}
writeFileSync(join(process.argv[3] ?? '.', 'viking-measure.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
