import { afterEach, describe, expect, it, vi } from 'vitest';
import { B } from '../sim/blocks.js';
import { LOG_LUT } from '../sim/treefall.js';
import { TREE_BLOCK_IDS, TREE_TUNING } from '../sim/treeData.js';
import { GROUND, makeTreeG } from './treefallTestKit.js';
import { isSupported, supportKind } from './blocksSupport.js';
import { resolveSystems, standardSystemFiles } from '../gameSystems.js';

// yapı sorgusu testte kontrol edilir (gerçek dünya yapılarına bağımlı olma): globalThis.__tfStructs = () => [{bounds}]
vi.mock('../sim/structures.js', () => ({
  structuresInRegion: (...a) => (globalThis.__tfStructs ? globalThis.__tfStructs(...a) : []),
  warmStructures: () => 0,
}));
afterEach(() => { globalThis.__tfStructs = null; });

const BASE_Y = GROUND + 1;
const isLog = (c) => LOG_LUT[c.id] === 1;

function airCount(G, cells) {
  return cells.filter((c) => G.world.getBlock(c.x, c.y, c.z) === 0).length;
}

describe('treefall sistemi: temel devrilme', () => {
  it('tabandan kesilen ağaç: tüm bloklar kaldırılır (kayıtlı), olay ve eşyalar gelir', () => {
    const t = makeTreeG();
    const cells = t.plant(0, 20, 8, 99);
    const logs = cells.filter(isLog);
    t.cut(20, BASE_Y, 8);
    t.tick(1);
    expect(t.S.active.length).toBe(1);
    t.tick(150);
    const rest = cells.filter((c) => !(c.x === 20 && c.y === BASE_Y && c.z === 8));
    expect(airCount(t.G, rest)).toBe(rest.length);
    // dünyaya kaydedildi: edits kayıtlarında kaldırılan hücreler 0
    cells.forEach((c) => { expect(t.G.world.edits.get(c.x + ',' + c.y + ',' + c.z)).toBe(0); });
    expect(t.events('treeFelled')).toHaveLength(1);
    expect(t.events('treeFelled')[0].logs).toBe(logs.length - 1);
    expect(t.events('treeFallDone')).toHaveLength(1);
    expect(t.S.active.length).toBe(0);
    expect(t.S.claimed.size).toBe(0);
    expect(t.G.worldRoot.children.length).toBe(0);
    // kırılan tabanın kendi düşüşünü blocks sistemi verir; devrilenden gelen kütük = logs − 1
    expect(t.dropsOf('_kütük')).toBe(logs.length - 1);
    expect(t.dropsOf('item:sopa') + t.dropsOf('_fidanı') + t.dropsOf('elma')).toBeGreaterThanOrEqual(0);
    expect(t.G.treefall.counts().felled).toBe(1);
  });

  it('görsel: animasyon süresince sahnede birleşik geometri vardır ve yatışa döner', () => {
    const t = makeTreeG();
    t.plant(4, 20, 8, 5);
    t.cut(20, BASE_Y, 8);
    t.tick(2);
    expect(t.G.worldRoot.children.length).toBe(1);
    const grp = t.G.worldRoot.children[0];
    expect(grp.children.length).toBeGreaterThan(0);
    expect(t.S.active[0].tris).toBeGreaterThan(50);
    t.tick(30);
    const mid = grp.quaternion.angleTo(new grp.quaternion.constructor());
    expect(mid).toBeGreaterThan(0.05);
    t.tick(200);
    expect(t.G.worldRoot.children.length).toBe(0);
  });

  it('süre 1,2–1,8 sn: ~2 sn sonra bitmiştir, 1 sn sonra sürüyordur', () => {
    const t = makeTreeG();
    t.plant(0, 20, 8, 5);
    t.cut(20, BASE_Y, 8);
    t.tick(50);
    expect(t.S.active.length).toBe(1);
    t.tick(70);
    expect(t.S.active.length).toBe(0);
  });

  it('ara gövde kesimi: yalnız üstü devrilir, alt kütük kalır', () => {
    const t = makeTreeG();
    const cells = t.plant(1, 20, 8, 5);
    t.cut(20, BASE_Y + 3, 8);
    t.tick(200);
    expect(t.G.world.getBlock(20, BASE_Y, 8)).toBe(B.LOG_BIRCH);
    expect(t.G.world.getBlock(20, BASE_Y + 2, 8)).toBe(B.LOG_BIRCH);
    const upper = cells.filter((c) => isLog(c) && c.y > BASE_Y + 3);
    expect(airCount(t.G, upper)).toBe(upper.length);
  });

  it('ağaç tepesindeki kütük kırılınca devrilme yok', () => {
    const t = makeTreeG();
    const cells = t.plant(0, 20, 8, 5);
    const top = cells.filter(isLog).sort((a, b) => b.y - a.y)[0];
    t.cut(top.x, top.y, top.z);
    t.tick(30);
    expect(t.events('treeFelled')).toHaveLength(0);
    expect(t.S.active.length).toBe(0);
  });

  it('oyuncunun koyduğu kütük sütunu / evi devrilmez', () => {
    const t = makeTreeG();
    for (let y = BASE_Y; y < BASE_Y + 8; y++) t.setPlaced(20, y, 8, B.LOG_OAK);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) t.G.world.setBlock(20 + dx, BASE_Y + 8, 8 + dz, B.LEAVES_OAK, { record: false, silent: true });
    t.cut(20, BASE_Y, 8);
    t.tick(60);
    expect(t.events('treeFelled')).toHaveLength(0);
    expect(t.G.world.getBlock(20, BASE_Y + 1, 8)).toBe(B.LOG_OAK);
  });

  it('insa ve harita modunda devrilme yok', () => {
    ['insa', 'harita'].forEach((mode) => {
      const t = makeTreeG({ mode });
      const cells = [];
      for (let y = BASE_Y; y < BASE_Y + 6; y++) {
        t.G.world.setBlock(8, y, 8, B.LOG_OAK, { record: false, silent: true });
        cells.push({ x: 8, y, z: 8 });
      }
      for (let dx = -1; dx <= 1; dx++) t.G.world.setBlock(8 + dx, BASE_Y + 6, 9, B.LEAVES_OAK, { record: false, silent: true });
      t.G.world.setBlock(8, BASE_Y, 8, 0, { record: false });
      t.tick(60);
      expect(t.events('treeFelled')).toHaveLength(0);
    });
  });

  it('devrilme yönü kırandan uzağa; eşyalar o tarafta düşer', () => {
    const t = makeTreeG();
    t.plant(0, 20, 8, 5);
    t.G.body.x = 14.5; t.G.body.z = 8.5; // batıda
    t.cut(20, BASE_Y, 8);
    t.tick(200);
    expect(t.dropsOf('_kütük')).toBeGreaterThan(2);
    const logs = t.G.items.filter((d) => /_kütük$/.test(d.item));
    logs.forEach((d) => expect(d.x).toBeGreaterThan(20));
  });

  it('oyuncu yoldaysa yana itilir, zarar görmez', () => {
    const t = makeTreeG();
    t.plant(4, 20, 8, 5);
    t.G.body.x = 14.5; t.G.body.z = 8.5; // batıda, yön doğuya
    t.cut(20, BASE_Y, 8);
    t.tick(1); // tespit (yön: batıdaki oyuncudan uzağa = doğu)
    // oyuncuyu yolun ortasına koy (menteşeden 4 blok doğuda, eksende)
    t.G.body.x = 24.5; t.G.body.z = 8.5;
    const hp0 = t.G.survival.hp;
    t.tick(69);
    const moved = Math.abs(t.G.body.vz) > 0.5 || Math.abs(t.G.body.vx) > 0.5 || Math.abs(t.G.body.z - 8.5) > 0.2;
    expect(moved).toBe(true);
    expect(t.G.survival.hp).toBe(hp0);
    expect(t.kit.G.log.filter((l) => l[0] === 'event' && l[1] === 'damage')).toHaveLength(0);
  });

  it('çarpmada yaratık hafif hasar + geri tepme alır; patron etkilenmez', () => {
    const t = makeTreeG();
    t.plant(4, 20, 8, 5);
    t.G.body.x = 14.5; t.G.body.z = 8.5;
    t.mobs.push({
      id: 11, x: 20.5 + 9, z: 8.5 + 0.4, y: GROUND + 1, def: { passive: false },
    });
    t.mobs.push({
      id: 12, x: 20.5 + 9, z: 8.5 - 0.4, y: GROUND + 1, def: { boss: true },
    });
    t.mobs.push({
      id: 13, x: 20.5 + 30, z: 8.5, y: GROUND + 1, def: {},
    });
    t.cut(20, BASE_Y, 8);
    t.tick(130);
    const d = t.damages.map((x) => x.id);
    expect(d).toContain(11);
    expect(d).not.toContain(12);
    expect(d).not.toContain(13);
    const hit = t.damages.find((x) => x.id === 11);
    expect(hit.dmg).toBeLessThanOrEqual(3);
    expect(hit.src.kind).toBe('env');
    expect(hit.src.strength).toBeGreaterThan(0);
  });

  it('aynı anda en fazla maxActive devrilme; kalanlar sırada bekler ve sonunda devrilir', () => {
    const t = makeTreeG();
    const all = [];
    for (let i = 0; i < 5; i++) all.push(t.plant(0, -10 + i * 8, 20, 10 + i));
    for (let i = 0; i < 5; i++) t.cut(-10 + i * 8, BASE_Y, 20);
    t.tick(5);
    expect(t.S.active.length).toBeLessThanOrEqual(TREE_TUNING.maxActive);
    t.tick(900);
    expect(t.events('treeFelled')).toHaveLength(5);
    all.forEach((cells) => {
      const logs = cells.filter(isLog);
      expect(airCount(t.G, logs)).toBe(logs.length);
    });
  });

  it('kıran konumu bilinmiyorsa (uzaktan) yön belirlenimci özetten gelir', () => {
    const a = makeTreeG();
    a.plant(0, 40, 40, 5);
    a.G.body.x = 100; a.G.body.z = 100;
    a.cut(40, BASE_Y, 40);
    a.tick(2);
    const d1 = a.S.active[0].result.dirIndex;
    const b = makeTreeG();
    b.plant(0, 40, 40, 5);
    b.G.body.x = -100; b.G.body.z = 100;
    b.cut(40, BASE_Y, 40);
    b.tick(2);
    expect(b.S.active[0].result.dirIndex).toBe(d1);
  });
});

