// Adaptive quality governor (presentation only). Pure: no DOM, no WebGL, no clock, no randomness.
// Time is accumulated from the frame deltas the caller passes in, so the same frame sequence always yields
// the same decisions. The governor only chooses a presentation level; the renderer applies it. Terrain
// heights, slopes, no-data cells, routes and mesh geometry are never changed by a level.
//
// Levels run from best to lightest. Each level is a concrete setting set that renderer.js applies:
//   shadows  -> sun shadow-map preset (off | low | high)
//   detail   -> gains for procedural micro detail / pebbles / rocks / craters (0 skips the layer) and dust
//   horizon  -> regional-context horizon pass on/off
//   footprintMax -> newest footprints drawn (null = all)

export const QUALITY_LEVELS = Object.freeze(['high', 'medium', 'low', 'minimal']);
export const QUALITY_MODES = Object.freeze(['auto', ...QUALITY_LEVELS]);

/** Concrete settings per level (presentation parameters; not measurements). */
export const QUALITY_LEVEL_SETTINGS = Object.freeze({
  high: Object.freeze({
    shadows: 'high',
    detail: Object.freeze({ micro: 1, pebbles: 1, rocks: 1, craters: 1, dust: 1 }),
    horizon: true,
    footprintMax: null,
  }),
  medium: Object.freeze({
    shadows: 'low',
    // Granular (pebbles) and crack/crater layers are reduced; micro and rocks stay near full.
    detail: Object.freeze({ micro: 0.8, pebbles: 0.6, rocks: 1, craters: 0.6, dust: 1 }),
    horizon: true,
    footprintMax: null,
  }),
  low: Object.freeze({
    shadows: 'off',
    // Pebble and rock octaves halved, crack/crater layer skipped.
    detail: Object.freeze({ micro: 0.5, pebbles: 0.5, rocks: 0.5, craters: 0, dust: 1 }),
    horizon: true,
    footprintMax: null,
  }),
  minimal: Object.freeze({
    shadows: 'off',
    // Base colour only (dust gain 1 = the base albedo/dust tint); every procedural detail layer is skipped.
    detail: Object.freeze({ micro: 0, pebbles: 0, rocks: 0, craters: 0, dust: 1 }),
    horizon: false,
    footprintMax: 60,
  }),
});

export const QUALITY_GOVERNOR_DEFAULTS = Object.freeze({
  targetFps: 45,        // median below this is "too slow"
  lowFps: 35,           // severe: below this the drop hold is shorter
  recoverFps: 55,       // median above this counts toward an upgrade
  windowFrames: 30,     // sliding window of accepted frame samples
  minSamples: 15,       // no decision before this many samples
  warmupS: 3,           // shader compile / tile streaming: no measurement
  settleS: 1.5,         // samples ignored after a level change (new shadow targets, shader use)
  dropHoldS: 2,         // sustained time below targetFps before stepping down
  severeDropHoldS: 1,   // sustained time below lowFps before stepping down
  recoverHoldS: 10,     // sustained time above recoverFps before stepping up
  minDwellS: 15,        // minimum time at a level before stepping up
  minDropDwellS: 4,     // minimum time since ANY level change before stepping down (separate from the up dwell)
  upgradeLockS: 30,     // a level that was reached by an upgrade and then dropped again is locked against upgrades this long
  resumeSettleS: 1,     // samples ignored after hidden / focus loss / pause ends
  loadChangeSettleS: 1.5, // samples ignored after notifyLoadChange() (helmet / map toggled, overlay opened)
  maxFrameMs: 250,     // a single frame longer than this is an outlier (tab switch, debugger, GC stall)
  maxChanges: 100,      // change log capacity (the total count is kept separately)
});

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Nearest-rank percentile (p in 0..1) of a non-empty list. */
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/**
 * @param {Object} [options]
 * @param {string[]} [options.levels] best -> lightest level names (default QUALITY_LEVELS)
 * @param {'auto'|string} [options.mode] 'auto' lets the governor step levels; a level name pins it
 * @param {Object} [options.thresholds] overrides for QUALITY_GOVERNOR_DEFAULTS
 * @returns {{ update, getState, reset, setMode }}
 */
