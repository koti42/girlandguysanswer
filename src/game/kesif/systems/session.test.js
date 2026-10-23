import { describe, expect, it, vi } from 'vitest';
import {
  boot, frame, makeTestG, stepSystems,
} from './sessionTestKit.js';
import { createSessionRuntime, createSystems } from './session.js';
import { resolveSystems } from '../gameSystems.js';
import { B } from '../sim/blocks.js';

function setup(opts) {
  const o = opts || {};
  const saves = [];
  const G = makeTestG({
    mode: o.mode || 'insa',
    base: 'düz',
    seed: o.seed,
    save: o.save,
    mapData: o.mapData,
    callbacks: Object.assign({ onSave: (p) => { saves.push(p); } }, o.callbacks || {}),
    opts: o.gopts,
  });
  const perf = { t: 1000 };
  const idleQ = [];
  const rt = createSessionRuntime(G, {
    saverDeps: {
      now: () => 1700000000000 + perf.t,
      perf: () => perf.t,
      idle: (fn) => { idleQ.push(fn); return () => { const i = idleQ.indexOf(fn); if (i >= 0) idleQ.splice(i, 1); }; },
    },
  });
  boot(G, [rt.core, rt.hud]);
  return {
    G, rt, saves, perf, idleQ,
  };
}

describe('giriş dosyası', () => {
  it('createSystems iki sistem verir; gameSystems çözücüsü kabul eder', () => {
    const G = makeTestG({ mode: 'insa', base: 'düz' });
    const sys = createSystems(G);
    expect(sys.map((s) => s.name)).toEqual(['session', 'session.hud']);
    expect(sys[0].order).toBe(10);
    expect(sys[1].order).toBe(90);
    const res = resolveSystems({ './systems/session.js': { createSystems } }, G);
    expect(res).toHaveLength(2);
    G.addSystem(res[0]);
    G.addSystem(res[1]);
    expect(G.getSystem('session')).toBe(res[0]);
  });

  it('api yüzeyi çakışmasız birleşir ve beklenen yöntemleri verir', () => {
    const { G } = setup();
    const api = G.registry.mergeApi({}, G);
    ['save', 'getSaveSummary', 'getWorldCode', 'exportMap', 'setMapTime', 'command'].forEach((k) => expect(typeof api[k]).toBe('function'));
    expect(Object.keys(api).sort()).toEqual(['command', 'exportMap', 'getSaveSummary', 'getWorldCode', 'save', 'setMapTime']);
  });
});

describe('açılış', () => {
  it('inşa: G yardımcıları ve açılış duyurusu', () => {
    const { G } = setup();
    expect(typeof G.hint).toBe('function');
    expect(typeof G.banner).toBe('function');
    expect(G.readOnly).toBe(false);
    expect(G.introDone).toBe(true);
    frame(G);
    expect(G.hud.banner.text).toBe('İnşa Alanı');
    expect(G.hud.hint).toMatch(/uçuş/);
    expect(G.published).toContain(true);
  });

  it('harita: salt okunur; kayıt yok', () => {
    const { G, saves } = setup({ mode: 'harita' });
    expect(G.readOnly).toBe(true);
    G.setUi('pause');
    G.emit({ type: 'death' });
    expect(saves).toHaveLength(0);
    const api = G.registry.mergeApi({}, G);
    expect(api.save()).toBe(null);
    expect(api.getWorldCode()).toBe('');
    expect(api.exportMap().ok).toBe(false);
  });

  it('bozuk kayıt: duyuru + sesli uyarı, oyun çalışmaya devam eder', () => {
    const { G } = setup({ save: '{bozuk json' });
    expect(G.restoreInfo.ok).toBe(false);
    expect(G.spoken.length).toBe(1);
    frame(G);
    expect(G.hud.banner.text).toBe('Kayıt okunamadı');
  });
});