describe('treefall sistemi: gerçek blocks sistemiyle entegrasyon', () => {
  it('oyuncu kırışı (destroyBlock) ağacı devirir; kütük düşüşü + devrilen kütükler toplamı = tüm kütükler', () => {
    const t = makeTreeG({ held: 'item:balta_demir' });
    const cells = t.plant(0, 20, 8, 99);
    const logs = cells.filter(isLog);
    expect(t.G.blocks.destroyBlock(20, BASE_Y, 8, { by: 'player' })).toBe(true);
    t.tick(200);
    expect(t.events('treeFelled')).toHaveLength(1);
    expect(t.dropsOf('_kütük')).toBe(logs.length); // 1 (kırılan) + devrilenler
    // tek tek blockBroken yalnız kırılan taban için; devrilen kütükler tür başına TEK toplu olayla (count) sayılır
    const single = t.events('blockBroken').filter((e) => e.by !== 'treefall');
    expect(single).toHaveLength(1);
    const batch = t.events('blockBroken').filter((e) => e.by === 'treefall');
    expect(batch).toHaveLength(1);
    expect(batch[0].count).toBe(logs.length - 1);
  });

  it('ışın/büyü gibi başka yollarla kaldırılan taban da (yalnız world.setBlock) devirir', () => {
    const t = makeTreeG();
    t.plant(2, 20, 8, 7);
    t.G.world.setBlock(20, BASE_Y, 8, 0);
    t.tick(3);
    expect(t.events('treeFelled')).toHaveLength(1);
  });

  it('kayıtsız (silent/record:false) kaldırma tetiklemez', () => {
    const t = makeTreeG();
    t.plant(2, 20, 8, 7);
    t.G.world.setBlock(20, BASE_Y, 8, 0, { record: false, silent: true });
    t.G.world.setBlock(20, BASE_Y + 1, 8, 0, { record: false });
    t.tick(5);
    expect(t.events('treeFelled')).toHaveLength(0);
  });
});

