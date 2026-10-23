/*
 * "magic" sistemi testleri: Büyü Masası / Simya Kazanı etkileşimi, büyüleme, asa büyüleri (mermi/şifa/sıçrayış), mana,
 * iksir içme, demleme, kayıt gidiş-dönüşü, mod kuralları (insa/harita kapalı), mods köprüsü ve blok kırma (Servet/İpek/Mıknatıs).
 */
import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { createSystem } from './magic.js';
import { createSystem as createBlocks } from './blocks.js';
import { events, makeG, sounds } from './blocksTestKit.js';
import { hudEffects } from '../sim/magic.js';

const noop = () => {};

function setup(opts) {
  const o = opts || {};
  const k = makeG({ mode: o.mode, held: o.held });
  const { G } = k;
  if (o.inv) for (let i = 0; i < o.inv.length; i++) G.inventory.add(o.inv[i][0], o.inv[i][1]);
  const blocks = createBlocks(G);
  const fired = [];
  const tele = [];
  G.em.fireProjectile = (kind, x, y, z, dx, dy, dz, speed, owner, opts2) => {
    fired.push({
      kind, x, y, z, dx, dy, dz, speed, owner, opts: opts2,
    });
    return { kind };
  };
  G.em.mobs = new Map();
  G.em.damage = () => null;
  G.teleport = (x, y, z) => {
    tele.push({ x, y, z });
    G.body.x = x; G.body.y = y; G.body.z = z;
    return { x, y, z };
  };
  G.hud = Object.assign(G.hud, {
    mana: { value: 0, max: 0 }, effects: [], spell: null, hint: null,
  });
  G.hint = (t) => { G.hud.hint = t; };
  G.fx = noop;
  const pfx = {};
  G.particles = new Proxy(pfx, {
    get: (t, name) => (name in t ? t[name] : (...a) => { G.log.push(['particles.' + String(name), ...a]); return 0; }),
  });
  G.registry = { list: () => [] };
  G.camera = { position: { x: 8.5, y: 42.5, z: 8.5 } };
  G.worldReady = true;
  G.markDirty = noop;
  G.publishHud = noop;
  G.player.cameraMode = 'fp';
  G.combatClaim = { attack: false, use: false };
  G.getSystem = () => null;
  const sys = createSystem(G);
  // olayları iki sisteme de dağıt
  const baseEmit = G.emit;
  G.emit = (evt) => {
    baseEmit(evt);
    if (sys.onEvent) sys.onEvent(G, evt);
  };
  sys.init(G);
  blocks.init(G);
  G.blocks = k.G.blocks;
  const api = sys.api(G);
  const step = (n, input) => {
    for (let i = 0; i < n; i++) {
      k.step(1, input);
      sys.fixedUpdate(G, 1 / 60);
      sys.frameUpdate(G, 1 / 60, 0);
    }
  };
  return {
    ...k, G, sys, api, fired, tele, step, blocks,
  };
}

function putAhead(G, id, dz = 2) {
  const x = Math.floor(G.body.x);
  const z = Math.floor(G.body.z) - dz;
  G.world.setBlock(x, 41, z, id);
  return { x, y: 41, z };
}

