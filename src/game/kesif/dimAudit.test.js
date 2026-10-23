/*
 * BAYAT DÜNYA DENETİMİ (sözleşme §21 risk #1, §18.5): `G.world`/`G.em`/`G.entityRoot`'u çağrı ötesinde önbelleğe alan (fabrika kapsamında tutan) sistemler
 * boyut değişiminde eski dünyaya tutunurdu. Bu test (a) G.world okuyan HER dosyayı sınıflandırmaya zorlar (yeni okuyucu sınıflandırılmadan geçmez),
 * (b) fabrika kapsamında önbellek tutan dosyaların sahibinin onDimension'ı olduğunu doğrular, (c) world.on aboneliği yapan her sistemin onDimension
 * ile yeniden bağlandığını doğrular, (d) tüm gerçek sistemlerle (mobs dahil) 50 swap + her biri sonrası sabit adım koşturup eski dünyaya erişimin
 * (retire tripwire: test ortamında FIRLATIR) 0 kaldığını doğrular.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from './dimTestKit.js';

vi.setConfig({ testTimeout: 180000 });

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.js$/.test(e.name) && !/\.test\.js$/.test(e.name) && !/Kit\.js$/.test(e.name)) out.push(p);
  });
  return out;
}

const FILES = walk(ROOT, []).map((p) => path.relative(ROOT, p).replace(/\\/g, '/'));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** G.world okuyan dosyalar ve nasıl okudukları. call: her çağrıda taze okur · boot: yalnız kurulumda · doc: yalnız yorum · rebuilt:X: fabrikada tutar, X.onDimension yeniden kurar. */
const READERS = {
  'game.js': 'boot',
  'gameCamera.js': 'call',
  'gameCtx.js': 'doc',
  'gameDebug.js': 'call',
  'gameDimension.js': 'call',
  'gameEnv.js': 'call',
  'gamePlayer.js': 'call',
  'gameRender.js': 'call',
  'gameSim.js': 'boot',
  'inputVehicleBridge.js': 'call', // Faz 3 kapısı (qa_p3): G.world yalnız roadSnap çağrısında taze okunur (sürüş geri çağrıları; önbellek yok)
  'render/city/cityLook.js': 'call',
  'render/techMachineFx.js': 'call',
  'sim/world.js': 'doc',
  'systems/blocksBreak.js': 'call',
  'systems/blocksChest.js': 'call',
  'systems/blocksCore.js': 'call',
  'systems/blocksCraft.js': 'call',
  'systems/blocksPlace.js': 'call',
  'systems/blocksSupport.js': 'call',
  'systems/blocksTarget.js': 'call',
  'systems/blocksUse.js': 'call',
  'systems/cityHud.js': 'call',
  'systems/cityPhoto.js': 'call', // Faz 4 (photo_map): G.world yalnız ışın çağrısı içinde taze okunur (yörünge kamerası/kadraj testi); önbellek yok, beforeDimension foto/seyahati kapatır
  'systems/cityNpc.js': 'call', // Faz 4 (npc_vendors): G.world yalnız çağrı içinde taze okunur (yerleşim/ışık/diyalog); dinamik proplar beforeDimension'da atılır
  'systems/contentAnim.js': 'call',
  'systems/crowd.js': 'call', // Faz 4 (crowd_ai): G.world yalnız çağrı içinde taze okunur (ensure/ışık/çarpışma kutuları); yaya ve kutular onDimension'da atılır
  'systems/crowdVisual.js': 'call', // Faz 4 (crowd_ai): G.world yalnız kare içinde kontrol edilir (önbellek yok)
  'systems/contentBoss.js': 'call',
  'systems/contentParkour.js': 'call',
  'systems/contentProgress.js': 'call',
  'systems/contentPuzzles.js': 'call',
  'systems/contentSeal.js': 'call',
  'systems/dimGate.js': 'call',
  'systems/dimension.js': 'call',
  'systems/magic.js': 'call',
  'systems/magicCast.js': 'call',
  'systems/magicWorld.js': 'rebuilt:systems/magic.js',
  'systems/mobsCombat.js': 'rebuilt:systems/mobs.js',
  'systems/mobsModels.js': 'rebuilt:systems/mobs.js',
  'systems/mobsPlayer.js': 'rebuilt:systems/mobs.js',
  'systems/mobsWorld.js': 'rebuilt:systems/mobs.js',
  'systems/props.js': 'call',
  'systems/propsEffects.js': 'call',
  'systems/propsSeat.js': 'call', // Faz 2 (props_content): G.world yalnız stand() çağrısında taze okunur (doğrulandı, önbellek yok)
  'systems/session.js': 'call',
  'systems/sessionCommands.js': 'call',
  'systems/sessionHud.js': 'call',
  'systems/sessionModes.js': 'call',
  'systems/sessionSave.js': 'call',
  'systems/tech.js': 'call',
  'systems/techApi.js': 'call',
  'systems/techCtx.js': 'call',
  'systems/techGear.js': 'call',
  'systems/techPortalGun.js': 'call',
  'systems/techUse.js': 'call',
  'systems/traffic.js': 'call', // Faz 3 (traffic_ai): G.world yalnız çağrı içinde taze okunur; trafik/çarpışma kutuları onDimension'da atılır
  'systems/treefall.js': 'call',
  'systems/treefallCore.js': 'call',
  'systems/treefallDecay.js': 'call',
  'systems/treefallFell.js': 'call',
  'systems/treefallFx.js': 'call',
  'systems/treefallSapling.js': 'call',
  'systems/vehicleAudio.js': 'call', // Faz 3 kapısı (qa_p3): G.world yalnız kare içinde (cityZoneAt) taze okunur
  'systems/vehicleUi.js': 'call', // Faz 3 kapısı (qa_p3): G.world yalnız API çağrısında taze okunur
  'systems/vehicleVisual.js': 'call', // Faz 3 kapısı (qa_p3): G.world yalnız lightOf/kare içinde taze okunur
  'systems/vehicles.js': 'call', // Faz 3 (vehicle_phys): G.world yalnız çağrı içinde taze okunur (manager/props/world işlevleri deps ile)
  'systems/vehiclesCam.js': 'call',
  'systems/vehiclesCommands.js': 'call',
};

