import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem } from './cityNpc.js';
import { setClockPhase } from '../sim/daynight.js';
import { NPCS } from '../sim/city/ped/npcData.js';
import { ownerSpot, placeStreetNpcs } from '../sim/city/ped/npcPlace.js';
import { runPropEffects } from './propsEffects.js';
import { foldKey, getFlag } from '../sim/city/ped/npcSave.js';
import { vendorStock } from '../sim/city/ped/vendorLogic.js';
import { NPC_T0 } from './cityNpcProps.js';
import { serializeDim } from '../sim/dim/dimState.js';
import { sanitizeNeon } from '../sim/dim/dimSanitize.js';

vi.setConfig({ testTimeout: 240000 });

function boot(opts) {
  const kit = makeDimG(Object.assign({ render: true, systems: ['blocks', 'props', 'dimension'] }, opts || null));
  const G = kit.G;
  const sys = createSystem(G);
  G.addSystem(sys);
  return { kit, G, sys, api: sys.api() };
}

function toCity(b, px, pz) {
  const r = b.kit.mgr.swap('neon', { reason: 'test' });
  expect(r.ok).toBe(true);
  const w = b.G.world;
  for (let cx = Math.floor((px - 80) / 16); cx <= Math.floor((px + 80) / 16); cx++) {
    for (let cz = Math.floor((pz - 80) / 16); cz <= Math.floor((pz + 80) / 16); cz++) w.ensureChunk(cx, cz);
  }
  b.kit.place(px, 64, pz, 0);
  b.G.worldReady = true;
  setClockPhase(b.G.clock, 0.25); // öğle: tüm gündüz NPC'leri çıkışta
  b.kit.frame(1 / 60, 30);
  return r;
}

function spotOf(seed, id) {
  return placeStreetNpcs(seed).find((s) => s.id === id);
}

describe('cityNpc: kurulum ve yerleşim', () => {
  it('overworld\'de NPC yok; şehre geçince yakındaki sokak NPC\'leri belirir (figür + dinamik prop + çarpışma); sistem sırası 33', () => {
    const b = boot();
    b.kit.frame(1 / 60, 5);
    expect(b.sys.order).toBe(33);
    expect(b.api.getNpcInfo().city).toBe(false);
    expect(b.api.getDialogue()).toBe(null);
    expect(b.api.getVendor()).toBe(null);
    toCity(b, 1.5, 4.5);
    const info = b.api.getNpcInfo();
    expect(info.city).toBe(true);
    expect(info.active).toContain('rehber_zeynep');
    expect(b.G.npcFigures.has('rehber_zeynep')).toBe(true);
    const seed = b.G.world.seed;
    const sp = spotOf(seed, 'rehber_zeynep');
    const pid = b.sys.state.props.get('rehber_zeynep');
    expect(pid).toBeTruthy();
    const e = b.G.props.entry(pid);
    expect(e.prop.t).toBe(NPC_T0 + NPCS.findIndex((n) => n.id === 'rehber_zeynep'));
    expect(Math.hypot(e.prop.x - sp.x, e.prop.z - sp.z)).toBeLessThan(2.5);
    expect(e.def.interact.kind).toBe('npctalk');
    expect(b.G.props.hint(pid)).toContain('Zeynep');
    // çarpışma kutusu ColliderIndex'te
    const out = [];
    b.G.props.colliders.query({ minX: e.prop.x - 0.2, minY: 64, minZ: e.prop.z - 0.2, maxX: e.prop.x + 0.2, maxY: 65, maxZ: e.prop.z + 0.2 }, out, 8);
    expect(out.length).toBeGreaterThan(0);
    expect(info.figures.heroes).toBeGreaterThanOrEqual(1);
  });

  it('uzaklaşınca NPC kaldırılır (prop + figür), geri gelince yeniden belirir', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    expect(b.sys.state.props.has('rehber_zeynep')).toBe(true);
    const w = b.G.world;
    for (let cx = 10; cx <= 16; cx++) for (let cz = -4; cz <= 4; cz++) w.ensureChunk(cx, cz);
    b.kit.place(200, 64, 0, 0);
    b.kit.frame(1 / 60, 40);
    expect(b.sys.state.props.has('rehber_zeynep')).toBe(false);
    b.kit.place(1.5, 64, 4.5, 0);
    b.kit.frame(1 / 60, 60);
    expect(b.sys.state.props.has('rehber_zeynep')).toBe(true);
  });
});