describe('magic: masa ve kazan etkileşimi', () => {
  it('Büyü Masası: sağ tık paneli açar, kitaplık sayısını yazar', () => {
    const t = setup();
    const p = putAhead(t.G, B.MAGIC_TABLE);
    for (let dx = -2; dx <= 2; dx++) t.G.world.setBlock(p.x + dx, 41, p.z - 2, B.BOOKSHELF);
    t.aim(p.x, p.y, p.z);
    t.step(2, { placePressed: true });
    expect(t.G.ui).toBe('enchant');
    expect(t.G.magicUi.kind).toBe('enchant');
    expect(t.G.magicUi.shelfCount).toBe(5);
    expect(t.api.getEnchantInfo().tier).toBe(5);
    t.G.setUi(null);
    expect(t.G.magicUi.kind).toBe(null);
  });

  it('Simya Kazanı: sağ tık kazan panelini açar; kazan kırılınca içindekiler iade edilir', () => {
    const t = setup({ inv: [['item:cam_şişe', 3], ['item:çilek', 2], ['item:kızıltaş_tozu', 1]] });
    const p = putAhead(t.G, B.ALCHEMY_CAULDRON);
    t.aim(p.x, p.y, p.z);
    t.step(2, { placePressed: true });
    expect(t.G.ui).toBe('brew');
    const info = t.api.getBrewInfo();
    expect(info.cauldron).toBe(null);
    const r = t.api.startBrew('sifa', 2);
    expect(r.ok).toBe(true);
    t.G.setUi(null);
    t.clearLog();
    t.G.world.setBlock(p.x, p.y, p.z, 0);
    const back = t.G.items.map((i) => i.item);
    expect(back).toContain('item:cam_şişe');
    expect(t.G.magic.brew.has(p)).toBe(false);
  });

  it('panel açıkken oyuncu uzaklaşırsa kapanır', () => {
    const t = setup();
    const p = putAhead(t.G, B.MAGIC_TABLE);
    t.aim(p.x, p.y, p.z);
    t.step(2, { placePressed: true });
    expect(t.G.ui).toBe('enchant');
    t.G.body.x += 30;
    t.step(40);
    expect(t.G.ui).toBe('none');
  });
});

describe('magic: büyüleme', () => {
  it('teklifler gelir, uygulanır; toz harcanır, mods hasarı artırır, olay yayılır', () => {
    const t = setup({ held: 'item:kılıç_demir', inv: [['item:büyü_tozu', 40], ['item:kuantum_kıymığı', 8]] });
    const p = putAhead(t.G, B.MAGIC_TABLE);
    t.aim(p.x, p.y, p.z);
    t.step(2, { placePressed: true });
    const info = t.api.getEnchantInfo();
    expect(info.ok).toBe(true);
    expect(info.offers.length).toBeGreaterThan(0);
    const before = t.G.inventory.count('item:büyü_tozu');
    const o = info.offers.find((x) => x.affordable);
    const r = t.api.enchant(o.id);
    expect(r.ok).toBe(true);
    expect(t.G.inventory.count('item:büyü_tozu')).toBeLessThan(before);
    expect(Object.keys(t.G.inventory.held().ench).length).toBeGreaterThan(0);
    expect(events(t.G, 'enchanted')).toHaveLength(1);
    expect(sounds(t.G, 'enchant')).toContain('enchant');
    t.step(2);
    // en az bir hasar/etki büyüsü (keskinlik/alev/buz/geri tepme/yağmacı) mods'a yansır
    const m = t.G.mods;
    expect(m.meleeBonus + m.burnLevel + m.slowLevel + m.knockBonus + m.luck + m.digMul - 1 > 0 || t.G.inventory.held().ench.dayaniklilik).toBeTruthy();
    // eski teklif kimliği artık geçersiz (tohum döndü)
    expect(t.api.enchant(o.id).ok).toBe(false);
  });

  it('yetersiz toz: reddeder ve eşya değişmez', () => {
    const t = setup({ held: 'item:kılıç_demir', inv: [['item:büyü_tozu', 1]] });
    const p = putAhead(t.G, B.MAGIC_TABLE);
    t.aim(p.x, p.y, p.z);
    t.step(2, { placePressed: true });
    const info = t.api.getEnchantInfo();
    const r = t.api.enchant(info.offers[0].id);
    expect(r.ok).toBe(false);
    expect(t.G.inventory.held().ench).toBeUndefined();
  });

  it('insa/harita: panel açılmaz, api reddeder, mods kimlik', () => {
    ['insa', 'harita'].forEach((mode) => {
      const t = setup({ mode });
      const p = putAhead(t.G, B.MAGIC_TABLE);
      t.aim(p.x, p.y, p.z);
      t.step(2, { placePressed: true });
      expect(t.G.ui).toBe('none');
      expect(t.api.getEnchantInfo().ok).toBe(false);
      expect(t.api.enchant('x').ok).toBe(false);
      expect(t.G.mods.speedMul).toBe(1);
    });
  });
});