/** world.on aboneliği yapan dosyalar → onDimension'da abonelik yeniden kuran sahibi. */
const SUBSCRIBERS = {
  'systems/magicWorld.js': 'systems/magic.js',
  'systems/tech.js': 'systems/tech.js',
  'systems/treefall.js': 'systems/treefall.js',
};

/** Fabrika (create…) kapsamında em/world/entityRoot önbelleği tutan dosyalar → yeniden kuran sahip. */
const FACTORY_CACHES = {
  'systems/mobsCombat.js': 'systems/mobs.js',
  'systems/mobsDrops.js': 'systems/mobs.js',
  'systems/mobsModels.js': 'systems/mobs.js',
  'systems/mobsShots.js': 'systems/mobs.js',
  'systems/mobsWorld.js': 'systems/mobs.js',
};

/** Fabrika adı create… olsa da önbelleği YALNIZ çağrı içinde eşzamanlı kullanan (çağrı ötesi yaşamayan) dosyalar. */
const EPHEMERAL = {
  'systems/treefallFx.js': 'createFallVisual: G.world yalnız meshTreeBlocks çağrısı süresince (eşzamanlı) kullanılır',
};

/** Bu sistem dosyaları boyuta bağlı durum tutar → onDimension ZORUNLU. */
const MUST_HAVE_ONDIMENSION = [
  'gamePlayer.js', 'systems/blocks.js', 'systems/content.js', 'systems/magic.js', 'systems/mobs.js', 'systems/props.js', 'systems/tech.js', 'systems/treefall.js',
  'systems/dimension.js', 'render/city/cityLook.js', 'systems/cityHud.js', 'systems/vehicles.js', 'systems/traffic.js',
  'systems/cityNpc.js', 'systems/crowd.js', 'systems/cityPhoto.js',
];

