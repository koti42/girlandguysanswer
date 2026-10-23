/*
 * content sistemi — entegrasyon: kristal → mühür → bölge açılışı → boss → yetenek → zafer (gerçek World/Progression/PuzzleManager).
 */
import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { makeContentG, anchorOf } from './contentTestKit.js';
import { zoneCrystalKey } from './contentHelpers.js';
import { takeCrystal } from './contentSeal.js';
import { fixedAnims, startOpenAnim } from './contentAnim.js';

const SEED = 12345;

function setup(opts) {
  const kit = makeContentG(Object.assign({ seed: SEED, pos: { x: 51, y: 69, z: 40 } }, opts || {}));
  return kit;
}

function airCount(world, cells) {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (world.getBlock(cells[i].x, cells[i].y, cells[i].z) === 0) n++;
  return n;
}

describe('content: Anahtar Kristali', () => {
  it('bulmacalar çözülmeden sunak kristali vermez; çözülünce verir (kristal kayası kalkar, olay + ilerleme)', () => {
    const kit = setup({ pos: { x: -27, y: 58, z: 40 } });
    const { G, S } = kit;
    kit.init();
    const t1 = anchorOf(SEED, 'anahtartapinagi', 0, 0);
    const rec = S.structs.get(t1.id);
    expect(rec).toBeTruthy();
    kit.load(t1.altar.x, t1.altar.z, 10);
    const cr = t1.crystal;
    expect(G.world.getBlock(cr.x, cr.y, cr.z)).toBe(B.CRYSTAL_ROCK);
    const item = zoneCrystalKey(0);

    // çözülmeden: reddedilir, kayaç yerinde
    kit.use(t1.altar.x, t1.altar.y, t1.altar.z);
    expect(G.inventory.count(item)).toBe(0);
    expect(kit.emitted('crystalCollected').length).toBe(0);
    kit.step(2);
    expect(S.fx.current()).toContain('mühürlü');
    expect(G.world.getBlock(cr.x, cr.y, cr.z)).toBe(B.CRYSTAL_ROCK);

    // tüm odalar çözüldü
    kit.solveStructure(rec);
    kit.use(t1.altar.x, t1.altar.y, t1.altar.z);
    expect(G.inventory.count(item)).toBe(1);
    expect(G.progression.crystals[0]).toEqual([t1.id]);
    expect(kit.emitted('crystalCollected').length).toBe(1);
    expect(kit.emitted('crystal')[0]).toMatchObject({ zone: 0, count: 1, required: 2 });
    expect(G.world.getBlock(cr.x, cr.y, cr.z)).toBe(0);

    // yeniden kullan: zaten alındı (eşya elde)
    kit.use(t1.altar.x, t1.altar.y, t1.altar.z);
    expect(G.inventory.count(item)).toBe(1);
    expect(kit.emitted('crystalCollected').length).toBe(1);

    // eşya kaybolursa (ölüm) sunaktan yeniden alınabilir; kilitlenme yok ve sayaç çift artmaz
    G.inventory.remove(item, 1);
    kit.step(1);
    kit.use(t1.altar.x, t1.altar.y, t1.altar.z);
    expect(G.inventory.count(item)).toBe(1);
    kit.use(t1.altar.x, t1.altar.y, t1.altar.z); // aynı tik, aynı hücre: tekrar işlenmez
    expect(G.inventory.count(item)).toBe(1);
    expect(G.progression.crystals[0].length).toBe(1);
    expect(kit.emitted('crystalCollected').length).toBe(1);
  });

  it('kristal kayasını kırmak da çözülmüş tapınakta kristal verir; çözülmemişte kayayı geri koyar', () => {
    const kit = setup({ pos: { x: -27, y: 58, z: 40 } });
    const { G, S } = kit;
    kit.init();
    const t1 = anchorOf(SEED, 'anahtartapinagi', 0, 0);
    const rec = S.structs.get(t1.id);
    kit.load(t1.altar.x, t1.altar.z, 10);
    const cr = t1.crystal;
    // çözülmemiş: kırıldı → geri konur
    G.world.setBlock(cr.x, cr.y, cr.z, 0);
    G.emit({ type: 'blockBroken', x: cr.x, y: cr.y, z: cr.z, id: B.CRYSTAL_ROCK });
    expect(G.world.getBlock(cr.x, cr.y, cr.z)).toBe(B.CRYSTAL_ROCK);
    expect(G.inventory.count(zoneCrystalKey(0))).toBe(0);
    // çözülmüş: kırıldı → kristal
    kit.solveStructure(rec);
    G.world.setBlock(cr.x, cr.y, cr.z, 0);
    G.emit({ type: 'blockBroken', x: cr.x, y: cr.y, z: cr.z, id: B.CRYSTAL_ROCK });
    expect(G.inventory.count(zoneCrystalKey(0))).toBe(1);
    expect(takeCrystal(S, rec)).toBe(false); // zaten alındı
  });
});

