/*
 * Büyü panelleri için sahte motor yüzeyi: gerçek Inventory + gerçek sim/magic (enchantInfo, applyEnchantOffer, BrewManager) üzerinde,
 * systems/magicApi.js'in sözleşmesini taklit eder (motor yok). Çağrılar vi.fn ile izlenir.
 */
import { vi } from 'vitest';
import { Inventory } from '../../../../game/kesif/sim/inventory.js';
import {
  applyEnchantOffer, brewInfo, createMagic, enchantInfo, rerollEnchant, BREW_RECIPES,
} from '../../../../game/kesif/sim/magic.js';
import { maxDurability } from '../../../../game/kesif/sim/items.js';

const view = (s) => {
    if (!s || !s.item) return { item: null, count: 0, dur: null, maxDur: 0 };
    const v = { item: s.item, count: s.count, dur: s.dur === undefined ? null : s.dur, maxDur: maxDurability(s.item) };
    if (s.ench) v.ench = Object.assign({}, s.ench);
    return v;
};

/** opts: {items:{idx:[key,count|dur,ench?]}, shelves, discovered: 'all'|ids[]} */
export function makeMagicApi(opts = {}) {
    const inv = new Inventory({ size: 36, hotbar: 9, armor: 4 });
    Object.keys(opts.items || {}).forEach((i) => {
        const e = opts.items[i];
        inv.setSlot(Number(i), e[0], e[1], undefined, e[2]);
    });
    const magic = createMagic(1234);
    const ui = { shelfCount: opts.shelves === undefined ? 3 : opts.shelves, cauldronPos: { x: 1, y: 2, z: 3 } };
    const seen = new Set(opts.seen || []);
    const known = (id) => opts.discovered === 'all' || (opts.discovered || []).indexOf(id) >= 0;
    const api = {
        _inv: inv,
        _magic: magic,
        _ui: ui,
        getInventorySnapshot: vi.fn(() => ({
            slots: inv.slots.map(view), armor: inv.armor.map(view), selected: inv.selected, heat: 0, creative: false,
        })),
        getEnchantInfo: vi.fn((addr) => Object.assign(
            enchantInfo(magic.state, inv, addr === undefined ? undefined : addr, ui.shelfCount),
            { table: { x: 1, y: 2, z: 3 } },
        )),
        enchant: vi.fn((id, addr) => applyEnchantOffer(magic.state, inv, addr === undefined ? inv.selected : addr, id, ui.shelfCount)),
        rerollEnchant: vi.fn(() => rerollEnchant(magic.state, inv)),
        getBrewInfo: vi.fn(() => {
            const info = brewInfo(magic.brew, ui.cauldronPos, inv);
            info.recipes = info.recipes.map((r) => Object.assign({}, r, {
                discovered: known(r.id),
                in: r.in.map((p) => Object.assign({}, p, { seen: p.have > 0 || seen.has(p.item) })),
            }));
            return info;
        }),
        startBrew: vi.fn((id, n) => magic.brew.start(ui.cauldronPos, id, n, inv)),
        collectBrew: vi.fn(() => magic.brew.collect(ui.cauldronPos, inv)),
        BREW_RECIPES,
    };
    return api;
}