describe('magic: asa ve büyüler', () => {
  it('Ateş Topu: mermi ateşlenir, mana ve bekleme işler, asa aşınır; basılı tutmak bekleme dolunca tekrar eder', () => {
    const t = setup({ held: 'item:asa_ates' });
    t.G.look.x = 0; t.G.look.y = 0; t.G.look.z = -1;
    const mana0 = t.G.magic.state.mana;
    const dur0 = t.G.inventory.held().dur;
    t.step(2, { placePressed: true });
    expect(t.fired).toHaveLength(1);
    expect(t.fired[0].kind).toBe('buyuates');
    expect(t.fired[0].owner).toBe('player');
    expect(t.fired[0].opts.kindSrc).toBe('magic');
    expect(t.G.magic.state.mana).toBeLessThan(mana0);
    expect(t.G.inventory.held().dur).toBe(dur0 - 1);
    expect(events(t.G, 'spellCast')).toHaveLength(1);
    // bekleme sürerken tekrar basma: sessiz başarısız (ipucu yok), ikinci mermi yok
    t.step(5, { placePressed: true });
    expect(t.fired).toHaveLength(1);
    // basılı tutma: ~1 sn sonra ikinci atış
    t.step(80, { placeHeld: true });
    expect(t.fired.length).toBeGreaterThanOrEqual(2);
  });

  it('mana yetmezse büyü yapılmaz, uyarı sesi/ipucu verilir', () => {
    const t = setup({ held: 'item:asa_buz' });
    t.G.magic.state.mana = 3;
    t.step(2, { placePressed: true });
    expect(t.fired).toHaveLength(0);
    expect(sounds(t.G, 'mana_low')).toHaveLength(1);
    expect(t.G.hud.hint).toMatch(/mana/i);
  });

  it('Şifa Işığı: can doluyken reddedilir (mana harcanmaz), eksikken iyileştirir', () => {
    const t = setup({ held: 'item:asa_sifa' });
    const m0 = t.G.magic.state.mana;
    t.step(2, { placePressed: true });
    expect(t.G.magic.state.mana).toBe(m0);
    t.G.survival.hp = 6;
    t.step(10);
    t.step(2, { placePressed: true });
    expect(t.G.survival.hp).toBeGreaterThan(6);
    expect(t.G.magic.state.mana).toBeLessThan(m0);
  });

  it('Kuantum Sıçrayışı: bakılan yönde güvenli noktaya ışınlar; uçurum önündeyse kısaltır/başarısız olur', () => {
    const t = setup({ held: 'item:asa_kuantum' });
    t.G.look.x = 0; t.G.look.y = 0; t.G.look.z = -1;
    const z0 = t.G.body.z;
    t.step(2, { placePressed: true });
    expect(t.tele).toHaveLength(1);
    expect(t.tele[0].z).toBeLessThan(z0 - 3);
    expect(t.tele[0].y).toBeCloseTo(41, 1);
    // önünü boşluk yap (zemin yok): bir sonraki sıçrayış güvenli yer bulamaz
    const bx = Math.floor(t.G.body.x);
    for (let dz = 1; dz <= 12; dz++) for (let y = 30; y <= 40; y++) for (let dx = -1; dx <= 1; dx++) t.G.world.setBlock(bx + dx, y, Math.floor(t.G.body.z) - dz, 0);
    t.step(200);
    const n = t.tele.length;
    t.step(2, { placePressed: true });
    expect(t.tele.length).toBe(n);
    expect(t.G.hud.hint).toMatch(/iniş/i);
  });

  it('insa/harita: asa devre dışı (mermi yok, mana harcanmaz)', () => {
    ['insa', 'harita'].forEach((mode) => {
      const t = setup({ mode, held: 'item:asa_ates' });
      if (mode === 'insa') t.G.inventory.setSlot(0, 'item:asa_ates', 1);
      t.step(2, { placePressed: true });
      expect(t.fired).toHaveLength(0);
      expect(t.G.hud.mana.max).toBe(0);
    });
  });

  it('Mana Kristali: azami mana +10, olay yayar', () => {
    const t = setup({ held: 'item:mana_kristali' });
    t.G.inventory.setSlot(0, 'item:mana_kristali', 2);
    t.step(2, { placePressed: true });
    expect(t.G.magic.state.maxMana).toBe(110);
    expect(events(t.G, 'manaCrystalUsed')).toHaveLength(1);
    expect(t.G.inventory.count('item:mana_kristali')).toBe(1);
  });
});

