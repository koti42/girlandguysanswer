/*
 * systems/dimension + dimGate + dimCommands: kapı kuralları (tablo), maliyet/iade, ömür, tek kapı, tetik → geçiş, Boyut Terminali,
 * şehir ölümü, portal kipi, debug komutları, dimhop. Gerçek sistemler + dimTestKit.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { runCommand } from './sessionCommands.js';
import { CELL_ITEM, CORE_ITEM, GATE_RULES } from '../sim/dim/travel.js';
import { PORTAL_GUN_ITEM } from '../sim/techData.js';
import { chargeOf } from '../sim/techCharge.js';
import { createPlayerCore } from '../gamePlayer.js';
import { applyDamage } from '../sim/survival.js';
import { addEffect } from '../sim/magicEffects.js';

vi.setConfig({ testTimeout: 120000 });

const cmd = (G, line) => runCommand(G, line, undefined, {});

/** G.emit olaylarını tüm türleriyle (PUBLIC olmayanlar dahil) kaydeden sistem. */
function record(G) {
  const log = [];
  G.addSystem({ name: 'rec' + log.length + Math.random().toString(36).slice(2, 6), order: 900, onEvent: (g, e) => { log.push(e); } });
  return log;
}

function gunSlot(G) {
  for (let i = 0; i < G.inventory.slots.length; i++) if (G.inventory.slots[i] && G.inventory.slots[i].item === PORTAL_GUN_ITEM) return i;
  return -1;
}

/** Portal Tabancası + yetenek + çekirdek + hücre; elde; boyut kipi açık. */
function armed(k, o) {
  const opt = o || {};
  const { G } = k;
  G.progression.abilities.portalGun = true;
  G.abilities.portalGun = true;
  G.inventory.add(PORTAL_GUN_ITEM, 1);
  const i = gunSlot(G);
  G.inventory.selected = i;
  const slot = G.inventory.slots[i];
  slot.charge = opt.charge === undefined ? 24 : opt.charge;
  if (opt.core !== false) G.inventory.add(CORE_ITEM, opt.core || 1);
  if (opt.cells) G.inventory.add(CELL_ITEM, opt.cells);
  G.portalMode = 'boyut';
  return slot;
}

function openingSpot(k) {
  // spawn çevresinde açık bir yere bak
  k.place(0.5, k.G.body.y, 0.5, 0);
  k.step(2);
}