function factoryCacheFiles() {
  const found = {};
  const re = /^ {2}(?:const|let) (\w+) = (?:G|g)\.(em|world|entityRoot|worldRoot|puzzles|chests|tech);\s*$/;
  FILES.forEach((rel) => {
    if (!/^systems\//.test(rel) && !/^game/.test(rel)) return;
    const lines = read(rel).split(/\r?\n/);
    let fn = null;
    for (let i = 0; i < lines.length; i++) {
      const m = /^(?:export )?function (\w+)\(/.exec(lines[i]);
      if (m) fn = m[1];
      if (fn && /^create/.test(fn) && re.test(lines[i])) found[rel] = (found[rel] || []).concat(lines[i].trim());
    }
  });
  return found;
}

describe('G.world okuyucu sınıflandırması', () => {
  it('G.world okuyan her dosya sınıflandırılmış; sınıflandırılmış dosya hâlâ okuyor (liste bayat değil)', () => {
    const readers = FILES.filter((rel) => /\b[Gg]\.world\b/.test(read(rel))).sort();
    const classified = Object.keys(READERS).sort();
    const unclassified = readers.filter((r) => classified.indexOf(r) < 0);
    expect(unclassified).toEqual([]); // yeni okuyucu: önce çağrı ötesi önbellek tutmadığını doğrula, sonra READERS'a ekle
    const stale = classified.filter((r) => readers.indexOf(r) < 0);
    expect(stale).toEqual([]);
  });

  it("'rebuilt' dosyaların sahibi onDimension tanımlar", () => {
    Object.keys(READERS).forEach((rel) => {
      const m = /^rebuilt:(.+)$/.exec(READERS[rel]);
      if (!m) return;
      expect(read(m[1])).toMatch(/onDimension\s*\(/);
    });
  });

  it('boyuta bağlı durum tutan sistem dosyalarında onDimension zorunlu', () => {
    MUST_HAVE_ONDIMENSION.forEach((rel) => {
      expect(read(rel), rel).toMatch(/onDimension\s*(\(|:)/);
    });
  });
});

describe('fabrika kapsamında önbellek (em/world/entityRoot) denetimi', () => {
  it('create… fabrikasında G.em/G.world/G.entityRoot tutan her dosya bilinen sahibe bağlı (yeni önbellek sahibi olmadan geçmez)', () => {
    const found = factoryCacheFiles();
    const unknown = Object.keys(found).filter((rel) => !FACTORY_CACHES[rel] && !EPHEMERAL[rel]);
    expect(unknown).toEqual([]);
    Object.keys(found).filter((rel) => FACTORY_CACHES[rel]).forEach((rel) => expect(read(FACTORY_CACHES[rel])).toMatch(/onDimension\s*\(/));
  });
});

describe('world.on abonelikleri', () => {
  it('G.world.on(…) çağıran her dosya onDimension ile abonelik kuran sahibe bağlı; abonelik aboneliği bırakır (unsub)', () => {
    const subs = FILES.filter((rel) => /\b[Gg]\.world\.on\(/.test(read(rel)));
    const unknown = subs.filter((r) => !SUBSCRIBERS[r]);
    expect(unknown).toEqual([]);
    subs.forEach((rel) => {
      const owner = read(SUBSCRIBERS[rel]);
      expect(owner).toMatch(/onDimension\s*\(/);
      expect(owner).toMatch(/unsub|\.dispose\(\)/);
    });
  });
});

describe('dinamik denetim: tüm gerçek sistemler (mobs dahil) 50 swap boyunca', () => {
  it('eski dünyaya erişim 0 (retire tripwire FIRLATIR), dinleyici sayıları sabit, mob görünümleri yeni em ile', () => {
    const k = makeDimG({ render: true, systems: ['blocks', 'tech', 'magic', 'treefall', 'content', 'props', 'mobs', 'dimension'] });
    const { G, mgr } = k;
    const owW = mgr.get('overworld').world;
    k.step(20);
    const mobs = G.getSystem('mobs');
    expect(mobs.impl).toBeTruthy();
    // yerde eşya: görünüm üretsin
    G.em.spawnItem('blok:taş', 3, G.body.x + 1, G.body.y + 1, G.body.z + 1);
    k.frame(1 / 60, 10);
    mgr.swap('neon');
    k.frame(1 / 60, 30);
    expect(G.em).toBe(mgr.get('neon').em);
    expect(G.em).not.toBe(mgr.get('overworld').em);
    mgr.swap('overworld');
    k.frame(1 / 60, 30);
    const nW = mgr.get('neon').world;
    const base = JSON.stringify([owW, nW].map((w) => Object.keys(w._listeners).map((kk) => w._listeners[kk].length)));
    for (let i = 0; i < 50; i++) {
      mgr.swap(i % 2 === 0 ? 'neon' : 'overworld');
      k.frame(1 / 60, 12);
    }
    expect(G.dim).toBe('overworld');
    expect(JSON.stringify([owW, nW].map((w) => Object.keys(w._listeners).map((kk) => w._listeners[kk].length)))).toBe(base);
    k.frame(1 / 60, 400); // 400 kare × (sabit adım + kare) → eski dünyaya tek erişim bile FIRLATIR
    expect(mgr.stats.staleWorldHits).toBe(0);
    // şehirde de 400 kare
    mgr.swap('neon');
    k.frame(1 / 60, 400);
    expect(mgr.stats.staleWorldHits).toBe(0);
    // sahne: yöneticiler/gate görseli sızdırmaz (kök sayısı sabit)
    const roots = G.scene.children.length;
    for (let i = 0; i < 20; i++) {
      mgr.swap(i % 2 === 0 ? 'overworld' : 'neon');
      k.frame(1 / 60, 3);
    }
    expect(G.scene.children.length).toBe(roots);
  });

  it('G.world önbellekleyen SENTETİK sistem tripwire tarafından yakalanır (denetimin kendisi çalışıyor)', () => {
    const k = makeDimG({ systems: ['dimension'] });
    const { G, mgr } = k;
    const cached = G.world; // kötü sistem: dünyayı tutar
    G.addSystem({ name: 'bad', order: 800, fixedUpdate: () => { cached.getBlock(0, 64, 0); } });
    k.step(5);
    expect(() => {
      mgr.swap('neon');
      k.step(1);
    }).toThrow(/Emekli dünya/);
  });
});