describe('magic: iksir içme ve etkiler', () => {
  it('Hız İksiri: basılı tutunca içilir, etki + HUD simgesi + mods; şişe geri gelir', () => {
    const t = setup({ held: 'item:iksir_hiz' });
    t.step(30, { placeHeld: true, placePressed: true });
    expect(t.G.magic.state.effects).toHaveLength(0);
    // 1 sn dolana dek tut
    t.step(60, { placeHeld: true });
    expect(t.G.magic.state.effects.some((e) => e.key === 'hiz')).toBe(true);
    expect(t.G.mods.speedMul).toBeGreaterThan(1.2);
    expect(t.G.hud.effects[0].icon).toBe('hiz');
    expect(t.G.inventory.count('item:cam_şişe')).toBe(1);
    expect(events(t.G, 'potionDrunk')).toHaveLength(1);
    expect(events(t.G, 'effectAdded')).toHaveLength(1);
  });

  it('içerken bırakırsan (fare) iptal olur ve iksir harcanmaz; dokunmatikte bırakınca da sürer', () => {
    const t = setup({ held: 'item:iksir_guc' });
    t.step(20, { placeHeld: true, placePressed: true });
    t.step(5, { placeHeld: false });
    t.step(80);
    expect(t.G.magic.state.effects).toHaveLength(0);
    expect(t.G.inventory.count('item:iksir_guc')).toBe(1);
    const t2 = setup({ held: 'item:iksir_guc' });
    t2.step(2, { placeHeld: true, placePressed: true, touch: true });
    t2.step(80, { placeHeld: false, touch: true });
    expect(t2.G.magic.state.effects.some((e) => e.key === 'guc')).toBe(true);
  });

  it('Güçlü Şifa: can doluysa içilmez; envanter "Kullan" iksiri anında içer', () => {
    const t = setup({ held: 'item:iksir_guclu_sifa' });
    t.step(2, { placeHeld: true, placePressed: true });
    t.step(70, { placeHeld: true });
    expect(t.G.inventory.count('item:iksir_guclu_sifa')).toBe(1);
    t.G.survival.hp = 4;
    t.G.inventory.setSlot(3, 'item:iksir_hiz', 1);
    const api = t.sys.api(t.G);
    expect(api.drinkPotion('s3').ok).toBe(true);
    expect(t.G.magic.state.effects.some((e) => e.key === 'hiz')).toBe(true);
  });

  it('etki süresi dolunca biter, olay yayılır ve mods kimliğe döner', () => {
    const t = setup();
    const st = t.G.magic.state;
    st.effects.push({
      key: 'hiz', level: 1, t: 1, total: 1,
    });
    t.step(2);
    expect(t.G.mods.speedMul).toBeGreaterThan(1);
    t.step(70);
    expect(st.effects).toHaveLength(0);
    expect(events(t.G, 'effectEnded')).toHaveLength(1);
    expect(t.G.mods.speedMul).toBe(1);
  });

  it('ölünce etkiler temizlenir', () => {
    const t = setup();
    t.G.magic.state.effects.push({
      key: 'guc', level: 1, t: 50, total: 50,
    });
    t.G.emit({ type: 'died' });
    expect(t.G.magic.state.effects).toHaveLength(0);
  });
});