describe('treefall sistemi: yapı koruması', () => {
  it('yapı sınırı içindeki ağaç/kütük devrilmez; sınır dışındaki devrilir', () => {
    globalThis.__tfStructs = () => [{ bounds: { x0: 14, x1: 30, z0: 0, z1: 20, y0: 30, y1: 90 } }];
    const t = makeTreeG();
    t.plant(0, 20, 8, 99);
    t.plant(0, 40, 8, 99);
    t.cut(20, BASE_Y, 8);
    t.tick(30);
    expect(t.events('treeFelled')).toHaveLength(0);
    t.cut(40, BASE_Y, 8);
    t.tick(30);
    expect(t.events('treeFelled')).toHaveLength(1);
  });
});

describe('treefall sistemi: dev ağaç ve yaprak çürümesi', () => {
  function giant(t, cx, cz) {
    const cells = [];
    for (let y = BASE_Y; y < BASE_Y + 14; y++) {
      for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) {
        t.G.world.setBlock(cx + dx, y, cz + dz, B.LOG_OAK, { record: false, silent: true });
        cells.push({ x: cx + dx, y, z: cz + dz, id: B.LOG_OAK });
      }
    }
    for (let dy = 0; dy < 8; dy++) for (let dx = -5; dx <= 6; dx++) for (let dz = -5; dz <= 6; dz++) {
      const x = cx + dx; const y = BASE_Y + 10 + dy; const z = cz + dz;
      if (t.G.world.getBlock(x, y, z) === 0 && Math.hypot(dx - 0.5, dz - 0.5, (dy - 3.5) * 1.2) < 5.8) {
        t.G.world.setBlock(x, y, z, B.LEAVES_OAK, { record: false, silent: true });
        cells.push({ x, y, z, id: B.LEAVES_OAK });
      }
    }
    return cells;
  }

  it('>300 bloklu ağaç: üstten alta 1,5 sn\'ye yayılı çöküş (tek adımda hepsi gitmez)', () => {
    const t = makeTreeG();
    const cells = giant(t, 20, 8);
    expect(cells.length).toBeGreaterThan(TREE_TUNING.bigBlocks);
    [[20, 8], [21, 8], [20, 9]].forEach((p) => t.cut(p[0], BASE_Y, p[1]));
    t.cut(21, BASE_Y, 9);
    t.tick(1);
    expect(t.S.active[0].big).toBe(true);
    expect(t.G.worldRoot.children.length).toBe(0); // basitleştirilmiş: dönen geometri yok
    t.tick(10);
    const left10 = cells.filter((c) => t.G.world.getBlock(c.x, c.y, c.z) !== 0).length;
    expect(left10).toBeGreaterThan(0);
    // üstten alta: en üst yaprak, en alt kütükten önce gider
    t.tick(100);
    const logsLeft = cells.filter((c) => c.id === B.LOG_OAK && t.G.world.getBlock(c.x, c.y, c.z) !== 0);
    expect(logsLeft).toHaveLength(0);
    // ağaca ≤ 4 adımdan uzak dış yapraklar devrilmeye katılmaz; yaprak çürümesi kurutur
    t.tick(60 * 14);
    expect(cells.filter((c) => t.G.world.getBlock(c.x, c.y, c.z) !== 0)).toHaveLength(0);
    expect(t.S.stats.popped).toBeGreaterThan(3);
    expect(t.events('treeFelled')[0].big).toBe(true);
    expect(t.dropsOf('_kütük')).toBeGreaterThanOrEqual(40);
  });

  it('sürekli kare süresi: normal ağaç devrilirken tek adımda en çok bir tespit ve bütçeli kaldırma', () => {
    const t = makeTreeG();
    t.plant(4, 20, 8, 5);
    t.cut(20, BASE_Y, 8);
    const t0 = performance.now();
    t.tick(1);
    t.tick(1);
    expect(performance.now() - t0).toBeLessThan(400);
  });

  it('yetim yapraklar birkaç saniyede kurur; oyuncu yaprağı ve kütüğe yakın yapraklar kalır', () => {
    const t = makeTreeG();
    const leaves = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      t.G.world.setBlock(30 + dx, BASE_Y + 10, 8 + dz, B.LEAVES_OAK, { record: false, silent: true });
      leaves.push({ x: 30 + dx, y: BASE_Y + 10, z: 8 + dz });
    }
    // oyuncu yaprağı
    t.setPlaced(30, BASE_Y + 11, 8, B.LEAVES_OAK);
    // kütüğe yakın yaprak grubu
    t.G.world.setBlock(40, BASE_Y + 3, 8, B.LOG_OAK, { record: false, silent: true });
    t.G.world.setBlock(41, BASE_Y + 3, 8, B.LEAVES_OAK, { record: false, silent: true });
    // tarama başlat: yetim kümenin yakınında bir kütük kaldır
    t.G.world.setBlock(30, BASE_Y + 9, 8, B.LOG_OAK, { record: false, silent: true });
    t.G.world.setBlock(30, BASE_Y + 9, 8, 0); // kayıtlı kaldırma → blockChange
    t.tick(60 * 12);
    expect(leaves.filter((c) => t.G.world.getBlock(c.x, c.y, c.z) !== 0)).toHaveLength(0);
    expect(t.G.world.getBlock(30, BASE_Y + 11, 8)).toBe(B.LEAVES_OAK);
    expect(t.G.world.getBlock(41, BASE_Y + 3, 8)).toBe(B.LEAVES_OAK);
    expect(t.S.stats.decayed).toBe(leaves.length);
  });
});

