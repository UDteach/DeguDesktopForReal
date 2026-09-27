import test from 'node:test';
import assert from 'node:assert/strict';
import { species, variants } from '../docs/obs/catalog.mjs';
import { makeDefaultConfig, validateConfig, serializeConfig, parseConfig, makeOverlayUrl,
  sizeFor } from '../docs/obs/config.mjs';
import { createSelector, chooseDelayMs } from '../docs/obs/scheduler.mjs';

test('published catalog covers exactly the approved animals and motions', () => {
  assert.equal(species.length, 1);
  assert.equal(variants.length, 16);
  assert.equal(variants.flatMap((variant) => variant.motions).length, 48);
  const ids = new Set(variants.map((variant) => variant.id));
  assert.equal(ids.size, variants.length);
  for (const variant of variants) {
    assert.equal(variant.motions.length, 3);
    assert.match(variant.image, /^\.\.\/assets\/colors\/[^/]+\.png$/);
    for (const motion of variant.motions) {
      assert.match(motion.video, /^\.\.\/assets\/obs-videos\/[^/]+\.webm$/);
      assert.equal(motion.fallbackVideo, motion.video.replace('/obs-videos/', '/trial-videos/').replace(/\.webm$/, '.mp4'));
    }
  }
});

test('default settings round-trip to the exact overlay URL', () => {
  const config = makeDefaultConfig();
  assert.deepEqual(validateConfig(config), []);
  const encoded = serializeConfig(config);
  assert.ok(encoded.length < 16 * 1024);
  assert.deepEqual(parseConfig(encoded), config);
  const url = new URL(makeOverlayUrl(config));
  assert.equal(url.pathname.endsWith('/obs/overlay.html'), true);
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('c'), encoded);
});

test('maximum-sized valid settings fit URL limit and survive import', () => {
  const config = makeDefaultConfig();
  for (const group of species) config.size.bySpecies[group.id] = 600;
  for (const variant of variants) config.size.byVariant[variant.id] = 80;
  config.area = { x: 0, y: 25.5, width: 100, height: 74.5 };
  config.order = 'sequential';
  const encoded = serializeConfig(config);
  assert.ok(encoded.length < 16 * 1024);
  assert.deepEqual(parseConfig(encoded), config);
});

test('disabled animals and motions never enter the selection pool', () => {
  const config = makeDefaultConfig();
  config.variants = ['agouti', 'sand'];
  config.motionsByVariant = {
    'agouti': ['b-side-peek'],
    'sand': ['a-bottom-pop'],
  };
  assert.deepEqual(validateConfig(config), []);
  const selector = createSelector(config, () => 0);
  const seen = Array.from({ length: 50 }, () => selector.next());
  assert.deepEqual(new Set(seen.map(({ variant }) => variant.id)), new Set(config.variants));
  for (const choice of seen) assert.ok(config.motionsByVariant[choice.variant.id].includes(choice.motion.id));
});

test('single choice works and sequential order walks selected animals', () => {
  const config = makeDefaultConfig();
  config.variants = ['sand'];
  config.motionsByVariant = { 'sand': ['b-side-peek'] };
  const selector = createSelector(config, () => 0);
  assert.deepEqual(Array.from({ length: 4 }, () => selector.next().motion.id), ['b-side-peek', 'b-side-peek', 'b-side-peek', 'b-side-peek']);
  config.variants = ['sand', 'agouti'];
  config.motionsByVariant['agouti'] = ['c-center-hop', 'b-side-peek'];
  config.order = 'sequential';
  const sequence = createSelector(config);
  assert.deepEqual(Array.from({ length: 4 }, () => sequence.next().variant.id), [
    'sand', 'agouti', 'sand', 'agouti',
  ]);
});

test('interval boundaries and size inheritance are deterministic', () => {
  assert.equal(chooseDelayMs({ minSec: 60, maxSec: 180 }, () => 0), 60000);
  assert.equal(chooseDelayMs({ minSec: 60, maxSec: 180 }, () => 0.5), 120000);
  assert.equal(chooseDelayMs({ minSec: 60, maxSec: 60 }, () => 0.5), 60000);
  const config = makeDefaultConfig();
  const variant = variants[0];
  assert.equal(sizeFor(config, variant), 240);
  config.size.bySpecies[variant.species] = 320;
  assert.equal(sizeFor(config, variant), 320);
  config.size.byVariant[variant.id] = 400;
  assert.equal(sizeFor(config, variant), 400);
  delete config.size.byVariant[variant.id];
  assert.equal(sizeFor(config, variant), 320);
});

test('invalid selections, geometry, and URL payload stop without selecting a default animal', () => {
  const config = makeDefaultConfig();
  config.variants = [];
  config.motionsByVariant = {};
  assert.ok(validateConfig(config).some(({ path }) => path === 'variants'));
  assert.throws(() => serializeConfig(config));
  config.variants = ['unknown-animal'];
  assert.ok(validateConfig(config).some(({ path }) => path === 'variants'));
  config.variants = ['sand'];
  config.motionsByVariant = { 'sand': ['not-a-motion'] };
  assert.ok(validateConfig(config).some(({ path }) => path.startsWith('motionsByVariant')));
  config.motionsByVariant = { 'sand': ['b-side-peek'] };
  config.interval = { minSec: 181, maxSec: 180 };
  assert.ok(validateConfig(config).some(({ path }) => path === 'interval'));
  config.interval = { minSec: 60, maxSec: 180 };
  config.area = { x: 95, y: 0, width: 10, height: 100 };
  assert.ok(validateConfig(config).some(({ path }) => path === 'area'));
  assert.throws(() => parseConfig('!invalid'));
  assert.throws(() => parseConfig('a'.repeat(16 * 1024 + 1)));
});

test('fixed random values map evenly across animal choices', () => {
  const config = makeDefaultConfig();
  config.variants = variants.slice(0, 3).map(({ id }) => id);
  config.motionsByVariant = Object.fromEntries(config.variants.map((id) => [id, ['a-bottom-pop']]));
  config.avoidRepeat = false;
  const choices = [0, 1 / 3, 2 / 3].map((value) => createSelector(config, () => value).next().variant.id);
  assert.deepEqual(choices, config.variants);
});