describe('cityNpc: diyalog', () => {
  it('propDialog → arayüz açılır (G.ui dialogue), görünüm, seçim, çıkış; dünya akmaya devam eder', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    const t0 = b.sys.state.t;
    b.G.emit({ type: 'propDialog', npc: 'rehber_zeynep', node: 'selam' });
    expect(b.G.ui).toBe('dialogue');
    const v = b.api.getDialogue();
    expect(v).toMatchObject({ type: 'dialogue', node: 'rehber_zeynep.root', npc: { name: 'Zeynep' } });
    expect(b.G.time.paused).toBeFalsy();
    b.kit.frame(1 / 60, 30);
    expect(b.sys.state.t).toBeGreaterThan(t0);
    const r = b.api.chooseDialogue(1);
    expect(r.ok).toBe(true);
    expect(r.view.node).toBe('rehber_zeynep.about');
    expect(b.api.chooseDialogue(99)).toMatchObject({ ok: false, reason: 'gecersiz' });
    // çıkış
    const last = b.api.getDialogue().choices.length;
    const e = b.api.chooseDialogue(last);
    expect(e.ended).toBe(true);
    expect(b.G.ui).toBe('none');
    expect(b.api.getDialogue()).toBe(null);
    expect(b.kit.G.cityNpc.talk.runner.isOpen()).toBe(false);
  });

  it('NPC oyuncuya döner ve kamera NPC\'ye çerçevelenir; konuşma bitince dönüş bırakılır', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    const seed = b.G.world.seed;
    const sp = spotOf(seed, 'rehber_zeynep');
    b.kit.place(sp.x + 2.2, 64, sp.z + 2.2, 0.0);
    b.kit.frame(1 / 60, 10);
    b.G.player.yaw = 2.0;
    expect(b.api.talkTo('rehber_zeynep').ok).toBe(true);
    b.kit.frame(1 / 60, 60);
    const want = Math.atan2(-(sp.x - b.G.body.x), -(sp.z - b.G.body.z));
    const d = Math.atan2(Math.sin(b.G.player.yaw - want), Math.cos(b.G.player.yaw - want));
    expect(Math.abs(d)).toBeLessThan(0.25);
    const f = b.G.npcFigures.get('rehber_zeynep');
    expect(f).toBeTruthy();
    b.api.closeDialogue();
    expect(b.G.ui).toBe('none');
  });

  it('araçtayken konuşma açılmaz; ölünce kapanır; araca binince kapanır; uzaklaşınca kapanır', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    b.G.player.vehicle = 123;
    expect(b.api.talkTo('rehber_zeynep')).toMatchObject({ ok: false, reason: 'engel' });
    expect(b.G.ui).toBe('none');
    b.G.player.vehicle = null;
    expect(b.api.talkTo('rehber_zeynep').ok).toBe(true);
    b.G.emit({ type: 'vehicleEnter', id: 1, cls: 'taksi', role: 'owned' });
    expect(b.G.ui).toBe('none');
    expect(b.api.talkTo('rehber_zeynep').ok).toBe(true);
    b.G.emit({ type: 'death' });
    expect(b.G.ui).toBe('none');
    expect(b.api.talkTo('rehber_zeynep').ok).toBe(true);
    b.kit.place(60, 64, 4.5, 0);
    b.kit.frame(1 / 60, 5);
    expect(b.G.ui).toBe('none');
    expect(b.api.talkTo('yok_biri')).toMatchObject({ ok: false });
  });

  it('Esc/başka kapatma (uiChanged none) diyaloğu temiz kapatır', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    b.api.talkTo('rehber_zeynep');
    expect(b.kit.G.cityNpc.talk.runner.isOpen()).toBe(true);
    b.G.setUi('none');
    expect(b.kit.G.cityNpc.talk.runner.isOpen()).toBe(false);
    expect(b.api.getDialogue()).toBe(null);
  });

  it('bayrak ve ilişki kaydı dims.neon.city üzerinde canlı; hediye bir kez', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    const city = b.G.dimMgr.get('neon').city;
    b.api.talkTo('tuna');
    b.api.chooseDialogue(1);
    const w = b.api.chooseDialogue(3);
    const idx = w.view.choices.findIndex((c) => c.t === 'Devre kartını al') + 1;
    b.api.chooseDialogue(idx);
    expect(city.flags.g_tuna).toBe(1);
    expect(b.G.inventory.count('item:devre_kartı')).toBeGreaterThanOrEqual(1);
    expect(city.npcs.tuna.v).toBe(1);
    b.api.closeDialogue();
    expect(getFlag(city, 'g_tuna')).toBe(1);
  });

  it('G.cityNpc.effects: dış işleyici bağlanır (mission), bayrak yardımcıları çalışır', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    const seen = [];
    b.G.cityNpc.effects.on('mission', (e) => { seen.push(e.id); b.G.cityNpc.setFlag('q_' + e.id, 1); return { ok: true, msg: 'Görev başladı' }; });
    b.api.talkTo('rehber_zeynep');
    b.api.chooseDialogue(3);
    const r = b.api.chooseDialogue(1);
    expect(seen).toEqual(['nm_ilk_surus']);
    expect(r.view.msg).toBe('Görev başladı');
    expect(b.G.cityNpc.getFlag('q_nm_ilk_surus')).toBe(1);
    b.api.closeDialogue();
    const v = b.api.talkTo('rehber_zeynep').view;
    expect(v.choices.map((c) => c.t)).toContain('Görevim nasıl gidiyor?');
  });
});