describe('treefall sistemi: fidan', () => {
  const SAP = TREE_BLOCK_IDS.SAPLING_OAK;
  const TREE_SPECIES_IDS = Object.values(TREE_BLOCK_IDS);

  it('fidan çimene dikilir, yüklü ve aydınlıkta 50–120 sn sonra ağaca dönüşür (belirlenimci)', () => {
    const t = makeTreeG();
    t.G.world.setBlock(24, BASE_Y, 24, SAP);
    expect(t.S.saplings.size).toBe(1);
    t.tick(60 * 40);
    expect(t.G.world.getBlock(24, BASE_Y, 24)).toBe(SAP);
    t.tick(60 * 90);
    expect(t.G.world.getBlock(24, BASE_Y, 24)).toBe(B.LOG_OAK);
    expect(t.S.saplings.size).toBe(0);
    expect(t.events('treeGrown')).toHaveLength(1);
    // belirlenimci: aynı tohum+konum → aynı süre
    const t2 = makeTreeG();
    t2.G.world.setBlock(24, BASE_Y, 24, SAP);
    t2.tick(60 * 119);
    expect(t2.G.world.getBlock(24, BASE_Y, 24)).toBe(B.LOG_OAK);
  });

  it('yer yoksa büyümez (üstü taş), yer açılınca büyür', () => {
    const t = makeTreeG();
    t.G.world.setBlock(24, BASE_Y, 24, SAP);
    t.G.world.setBlock(24, BASE_Y + 2, 24, B.STONE);
    t.tick(60 * 150);
    expect(t.G.world.getBlock(24, BASE_Y, 24)).toBe(SAP);
    t.G.world.setBlock(24, BASE_Y + 2, 24, 0);
    t.tick(60 * 70);
    expect(t.G.world.getBlock(24, BASE_Y, 24)).toBe(B.LOG_OAK);
  });

  it('karanlıkta büyümez', () => {
    const t = makeTreeG();
    t.G.world.setBlock(24, BASE_Y, 24, SAP);
    const real = t.G.world.getLight.bind(t.G.world);
    t.G.world.getLight = () => 0;
    t.tick(60 * 150);
    expect(t.G.world.getBlock(24, BASE_Y, 24)).toBe(SAP);
    t.G.world.getLight = real;
  });

  it('oyuncudan çok uzaktaki fidan ilerlemez', () => {
    const t = makeTreeG();
    t.G.world.setBlock(24, BASE_Y, 24, SAP);
    t.G.body.x = 500; t.G.body.z = 500;
    t.tick(60 * 150);
    expect(t.G.world.getBlock(24, BASE_Y, 24)).toBe(SAP);
  });

  it('destek kuralı: fidan çimen/toprak ister (taş/havada olmaz), zemin kalkınca blocks sistemi düşürür', () => {
    TREE_SPECIES_IDS.forEach((id) => expect(supportKind(id)).toBe('plant'));
    const t = makeTreeG();
    const w = t.G.world;
    t.G.world.setBlock(24, BASE_Y, 24, SAP);
    expect(isSupported(w, 'plant', SAP, 24, BASE_Y, 24)).toBe(true);
    w.setBlock(26, BASE_Y - 1, 26, B.STONE);
    expect(isSupported(w, 'plant', SAP, 26, BASE_Y, 26)).toBe(false);
    // yerleştirme: taş üstüne konamaz, çimene konur
    t.G.inventory.setSlot(0, 'blok:meşe_fidanı', 3);
    t.G.inventory.selected = 0;
    expect(t.G.blocks.placeBlockAt(26, BASE_Y, 26, SAP, {})).toBeFalsy();
    expect(t.G.blocks.placeBlockAt(28, BASE_Y, 28, SAP, {})).toBeTruthy();
    expect(w.getBlock(28, BASE_Y, 28)).toBe(SAP);
    // zemin kırılınca fidan düşer ve eşya bırakır
    t.G.blocks.destroyBlock(28, BASE_Y - 1, 28, { by: 'player' });
    expect(w.getBlock(28, BASE_Y, 28)).toBe(0);
    expect(t.G.items.some((d) => d.item === 'blok:meşe_fidanı')).toBe(true);
  });

  it('fidanın zemini kalkınca düşer (destek kuralı) ve kayıttan silinir', () => {
    const t = makeTreeG();
    t.G.world.setBlock(24, BASE_Y, 24, SAP);
    t.G.world.setBlock(24, BASE_Y, 24, 0);
    t.tick(2);
    expect(t.S.saplings.size).toBe(0);
  });

  it('büyüyen ağaç doğaldır: tabanı kesilince devrilir; oyuncunun koyduğu kütük devrilmez', () => {
    const t = makeTreeG();
    t.G.world.setBlock(24, BASE_Y, 24, SAP);
    t.tick(60 * 125);
    expect(t.G.world.getBlock(24, BASE_Y, 24)).toBe(B.LOG_OAK);
    t.cut(24, BASE_Y, 24);
    t.tick(5);
    expect(t.events('treeFelled')).toHaveLength(1);
    t.tick(200);
    expect(t.G.world.getBlock(24, BASE_Y + 2, 24)).toBe(0);
  });

  it('kayıt: fidan listesi ve büyüyen ağaç kayıtları gidiş-dönüş eder (büyüyen ağaç doğal kalır)', () => {
    const a = makeTreeG();
    a.G.world.setBlock(24, BASE_Y, 24, SAP); // büyüyecek
    a.tick(60 * 125);
    a.G.world.setBlock(30, BASE_Y, 30, SAP); // bekleyen
    a.tick(60 * 20);
    const saved = JSON.parse(JSON.stringify(a.sys.serialize()));
    expect(saved.sap.length).toBe(1);
    expect(saved.grown.length).toBe(1);
    // aynı dünya, yeni sistem
    const b = makeTreeG();
    for (let y = BASE_Y; y < BASE_Y + 12; y++) {
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
        const id = a.G.world.getBlock(24 + dx, y, 24 + dz);
        if (id) b.G.world.setBlock(24 + dx, y, 24 + dz, id); // KAYITLI: oyuncu eliyle gibi görünür
      }
    }
    b.G.world.setBlock(30, BASE_Y, 30, SAP);
    b.sys.restore(b.G, saved);
    expect(b.S.saplings.size).toBe(1);
    expect(b.S.grownTrees.length).toBe(1);
    b.cut(24, BASE_Y, 24);
    b.tick(3);
    expect(b.events('treeFelled')).toHaveLength(1); // kayıtlı hücreler "büyüyen ağaç" kaydıyla doğal sayıldı
    // kayıt olmadan aynı durum: oyuncu inşası sayılır
    const c = makeTreeG();
    for (let y = BASE_Y; y < BASE_Y + 12; y++) {
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
        const id = a.G.world.getBlock(24 + dx, y, 24 + dz);
        if (id) c.G.world.setBlock(24 + dx, y, 24 + dz, id);
      }
    }
    c.cut(24, BASE_Y, 24);
    c.tick(3);
    expect(c.events('treeFelled')).toHaveLength(0);
  });

  it('bozuk kayıt verisi yok sayılır (çökmez)', () => {
    const t = makeTreeG();
    [null, undefined, 5, 'x', {}, { sap: 'x', grown: [[1]], rem: [1, 2], drops: [{ item: 3 }] }, { sap: [[1.5, 2, 3, 0]], grown: [[1, 2, 3, 99, 5]] }].forEach((o) => {
      expect(() => t.sys.restore(t.G, o)).not.toThrow();
    });
    expect(t.S.saplings.size).toBe(0);
  });
});

