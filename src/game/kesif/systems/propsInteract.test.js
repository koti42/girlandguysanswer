import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { createPropLayer, attachPropLayer } from '../sim/props/propLayer.js';
import { PROP_DEFS } from '../sim/props/propDefs.js';
import { idToStr } from '../sim/props/propSave.js';
import { events, makeG } from './blocksTestKit.js';
import { runPropEffects } from './propsEffects.js';

/** Düz dünyada (zemin üstü y=41) prop yerleştiren planlayıcı. */
function withProps(g, list, opts) {
  const layer = createPropLayer({ citySeed: 99 });
  layer.props.planner = (seed, cx, cz) => list.filter((p) => Math.floor(p.x / 16) === cx && Math.floor(p.z / 16) === cz);
  attachPropLayer(g.G.world, layer);
  g.G.props = layer.props;
  if (opts && opts.choiceUi) layer.props.setChoiceUi(true);
  return layer;
}
function mk(id, key, x, z, extra) {
  return Object.assign({
    id, t: PROP_DEFS[key].t, x, y: 41, z, yaw: 0, variant: 0, flags: 0,
  }, extra || {});
}

describe('propUse kancası (blocks dispatchUse)', () => {
  it('otomat önünde sağ tık: prop kullanılır, ileti ipucu olur, propUsed olayı yayılır', () => {
    const g = makeG();
    withProps(g, [mk(1, 'otomat', 8.5, 6.0)]);
    g.step(1, { interactPressed: true });
    const ev = events(g.G, 'propUsed');
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ id: 1, key: 'otomat' });
    expect(typeof g.G.hud.hint).toBe('string');
    expect(g.G.hud.hint.length).toBeGreaterThan(5);
    expect(g.G.log.some((e) => e[0] === 'swing')).toBe(true);
    expect(g.G.log.some((e) => e[0] === 'speak')).toBe(true);
  });

  it('kullanım yerleştirmeyi engeller: elde blok varken prop kullanılır, blok konmaz', () => {
    const g = makeG({ held: 'blok:taş' });
    withProps(g, [mk(1, 'otomat', 8.5, 6.0)]);
    const before = g.G.world.getBlock(8, 41, 7);
    g.step(1, { placePressed: true });
    expect(events(g.G, 'propUsed').length).toBe(1);
    expect(g.G.world.getBlock(8, 41, 7)).toBe(before);
  });

  it('çömelen oyuncu elinde blokla prop\'u atlar (blok koyma önce gelir)', () => {
    const g = makeG({ held: 'blok:taş' });
    withProps(g, [mk(1, 'otomat', 8.5, 6.0)]);
    g.look(0, -0.5);
    g.step(1, { placePressed: true, crouch: true });
    expect(events(g.G, 'propUsed').length).toBe(0);
  });

  it('menzil: etkileşim menzili (2.6) dışındaki prop kullanılmaz', () => {
    const g = makeG();
    withProps(g, [mk(1, 'otomat', 8.5, 3.0)]); // göz z=8.5 → ~5 blok
    g.step(1, { interactPressed: true });
    expect(events(g.G, 'propUsed').length).toBe(0);
  });

  it('voxel isabeti daha yakınsa voxel kazanır; propun önünde duvar varsa prop kullanılmaz', () => {
    const g = makeG();
    withProps(g, [mk(1, 'otomat', 8.5, 5.5)]);
    for (let y = 41; y <= 44; y++) g.G.world.setBlock(8, y, 7, B.STONE);
    g.step(1, { interactPressed: true });
    expect(events(g.G, 'propUsed').length).toBe(0);
  });

  it('eşitlikte (≤0.05) prop kazanır: aynı yüzeyde duran blok ve prop', () => {
    const g = makeG();
    // otomat tetik kutusunun +z yüzü z = 6 + 0.5625 = 6.5625; blok yüzü z=7 → aynı hizaya ayarla: otomatı z=6.4375'e koy → yüz 7.0
    withProps(g, [mk(1, 'otomat', 8.5, 6.4375)]);
    for (let y = 41; y <= 44; y++) g.G.world.setBlock(8, y, 6, B.STONE); // z∈[6,7): +z yüzü 7.0
    g.step(1, { interactPressed: true });
    expect(events(g.G, 'propUsed').length).toBe(1);
  });

  it('terminal: ilk kullanımda terminalFound yayılır; boyut terminalinde onay dimensionOp olur', () => {
    const g = makeG();
    withProps(g, [mk(7, 'terminal', 8.5, 6.5, { flags: 3 }), mk(9, 'boyut_terminali', 20.5, 20.5)]);
    g.step(1, { interactPressed: true });
    const found = events(g.G, 'terminalFound');
    expect(found.length).toBe(1);
    expect(found[0]).toMatchObject({ terminal: 3, first: true });
    expect(g.G.props.state(7)).toBe(1);
    expect(g.G.props.serialize()).toEqual({ [idToStr(7)]: [1, 0] });
    // boyut terminali: göz hizası/menzil için oyuncuyu yanına taşı
    g.G.eyeSim.x = 20.5; g.G.eyeSim.z = 22.4; g.G.eye.x = 20.5; g.G.eye.z = 22.4;
    g.look(Math.PI * 0, 0);
    g.G.eyeSim.y = 42.0; g.G.eye.y = 42.0;
    g.step(10, {});
    g.step(1, { interactPressed: true });
    expect(events(g.G, 'propUi').length).toBe(1);
    g.step(10, {});
    g.step(1, { interactPressed: true });
    const ops = events(g.G, 'dimensionOp');
    expect(ops.length).toBe(1);
    expect(ops[0].op).toBe('back');
  });

  it('G.dimensionOp tanımlıysa olay yerine onu çağırır', () => {
    const g = makeG();
    const calls = [];
    g.G.dimensionOp = (op) => calls.push(op);
    runPropEffects(g.G, [{ kind: 'dimension', op: 'home' }, { kind: 'dimension', op: 'evil' }]);
    expect(calls).toEqual(['home']);
    expect(events(g.G, 'dimensionOp').length).toBe(0);
  });

  it('G.props yokken (overworld) davranış değişmez: sandık hâlâ açılır', () => {
    const g = makeG();
    g.G.world.setBlock(8, 41, 7, B.CHEST);
    g.aim(8, 41, 7);
    g.step(1, { interactPressed: true });
    expect(events(g.G, 'chestOpened').length).toBe(1);
    expect(events(g.G, 'propUsed').length).toBe(0);
  });
});