describe('content: Mühür Sunağı → bölge açılışı → yetenek → zafer', () => {
  it('tam zincir: 2 kristal → mühür → geçit animasyonu + halka gecikmeli → boss kapısı → boss → yetenek → zafer', () => {
    const kit = setup();
    const { G, S } = kit;
    kit.init();
    const sealDef = anchorOf(SEED, 'muhursunagi', 0, 0);
    const seal = sealDef.seal;
    kit.load(sealDef.x, sealDef.z, 28);
    const gate = seal.gate.cells;
    expect(airCount(G.world, gate)).toBe(0);
    expect(gate.every((c) => G.world.getBlock(c.x, c.y, c.z) === B.SEAL_BARRIER)).toBe(true);
    const item = zoneCrystalKey(0);

    // kristalsiz sunak: neden + yön bilgisi
    kit.use(seal.altar.x, seal.altar.y, seal.altar.z);
    kit.step(2);
    expect(S.fx.current()).toContain('Mühür Sunağı: 0/2');
    expect(kit.emitted('crystalPlaced').length).toBe(0);

    // iki tapınaktan kristal (ilerleme olayları), envantere iki kristal
    G.emit({ type: 'crystalCollected', zone: 0, id: 'anahtartapinagi:-1,0' });
    G.emit({ type: 'crystalCollected', zone: 0, id: 'anahtartapinagi:0,0' });
    G.inventory.add(item, 2);

    // ilk kristal sunağa sağ tıkla: ilk boş yuvaya konur
    kit.step(1);
    kit.use(seal.altar.x, seal.altar.y, seal.altar.z);
    expect(G.inventory.count(item)).toBe(1);
    const s0 = seal.sockets[0];
    expect(G.world.getBlock(s0.x, s0.y, s0.z)).toBe(B.RECEIVER_ON);
    expect(kit.emitted('sealProgress')[0]).toMatchObject({ zone: 0, placed: 1, required: 2 });
    expect(G.world.isZoneUnlocked(1)).toBe(false);
    expect(airCount(G.world, gate)).toBe(0);

    // belirli yuvaya sağ tık (kaide) → o yuva dolar; tamamlayan kristal
    kit.step(1);
    const s1 = seal.sockets[1];
    kit.use(s1.base.x, s1.base.y, s1.base.z);
    expect(G.inventory.count(item)).toBe(0);
    expect(G.world.getBlock(s1.x, s1.y, s1.z)).toBe(B.RECEIVER_ON);
    expect(G.progression.seals[0]).toBe(true);
    expect(G.progression.zonesUnlocked[1]).toBe(true);
    expect(kit.emitted('sealComplete').length).toBe(1);
    expect(kit.emitted('zoneUnlocked')[0]).toMatchObject({ zone: 1 });
    expect(G.inventory.count('item:pusula')).toBe(1); // mühür ödül eşyaları (çekirdek uygular)
    // halka animasyonla eş zamanlı: hemen açılmaz
    expect(G.world._unlocked.has(1)).toBe(false);
    expect(S.anims.length).toBe(1);

    // animasyon: 1 sn sonra kısmen, 4 sn sonra tamamen
    kit.step(60);
    const mid = airCount(G.world, gate);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(gate.length);
    expect(G.world._unlocked.has(1)).toBe(false);
    kit.step(60 * 3);
    expect(airCount(G.world, gate)).toBe(gate.length);
    expect(G.world._unlocked.has(1)).toBe(true);
    expect(S.anims.length).toBe(0);
    expect(S.pendingUnlocks.length).toBe(0);
    expect(G.hud.banner && G.hud.banner.text).toContain('açıldı');

    // yuvaya tekrar kristal: zaten açık
    G.inventory.add(item, 1);
    kit.step(1);
    kit.use(seal.altar.x, seal.altar.y, seal.altar.z);
    expect(G.inventory.count(item)).toBe(1);
    kit.step(2);
    expect(S.fx.current()).toContain('zaten');
  });

  it('boss: mühür tamamlanınca kapı açılır; boss yenilince arka kasa + yetenek + ödül sırası; zafer ekranı', () => {
    const bd = anchorOf(SEED, 'bossarena', 1, 0);
    // oyuncu arenanın yakınında başlar (arena konumu üretecle değişebilir: sabit koordinat yerine çıpadan türet)
    const kit = setup({ pos: { x: bd.x + 0.5, y: bd.y + 12, z: bd.z + 0.5 } });
    const { G, S } = kit;
    kit.init();
    const boss = bd.boss;
    // zone 0 mührünü ilerlemeden aç (kayıtlı durum gibi), sonra bölge 1 mührü olaylarla
    G.progression.seals[0] = true;
    G.progression.zonesUnlocked[1] = true;
    kit.step(5);
    const entry = S.arenaByZone.get(1);
    expect(entry).toBeTruthy();
    expect(G.arenas.some((a) => a.id === bd.id && a.unlocked === false && a.done === false && a.r === boss.radius)).toBe(true);
    kit.load(bd.x, bd.z, 36);
    const doorCells = boss.door.cells;
    expect(doorCells.every((c) => G.world.getBlock(c.x, c.y, c.z) === B.BOSS_DOOR)).toBe(true);
    // kapalı kapıya sağ tık: ipucu
    const c0 = doorCells[0];
    kit.use(c0.x, c0.y, c0.z);
    kit.step(2);
    expect(S.fx.current()).toContain('Mühür açılmadan geçemezsin: 0/3');

    for (let i = 0; i < 3; i++) G.emit({ type: 'crystalPlaced', zone: 1, id: 't' + i });
    expect(kit.emitted('bossDoor')[0]).toMatchObject({ zone: 1, bossKey: 'kokana' });
    expect(G.arenas[0].unlocked).toBe(true);
    expect(G.inventory.count('item:boss_anahtarı')).toBe(1);
    kit.step(60 * 4);
    expect(airCount(G.world, doorCells)).toBe(doorCells.length);
    const rd = boss.rewardDoor.cells;
    expect(rd.every((c) => G.world.getBlock(c.x, c.y, c.z) === B.BOSS_DOOR)).toBe(true);

    // boss yenilir
    G.emit({
      type: 'bossDefeated', id: 1, boss: 'kokana', name: 'Kök Ana', zone: 1, x: bd.x, y: bd.y, z: bd.z,
    });
    expect(G.progression.abilities.doubleJump).toBe(true);
    expect(G.abilities.doubleJump).toBe(true);
    expect(G.inventory.count('item:çift_zıplama_botları')).toBe(1);
    expect(G.progression.pendingRewards().map((r) => r.key)).toContain('zone:1:boss');
    expect(kit.emitted('reward').map((r) => r.key)).toContain('zone:1:boss');
    expect(G.arenas[0].done).toBe(true);
    kit.step(60 * 3);
    expect(airCount(G.world, rd)).toBe(rd.length);
  });

  it('ölümde kaybolan yetenek eşyası yeniden doğuşta geri verilir', () => {
    const kit = setup();
    kit.init();
    const { G } = kit;
    G.emit({ type: 'bossDefeated', zone: 1, boss: 'kokana' });
    expect(G.inventory.count('item:çift_zıplama_botları')).toBe(1);
    G.inventory.remove('item:çift_zıplama_botları', 1);
    G.emit({ type: 'respawn', reason: 'death' });
    expect(G.inventory.count('item:çift_zıplama_botları')).toBe(1);
  });

  it('zafer: Gölge Hükümdar yenilince ~3 sn sonra hud.ui = "victory" ve olay yayılır', () => {
    const kit = setup();
    kit.init();
    const { G } = kit;
    G.emit({ type: 'bossDefeated', zone: 4, boss: 'golgehukumdar', name: 'Gölge Hükümdar' });
    expect(kit.emitted('victory').length).toBe(1);
    expect(G.ui).toBe('none');
    kit.step(60);
    expect(G.ui).toBe('none');
    kit.step(60 * 3);
    expect(G.ui).toBe('victory');
    expect(G.progression.pendingRewards().map((r) => r.key)).toEqual(expect.arrayContaining(['zone:4:boss', 'world:conquered']));
  });

  it('zafer: gecikme dolarken envanter açıksa ekran kaybolmaz, panel kapanınca gelir (QA)', () => {
    const kit = setup();
    kit.init();
    const { G } = kit;
    G.emit({ type: 'bossDefeated', zone: 4, boss: 'golgehukumdar', name: 'Gölge Hükümdar' });
    G.setUi('inventory');
    kit.step(60 * 5);
    expect(G.ui).toBe('inventory');
    G.setUi('none');
    kit.step(2);
    expect(G.ui).toBe('victory');
    // bir kez gösterilir: kapatınca yeniden açılmaz
    G.setUi('none');
    kit.step(60 * 5);
    expect(G.ui).toBe('none');
  });

  it('kayıttan yükleme: yerleşmiş yuvalar ve açık geçit yapı kaydında yeniden kurulur', () => {
    const sealDef = anchorOf(SEED, 'muhursunagi', 0, 0);
    const kit = setup({ pos: { x: sealDef.x, y: 70, z: sealDef.z - 12 } });
    const { G } = kit;
    kit.load(sealDef.x, sealDef.z, 28);
    const ids = sealDef.seal.sockets.map((s, i) => sealDef.id + '#s' + i);
    G.progression.crystals[0] = ['a', 'b'];
    G.progression.placed[0] = ids.slice();
    G.progression.seals[0] = true;
    G.progression.zonesUnlocked[1] = true;
    kit.init();
    const gate = sealDef.seal.gate.cells;
    expect(airCount(G.world, gate)).toBe(gate.length);
    sealDef.seal.sockets.forEach((s) => expect(G.world.getBlock(s.x, s.y, s.z)).toBe(B.RECEIVER_ON));
    expect(kit.S.sealZones.get(0).gateOpen).toBe(true);
  });

  it('halka gecikmesi: dispose bekleyen açılışı hemen uygular (kayıp yok)', () => {
    const kit = setup();
    kit.init();
    const { G, S } = kit;
    S.delayUnlockZone = 0;
    G.world.unlockZone(1);
    expect(S.pendingUnlocks.length).toBe(1);
    expect(G.world._unlocked.has(1)).toBe(false);
    // _syncZones yolu (chunk üretimi) aynı bölgeyi erken açmamalı
    G.world.unlockZone(1);
    expect(G.world._unlocked.has(1)).toBe(false);
    kit.sys.dispose(G);
    expect(G.world._unlocked.has(1)).toBe(true);
  });

  it('animasyon çekirdeği: yalnız beklenen blok silinir, uzaktaki oyuncuda anında biter', () => {
    const kit = setup();
    kit.init();
    const { G, S } = kit;
    kit.load(0, 0, 16);
    const y = 90;
    G.world.setBlock(2, y, 2, B.BOSS_DOOR);
    G.world.setBlock(3, y, 2, B.STONE);
    const cells = [{ x: 2, y, z: 2 }, { x: 3, y, z: 2 }];
    let done = 0;
    expect(S.anims.length).toBe(0);
    G.body.x = 2;
    G.body.z = 2;
    // yakın: animasyon
    startOpenAnim(S, cells, { expect: B.BOSS_DOOR, seconds: 1, onDone: () => { done++; } });
    expect(S.anims.length).toBe(1);
    for (let i = 0; i < 70; i++) fixedAnims(S, 1 / 60);
    expect(G.world.getBlock(2, y, 2)).toBe(0);
    expect(G.world.getBlock(3, y, 2)).toBe(B.STONE); // beklenen blok değil → dokunulmadı
    expect(done).toBe(1);
    // uzak: anında
    G.body.x = 900;
    G.world.setBlock(2, y, 2, B.BOSS_DOOR);
    startOpenAnim(S, cells, { expect: B.BOSS_DOOR, seconds: 1 });
    expect(S.anims.length).toBe(0);
    expect(G.world.getBlock(2, y, 2)).toBe(0);
  });
});