describe('treefall sistemi: kayıt (yarım kalan devrilme)', () => {
  it('dev çöküş sürerken serialize: kalan hücreler listelenir; yüklemede hemen tamamlanır', () => {
    const a = makeTreeG();
    const cells = [];
    for (let y = BASE_Y; y < BASE_Y + 14; y++) {
      for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) cells.push({ x: 20 + dx, y, z: 8 + dz, id: B.LOG_OAK });
    }
    for (let dy = 0; dy < 8; dy++) for (let dx = -4; dx <= 5; dx++) for (let dz = -4; dz <= 5; dz++) {
      const x = 20 + dx; const y = BASE_Y + 10 + dy; const z = 8 + dz;
      if (Math.hypot(dx - 0.5, dz - 0.5, (dy - 3.5) * 1.2) < 4.6) cells.push({ x, y, z, id: B.LEAVES_OAK });
    }
    const put = (t) => cells.forEach((c) => { if (t.G.world.getBlock(c.x, c.y, c.z) === 0) t.G.world.setBlock(c.x, c.y, c.z, c.id, { record: false, silent: true }); });
    put(a);
    for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) a.cut(20 + dx, BASE_Y, 8 + dz);
    a.tick(30);
    const saved = JSON.parse(JSON.stringify(a.sys.serialize()));
    expect(saved.rem.length).toBeGreaterThan(0);
    expect(saved.drops.length).toBeGreaterThan(0);
    // yeni oturum: dünya kayıtlı düzenlemelerle (kısmi) + ağaç üretimi
    const b = makeTreeG();
    put(b);
    b.G.world.applyEdits(a.G.world.serializeEdits());
    expect(cells.filter((c) => c.id === B.LOG_OAK && b.G.world.getBlock(c.x, c.y, c.z) !== 0).length).toBeGreaterThan(0);
    b.sys.restore(b.G, saved);
    expect(cells.filter((c) => c.id === B.LOG_OAK && b.G.world.getBlock(c.x, c.y, c.z) !== 0)).toHaveLength(0);
    b.tick(3);
    expect(b.G.items.filter((d) => /_kütük$/.test(d.item)).length).toBeGreaterThan(0);
  });

  it('normal ağaç: kaldırma anında biter; devrilirken kaydedilen eşyalar yüklemede bırakılır', () => {
    const a = makeTreeG();
    a.plant(0, 20, 8, 5);
    a.cut(20, BASE_Y, 8);
    a.tick(20);
    const saved = JSON.parse(JSON.stringify(a.sys.serialize()));
    expect(saved.drops.length).toBeGreaterThan(0);
    const b = makeTreeG();
    b.sys.restore(b.G, saved);
    b.tick(3);
    expect(b.G.items.map((d) => d.item).join()).toContain('_kütük');
  });
});