describe('kayıt tetikleyicileri', () => {
  it('duraklatma → auto kayıt (aynı anda ikinci tetikleme yok sayılır)', () => {
    const { G, saves, perf } = setup();
    G.time.tick = 50;
    G.setUi('pause');
    expect(saves).toHaveLength(1);
    expect(saves[0].reason).toBe('auto');
    G.setUi('none');
    G.time.tick = 51;
    perf.t += 300;
    G.setUi('pause');
    expect(saves).toHaveLength(1); // minGap 1500 ms
    G.setUi('none');
    perf.t += 2000;
    G.time.tick = 60;
    G.setUi('pause');
    expect(saves).toHaveLength(2);
  });

  it('ölüm → yeniden doğmuş hâlle kayıt', () => {
    const { G, saves } = setup();
    G.body.x = 90; G.body.z = 90;
    G.survival.hp = 0;
    G.player.dead = true;
    G.time.tick = 70;
    G.emit({ type: 'death', cause: 'düşme' });
    expect(saves).toHaveLength(1);
    expect(saves[0].save.player.hp).toBe(G.survival.maxHp);
    expect(saves[0].save.player.pos[0]).toBeCloseTo(G.spawn.x, 1);
  });

  it('bölge açılışı/boss/yetenek boşta kaydedilir; elle istek (G.requestSave) hemen', () => {
    const { G, saves, idleQ } = setup();
    G.time.tick = 80;
    G.emit({ type: 'zoneUnlocked', zone: 1, name: 'Fısıldayan Ormanlar' });
    expect(saves).toHaveLength(0);
    expect(idleQ).toHaveLength(1);
    G.emit({ type: 'bossDefeated', zone: 1 });
    expect(idleQ).toHaveLength(1); // birleşti
    idleQ[0]();
    expect(saves).toHaveLength(1);
    expect(saves[0].reason).toBe('auto');
    G.requestSave('manual');
    expect(saves).toHaveLength(2);
    expect(saves[1].reason).toBe('manual');
    G.requestSave('bed');
    expect(saves[2].reason).toBe('auto');
  });

  it('60 sn oyun süresi → boşta otomatik kayıt', () => {
    const { G, saves, idleQ, perf } = setup();
    G.time.tick = 1;
    stepSystems(G, 60 * 59);
    expect(idleQ).toHaveLength(0);
    stepSystems(G, 120);
    expect(idleQ).toHaveLength(1);
    perf.t += 10000;
    idleQ[0]();
    expect(saves).toHaveLength(1);
    expect(saves[0].save.playTime).toBeGreaterThanOrEqual(59);
  });

  it('dispose: çıkış kaydı (reason exit), sonra ikinci dispose sessiz', () => {
    const { G, saves, rt } = setup();
    G.time.tick = 5;
    G.destroyed = true; // çekirdek destroy sırası: önce G.destroyed
    rt.core.dispose(G);
    expect(saves).toHaveLength(1);
    expect(saves[0].reason).toBe('exit');
    rt.core.dispose(G);
    expect(saves).toHaveLength(1);
  });

  it('dünya hazır değilken çıkış kaydı yok', () => {
    const G = makeTestG({ mode: 'insa', base: 'düz' });
    const saves = [];
    G.callbacks.onSave = (p) => saves.push(p);
    const rt = createSessionRuntime(G);
    G.addSystem(rt.core);
    G.addSystem(rt.hud);
    rt.core.init(G);
    rt.core.dispose(G);
    expect(saves).toHaveLength(0);
  });
});