describe('magic: demleme ve kayıt', () => {
  it('30 sn sonra iksir hazır olur; potionBrewed olayı; collect çantaya koyar', () => {
    const t = setup({ inv: [['item:cam_şişe', 3], ['item:çilek', 2], ['item:kızıltaş_tozu', 1]] });
    const p = putAhead(t.G, B.ALCHEMY_CAULDRON);
    t.aim(p.x, p.y, p.z);
    t.step(2, { placePressed: true });
    // tarif keşfi: malzemeler görüldüğü için açık
    const info = t.api.getBrewInfo();
    const rec = info.recipes.find((r) => r.id === 'sifa');
    expect(rec.discovered).toBe(true);
    expect(rec.craftable).toBe(true);
    const locked = info.recipes.find((r) => r.id === 'hiz');
    expect(locked.discovered).toBe(false);
    expect(t.api.startBrew('hiz', 1).ok).toBe(false); // keşfedilmemiş
    expect(t.api.startBrew('sifa', 3).ok).toBe(true);
    expect(t.api.collectBrew().ok).toBe(false);
    t.step(60 * 31);
    expect(events(t.G, 'potionBrewed')).toHaveLength(1);
    expect(t.api.getBrewInfo().cauldron.done).toBe(true);
    const r = t.api.collectBrew();
    expect(r.ok).toBe(true);
    expect(t.G.inventory.count('item:şifa_iksiri')).toBe(3);
  });

  it('kayıt gidiş-dönüşü: mana, etkiler, demleme, bilinen tarifler korunur', () => {
    const t = setup({ inv: [['item:cam_şişe', 3], ['item:çilek', 2], ['item:kızıltaş_tozu', 1]] });
    const p = putAhead(t.G, B.ALCHEMY_CAULDRON);
    t.aim(p.x, p.y, p.z);
    t.step(2, { placePressed: true });
    t.api.startBrew('sifa', 2);
    t.step(60 * 10);
    t.G.magic.state.effects.push({
      key: 'ates_direnci', level: 1, t: 90, total: 180,
    });
    t.G.magic.state.mana = 37;
    t.G.magic.state.manaBonus = 20;
    const data = JSON.parse(JSON.stringify(t.sys.serialize(t.G)));
    const u = setup();
    u.sys.restore(u.G, data);
    expect(Math.round(u.G.magic.state.mana)).toBe(37);
    expect(u.G.magic.state.maxMana).toBe(120);
    expect(hudEffects(u.G.magic.state.effects)[0].key).toBe('ates_direnci');
    const view = u.G.magic.brew.get(p);
    expect(view.recipeId).toBe('sifa');
    expect(view.secondsLeft).toBeLessThanOrEqual(21);
    expect(view.secondsLeft).toBeGreaterThanOrEqual(19);
    // tarif defteri: önceki oturumda demlenen tarif açık kalır
    u.G.world.setBlock(p.x, p.y, p.z, B.ALCHEMY_CAULDRON);
    u.G.magicUi.cauldronPos = p;
    expect(u.api.getBrewInfo().recipes.find((r) => r.id === 'sifa').discovered).toBe(true);
  });
});

describe('magic: blok kırma köprüsü (Servet / İpek Dokunuş / Mıknatıs)', () => {
  function mine(t, id, ench) {
    t.G.inventory.setSlot(0, 'item:kazma_elmas', 1, undefined, ench);
    t.G.inventory.selected = 0;
    t.step(2);
    const x = Math.floor(t.G.body.x);
    const z = Math.floor(t.G.body.z) - 2;
    t.G.world.setBlock(x, 41, z, id);
    t.clearLog();
    t.G.blocks.destroyBlock(x, 41, z, { by: 'player' });
  }

  it('İpek Dokunuş: kümeler kendi halinde düşer', () => {
    const t = setup();
    mine(t, B.STONE, { ipek_dokunus: 1 });
    expect(t.G.items.map((i) => i.item)).toEqual(['blok:taş']);
  });

  it('Mıknatıs: düşenler doğrudan çantaya girer', () => {
    const t = setup();
    mine(t, B.STONE, { miknatis: 1 });
    expect(t.G.items).toHaveLength(0);
    expect(t.G.inventory.count('blok:kırıktaş') + t.G.inventory.count('blok:taş')).toBeGreaterThan(0);
  });
});
