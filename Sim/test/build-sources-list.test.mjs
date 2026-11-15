// Stage 31A tests: SOURCES.md compiler never invents a licence and is deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  UNSPECIFIED, orUnspecified, buildSourceEntries, renderSourcesMarkdown, buildSourcesMarkdown,
} from '../scripts/build-sources-list.mjs';

const SIM_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('orUnspecified collapses empty and "not stated" markers to "belirtilmemiş"', () => {
  assert.equal(UNSPECIFIED, 'belirtilmemiş');
  for (const value of [undefined, null, '', '   ', 'NOT_STATED_IN_PROVIDED_FGDC', 'belirtilmemiş', 'Belirtilmemiş']) {
    assert.equal(orUnspecified(value), UNSPECIFIED, JSON.stringify(value));
  }
  assert.equal(orUnspecified('CC0 1.0'), 'CC0 1.0');
  assert.equal(orUnspecified(0), '0');
});

test('with no records at all every entry still has non-empty fields and the licence is "belirtilmemiş" (never invented)', () => {
  const entries = buildSourceEntries({});
  assert.ok(entries.length >= 13, `expected the full source list, got ${entries.length}`);
  for (const item of entries) {
    for (const [field, value] of Object.entries(item)) {
      assert.ok(typeof value === 'string' && value.trim() !== '', `${item.id}.${field} must not be empty`);
    }
    assert.equal(item.license, UNSPECIFIED, `${item.id} licence must not be invented`);
  }
});

test('an entry whose record has no licence writes "belirtilmemiş"; a stated licence is copied verbatim', () => {
  const entries = buildSourceEntries({
    dtm: { label: { productId: 'P1', mapScaleM: 1, lines: 2, samples: 3, useConstraints: 'This work is marked with CC0 1.0 Universal' }, window: { rows: 1, cols: 1 } },
    legacyDtm: { label: { productId: 'LEG' } },
    viking: { license: 'belirtilmemiş', attribution: 'x', source: { file: 'v.tif' }, projection: { nativeMPerPx: 231.5 } },
    mola: { license: '', product: { layer: 'L', serviceCopyrightText: '' } },
  });
  const byId = Object.fromEntries(entries.map((item) => [item.id, item]));
  assert.equal(byId['hirise-dtm'].license, 'This work is marked with CC0 1.0 Universal');
  assert.equal(byId['hirise-dtm-legacy'].license, UNSPECIFIED);
  assert.equal(byId['viking-mdim'].license, UNSPECIFIED);
  assert.equal(byId['mola-trek'].license, UNSPECIFIED);
  assert.equal(byId['trek-ortho'].license, UNSPECIFIED, 'ortho must not inherit the DTM CC0 statement');
});

test('markdown output is deterministic, LF-only, escapes pipes, and counts unspecified licences', () => {
  const entries = buildSourceEntries({ mola: { product: { layer: 'a|b' }, license: 'x|y' } });
  const first = renderSourcesMarkdown(entries);
  const second = renderSourcesMarkdown(buildSourceEntries({ mola: { product: { layer: 'a|b' }, license: 'x|y' } }));
  assert.equal(first, second);
  assert.ok(!first.includes('\r'));
  assert.match(first, /a\\\|b/);
  const unspecified = entries.filter((item) => item.license === UNSPECIFIED).length;
  assert.match(first, new RegExp(`${entries.length} kaynaktan ${unspecified} tanesinde lisans belirtilmemiş`));
});

test('real repository records: stable output, DTM and Viking metadata carry their stated usage terms', () => {
  const markdown = buildSourcesMarkdown(SIM_ROOT);
  assert.equal(markdown, buildSourcesMarkdown(SIM_ROOT));
  const entries = buildSourceEntries({
    dtm: JSON.parse(fs.readFileSync(path.join(SIM_ROOT, 'data', 'dtm_subset.json'), 'utf8')),
    trek: JSON.parse(fs.readFileSync(path.join(SIM_ROOT, 'data', 'mars-trek', 'manifest.json'), 'utf8')),
    viking: JSON.parse(fs.readFileSync(path.join(SIM_ROOT, 'data', 'viking-mdim', 'manifest.json'), 'utf8')),
  });
  const stated = entries.filter((item) => item.license !== UNSPECIFIED).map((item) => item.id);
  assert.deepEqual(stated, ['hirise-dtm', 'viking-mdim']);
  const viking = entries.find((item) => item.id === 'viking-mdim');
  assert.equal(viking.license, 'Public domain');
  assert.match(viking.licenseEvidence, /Access Constraints = Public domain; Use Constraints = None/);
  assert.equal(viking.sourceUrl, 'https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m');
});

test('committed SOURCES.md is up to date with the generator (run node scripts/build-sources-list.mjs after data changes)', () => {
  const committed = fs.readFileSync(path.join(SIM_ROOT, 'SOURCES.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(committed, buildSourcesMarkdown(SIM_ROOT));
});