describe('cityNpc: iç mekân sahipleri', () => {
  it('Usta Selvi ramen barında figürlü durur; Konuş propu → propDialog → diyalog (gerçek prop kullan yolu); figürsüz üç sahip (dr_bolt, cikrik, sule) eklenmez', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    const seed = b.G.world.seed;
    const sp = ownerSpot(seed, 'usta_selvi');
    const w = b.G.world;
    for (let cx = Math.floor((sp.x - 90) / 16); cx <= Math.floor((sp.x + 90) / 16); cx++) {
      for (let cz = Math.floor((sp.z - 90) / 16); cz <= Math.floor((sp.z + 90) / 16); cz++) w.ensureChunk(cx, cz);
    }
    b.kit.place(sp.x + 2, 64, sp.z + 2, 0);
    b.kit.frame(1 / 60, 60);
    expect(b.sys.state.props.has('usta_selvi')).toBe(true);
    expect(b.sys.state.props.has('dr_bolt')).toBe(false);
    expect(b.sys.state.props.has('sule')).toBe(false);
    const pid = b.sys.state.props.get('usta_selvi');
    const e = b.G.props.entry(pid);
    expect(Math.hypot(e.prop.x - sp.x, e.prop.z - sp.z)).toBeLessThan(0.1);
    expect(b.G.props.hint(pid)).toContain('Usta Selvi');
    const effects = b.G.props.use(pid, { crouch: false, x: sp.x + 2, y: 64, z: sp.z + 2 });
    expect(effects.some((f) => f.kind === 'dialog' && f.npc === 'usta_selvi')).toBe(true);
    runPropEffects(b.G, effects);
    expect(b.G.ui).toBe('dialogue');
    expect(b.api.getDialogue().npc.id).toBe('usta_selvi');
    b.api.closeDialogue();
    // uzaklaşınca kaldırılır
    b.kit.place(1.5, 64, 4.5, 0);
    b.kit.frame(1 / 60, 40);
    expect(b.sys.state.props.has('usta_selvi')).toBe(false);
  });
});

describe('cityNpc: satıcı', () => {
  it('propUi vendor → panel açılır; satın alma Kredi/envanter/sayaç; geri satış; sınırlar; kapat', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    const city = b.G.dimMgr.get('neon').city;
    city.kredi = 500;
    b.G.emit({ type: 'propUi', ui: 'vendor', vendor: 'usta_selvi', counter: 'x', brand: 'bulut_ramen' });
    expect(b.G.ui).toBe('vendor');
    const v = b.api.getVendor();
    expect(v.vendor.id).toBe('usta_selvi');
    expect(v.vendor.name).toBe('Usta Selvi');
    expect(v.vendor.brand).toBe('Bulut Ramen');
    expect(v.offers).toHaveLength(6);
    const offer = v.offers[0];
    const stock = vendorStock(b.G.world.seed, 0, 'usta_selvi');
    expect(stock.map((o) => o.item)).toContain(offer.item);
    const r = b.api.vendorBuy(offer.item, 2);
    expect(r.ok).toBe(true);
    expect(city.kredi).toBe(500 - offer.price * 2);
    expect(b.G.inventory.count(offer.item)).toBe(2);
    expect(b.api.getVendor().offers[0].left).toBe(offer.left - 2);
    expect(b.api.getVendor().msg).toContain('alındı');
    const sell = b.api.vendorSell(offer.item, 1);
    expect(sell.ok).toBe(true);
    expect(city.kredi).toBeLessThan(500);
    expect(b.api.vendorBuy('item:yok', 1)).toMatchObject({ ok: false, reason: 'yok' });
    expect(b.api.closeVendor()).toBe(true);
    expect(b.G.ui).toBe('none');
    expect(b.api.getVendor()).toBe(null);
    expect(b.api.vendorBuy(offer.item, 1)).toMatchObject({ ok: false, reason: 'kapali' });
    expect(b.G.emit).toBeTruthy();
  });

  it('diyalogdan satıcıya geçiş: diyalog kapanır, panel açılır; günlük sayaç gün değişince sıfırlanır; bilinmeyen satıcı otomata düşer', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    const city = b.G.dimMgr.get('neon').city;
    city.kredi = 5000;
    b.api.talkTo('usta_selvi');
    const r = b.api.chooseDialogue(3); // alışveriş
    expect(r.ended).toBe(true);
    expect(b.G.ui).toBe('vendor');
    const v = b.api.getVendor();
    b.api.vendorBuy(v.offers[0].item, 1);
    expect(city.shop.g[foldKey(v.offers[0].item)]).toBe(1);
    b.api.closeVendor();
    b.kit.G.cityNpc.state.t += 0; // dokunmadan
    b.kit.G.dimMgr.get('neon').city.shop.t = 1300; // 2. gün
    b.api.openVendor('yok_satici');
    const v2 = b.api.getVendor();
    expect(v2.vendor.id).toBe('otomat');
    expect(v2.day).toBe(1);
    expect(city.shop.g).toEqual({});
    b.api.closeVendor();
  });

  it('araçtayken satıcı açılmaz; satıcı panelinden Konuş: panel kapanır, diyalog açılır (tek panel)', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    b.G.player.vehicle = 7;
    expect(b.api.openVendor('kerem')).toMatchObject({ ok: false, reason: 'engel' });
    b.G.player.vehicle = null;
    expect(b.api.openVendor('kerem').ok).toBe(true);
    const r = b.api.talkTo('kerem');
    expect(r.ok).toBe(true);
    expect(b.G.ui).toBe('dialogue');
    expect(b.api.getVendor()).toBe(null);
    expect(b.api.getDialogue().npc.id).toBe('kerem');
    // diyalogdan satıcıya: tek panel
    const v = b.api.chooseDialogue(3);
    expect(v.ended).toBe(true);
    expect(b.G.ui).toBe('vendor');
    expect(b.api.getDialogue()).toBe(null);
    b.api.closeVendor();
  });
});