describe('propFrame kancası (HUD ipucu)', () => {
  it('etkileşimli prop bakılırken ipucu + hedef adı; bakış kayınca silinir; blok vurgusu temizlenir', () => {
    const g = makeG();
    withProps(g, [mk(7, 'terminal', 8.5, 6.5)]);
    g.sys.frameUpdate(g.G, 0.016);
    expect(g.G.hud.hint).toBe('[Sağ tık] Terminali etkinleştir');
    expect(g.G.hud.target.name).toBe('Terminal');
    expect(g.G.highlight.state.hasTarget).toBe(false);
    g.look(1.2, 0);
    g.sys.frameUpdate(g.G, 0.016);
    expect(g.G.hud.hint).toBeNull();
  });

  it('dokunmatik: "Kullan: ..." biçimi', () => {
    const g = makeG();
    withProps(g, [mk(7, 'terminal', 8.5, 6.5)]);
    g.G.inputState.touch = true;
    g.sys.frameUpdate(g.G, 0.016);
    expect(g.G.hud.hint).toBe('Kullan: Terminali etkinleştir');
  });

  it('etkileşimsiz prop (lamba) ipucu yazmaz, voxel akışı sürer', () => {
    const g = makeG();
    withProps(g, [mk(7, 'lamba', 8.5, 6.5)]);
    g.sys.frameUpdate(g.G, 0.016);
    expect(g.G.hud.hint === null || g.G.hud.hint === undefined).toBe(true);
  });

  it('UI açıkken ipucu yazılmaz', () => {
    const g = makeG();
    withProps(g, [mk(7, 'terminal', 8.5, 6.5)]);
    g.G.ui = 'inventory';
    g.sys.frameUpdate(g.G, 0.016);
    expect(g.G.hud.hint === null || g.G.hud.hint === undefined).toBe(true);
  });
});

describe('runPropEffects', () => {
  it('her tür güvenle uygulanır; bozuk/bilinmeyen atlanır; sayım doğru', () => {
    const g = makeG();
    const e = [
      { kind: 'sound', name: 'ui_click', x: 1, y: 2, z: 3 },
      { kind: 'particles', fx: 'pickup', x: 1, y: 2, z: 3 },
      { kind: 'message', text: 'Merhaba' },
      { kind: 'message', text: '' },
      { kind: 'giveItem', item: 'item:yok_boyle_bir_sey', count: 1 },
      { kind: 'giveItem', item: 'blok:taş', count: 2 },
      { kind: 'setBlock', x: 3, y: 41, z: 3, id: B.STONE },
      { kind: 'setBlock', x: 1.5, y: 41, z: 3, id: B.STONE },
      { kind: 'dialog', npc: 'a', node: 'b' },
      { kind: 'openUi', ui: 'x', title: 'T' },
      { kind: 'lock', lockId: 'k', op: 'open' },
      { kind: 'emit', evt: { type: 'ozel' } },
      { kind: 'emit', evt: null },
      { kind: 'dimension', op: 'back' },
      { kind: 'bilinmeyen' },
      null,
      5,
    ];
    const n = runPropEffects(g.G, e, { say: (t) => g.G.log.push(['say', t]) });
    expect(n).toBeGreaterThanOrEqual(9);
    expect(g.G.log.some((x) => x[0] === 'say' && x[1] === 'Merhaba')).toBe(true);
    expect(g.G.world.getBlock(3, 41, 3)).toBe(B.STONE);
    expect(events(g.G, 'propDialog').length).toBe(1);
    expect(events(g.G, 'propUi')[0]).toMatchObject({ ui: 'x', title: 'T' });
    expect(events(g.G, 'propLock').length).toBe(1);
    expect(events(g.G, 'ozel').length).toBe(1);
    expect(events(g.G, 'dimensionOp').length).toBe(1);
    expect(runPropEffects(g.G, [])).toBe(0);
    expect(runPropEffects(g.G, null)).toBe(0);
  });

  it('setProp efekti PropWorld durumunu ayarlar; geçersiz durum yok sayılır', () => {
    const g = makeG();
    withProps(g, [mk(4, 'trafik_diregi', 30.5, 30.5)]);
    runPropEffects(g.G, [{ kind: 'setProp', id: 4, state: 2 }]);
    expect(g.G.props.state(4)).toBe(2);
    runPropEffects(g.G, [{ kind: 'setProp', id: 4, state: 9 }]);
    expect(g.G.props.state(4)).toBe(2);
    runPropEffects(g.G, [{ kind: 'setProp', id: 4, state: 1.5 }]);
    expect(g.G.props.state(4)).toBe(2);
  });

  it('hata fırlatan efekt yutulur (strictSystems kapalıyken)', () => {
    const g = makeG();
    g.G.opts = {};
    g.G.world.setBlock = () => { throw new Error('x'); };
    expect(() => runPropEffects(g.G, [{ kind: 'setBlock', x: 1, y: 41, z: 1, id: 1 }])).not.toThrow();
  });
});