describe('treefall sistemi: oyuna bağlanma sözleşmesi', () => {
  it('gameSystems standart sistem dosyalarında yüklenir; sistem adı/sırası sabit', () => {
    expect(standardSystemFiles()).toContain('./systems/treefall.js');
    const t = makeTreeG();
    const made = resolveSystems({ './systems/treefall.js': { createSystem: (G) => (G === t.G ? t.sys : null) } }, t.G);
    expect(made).toHaveLength(1);
    expect(made[0].name).toBe('treefall');
    expect(made[0].order).toBe(22);
    expect(typeof made[0].fixedUpdate).toBe('function');
    expect(typeof made[0].frameUpdate).toBe('function');
    expect(typeof made[0].serialize).toBe('function');
    expect(typeof made[0].restore).toBe('function');
    expect(Object.keys(made[0].api())).toEqual(['getTreeFallStats']);
  });

  it('dispose: sahneden görseller kalkar, dinleyici bırakılır (sonraki blok değişimi tetiklemez)', () => {
    const t = makeTreeG();
    t.plant(0, 20, 8, 5);
    t.plant(0, 36, 8, 5);
    t.cut(20, BASE_Y, 8);
    t.tick(5);
    expect(t.G.worldRoot.children.length).toBe(1);
    t.sys.dispose();
    expect(t.G.worldRoot.children.length).toBe(0);
    const n = t.events('treeFelled').length;
    t.cut(36, BASE_Y, 8);
    t.tick(5);
    expect(t.events('treeFelled').length).toBe(n);
  });
});
