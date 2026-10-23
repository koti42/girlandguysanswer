import { vi } from 'vitest';

/*
 * Oturum/ekran testleri için sahte Keşif motoru: createKesifGame + api yüzeyi (addendum §E/§G).
 * `engine.opts` son createKesifGame seçeneklerini, `engine.controls` api'yi (vi.fn), `engine.cb`
 * geri çağrıları (onHud/onEvent/onSave...) verir. HUD yayınlayan yardımcılar: hud(), setUi().
 */

export const SAVE = {
    v: 2, // sim/constants SAVE_VERSION (derin dünya sonrası)
    mode: 'macera',
    seed: 4242,
    name: 'Test macerası',
    createdAt: 1000,
    savedAt: 2000,
    playTime: 90,
    player: { pos: [0, 64, 0], yaw: 0, pitch: 0 },
    edits: {},
};

export const MAP = { v: 1, base: 'düz', size: { x: 128, z: 128 }, spawn: [64, 40, 64], chunks: {}, time: 'gündüz' };

const emptySlots = () => Array.from({ length: 36 }, () => ({ item: null, count: 0, dur: null }));

export function makeEngine({ webgl = true, progress = null, worldCode = 'ABCD1234', exportResult, autoReady = false, input = null } = {}) {
    const state = { opts: null, paused: false, calls: 0, progressIdx: 0 };
    const baseHud = { hp: 20, maxHp: 20, hunger: 20, ui: 'none', mode: 'macera' };
    const controls = {
        start: vi.fn(),
        pause: vi.fn(() => {
            state.paused = true;
            state.opts.callbacks.onHud({ ...baseHud, mode: state.opts.mode, ui: 'pause' });
        }),
        resume: vi.fn(() => {
            state.paused = false;
            state.opts.callbacks.onHud({ ...baseHud, mode: state.opts.mode, ui: 'none' });
        }),
        closeUi: vi.fn(() => state.opts.callbacks.onHud({ ...baseHud, mode: state.opts.mode, ui: 'none' })),
        destroy: vi.fn(),
        save: vi.fn(() => ({ ...SAVE, savedAt: 3000 })),
        exportMap: vi.fn(() => exportResult || { map: MAP, meta: { blockCount: 12, spawn: [64, 40, 64] } }),
        screenshot: vi.fn(() => 'data:image/jpeg;base64,AAAA'),
        setMapTime: vi.fn((name) => name),
        setMuted: vi.fn(),
        setMusicEnabled: vi.fn(),
        setAvatar: vi.fn(),
        setSettings: vi.fn(),
        setCameraMode: vi.fn(),
        selectHotbar: vi.fn(),
        markRewardClaimed: vi.fn(),
        respawn: vi.fn(),
        toggleInventory: vi.fn(),
        toggleCrafting: vi.fn(),
        getWorldCode: vi.fn(() => worldCode),
        getSaveSummary: vi.fn(() => ({ name: 'Test macerası', seed: 4242, worldCode, playTime: 90, zone: { id: 1, name: 'Fısıldayan Ormanlar' } })),
        getStats: vi.fn(() => ({ puzzlesSolved: 3, zone: 1, playTime: 125 })),
        getInventorySnapshot: vi.fn(() => ({ slots: emptySlots(), armor: [null, null, null, null], selected: 0, heat: 0, creative: false })),
        getStations: vi.fn(() => ['el']),
        getRecipes: vi.fn(() => []),
        getBuildPalette: vi.fn(() => []),
        getChest: vi.fn(() => null),
        getMapInfo: vi.fn(() => null),
        getJournal: vi.fn(() => ({ quests: [], achievements: [], discovered: { structures: 0, biomes: 0 }, stats: {}, abilities: {} })),
        getPuzzleHint: vi.fn(() => 'Plakaya bir blok koy.'),
        pressButton: vi.fn(() => true),
    };
    if (input) {
        controls.input = input;
        delete controls.pressButton; // gerçek api'de yok: düğmeler input'a gider
    }
    if (progress) {
        controls.getLoadProgress = vi.fn(() => progress[Math.min(state.progressIdx++, progress.length - 1)]);
    }
    const mod = {
        isWebGLAvailable: vi.fn(() => webgl),
        createKesifGame: vi.fn(async (o) => {
            state.opts = o;
            state.calls += 1;
            // Gerçek motor: ilk chunk halkası yüklenince onReady'yi api dönmeden ÖNCE çağırır.
            if (autoReady) o.callbacks.onReady();
            return controls;
        }),
    };
    const engine = {
        controls,
        mod,
        get opts() {
            return state.opts;
        },
        get cb() {
            return state.opts.callbacks;
        },
        hud: (patch = {}) => state.opts.callbacks.onHud({ ...baseHud, mode: state.opts.mode, ...patch }),
        setUi: (ui) => state.opts.callbacks.onHud({ ...baseHud, mode: state.opts.mode, ui }),
    };
    return engine;
}

export const httpErr = (status, data, message) => Object.assign(new Error(`http ${status}`), { response: { status, data: { success: false, message, data } } });