export function createQualityGovernor(options = {}) {
  const levels = [...(options.levels ?? QUALITY_LEVELS)];
  if (levels.length === 0 || new Set(levels).size !== levels.length || levels.some((name) => typeof name !== 'string' || !name)) {
    throw new TypeError('levels must be a non-empty list of unique level names');
  }
  const cfg = { ...QUALITY_GOVERNOR_DEFAULTS, ...(options.thresholds ?? {}) };
  for (const [key, value] of Object.entries(cfg)) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`governor threshold ${key} must be a finite non-negative number`);
  }
  if (!(cfg.lowFps < cfg.targetFps && cfg.targetFps < cfg.recoverFps)) {
    throw new RangeError('governor thresholds need lowFps < targetFps < recoverFps');
  }
  if (!(cfg.minSamples >= 1 && cfg.windowFrames >= cfg.minSamples)) {
    throw new RangeError('governor needs 1 <= minSamples <= windowFrames');
  }

  const requestedMode = options.mode ?? 'auto';
  if (!QUALITY_MODES.includes(requestedMode)) throw new RangeError(`unknown quality mode: ${requestedMode}`);

  let state;
  function freshState(mode) {
    return {
      mode,
      levelIndex: mode === 'auto' ? 0 : levels.indexOf(mode),
      elapsedS: 0,
      sinceChangeS: 0,
      settleLeftS: 0,
      belowS: 0,
      aboveS: 0,
      prevLong: false,
      window: [],
      changes: [],
      changeCount: 0,
      lastMedianMs: null,
      lastChangeUp: false,    // the most recent level change was an upgrade
      lockUntilS: [],         // per level index: elapsedS before which an upgrade INTO that level is refused
      wasSuspended: false,    // previous update was hidden / unfocused / paused
      loadChangeCount: 0,
    };
  }
  state = freshState(requestedMode);
  if (state.mode !== 'auto' && state.levelIndex < 0) {
    // A pinned mode must name one of this governor's levels.
    throw new RangeError(`quality mode ${requestedMode} is not among the governor levels`);
  }

  function record(to, reason) {
    const from = levels[state.levelIndex];
    const toIndex = levels.indexOf(to);
    // Dropping out of a level that an upgrade had just reached proves the upgrade was premature: lock it.
    if (toIndex > state.levelIndex && state.lastChangeUp && reason !== 'manual') {
      state.lockUntilS[state.levelIndex] = state.elapsedS + cfg.upgradeLockS;
    }
    state.lastChangeUp = toIndex < state.levelIndex;
    state.levelIndex = toIndex;
    state.changeCount += 1;
    state.changes.push({ tS: round(state.elapsedS, 2), from, to, reason });
    if (state.changes.length > cfg.maxChanges) state.changes.shift();
    state.sinceChangeS = 0;
    state.belowS = 0;
    state.aboveS = 0;
    state.window = [];
    state.settleLeftS = cfg.settleS;
  }

  function resetMeasurement() {
    state.window = [];
    state.belowS = 0;
    state.aboveS = 0;
    state.prevLong = false;
  }

  function result(reason, changed = false) {
    return { level: levels[state.levelIndex], changed, reason };
  }

  return {
    /**
     * Feeds one frame. `frameDtMs` is the frame-to-frame interval. `context.hidden` (tab hidden or not in the
     * 3D view) and `context.paused` (simulation paused) discard the sample and restart the window.
     */
    update(frameDtMs, context = {}) {
      if (!Number.isFinite(frameDtMs) || frameDtMs < 0) return result('invalid-sample');
      if (state.mode !== 'auto') return result('manual');
      // hidden tab, lost focus, 2D view / overlays (caller sets hidden) and pause are never measured.
      if (context.hidden || context.paused || context.focused === false) {
        resetMeasurement();
        state.wasSuspended = true;
        return result(context.hidden ? 'hidden' : context.paused ? 'paused' : 'unfocused');
      }
      if (state.wasSuspended) {
        state.wasSuspended = false;
        state.settleLeftS = Math.max(state.settleLeftS, cfg.resumeSettleS);
      }
      const dtS = frameDtMs / 1000;
      state.elapsedS += dtS;
      state.sinceChangeS += dtS;

      // A single long frame is an outlier; a run of long frames is a real slow state and is counted.
      const isLong = frameDtMs > cfg.maxFrameMs;
      if (isLong && !state.prevLong) {
        state.prevLong = true;
        return result('outlier');
      }
      state.prevLong = isLong;

      if (state.elapsedS < cfg.warmupS) return result('warmup');
      if (state.settleLeftS > 0) {
        state.settleLeftS -= dtS;
        return result('settle');
      }

      state.window.push(frameDtMs);
      if (state.window.length > cfg.windowFrames) state.window.shift();
      if (state.window.length < cfg.minSamples) return result('filling');

      // Decisions use the median (spike-robust); the p90 frame time must also be healthy before an upgrade.
      const medianMs = median(state.window);
      const p90Ms = percentile(state.window, 0.9);
      state.lastMedianMs = medianMs;
      const fps = 1000 / Math.max(medianMs, 1e-6);
      const p90Healthy = p90Ms <= 1000 / cfg.targetFps;
      if (fps < cfg.targetFps) {
        state.belowS += dtS;
        state.aboveS = 0;
      } else if (fps > cfg.recoverFps && p90Healthy) {
        state.aboveS += dtS;
        state.belowS = 0;
      } else {
        // Dead band 45..55 fps (or a ragged p90): no timer runs, so the level cannot flap.
        state.belowS = 0;
        state.aboveS = 0;
      }

      const dropHoldS = fps < cfg.lowFps ? cfg.severeDropHoldS : cfg.dropHoldS;
      if (state.levelIndex < levels.length - 1 && state.belowS >= dropHoldS && state.sinceChangeS >= cfg.minDropDwellS) {
        const reason = fps < cfg.lowFps ? 'frame-time-severe' : 'frame-time-low';
        record(levels[state.levelIndex + 1], reason);
        return result(reason, true);
      }
      if (state.levelIndex > 0 && state.aboveS >= cfg.recoverHoldS && state.sinceChangeS >= cfg.minDwellS
        && state.elapsedS >= (state.lockUntilS[state.levelIndex - 1] ?? 0)) {
        record(levels[state.levelIndex - 1], 'frame-time-recovered');
        return result('frame-time-recovered', true);
      }
      return result('hold');
    },

    /**
     * Tells the governor the render/CPU load just changed for a transient reason (helmet layer, minimap enlarged
     * with M, overlay or vision mode toggled). The measurement window and hold timers restart and the next
     * `loadChangeSettleS` seconds are not sampled. Optional and safe to never call. Does not change the level.
     */
    notifyLoadChange() {
      state.loadChangeCount += 1;
      resetMeasurement();
      state.settleLeftS = Math.max(state.settleLeftS, cfg.loadChangeSettleS);
    },

    /** Pins a level ('auto' re-enables stepping). Pinning changes the level at once and is logged. */
    setMode(mode) {
      if (!QUALITY_MODES.includes(mode)) throw new RangeError(`unknown quality mode: ${mode}`);
      if (mode !== 'auto' && !levels.includes(mode)) throw new RangeError(`quality mode ${mode} is not among the governor levels`);
      const changes = state.changes;
      const changeCount = state.changeCount;
      const elapsedS = state.elapsedS;
      const levelIndex = state.levelIndex;
      state = freshState(mode);
      state.changes = changes;
      state.changeCount = changeCount;
      state.elapsedS = elapsedS;
      if (mode === 'auto') {
        state.levelIndex = levelIndex;
        return;
      }
      const to = mode;
      if (levels[levelIndex] !== to) {
        state.levelIndex = levelIndex;
        record(to, 'manual');
      }
    },

    /** Back to automatic mode at the best level, with an empty log. */
    reset() {
      state = freshState('auto');
    },

    getState() {
      const medianMs = state.window.length >= cfg.minSamples ? median(state.window) : null;
      const p90Ms = state.window.length >= cfg.minSamples ? percentile(state.window, 0.9) : null;
      return {
        p90FrameMs: p90Ms === null ? null : round(p90Ms, 2),
        loadChangeCount: state.loadChangeCount,
        lockedLevels: levels.filter((_, i) => (state.lockUntilS[i] ?? 0) > state.elapsedS),
        mode: state.mode,
        level: levels[state.levelIndex],
        levelIndex: state.levelIndex,
        medianFrameMs: medianMs === null ? null : round(medianMs, 2),
        medianFps: medianMs === null ? null : round(1000 / Math.max(medianMs, 1e-6), 1),
        sampleCount: state.window.length,
        elapsedS: round(state.elapsedS, 2),
        changeCount: state.changeCount,
        changes: state.changes.map((change) => ({ ...change })),
      };
    },
  };
}