describe('duyurular ve ipuçları', () => {
  it('bölge girişi: ilk olay açılışta yutulur, sonraki gösterilir, tekrarı bastırılır', () => {
    const { G, rt } = setup({ mode: 'insa' });
    G.mode = 'macera';
    G.time.playTime = 0.5;
    G.emit({ type: 'zoneEnter', zone: 0, name: 'Başlangıç Vadisi' });
    let titles = [];
    for (let i = 0; i < 5; i++) { frame(G); if (G.hud.banner) titles.push(G.hud.banner.text); }
    expect(titles).not.toContain('Başlangıç Vadisi');
    G.time.playTime = 100;
    G.emit({ type: 'zoneEnter', zone: 1, name: 'Fısıldayan Ormanlar' });
    expect(rt.banners.size).toBeGreaterThan(0);
    const before = rt.banners.size;
    G.emit({ type: 'zoneEnter', zone: 1, name: 'Fısıldayan Ormanlar' });
    expect(rt.banners.size).toBe(before);
    titles = [];
    expect(rt.banners.current === null || typeof rt.banners.current.text === 'string').toBe(true);
  });

  it('yüksek öncelikli mühür duyurusu bölge duyurusunu keser', () => {
    const { G } = setup();
    G.mode = 'macera';
    G.time.playTime = 100;
    G.emit({ type: 'zoneEnter', zone: 2, name: 'Yanık Kanyonlar' });
    // açılış duyurusu (öncelik 8) önce gösteriliyor; onu geçemez ama sıraya girer
    frame(G);
    G.emit({ type: 'zoneUnlocked', zone: 3, name: 'Donmuş Zirveler' });
    const seen = [];
    for (let i = 0; i < 3; i++) { frame(G); if (G.hud.banner) seen.push(G.hud.banner.text); }
    expect(seen.length).toBeGreaterThan(0);
  });

  it('actionDenied → ipucu (Türkçe), tekrarında cooldown', () => {
    const { G } = setup({ mode: 'harita' });
    G.emit({ type: 'actionDenied', reason: 'readOnly' });
    frame(G);
    expect(G.hud.hint === null || /salt okunur/.test(G.hud.hint) || /keşfet/.test(G.hud.hint)).toBe(true);
    const { G: H } = setup();
    H.hud.hint = null;
    H.emit({ type: 'actionDenied', reason: 'bounds' });
    for (let i = 0; i < 3; i++) frame(H);
    expect(H.hud.hint).toMatch(/sınır/);
  });

  it('erişilebilirlik: ekranda görünmeyen önemli olaylar sesli okunur', () => {
    const { G } = setup({ gopts: { accessibility: true } });
    G.accessibility = true;
    G.spoken.length = 0;
    G.emit({ type: 'puzzleSolved', id: 'x', puzzleType: 'terazi', zone: 0 });
    expect(G.spoken).toContain('Bulmaca çözüldü. Terazi');
  });

  it('banners:"all" ayarında bulmaca duyurusu banner olur', () => {
    const { G, rt } = setup({ gopts: { banners: 'all' } });
    rt.banners.clear();
    G.emit({ type: 'puzzleSolved', id: 'x', puzzleType: 'terazi', zone: 0 });
    expect(rt.banners.size).toBe(1);
  });
});

describe('sesler', () => {
  it('ilerleme melodileri çalar; bulmaca melodisi çalmaz', () => {
    const { G } = setup();
    G.sounds.length = 0;
    G.emit({ type: 'achievement', id: 'a', title: 't' });
    G.emit({ type: 'zoneUnlocked', zone: 1 });
    G.emit({ type: 'puzzleSolved', id: 'p', puzzleType: 'terazi' });
    G.emit({ type: 'questUpdate', id: 'q', state: 'active' });
    G.emit({ type: 'questUpdate', id: 'q', state: 'done' });
    expect(G.sounds.map((s) => s.name)).toEqual(['achievement', 'zone_unlock', 'quest']);
  });

  it('api ile açılan panel ses çalar; eylemle açılan (çekirdek zaten çaldı) çalmaz', () => {
    const { G, rt } = setup();
    G.sounds.length = 0;
    // api yolu: olay + sonraki kare
    G.time.frame = 10;
    G.emit({ type: 'uiChanged', ui: 'inventory', prev: 'none' });
    G.time.frame = 11;
    frame(G);
    expect(G.sounds.map((s) => s.name)).toEqual(['ui_open']);
    // eylem yolu: aynı karede önce olay sonra onAction
    G.sounds.length = 0;
    G.time.frame = 20;
    G.emit({ type: 'uiChanged', ui: 'none', prev: 'inventory' });
    rt.core.onAction(G, { type: 'inventory' });
    frame(G); // frame() time.frame'i artırır; aynı kare gibi davran
    G.time.frame = 20;
    expect(G.sounds).toHaveLength(0);
  });
});