describe('kapı açma kuralları (tablo)', () => {
  const rows = [
    ['insa modu', (k) => { k.G.mode = 'insa'; }, /yalnızca macera/],
    ['yetenek yok', (k) => { k.G.abilities.portalGun = false; }, /yeteneğini/],
    ['tabanca elde değil', (k) => { k.G.inventory.selected = 8; }, /ele almalısın/],
    ['şarj yok ve hücre yok', (k, s) => { s.charge = 0; k.G.inventory.remove(CELL_ITEM, k.G.inventory.count(CELL_ITEM)); }, /12 portal şarjı/],
    ['çekirdek yok (kalibre değil)', (k) => { k.G.inventory.remove(CORE_ITEM, k.G.inventory.count(CORE_ITEM)); }, /Kuantum Çekirdeği/],
    ['su altında', (k) => { k.G.hud.underwater = true; }, /Su altında/],
    ['parkur', (k) => { k.G.hud.parkour = { id: 'x' }; }, /Parkur/],
    ['atlama beklemesi (20 sn)', (k) => { k.mgr.dimMeta.lastHopAt = Math.max(0.01, k.G.time.seconds - 5); }, /atlama için/],
  ];
  rows.forEach(([name, mutate, re]) => {
    it(name + ': kapı açılmaz, maliyet ALINMAZ, neden söylenir', () => {
      const k = makeDimG();
      const { G } = k;
      const slot = armed(k, { cells: 2 });
      openingSpot(k);
      mutate(k, slot);
      const charge0 = chargeOf(slot);
      const core0 = G.inventory.count(CORE_ITEM);
      const cells0 = G.inventory.count(CELL_ITEM);
      const ok = G.dimGate.fire();
      expect(ok).toBe(false);
      expect(G.dimGate.current()).toBeNull();
      expect(chargeOf(slot)).toBe(charge0);
      expect(G.inventory.count(CORE_ITEM)).toBe(core0);
      expect(G.inventory.count(CELL_ITEM)).toBe(cells0);
      expect(k.hints.map((h) => h.text).join('|')).toMatch(re);
    });
  });

  it('başarı: 12 şarj + 1 çekirdek alınır, 3 sn Kalibrasyon sonra açılır, kalibre olur, prewarm başlar, gateOpened olayı', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    const slot = armed(k);
    openingSpot(k);
    const evs = record(G);
    expect(G.dimGate.fire()).toBe(true);
    const g = G.dimGate.current();
    expect(g.kind).toBe('out');
    expect(g.dest).toBe('neon');
    expect(g.state).toBe('kalibrasyon');
    expect(chargeOf(slot)).toBe(24 - GATE_RULES.cost);
    expect(G.inventory.count(CORE_ITEM)).toBe(0);
    expect(mgr.dimMeta.calibrated).toBe(false);
    expect(mgr.get('neon').chunkManager.hidden).toBe(true); // varış hazırlanıyor
    k.run(2.5);
    expect(G.dimGate.current().state).toBe('kalibrasyon');
    k.run(0.7);
    expect(G.dimGate.current().state).toBe('acik');
    expect(mgr.dimMeta.calibrated).toBe(true);
    const ev = evs.map((e) => e.type);
    expect(ev).toContain('gateOpened');
    expect(ev).toContain('dimCalibrated');
  });

  it('ikinci açılış (kalibre): yalnız 12 şarj; çekirdek istenmez; şarj yetmezse Enerji Hücresi yüklenir', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    const slot = armed(k, { charge: 15, core: false, cells: 1 });
    mgr.dimMeta.calibrated = true;
    openingSpot(k);
    expect(G.dimGate.fire()).toBe(true);
    expect(chargeOf(slot)).toBe(3);
    G.dimGate.close('kapat', true);
    k.run(5.2);
    // 3 şarj + 1 hücre (+12) = 15 → 12 harcanır → 3
    expect(G.dimGate.fire()).toBe(true);
    expect(chargeOf(slot)).toBe(3);
    expect(G.inventory.count(CELL_ITEM)).toBe(0);
    expect(G.dimGate.current().state).toBe('acik'); // kalibrasyon yok
  });

  it('kapı açma beklemesi 5 sn; boyut başına tek kapı (yenisi eskisini kapatır)', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    armed(k, { core: false, cells: 3 });
    mgr.dimMeta.calibrated = true;
    openingSpot(k);
    expect(G.dimGate.fire()).toBe(true);
    const first = G.dimGate.current().id;
    k.run(2);
    expect(G.dimGate.fire()).toBe(false);
    expect(k.hints.map((h) => h.text).join('|')).toMatch(/hazırlanıyor/);
    expect(G.dimGate.current().id).toBe(first);
    k.run(3.2);
    expect(G.dimGate.fire()).toBe(true);
    expect(G.dimGate.current().id).toBe(first + 1);
  });

  it('kapı ömrü 30 sn: kapanır, gateClosed olayı, prewarm yöneticisi atılır; tekrar açılabilir', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    armed(k, { core: false });
    mgr.dimMeta.calibrated = true;
    openingSpot(k);
    const ev = record(G);
    expect(G.dimGate.fire()).toBe(true);
    expect(mgr.get('neon').chunkManager).toBeTruthy();
    k.run(29);
    expect(G.dimGate.current()).not.toBeNull();
    k.run(1.6);
    expect(G.dimGate.current()).toBeNull();
    expect(ev.some((e) => e.type === 'gateClosed' && e.why === 'ttl')).toBe(true);
    expect(mgr.get('neon').chunkManager).toBeNull();
    expect(k.hints.some((h) => /kapandı/.test(h.text))).toBe(true);
  });
});