describe('cityNpc: maliyet', () => {
  it('3 NPC etkinken fixedUpdate (tarama dahil) ve frameUpdate ortalaması < 0,3 ms (bütçe: yaya+NPC sim ≪ 3 ms)', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    expect(b.sys.state.props.size).toBeGreaterThanOrEqual(2);
    const N = 600;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) b.sys.fixedUpdate(b.G, 1 / 60);
    const t1 = performance.now();
    for (let i = 0; i < N; i++) b.sys.frameUpdate(b.G, 1 / 60);
    const t2 = performance.now();
    expect((t1 - t0) / N).toBeLessThan(0.3);
    expect((t2 - t1) / N).toBeLessThan(0.3);
  });
});

describe('cityNpc: boyut ve kayıt', () => {
  it('şehirden çıkınca UI + proplar + figürler temizlenir; geri gelince yeniden kurulur', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    b.api.talkTo('rehber_zeynep');
    expect(b.G.ui).toBe('dialogue');
    const back = b.kit.mgr.swap('overworld', { reason: 'test' });
    expect(back.ok).toBe(true);
    expect(b.G.ui).toBe('none');
    expect(b.sys.state.props.size).toBe(0);
    expect(b.api.getNpcInfo().city).toBe(false);
    b.kit.frame(1 / 60, 5);
    expect(b.G.npcFigures.group.visible).toBe(false);
    b.kit.mgr.swap('neon', { reason: 'test' });
    for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) b.G.world.ensureChunk(cx, cz);
    b.kit.place(1.5, 64, 4.5, 0);
    setClockPhase(b.G.clock, 0.25);
    b.kit.frame(1 / 60, 40);
    expect(b.sys.state.props.has('rehber_zeynep')).toBe(true);
  });

  it('kaydet → yükle: flags / npcs / shop dims.neon.city içinde gidiş-dönüş eder', () => {
    const b = boot();
    toCity(b, 1.5, 4.5);
    b.G.cityNpc.setFlag('q_nm_cip_10', 2);
    b.api.talkTo('kerem');
    b.api.chooseDialogue(1);
    b.api.closeDialogue();
    b.api.openVendor('hasan_amca');
    b.G.dimMgr.get('neon').city.kredi = 900;
    b.api.vendorBuy(b.api.getVendor().offers[0].item, 1);
    b.api.closeVendor();
    const blob = JSON.parse(JSON.stringify(serializeDim(b.G.dimMgr.get('neon'), {})));
    const clean = sanitizeNeon(blob, []);
    const city = clean.city;
    expect(city.flags.q_nm_cip_10).toBe(2);
    expect(city.npcs.kerem.v).toBe(1);
    expect(Object.keys(city.shop.s).length).toBe(1);
    expect(city.kredi).toBeLessThan(900);
  });
});
