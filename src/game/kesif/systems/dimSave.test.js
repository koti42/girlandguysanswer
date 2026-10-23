/*
 * Boyutlar ve kayıt (sözleşme §14): şehirde kaydet → şehirde yükle, açık kapıyla kaydet, overworld üst düzey alanları, sistem anlık görüntüsü,
 * otomatik kayıt bastırma, 'dimension' nedeni. Gerçek buildSave/restoreFromSave + dimTestKit.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import {
  buildSave, createEditsCache, createSaver, normalizeReason, restoreFromSave,
} from './sessionSave.js';
import { B } from '../sim/blocks.js';
import { PORTAL_GUN_ITEM } from '../sim/techData.js';
import { CORE_ITEM } from '../sim/dim/travel.js';
import { chargeOf } from '../sim/techCharge.js';
import { setClockPhase } from '../sim/daynight.js';

vi.setConfig({ testTimeout: 120000 });

function save(k, extra) {
  return buildSave(k.G, Object.assign({ name: 'T', createdAt: 1, now: 2, edits: createEditsCache() }, extra || {}));
}

function loadCity(k, n) {
  const { G } = k;
  for (let cx = -(n || 2); cx <= (n || 2) - 1; cx++) for (let cz = -(n || 2); cz <= (n || 2) - 1; cz++) G.world.ensureChunk(cx, cz);
}

describe('normalizeReason / otomatik kayıt', () => {
  it("'dimension' geçerli neden; bilinmeyen 'auto'", () => {
    expect(normalizeReason('dimension')).toBe('dimension');
    expect(normalizeReason('manual')).toBe('manual');
    expect(normalizeReason('exit')).toBe('exit');
    expect(normalizeReason('xyz')).toBe('auto');
  });

  it('geçiş sürerken otomatik kayıt bastırılır; dimension/manual/exit geçer', () => {
    const k = makeDimG({ systems: ['dimension'] });
    const { G } = k;
    const seen = [];
    G.callbacks.onSave = ({ reason }) => { seen.push(reason); };
    const saver = createSaver(G, { now: () => 5, perf: () => 100 });
    G.transitionActive = true;
    expect(saver.save('auto', { force: true })).toBeNull();
    expect(saver.save('dimension', { force: true })).not.toBeNull();
    expect(saver.save('manual')).not.toBeNull();
    G.transitionActive = false;
    expect(saver.save('auto', { force: true })).not.toBeNull();
    expect(seen).toEqual(['dimension', 'manual', 'auto']);
    saver.dispose();
  });
});

describe('şehirde kaydet', () => {
  it('player.dim neon + şehir konumu; üst düzey saat/hava/düzenleme/sandık overworld\'ün; dims.neon şehir blobu', () => {
    const k = makeDimG({ systems: ['blocks', 'tech', 'dimension'] });
    const { G, mgr } = k;
    setClockPhase(G.clock, 0.1);
    G.world.setBlock(3, 60, 3, B.STONE);
    G.chests.set('1,50,1', [{ item: 'item:elma', count: 1 }]);
    mgr.swap('neon');
    loadCity(k);
    k.place(0.5, 64, 2.5, 1);
    G.world.setBlock(5, 65, 5, B.STONE, { force: true });
    G.chests.set('9,64,9', [{ item: 'item:elma', count: 2 }]);
    const s = save(k);
    expect(s.v).toBe(3);
    expect(s.player.dim).toBe('neon');
    expect(s.player.pos[0]).toBeCloseTo(0.5, 2);
    expect(s.player.pos[2]).toBeCloseTo(2.5, 2);
    expect(s.time.time).toBeCloseTo(mgr.get('overworld').clock.time, 1); // overworld saati (donmuş)
    expect(Object.keys(s.chests)).toContain('1,50,1');
    expect(Object.keys(s.chests)).not.toContain('9,64,9');
    expect(Object.keys(s.edits).length).toBeGreaterThan(0);
    expect(s.editStats.cells).toBe(1); // yalnız overworld düzenlemesi
    expect(s.dims.neon.v).toBe(1);
    expect(Object.keys(s.dims.neon.edits).length).toBeGreaterThan(0);
    expect(Object.keys(s.dims.neon.chests)).toContain('9,64,9');
    expect(s.dimMeta.visits).toBe(1);
    // JSON'a yazılabilir ve makul boyutta
    expect(JSON.stringify(s).length).toBeLessThan(400000);
  });

  it("şehirdeyken systems.tech/blocks donmuş overworld anlık görüntüsünden (şehir makinesi/sandığı overworld kaydına karışmaz)", () => {
    const k = makeDimG({ systems: ['blocks', 'tech', 'dimension'] });
    const { G, mgr } = k;
    k.step(3);
    mgr.swap('neon');
    k.step(3);
    G.chests.set('7,64,7', [{ item: 'item:elma', count: 4 }]);
    const s = save(k);
    expect(JSON.stringify(s.systems.blocks || {})).not.toContain('7,64,7');
    expect(s.systems.tech).toBeTruthy();
  });

  it('ölüyken şehir kaydı: konum en yakın bulunmuş terminal (overworld yatağına DEĞİL)', () => {
    const k = makeDimG({ systems: ['dimension'] });
    const { G, mgr } = k;
    mgr.swap('neon');
    k.place(300, 64, 300, 0);
    G.player.dead = true;
    const s = save(k);
    expect(s.player.dim).toBe('neon');
    expect(Math.abs(s.player.pos[0])).toBeLessThan(8); // terminal 0 (Kapı Meydanı)
    expect(Math.abs(s.player.pos[2])).toBeLessThan(8);
  });
});

describe('şehirde yükle (gidiş-dönüş)', () => {
  it('overworld kurulur, G.dimBoot ayarlanır; geçiş makinesiyle şehre geçilir; düzenleme/saat/sandık/terminal/stash geri gelir', () => {
    const k1 = makeDimG({ systems: ['blocks', 'tech', 'dimension'] });
    const { G, mgr } = k1;
    mgr.swap('neon');
    loadCity(k1);
    mgr.markTerminal(4);
    k1.place(0.5, 64, 2.5, 0.7);
    G.world.setBlock(5, 65, 5, B.STONE, { force: true });
    G.chests.set('9,64,9', [{ item: 'item:elma', count: 2 }]);
    setClockPhase(G.clock, 0.9);
    mgr.get('neon').locks.kapi1 = 2;
    const s = JSON.parse(JSON.stringify(save(k1)));

    const k2 = makeDimG({ systems: ['blocks', 'tech', 'dimension'] });
    const r = restoreFromSave(k2.G, s);
    expect(r.ok).toBe(true);
    expect(k2.G.dim).toBe('overworld');
    expect(k2.G.dimBoot.dim).toBe('neon');
    expect(k2.G.dimBoot.arrival.x).toBeCloseTo(0.5, 2);
    expect(k2.mgr.dimMeta.visits).toBe(1);
    // game.js: frame(0)'dan sonra
    k2.G.registry.restore(k2.G, r.systems);
    const boot = k2.G.dimBoot;
    k2.G.dimBoot = null;
    expect(k2.G.transition.startBoot({ to: boot.dim, reason: 'restore', arrival: boot.arrival }).ok).toBe(true);
    k2.run(6, () => !k2.G.transition.active);
    expect(k2.G.dim).toBe('neon');
    expect(k2.G.body.x).toBeCloseTo(0.5, 1);
    expect(k2.G.body.z).toBeCloseTo(2.5, 1);
    expect(k2.G.world.getBlock(5, 65, 5)).toBe(B.STONE); // oyuncu bloğu geri geldi (edits)
    expect(k2.G.chests.has('9,64,9')).toBe(true);
    expect(k2.mgr.isTerminalFound(4)).toBe(true);
    expect(k2.mgr.get('neon').locks.kapi1).toBe(2);
    expect(k2.G.clock.dayLengthSec).toBe(600);
    expect(k2.saves.filter((x) => x === 'dimension')).toHaveLength(1); // önyükleme geçişi sonunda tek kayıt
  });

  it('overworld kaydı (şehir ziyaret edilmiş): dims.neon taşınır; yeniden kaydedilince kaybolmaz; şehre girince uygulanır', () => {
    const k1 = makeDimG({ systems: ['dimension'] });
    k1.mgr.swap('neon');
    k1.mgr.markTerminal(6);
    k1.mgr.swap('overworld');
    const s = JSON.parse(JSON.stringify(save(k1)));
    expect(s.player.dim).toBe('overworld');
    expect(s.dims.neon.terminals).toBeGreaterThan(0);
    const k2 = makeDimG({ systems: ['dimension'] });
    expect(restoreFromSave(k2.G, s).ok).toBe(true);
    expect(k2.G.dimBoot).toBeFalsy();
    const s2 = save(k2); // şehir hiç kurulmadan yeniden kayıt: blob aynen taşınır
    expect(s2.dims.neon.terminals).toBe(s.dims.neon.terminals);
    k2.mgr.swap('neon');
    expect(k2.mgr.isTerminalFound(6)).toBe(true);
  });

  it('şehir blobu bozuk/eksikse overworld konumuna düşer (şehirde hayalet konum yok)', () => {
    const k1 = makeDimG({ systems: ['dimension'] });
    k1.mgr.swap('neon');
    const s = JSON.parse(JSON.stringify(save(k1)));
    delete s.dims;
    const k2 = makeDimG({ systems: ['dimension'] });
    const r = restoreFromSave(k2.G, s);
    expect(r.ok).toBe(true);
    expect(k2.G.dimBoot).toBeFalsy();
    expect(k2.G.dim).toBe('overworld');
  });
});

describe('açık kapıyla kaydet (§14)', () => {
  it('kapı kayda girmez; yüklenince kapı yok, maliyet iade EDİLMEZ, çökme yok', () => {
    const k1 = makeDimG({ systems: ['dimension', 'tech'] });
    const { G, mgr } = k1;
    G.progression.abilities.portalGun = true;
    G.abilities.portalGun = true;
    G.inventory.add(PORTAL_GUN_ITEM, 1);
    let gi = -1;
    for (let i = 0; i < G.inventory.slots.length; i++) if (G.inventory.slots[i] && G.inventory.slots[i].item === PORTAL_GUN_ITEM) gi = i;
    G.inventory.selected = gi;
    G.inventory.slots[gi].charge = 24;
    G.inventory.add(CORE_ITEM, 1);
    G.portalMode = 'boyut';
    mgr.dimMeta.calibrated = true;
    k1.place(0.5, G.body.y, 0.5, 0);
    k1.step(2);
    expect(G.dimGate.fire()).toBe(true);
    expect(G.dimGate.current()).not.toBeNull();
    const s = JSON.parse(JSON.stringify(save(k1)));
    expect(JSON.stringify(s)).not.toMatch(/"gate"/);
    const k2 = makeDimG({ systems: ['dimension', 'tech'] });
    const r = restoreFromSave(k2.G, s);
    expect(r.ok).toBe(true);
    expect(k2.G.dimGate.current()).toBeNull();
    let slot = null;
    for (let i = 0; i < k2.G.inventory.slots.length; i++) if (k2.G.inventory.slots[i] && k2.G.inventory.slots[i].item === PORTAL_GUN_ITEM) slot = k2.G.inventory.slots[i];
    expect(slot).toBeTruthy();
    expect(chargeOf(slot)).toBe(12);
    k2.run(1);
  });
});