describe('tetik → geçiş → terminalle dönüş', () => {
  function toCity(k) {
    const { G, mgr } = k;
    armed(k, { core: false });
    mgr.dimMeta.calibrated = true;
    openingSpot(k);
    expect(G.dimGate.fire()).toBe(true);
    const g = G.dimGate.current();
    // kapıya yürü: oyuncuyu kapı hacmine koy
    k.place(g.x, g.y, g.z, G.player.yaw);
    k.run(0.2);
    expect(G.transition.active).toBe(true);
    k.run(6, () => !G.transition.active);
    expect(G.transition.active).toBe(false);
    // sahte yönetici chunk yüklemez: meydan çevresini elle yükle (gerçek oyunda ChunkManager yükler)
    for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 1; cz++) G.world.ensureChunk(cx, cz);
    return g;
  }

  it('oyuncu kapı hacmine girince geçiş başlar; şehirde Kapı Meydanı; dimMeta.link kapı önü; kayıt TEK (dimension)', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    const g = toCity(k);
    expect(G.dim).toBe('neon');
    expect(G.body.x).toBeCloseTo(0.5, 3);
    expect(G.body.z).toBeCloseTo(2.5, 3);
    expect(mgr.dimMeta.link.from[0]).toBeCloseTo(g.x + g.nx * 2, 3);
    expect(k.saves.filter((r) => r === 'dimension')).toHaveLength(1);
    expect(G.dimGate.current()).toBeNull(); // kaynak kapı kapandı
    expect(G.simFrozen).toBe(false);
  });

  it('geçiş sürerken (kilit) sabit adımlar donar: saat ilerlemez, gövde yerinde', () => {
    const k = makeDimG();
    const { G } = k;
    armed(k, { core: false });
    k.mgr.dimMeta.calibrated = true;
    openingSpot(k);
    G.dimGate.fire();
    const g = G.dimGate.current();
    k.place(g.x, g.y, g.z, G.player.yaw);
    k.run(0.2);
    expect(G.transition.active).toBe(true);
    const clock0 = G.clock.time;
    const tick0 = G.stepsRun;
    k.step(120);
    expect(G.clock.time).toBe(clock0);
    expect(G.stepsRun).toBe(tick0 + 120); // sayaç kit'te işler ama sistemler çalışmadı
  });

  it('Boyut Terminali: back → ücretsiz kapı → otomatik giriş → overworld (kapı önü); maliyet YOK; atlama beklemesinden muaf', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    toCity(k);
    const slot = G.inventory.slots[gunSlot(G)];
    const c0 = chargeOf(slot);
    mgr.dimMeta.lastHopAt = G.time.seconds - 1; // 20 sn beklemesi: terminal muaf
    k.place(0.5, 64, 2.5, 0.2);
    expect(G.dimensionOp('back')).toBe(true);
    expect(G.dimGate.current().free).toBe(true);
    expect(G.dimGate.current().kind).toBe('back');
    k.run(6, () => !G.transition.active && G.dim === 'overworld');
    expect(G.dim).toBe('overworld');
    expect(chargeOf(slot)).toBe(c0);
    expect(Math.abs(G.body.x - mgr.dimMeta.link.from[0])).toBeLessThan(28);
  });

  it("'home': başlangıç noktasına döner", () => {
    const k = makeDimG();
    const { G } = k;
    toCity(k);
    k.place(0.5, 64, 2.5, 0.2);
    expect(G.dimensionOp('home')).toBe(true);
    k.run(6, () => !G.transition.active && G.dim === 'overworld');
    expect(G.dim).toBe('overworld');
    expect(Math.abs(G.body.x - G.spawn.x)).toBeLessThan(30);
    expect(Math.abs(G.body.z - G.spawn.z)).toBeLessThan(30);
  });

  it('kapıya yer yoksa terminal kapısız doğrudan geçiş yapar (hapis yok)', () => {
    const k = makeDimG();
    const { G } = k;
    toCity(k);
    k.place(0.5, 64, 2.5, 0.2);
    // önündeki tüm adayları katı bloklarla doldur (kayıtsız): spot null
    const w = G.world;
    for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) for (let y = 65; y <= 70; y++) w.setBlock(x, y, z, 1, { record: false, silent: true });
    expect(G.dimensionOp('back')).toBe(true);
    expect(G.dimGate.current()).toBeNull();
    expect(G.transition.active).toBe(true);
    k.run(6, () => !G.transition.active);
    expect(G.dim).toBe('overworld');
  });

  it('overworld\'de terminal komutu çalışmaz (yalnız şehir)', () => {
    const k = makeDimG();
    expect(k.G.dimensionOp('back')).toBe(false);
    expect(k.G.dim).toBe('overworld');
  });
});