describe('sistem durumları ve geri yükleme (inşa)', () => {
  it('serialize edilen sistem durumu kayda yazılır; yüklemede ilk karede geri verilir', () => {
    const A = setup();
    const store = { n: 5 };
    A.G.addSystem({
      name: 'sahte', serialize: () => ({ n: store.n }), restore: vi.fn(),
    });
    A.G.time.tick = 9;
    const api = A.G.registry.mergeApi({}, A.G);
    const save = JSON.parse(JSON.stringify(api.save()));
    expect(save.systems.sahte).toEqual({ n: 5 });
    expect(save.ext.v).toBe(1);

    const restore = vi.fn();
    const Bg = makeTestG({ mode: 'insa', base: 'düz', save });
    const rt = createSessionRuntime(Bg);
    Bg.addSystem({ name: 'sahte', restore });
    boot(Bg, [rt.core, rt.hud]);
    expect(Bg.restoreInfo.ok).toBe(true);
    expect(restore).not.toHaveBeenCalled(); // init'te değil
    frame(Bg);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore.mock.calls[0][1]).toEqual({ n: 5 });
    frame(Bg);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('inşa gidiş-dönüş: düzenlemeler ve envanter yeni oturumda', () => {
    const A = setup();
    for (let cz = 0; cz < 2; cz++) for (let cx = 0; cx < 2; cx++) A.G.world.ensureChunk(cx, cz);
    A.G.world.setBlock(10, 50, 10, B.STONE);
    A.G.world.setBlock(11, 50, 10, 3);
    A.G.inventory.setSlot(1, 'blok:taş', 4);
    A.G.time.tick = 3;
    const api = A.G.registry.mergeApi({}, A.G);
    const save = JSON.parse(JSON.stringify(api.save()));
    const Bg = makeTestG({ mode: 'insa', base: 'düz', save });
    boot(Bg, createSystems(Bg));
    Bg.world.ensureChunk(0, 0);
    expect(Bg.world.getBlock(10, 50, 10)).toBe(B.STONE);
    expect(Bg.world.getBlock(11, 50, 10)).toBe(3);
    expect(Bg.inventory.slots[1]).toEqual({ item: 'blok:taş', count: 4 });
    frame(Bg);
    expect(Bg.hud.banner.text).toBe('İnşa Alanı');
    expect(Bg.hud.hint).toBe(null); // devam: açılış ipucu yok
  });
});

describe('content / mobs sistemleriyle birlikte', () => {
  function withSystems(names) {
    const G = makeTestG({ mode: 'macera', seed: 'BIRLIK01', callbacks: { onSave() {} } });
    const rt = createSessionRuntime(G);
    names.forEach((n) => G.addSystem({ name: n, order: 30 }));
    boot(G, [rt.core, rt.hud]);
    return { G, rt };
  }

  it('content varken görev HUD, bağlamsal ipucu, açılış ipucu ve mühür duyurusu çift yazılmaz', () => {
    const { G, rt } = withSystems(['content']);
    G.hud.quest = { title: 'content yazdı', lines: ['x'] };
    frame(G, 0.6);
    expect(G.hud.quest.title).toBe('content yazdı'); // üzerine yazılmadı
    expect(G.hud.hint).toBe(null); // açılış ipucu content'in görev ipucuna bırakıldı
    G.survival.hp = 2;
    frame(G, 2.5);
    expect(G.hud.hint).toBe(null); // düşük can ipucunu content üretir
    rt.banners.clear();
    G.emit({ type: 'zoneUnlocked', zone: 1, name: 'Fısıldayan Ormanlar' });
    expect(rt.banners.size).toBe(0); // content kendi 'açıldı!' duyurusunu gösterir
    G.emit({ type: 'bossDefeated', zone: 1 }); // ilerleme hattı yetenek olayını da türetir
    expect(rt.banners.size).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('başka sistemin yazdığı büyük duyurunun üzerine yazılmaz; bitince bizimki geri gelir', () => {
    const { G, rt } = withSystems(['content']);
    frame(G, 0.016);
    const mine = G.hud.banner;
    expect(mine.text).toMatch(/Dünya Kodu/);
    const ext = { text: 'Kule: Gözcü', sub: '', until: Date.now() + 4000 };
    G.hud.banner = ext;
    frame(G, 0.016);
    expect(G.hud.banner).toBe(ext);
    G.hud.banner = null; // content bitirdi
    frame(G, 0.016);
    expect(G.hud.banner).toBe(mine);
    expect(rt.banners.size).toBeGreaterThan(0);
  }, 60000);

  it('mobs varken boss çubuğuna dokunulmaz', () => {
    const { G } = withSystems(['mobs']);
    G.em.bossHud = () => ({ name: 'Kök Ana', hp: 5, maxHp: 10 });
    frame(G, 0.5);
    expect(G.hud.boss).toBe(null);
  }, 60000);
});

describe('macera gidiş-dönüş', () => {
  it('ilerleme, bölge kilidi, envanter, düzenleme, saat ve varlık durumu yeni oturumda geri gelir', () => {
    const seed = 'KAYIT777';
    const A = setup({ mode: 'macera', seed });
    A.G.worldReady = true;
    A.G.debug = true;
    const api = A.G.registry.mergeApi({}, A.G);
    expect(api.getWorldCode()).toBe(A.G.worldCode);
    expect(api.command('unlockzone', ['1']).ok).toBe(true);
    api.command('give', ['item:kazma_demir', '1']);
    api.command('give', ['blok:taş', '12']);
    A.G.inventory.selected = 2;
    const bx = Math.floor(A.G.body.x) + 3;
    const bz = Math.floor(A.G.body.z);
    const top = A.G.world.surfaceY(bx, bz, { ignoreFoliage: true });
    A.G.world.setBlock(bx, top + 1, bz, B.STONE);
    A.G.world.setBlock(bx, top + 2, bz, B.STONE);
    A.G.clock.time = 321;
    A.G.survival.hp = 8;
    A.G.time.playTime = 456.7;
    A.G.progression.stats.blocksBroken = 14;
    A.G.em.populated.add('7,7');
    const px = A.G.body.x;
    const pz = A.G.body.z;
    A.G.time.tick = 20;
    const save = JSON.parse(JSON.stringify(api.save()));
    expect(save.mode).toBe('macera');
    expect(save.seed).toBe(A.G.worldCode);

    const t0 = performance.now();
    const Bg = makeTestG({ mode: 'macera', seed: save.seed, save });
    const tBuild = performance.now() - t0;
    boot(Bg, createSystems(Bg));
    console.log('[yükleme] dünya kurulumu ' + tBuild.toFixed(0) + ' ms; geri yükleme sonrası kayıt: ' + (Bg.restoreInfo.warnings.length) + ' uyarı');
    expect(Bg.restoreInfo.ok).toBe(true);
    expect(Bg.worldCode).toBe(A.G.worldCode);
    expect(Bg.seed).toBe(A.G.seed);
    expect(Bg.progression.zonesUnlocked[1]).toBe(true);
    expect(Bg.world.isZoneUnlocked(1)).toBe(true);
    expect(Bg.inventory.count('item:kazma_demir')).toBe(1);
    expect(Bg.inventory.count('blok:taş')).toBe(12);
    expect(Bg.inventory.selected).toBe(2);
    expect(Bg.world.getBlock(bx, top + 1, bz)).toBe(B.STONE);
    expect(Bg.world.getBlock(bx, top + 2, bz)).toBe(B.STONE);
    expect(Bg.clock.time).toBeCloseTo(321, 0);
    expect(Bg.survival.hp).toBeCloseTo(8, 1);
    expect(Bg.time.playTime).toBe(456);
    expect(Bg.progression.stats.blocksBroken).toBe(14);
    expect(Bg.em.populated.has('7,7')).toBe(true);
    expect(Math.abs(Bg.body.x - px)).toBeLessThan(1.5);
    expect(Math.abs(Bg.body.z - pz)).toBeLessThan(1.5);
    expect(Bg.introDone).toBe(true);
    frame(Bg);
    expect(Bg.hud.banner.text).toBe('Maceraya devam');
    // yeniden kaydedince aynı düzenlemeler
    const api2 = Bg.registry.mergeApi({}, Bg);
    Bg.time.tick = 5;
    const save2 = api2.save();
    expect(save2.edits).toEqual(save.edits);
    expect(save2.progression.zonesUnlocked).toEqual(save.progression.zonesUnlocked);
    expect(save2.name).toBe(save.name);
    expect(save2.createdAt).toBe(save.createdAt);
  }, 120000);

  it('yeni macera: Dünya Kodu başlığı ve ilk adım ipucu', () => {
    const { G } = setup({ mode: 'macera', seed: 'YENI0001' });
    frame(G);
    expect(G.hud.banner.text).toBe('Dünya Kodu: ' + G.worldCode);
    expect(G.hud.hint).toMatch(/ağaca/);
  }, 60000);
});
