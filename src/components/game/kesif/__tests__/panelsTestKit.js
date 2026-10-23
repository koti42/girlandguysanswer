/*
 * Panel testleri için sahte motor yüzeyi: gerçek Inventory + gerçek tarif tablosu üzerinde, addendum §E'deki
 * adres tabanlı api (moveStack/equipArmor/craft/getRecipes/...) davranışını taklit eder. Çağrılar vi.fn ile izlenir.
 */
import { vi } from 'vitest';
import { Inventory } from '../../../../game/kesif/sim/inventory.js';
import { RECIPES, itemByKey } from '../../../../game/kesif/sim/items.js';

const cl = (s) => (s ? { item: s.item, count: s.count, dur: s.dur === undefined ? null : s.dur } : null);

export function parse(addr) {
    const m = /^([sac])(\d+)$/.exec(addr);
    return m ? { kind: m[1], index: Number(m[2]) } : null;
}

/**
 * opts: {items:{idx:[key,count]}, armor:{idx:[key,count]}, chest:{idx:[key,count]}|null, stations:[...], heat,
 *        creative, palette, craftMulti (false → times>1 başarısız), map, journal}
 */
export function makeFakeApi(opts = {}) {
    const inv = new Inventory({ size: 36, hotbar: 9, armor: 4 });
    Object.keys(opts.items || {}).forEach((i) => inv.setSlot(Number(i), opts.items[i][0], opts.items[i][1]));
    Object.keys(opts.armor || {}).forEach((i) => {
        inv.setSlot(35, opts.armor[i][0], 1);
        inv.equip(35);
    });
    if (opts.heat) inv.heat = opts.heat;
    let chest = null;
    if (opts.chest) {
        chest = { pos: { x: 3, y: 64, z: -8 }, slots: new Array(27).fill(null) };
        Object.keys(opts.chest).forEach((i) => {
            const it = itemByKey(opts.chest[i][0]);
            chest.slots[Number(i)] = { item: it.key, count: opts.chest[i][1] };
            if (it.durability) chest.slots[Number(i)].dur = it.durability;
        });
    }
    const stations = opts.stations || ['el'];
    const container = (addr) => {
        const p = parse(addr);
        if (!p) return null;
        const arr = p.kind === 's' ? inv.slots : p.kind === 'a' ? inv.armor : chest && chest.slots;
        return arr ? [arr, p.index] : null;
    };

    const api = {
        _inv: inv,
        _chest: () => chest,
        getInventorySnapshot: vi.fn(() => ({
            slots: inv.slots.map(cl),
            armor: inv.armor.map(cl),
            selected: inv.selected,
            heat: inv.heat,
            creative: !!opts.creative,
        })),
        moveStack: vi.fn((from, to, o) => {
            const f = container(from);
            const t = container(to);
            if (!f || !t) return false;
            const a = f[0][f[1]];
            const b = t[0][t[1]];
            if (!a || (f[0] === t[0] && f[1] === t[1])) return false;
            const stack = itemByKey(a.item).stack;
            if (o && o.half) {
                const n = Math.floor(a.count / 2);
                if (n < 1) return false;
                if (!b) {
                    t[0][t[1]] = { item: a.item, count: n };
                    a.count -= n;
                    return true;
                }
                if (b.item === a.item && b.count + n <= stack) {
                    b.count += n;
                    a.count -= n;
                    return true;
                }
                return false;
            }
            if (b && b.item === a.item && a.dur === undefined && b.dur === undefined && b.count < stack) {
                const n = Math.min(stack - b.count, a.count);
                b.count += n;
                a.count -= n;
                if (a.count <= 0) f[0][f[1]] = null;
                return true;
            }
            f[0][f[1]] = b || null;
            t[0][t[1]] = a;
            return true;
        }),
        dropSlot: vi.fn((addr, count) => {
            const f = container(addr);
            if (!f || !f[0][f[1]]) return;
            f[0][f[1]].count -= count;
            if (f[0][f[1]].count <= 0) f[0][f[1]] = null;
        }),
        equipArmor: vi.fn((addr) => inv.equip(parse(addr).index)),
        unequipArmor: vi.fn((i) => inv.unequip(i)),
        selectHotbar: vi.fn((i) => {
            inv.selected = i;
        }),
        useSlot: vi.fn(() => true),
        getStations: vi.fn(() => stations.slice()),
        getRecipes: vi.fn(() => RECIPES.map((r) => ({
            id: r.id,
            out: r.out,
            in: r.in.map((p) => ({ item: p.item, count: p.count, have: inv.count(p.item) })),
            station: r.station,
            category: r.category,
            heat: r.heat,
            craftable: inv.canCraft(r, new Set(stations)),
        }))),
        craft: vi.fn((id, o) => {
            const times = (o && o.times) || 1;
            if (times > 1 && opts.craftMulti === false) return false;
            let done = 0;
            for (let i = 0; i < times; i++) {
                if (!inv.craft(id, new Set(stations))) break;
                done++;
            }
            return done === times;
        }),
        getBuildPalette: vi.fn(() => opts.palette || []),
        setCreativeSlot: vi.fn((i, key) => inv.setSlot(i, key, 64)),
        clearSlot: vi.fn((addr) => {
            const f = container(addr);
            if (f) f[0][f[1]] = null;
        }),
        getChest: vi.fn(() => (chest ? { pos: chest.pos, slots: chest.slots.map(cl) } : null)),
        getMapInfo: vi.fn(() => opts.map || null),
        getJournal: vi.fn(() => opts.journal || null),
    };
    return api;
}

/** Her şeyi sessizce yutan 2D bağlam taklidi (jsdom canvas'ı yok). */
export function makeFakeCtx() {
    const calls = [];
    const target = {
        createImageData: (w, h) => ({ width: w, height: h, data: { set() {} } }),
        measureText: () => ({ width: 10 }),
        calls,
    };
    return new Proxy(target, {
        get(t, k) {
            if (k in t) return t[k];
            return (...args) => {
                calls.push([k, ...args]);
            };
        },
        set() {
            return true;
        },
    });
}