describe('zaman aşımı iadesi (gerçek sistemlerle)', () => {
  it('varış 20 sn hazır olmaz → kaynağa dön; 12 şarj + çekirdek iade, kalibrasyon geri alınır', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    const slot = armed(k);
    openingSpot(k);
    G.dimGate.fire();
    k.run(3.3);
    const g = G.dimGate.current();
    expect(g.state).toBe('acik');
    expect(chargeOf(slot)).toBe(12);
    mgr.get('neon').chunkManager.ready = false; // prewarm yöneticisi hazır olmaz
    k.place(g.x, g.y, g.z, G.player.yaw);
    k.run(2.5);
    expect(G.dim).toBe('neon');
    k.run(21);
    expect(G.dim).toBe('overworld');
    expect(chargeOf(slot)).toBe(24);
    expect(G.inventory.count(CORE_ITEM)).toBe(1);
    expect(mgr.dimMeta.calibrated).toBe(false);
    expect(k.hints.some((h) => /iade/.test(h.text))).toBe(true);
  });
});

describe('şehir ölümü', () => {
  it('eşya düşmez; en yakın bulunmuş terminalde tam can; etkiler temiz; duyuru', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    mgr.swap('neon');
    mgr.markTerminal(2);
    const list = mgr.get('neon').terminals.list;
    G.inventory.add('blok:taş', 20);
    G.survival.easy = false;
    addEffect(G.magic ? G.magic.state.effects : [], 'hiz', 1, 60, 'test');
    const core = createPlayerCore(G, { snap() {}, onLand() {}, onHurt() {} }, { footstep() {} });
    G.respawnPlayer = core.respawn;
    G.body.x = list[2].x + 3;
    G.body.y = list[2].y;
    G.body.z = list[2].z + 3;
    applyDamage(G.survival, 1000, { cause: 'genel' });
    core.postSystem.fixedUpdate(G, 1 / 60);
    expect(G.player.dead).toBe(true);
    expect(G.inventory.count('blok:taş')).toBe(20);
    let drops = 0;
    G.em.items.forEach((e) => { drops += e.count; });
    expect(drops).toBe(0);
    expect(G.player.deathInfo.kept).toBe(true);
    core.respawn('manual');
    expect(G.player.dead).toBe(false);
    expect(G.survival.hp).toBe(G.survival.maxHp);
    expect(G.survival.hunger).toBeGreaterThanOrEqual(12);
    const dx = G.body.x - list[2].x;
    const dz = G.body.z - list[2].z;
    expect(Math.hypot(dx, dz)).toBeLessThan(8);
    expect(G.dim).toBe('neon');
    k.frame(1 / 60, 2);
    expect(k.banners.some((b) => /terminalde yeniden derledi/.test(b.text))).toBe(true);
  });

  it('overworld ölümü değişmez: eşyalar düşer', () => {
    const k = makeDimG();
    const { G } = k;
    G.survival.easy = false;
    G.inventory.add('blok:taş', 20);
    const core = createPlayerCore(G, { snap() {}, onLand() {}, onHurt() {} }, { footstep() {} });
    applyDamage(G.survival, 1000, { cause: 'genel' });
    core.postSystem.fixedUpdate(G, 1 / 60);
    expect(G.player.dead).toBe(true);
    expect(G.inventory.count('blok:taş')).toBe(0);
    expect(G.player.deathInfo.lostCount).toBe(20);
  });
});

describe('portal kipi', () => {
  it('portalMode eylemi kipi değiştirir (yetenek şart); normal kipte ateş kancası işlemez; boyut kipinde işler', () => {
    const k = makeDimG();
    const { G } = k;
    const tech = G.getSystem('tech');
    tech.onAction(G, { type: 'portalMode' });
    expect(G.portalMode).toBe('normal'); // yetenek yok
    armed(k);
    G.portalMode = 'normal';
    tech.onAction(G, { type: 'portalMode' });
    expect(G.portalMode).toBe('boyut');
    expect(G.dimPortalFire()).toBe(true);
    tech.onAction(G, { type: 'portalMode' });
    expect(G.portalMode).toBe('normal');
    expect(G.dimPortalFire()).toBe(false);
  });

  it('UI açıkken / ölüyken portalMode yok sayılır', () => {
    const k = makeDimG();
    const { G } = k;
    armed(k);
    G.portalMode = 'normal';
    const tech = G.getSystem('tech');
    G.ui = 'inventory';
    tech.onAction(G, { type: 'portalMode' });
    expect(G.portalMode).toBe('normal');
    G.ui = 'none';
    G.player.dead = true;
    tech.onAction(G, { type: 'portalMode' });
    expect(G.portalMode).toBe('normal');
  });
});

describe('debug komutları', () => {
  it('dim / dimstat / tpd / props / givegate / nocost', () => {
    const k = makeDimG();
    const { G } = k;
    expect(cmd(G, 'givegate').ok).toBe(true);
    expect(G.abilities.portalGun || G.progression.abilities.portalGun).toBe(true);
    expect(G.inventory.count(CORE_ITEM)).toBe(1);
    expect(cmd(G, 'dim').data.dim).toBe('overworld');
    const r = cmd(G, 'dim neon');
    expect(r.ok).toBe(true);
    expect(G.dim).toBe('neon');
    expect(cmd(G, 'dim neon').message).toMatch(/Zaten/);
    expect(cmd(G, 'dim xyz').ok).toBe(false);
    const st = cmd(G, 'dimstat').data;
    expect(st.dim).toBe('neon');
    expect(st.staleWorldHits).toBe(0);
    expect(st.swaps).toBe(1);
    expect(st.stageMs).toBeTruthy();
    expect(st.listeners.neon.blockChange).toBeGreaterThanOrEqual(0);
    const tp = cmd(G, 'tpd liman');
    expect(tp.ok).toBe(true);
    expect(cmd(G, 'tpd 5').ok).toBe(true);
    expect(cmd(G, 'tpd nowhere').ok).toBe(false);
    expect(cmd(G, 'props').ok).toBe(true);
    expect(cmd(G, 'nocost on').data.nocost).toBe(true);
    expect(cmd(G, 'nocost off').data.nocost).toBe(false);
    cmd(G, 'dim overworld');
    expect(cmd(G, 'tpd merkez').ok).toBe(false); // yalnız şehirde
  });

  it('nocost: maliyet, çekirdek ve bekleme olmadan kapı açılır', () => {
    const k = makeDimG();
    const { G } = k;
    const slot = armed(k, { charge: 0, core: false });
    G.dimMeta.calibrated = false;
    cmd(G, 'nocost on');
    openingSpot(k);
    expect(G.dimGate.fire()).toBe(true);
    expect(chargeOf(slot)).toBe(0);
    expect(G.dimGate.current().state).toBe('acik');
    expect(G.dimGate.current().cost.charges).toBe(0);
  });

  it('dimhop: gerçek geçiş makinesiyle n kez sıçrar; saat/kayıt sayaçları tutarlı; hepsi bitince yığın temiz', () => {
    const k = makeDimG();
    const { G, mgr } = k;
    const r = cmd(G, 'dimhop 6 0 0');
    expect(r.ok).toBe(true);
    k.run(60, () => G.getSystem('dimension').sys.hopRun === null && !G.transition.active && mgr.stats.swaps >= 6);
    expect(mgr.stats.swaps).toBe(6);
    expect(G.dim).toBe('overworld');
    expect(k.saves.filter((s) => s === 'dimension')).toHaveLength(6);
    expect(mgr.stats.staleWorldHits).toBe(0);
    expect(G.simFrozen).toBe(false);
    const st = cmd(G, 'dimstat').data;
    expect(st.hopCount).toBe(6);
    expect(cmd(G, 'dimhop 0').ok).toBe(false);
  });
});

describe('sistem sırası ve api', () => {
  it('dimension order −120 (benzersiz), alwaysRun; getDimensionInfo', () => {
    const k = makeDimG();
    const sys = k.G.getSystem('dimension');
    expect(sys.order).toBe(-120);
    expect(sys.alwaysRun).toBe(true);
    const orders = k.G.registry.list().map((s) => s.order);
    expect(orders.filter((o) => o === -120)).toHaveLength(1);
    const info = sys.api(k.G).getDimensionInfo();
    expect(info.dim).toBe('overworld');
    expect(info.calibrated).toBe(false);
    expect(info.portalMode).toBe('normal');
  });
});
