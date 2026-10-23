import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  indoor: null, owner: null, door: null, pad: null, clue: null, open: new Set(), bridge: null,
}));
vi.mock('./propIndoor.js', () => ({
  indoorAt: () => H.indoor,
  indoorAtProp: () => H.indoor,
  ownerAtProp: () => H.owner,
  doorLockOf: () => H.door,
  padLockOf: () => H.pad,
  clueDigitsOf: () => H.clue,
  isLockOpen: (l) => !l || l.kind === 'serbest' || H.open.has(l.id),
  markLockOpen: () => {},
  setLockBridge: () => {},
  getLockBridge: () => H.bridge,
  clearOpenedLocks: () => {},
  moodHueAt: () => null,
}));

const { PropWorld } = await import('./propWorld.js');
const { getPropBehavior, isEffect } = await import('./propBehaviors.js');
const { INTERIOR_BY_KEY, INTERIOR_DEFS } = await import('./propDefsInterior.js');
const { clearBehaviorMemo, PICKUP_ITEMS } = await import('./propBehaviorsInterior.js');
const { isSafeText } = await import('../city/citySafeData.js');
const { OWNER_BY_INTERIOR, ownerLine } = await import('../city/ownerData.js');
const { ITEMS } = await import('../items.js');

let seq = 100;
function world(keys, opts) {
  const o = opts || {};
  const props = keys.map((k, i) => {
    const d = INTERIOR_BY_KEY[k];
    return {
      id: o.baseId ? o.baseId + i : ++seq, t: d.t, x: 5.5 + i * 3, y: 64, z: 5.5, yaw: 0, variant: 0, flags: o.flags && o.flags[k] ? o.flags[k] : 0,
    };
  });
  const pw = new PropWorld({ citySeed: 1, planner: (s, cx, cz) => (cx === 0 && cz === 0 ? props : []) });
  pw.loadChunk(0, 0);
  return { pw, ids: props.map((p) => p.id) };
}
const msg = (fx) => (fx.find((e) => e.kind === 'message') || {}).text;

beforeEach(() => {
  H.indoor = null; H.owner = null; H.door = null; H.pad = null; H.clue = null; H.bridge = null; H.open.clear();
  clearBehaviorMemo();
});

describe('kayıt', () => {
  it('9 etkileşim türü kayıtlı; kalıcı olmayan türler volatile', () => {
    ['sit', 'open', 'toggle', 'read', 'buy', 'lockpad', 'elevator', 'dialog', 'pickup'].forEach((k) => expect(getPropBehavior(k)).not.toBeNull());
    ['sit', 'read', 'buy', 'elevator', 'dialog'].forEach((k) => expect(getPropBehavior(k).volatile).toBe(true));
    ['open', 'toggle', 'lockpad', 'pickup'].forEach((k) => expect(getPropBehavior(k).volatile).toBeFalsy());
  });
});

describe('sit', () => {
  it('oturma: propSeat olayı sonlu sayılarla; kapsül kapağı kapanır (durum 1) ve kaydedilmez', () => {
    const { pw, ids } = world(['sandalye', 'kapsul_yatak', 'yatak']);
    let fx = pw.use(ids[0], { x: 5.5, z: 7 });
    fx.forEach((e) => expect(isEffect(e)).toBe(true));
    const ev = fx.find((e) => e.kind === 'emit').evt;
    expect(ev.type).toBe('propSeat');
    expect(Number.isFinite(ev.x + ev.y + ev.z + ev.yaw + ev.eye)).toBe(true);
    expect(ev.pose).toBe('sit');
    expect(ev.closes).toBe(false);
    expect(isSafeText(msg(fx))).toBe(true);
    fx = pw.use(ids[1]);
    expect(fx.find((e) => e.kind === 'emit').evt.closes).toBe(true);
    expect(pw.state(ids[1])).toBe(1);
    expect(Object.keys(pw.serialize()).length).toBe(0);
    fx = pw.use(ids[2]);
    expect(fx.find((e) => e.kind === 'emit').evt.pose).toBe('lie');
    expect(msg(fx)).toMatch(/Uzandın/);
  });
});

describe('open — kapı', () => {
  const OUT = { x: 5.5, y: 64, z: 9 };

  it('kapalı → açık → kapalı; açıkken çarpışma kalkar, kapanınca döner; durum kaydedilir', () => {
    const { pw, ids } = world(['kapi']);
    const id = ids[0];
    expect(pw.colliders.has(id)).toBe(true);
    let fx = pw.use(id, OUT);
    expect(pw.state(id)).toBe(1);
    expect(pw.colliders.has(id)).toBe(false);
    expect(fx.some((e) => e.kind === 'sound' && e.name === 'prop:door')).toBe(true);
    const saved = pw.serialize();
    expect(Object.values(saved)).toEqual([[1, 0]]);
    fx = pw.use(id, OUT);
    expect(pw.state(id)).toBe(0);
    expect(pw.colliders.has(id)).toBe(true);
    expect(fx.some((e) => e.name === 'prop:door_shut')).toBe(true);
  });

  it('kapıdaki oyuncu varken kapanmaz (hapis/gömülme yok)', () => {
    const { pw, ids } = world(['kapi_genis']);
    const id = ids[0];
    pw.use(id, OUT);
    const fx = pw.use(id, { x: 5.5, y: 64, z: 5.5 });
    expect(pw.state(id)).toBe(1);
    expect(msg(fx)).toMatch(/aralığında/);
    expect(pw.colliders.has(id)).toBe(false);
  });

  it('kilitli kapı: dışarıdan {lock,try}, durum değişmez; çözülünce açılır; içeriden (kilitli odanın içinden) HER ZAMAN açılır', () => {
    const { pw, ids } = world(['kapi']);
    const id = ids[0];
    H.door = {
      lock: { id: 'k1', kind: 'kod', tier: 1 },
      door: {},
      back: {
        x0: 4, z0: 1, x1: 9, z1: 5, y0: 64, y1: 68,
      },
    };
    let fx = pw.use(id, OUT);
    expect(pw.state(id)).toBe(0);
    expect(fx.some((e) => e.kind === 'lock')).toBe(false); // panel cityLocks'ta (propUsed olayı)
    expect(fx.some((e) => e.name === 'prop:locked')).toBe(true);
    expect(isSafeText(msg(fx))).toBe(true);
    expect(pw.hint(id)).toBe('Kapı kilitli');
    // içeriden
    fx = pw.use(id, { x: 6, y: 64, z: 3 });
    expect(pw.state(id)).toBe(1);
    expect(msg(fx)).toMatch(/İçeriden/);
    pw.use(id, OUT);
    expect(pw.state(id)).toBe(0);
    // çözüldü
    H.open.add('k1');
    pw.use(id, OUT);
    expect(pw.state(id)).toBe(1);
    expect(pw.hint(id)).toMatch(/Kapat/);
  });

  it('kilit köprüsü varken kapılar OTOMATİKTİR: kullanım durumu değiştirmez (yaklaşma/kilit cityLocks\'ta), kilitliyse "kilitli" ve ipucu "Otomatik kapı"', () => {
    H.bridge = { isOpen: () => false };
    const { pw, ids } = world(['kapi', 'gizli_kapi_raf']);
    let fx = pw.use(ids[0], OUT);
    expect(pw.state(ids[0])).toBe(0);
    expect(msg(fx)).toMatch(/otomatik|yaklaş/i);
    expect(pw.hint(ids[0])).toBe('Otomatik kapı');
    H.door = { lock: { id: 'k9', kind: 'kod', tier: 1 }, door: {}, back: null };
    clearBehaviorMemo();
    fx = pw.use(ids[0], OUT);
    expect(pw.state(ids[0])).toBe(0);
    expect(fx.some((e) => e.name === 'prop:locked')).toBe(true);
    expect(pw.hint(ids[0])).toBe('Kapı kilitli');
    fx = pw.use(ids[1], OUT);
    expect(pw.state(ids[1])).toBe(0);
    expect(pw.hint(ids[1])).toMatch(/İncele/);
    // cityLocks kapıyı açınca (setState) çarpışma PropWorld'de kalkar
    pw.setState(ids[0], 1);
    expect(pw.colliders.has(ids[0])).toBe(false);
  });

  it('serbest kilitli kapı açılır; kilitler arasında yakın çözüm yok (kart/mini_hack da kilitli)', () => {
    const { pw, ids } = world(['kapi', 'kapi_genis']);
    H.door = { lock: { id: 's1', kind: 'serbest', tier: 0 }, door: {}, back: null };
    pw.use(ids[0], OUT);
    expect(pw.state(ids[0])).toBe(1);
    H.door = { lock: { id: 'c1', kind: 'kart', tier: 2 }, door: {}, back: null };
    pw.use(ids[1], OUT);
    expect(pw.state(ids[1])).toBe(0);
    H.door = { lock: { id: 'h1', kind: 'mini_hack', tier: 3 }, door: {}, back: null };
    clearBehaviorMemo();
    const { pw: pw2, ids: ids2 } = world(['kapi']);
    pw2.use(ids2[0], OUT);
    expect(pw2.state(ids2[0])).toBe(0);
  });

  it('gizli kapı (raf) açılır; ileti güvenli; açıkken çarpışma yok', () => {
    const { pw, ids } = world(['gizli_kapi_raf']);
    const fx = pw.use(ids[0], OUT);
    expect(pw.state(ids[0])).toBe(1);
    expect(pw.colliders.has(ids[0])).toBe(false);
    expect(isSafeText(msg(fx))).toBe(true);
  });

  it('kayıt geri yükleme: açık kapı yüklenince çarpışması yok; sıfır durumda var', () => {
    const { pw, ids } = world(['kapi']);
    pw.use(ids[0], OUT);
    const saved = JSON.parse(JSON.stringify(pw.serialize()));
    const { pw: pw2, ids: ids2 } = world(['kapi']);
    // aynı id: planlayıcı kimliği farklı olduğundan elle eşle
    const row = Object.values(saved)[0];
    pw2.restore({ [ids2[0].toString(36)]: row });
    expect(pw2.state(ids2[0])).toBe(1);
    expect(pw2.colliders.has(ids2[0])).toBe(false);
    pw2.restore({});
    expect(pw2.state(ids2[0])).toBe(0);
    expect(pw2.colliders.has(ids2[0])).toBe(true);
  });
});

describe('open — dolap / buzdolabı', () => {
  it('açılır/kapanır, açarken iç mekâna uygun ileti', () => {
    const { pw, ids } = world(['dolap', 'saglik_dolabi', 'buzdolabi', 'dolap_sirali', 'takim_dolabi']);
    ids.forEach((id) => {
      const fx = pw.use(id);
      expect(pw.state(id)).toBe(1);
      expect(isSafeText(msg(fx))).toBe(true);
      expect(msg(fx).length).toBeLessThanOrEqual(80);
      pw.use(id);
      expect(pw.state(id)).toBe(0);
    });
    pw.use(ids[0]);
    expect(pw.hint(ids[0])).toMatch(/^Kapat/);
    expect(pw.colliders.has(ids[0])).toBe(true); // dolap açılınca da yerinde durur
  });
});

describe('toggle', () => {
  it('güç döngüsü: holo ekran 0→1→2→0; iletiler güvenli', () => {
    const { pw, ids } = world(['holo_ekran', 'televizyon', 'cok_ekranli_masa']);
    const h = ids[0];
    const seen = [];
    for (let i = 0; i < 6; i++) {
      const fx = pw.use(h);
      seen.push(pw.state(h));
      expect(isSafeText(msg(fx))).toBe(true);
    }
    expect(seen).toEqual([1, 2, 0, 1, 2, 0]);
    pw.use(ids[1]);
    expect(pw.state(ids[1])).toBe(1);
    pw.use(ids[1]);
    expect(pw.state(ids[1])).toBe(0);
    expect(pw.hint(ids[2])).toMatch(/^Kapat/); // varsayılan açık
    pw.use(ids[2]);
    expect(pw.hint(ids[2])).toBe(INTERIOR_BY_KEY.cok_ekranli_masa.interact.prompt);
  });

  it('zamanlı cihazlar (duş/şarj/çay/robot kol/dron/tarayıcı/oyun): durum 1 → süre sonra 0; kayda girmez; meşgulken yeniden başlamaz', () => {
    const keys = ['dus_kabini', 'sarj_istasyonu', 'cay_ocagi', 'robot_kol', 'dron_istasyonu', 'tarayici_cihaz', 'arcade_makinesi'];
    const { pw, ids } = world(keys);
    ids.forEach((id, i) => {
      const d = INTERIOR_BY_KEY[keys[i]];
      const fx = pw.use(id);
      expect(pw.state(id), keys[i]).toBe(1);
      expect(isSafeText(msg(fx))).toBe(true);
      expect(Object.keys(pw.serialize()).length).toBe(0);
      const again = pw.use(id);
      expect(msg(again)).toMatch(/çalışıyor/);
      let outFx = [];
      for (let t = 0; t < (d.timed + 1) * 60; t++) outFx = outFx.concat(pw.tick(1 / 60));
      expect(pw.state(id), keys[i]).toBe(0);
      outFx.forEach((e) => expect(isEffect(e)).toBe(true));
    });
  });

  it('transient: boşaltma/yeniden yükleme durumu sıfırlar (stuck yok)', () => {
    const { pw, ids } = world(['dus_kabini']);
    pw.use(ids[0]);
    pw.unloadChunk(0, 0);
    pw.loadChunk(0, 0);
    expect(pw.state(ids[0])).toBe(0);
  });

  it('katlanır masa: katlayınca çarpışma kalkar (yürüyüş açılır), açınca döner', () => {
    const { pw, ids } = world(['katlanir_masa']);
    expect(pw.colliders.has(ids[0])).toBe(true);
    pw.use(ids[0]);
    expect(pw.state(ids[0])).toBe(1);
    expect(pw.colliders.has(ids[0])).toBe(false);
    expect(pw.hint(ids[0])).toBe('Masayı aç');
    pw.use(ids[0]);
    expect(pw.colliders.has(ids[0])).toBe(true);
  });

  it('DJ standı üç parça döngüsü; kalıcı durum kaydedilir ve geri gelir', () => {
    const { pw, ids } = world(['dj_standi']);
    pw.use(ids[0]);
    pw.use(ids[0]);
    expect(pw.state(ids[0])).toBe(2);
    const s = JSON.parse(JSON.stringify(pw.serialize()));
    pw.restore({});
    expect(pw.state(ids[0])).toBe(0);
    pw.restore(s);
    expect(pw.state(ids[0])).toBe(2);
  });
});

describe('read', () => {
  it('tüm okunur tanımlar güvenli, ≤ 120 karakter ileti üretir; sayaç değişken metin verir; kaydedilmez', () => {
    const keys = INTERIOR_DEFS.filter((d) => d.interact && d.interact.kind === 'read').map((d) => d.key);
    expect(keys.length).toBeGreaterThanOrEqual(11);
    const { pw, ids } = world(keys);
    ids.forEach((id, i) => {
      const seen = new Set();
      for (let n = 0; n < 12; n++) {
        const fx = pw.use(id);
        fx.forEach((e) => expect(isEffect(e)).toBe(true));
        const m = msg(fx);
        expect(m, keys[i]).toBeTruthy();
        expect(isSafeText(m), keys[i] + ': ' + m).toBe(true);
        expect(m.length, keys[i]).toBeLessThanOrEqual(120);
        seen.add(m);
      }
      if (['kitaplik', 'sanat', 'sovale', 'tuval'].indexOf(keys[i]) >= 0 || keys[i] === 'kitap_yigini') expect(seen.size, keys[i]).toBeGreaterThan(3);
    });
    expect(Object.keys(pw.serialize()).length).toBe(0);
  });

  it('bilgi terminali iç mekân türüne uygun; kod notu rakamları ve ipucu kilidi efekti', () => {
    const { pw, ids } = world(['bilgi_terminali', 'kod_notu', 'ilan_panosu']);
    H.indoor = { kind: 'klinik', it: { clues: [] }, owner: null };
    expect(msg(pw.use(ids[0]))).toMatch(/Klinik/);
    H.clue = [3, 5, 1, 4];
    H.indoor = {
      kind: 'garaj_atolyesi',
      it: { clues: [{ x: 5.5 + 3, y: 64, z: 5.5, lockId: 'garaj1' }] },
      owner: null,
    };
    let fx = pw.use(ids[1]);
    expect(msg(fx)).toMatch(/3 - 5 - 1 - 4/);
    expect(fx.some((e) => e.kind === 'lock')).toBe(false); // kilit paneli ipucu okurken açılmaz
    fx = pw.use(ids[2]);
    expect(msg(fx)).toMatch(/Kenarda zar yüzleri: 3 - 5 - 1 - 4/);
    H.clue = null;
    clearBehaviorMemo();
    const { pw: pw3, ids: ids3 } = world(['kod_notu']);
    expect(isSafeText(msg(pw3.use(ids3[0])))).toBe(true);
  });
});

describe('buy / dialog / pet', () => {
  it('tezgâh: sahibin selamı + openUi vendor; otomat: otomat satıcısı', () => {
    const { pw, ids } = world(['ramen_tezgahi', 'otomat_icecek']);
    H.owner = OWNER_BY_INTERIOR.ramen_bari;
    let fx = pw.use(ids[0]);
    expect(msg(fx)).toContain(OWNER_BY_INTERIOR.ramen_bari.name);
    const ui = fx.find((e) => e.kind === 'openUi');
    expect(ui.ui).toBe('vendor');
    expect(ui.vendor).toBe('usta_selvi');
    expect(ui.counter).toBe('ramen_tezgahi');
    fx = pw.use(ids[1]);
    expect(fx.find((e) => e.kind === 'openUi').vendor).toBe('otomat');
    expect(isSafeText(msg(fx))).toBe(true);
    H.owner = null;
    fx = pw.use(ids[0]);
    expect(fx.find((e) => e.kind === 'openUi').vendor).toBe('otomat');
  });

  it('sahip konuşması: selam, sohbet, ipucu, veda sırası; yağmur/gece varyantı; {dialog} efekti; sahip yoksa yedek', () => {
    const { pw, ids } = world(['robot_doktor_istasyonu', 'kurye_tezgahi']);
    H.owner = OWNER_BY_INTERIOR.klinik;
    const lines = [];
    for (let i = 0; i < 4; i++) {
      const fx = pw.use(ids[0], null);
      lines.push(msg(fx));
      expect(fx.find((e) => e.kind === 'dialog').npc).toBe('dr_bolt');
      expect(isSafeText(msg(fx))).toBe(true);
      expect(msg(fx).length).toBeLessThanOrEqual(90);
    }
    expect(lines[0]).toContain(ownerLine(OWNER_BY_INTERIOR.klinik, 'selam'));
    expect(lines[1]).toContain(ownerLine(OWNER_BY_INTERIOR.klinik, 'sohbet'));
    expect(lines[2]).toContain(ownerLine(OWNER_BY_INTERIOR.klinik, 'ipucu'));
    expect(lines[3]).toContain(ownerLine(OWNER_BY_INTERIOR.klinik, 'veda'));
    pw.use(ids[1]);
    pw.use(ids[1]);
    expect(msg(pw.use(ids[1], { rain: true }))).toContain(ownerLine(OWNER_BY_INTERIOR.klinik, 'yagmur'));
    expect(msg(pw.use(ids[1], { night: true }))).toContain(ownerLine(OWNER_BY_INTERIOR.klinik, 'gece'));
    H.owner = null;
    const fx = pw.use(ids[1]);
    expect(isSafeText(msg(fx))).toBe(true);
    expect(fx.find((e) => e.kind === 'dialog')).toBeUndefined();
  });

  it('robot kedi / mini robot: değişken güvenli satırlar', () => {
    const { pw, ids } = world(['robot_kedi', 'mini_robot']);
    ids.forEach((id) => {
      const seen = new Set();
      for (let i = 0; i < 12; i++) {
        const m = msg(pw.use(id));
        expect(isSafeText(m)).toBe(true);
        seen.add(m);
      }
      expect(seen.size).toBeGreaterThan(2);
    });
  });
});

describe('lockpad / elevator / pickup', () => {
  it('kilit düzeneği: {lock,pad}; çözülmüşse durum 1; bayat soğuma ışığı 0\'a döner; kilitsiz düzenek güvenli', () => {
    const { pw, ids } = world(['kod_paneli', 'kart_okuyucu', 'hack_terminali']);
    H.pad = { lock: { id: 'p1', kind: 'kod', tier: 1 }, door: {} };
    let fx = pw.use(ids[0]);
    expect(fx.some((e) => e.kind === 'lock')).toBe(false); // panel cityLocks'ta (propUsed)
    expect(isSafeText(msg(fx))).toBe(true);
    pw.setState(ids[0], 2);
    fx = pw.use(ids[0]);
    expect(pw.state(ids[0])).toBe(0); // köprü yok: bayat soğuma ışığı sıfırlanır
    H.bridge = { isOpen: () => false };
    pw.setState(ids[0], 2);
    pw.use(ids[0]);
    expect(pw.state(ids[0])).toBe(2); // köprü varken soğumayı kilit sistemi yönetir
    H.bridge = null;
    pw.setState(ids[0], 0);
    H.open.add('p1');
    fx = pw.use(ids[0]);
    expect(pw.state(ids[0])).toBe(1);
    expect(fx.find((e) => e.kind === 'lock')).toBeUndefined();
    expect(pw.hint(ids[0])).toMatch(/çözüldü/);
    H.pad = null;
    clearBehaviorMemo();
    fx = pw.use(ids[1]);
    expect(fx.find((e) => e.kind === 'lock')).toBeUndefined();
    expect(isSafeText(msg(fx))).toBe(true);
    fx = pw.use(ids[2]);
    expect(msg(fx)).toMatch(/Terminal/);
  });

  it('asansör düğmesi: elevatorCall olayı; 3 sn sonra söner; kaydedilmez; çift basış yutulur', () => {
    const { pw, ids } = world(['asansor_dugmesi']);
    const fx = pw.use(ids[0]);
    const ev = fx.find((e) => e.kind === 'emit').evt;
    expect(ev.type).toBe('elevatorCall');
    expect(ev.id).toBe(ids[0]);
    expect(pw.state(ids[0])).toBe(1);
    expect(pw.use(ids[0])).toEqual([]);
    expect(pw.hint(ids[0])).toMatch(/yolda/);
    for (let i = 0; i < 200; i++) pw.tick(1 / 60);
    expect(pw.state(ids[0])).toBe(0);
    expect(Object.keys(pw.serialize()).length).toBe(0);
  });

  it('asansör düğmesi, kilit köprüsü varken durumu değiştirmez (cityLocks yönetir) ama olayı yayar', () => {
    H.bridge = { isOpen: () => false };
    const { pw, ids } = world(['asansor_dugmesi']);
    const fx = pw.use(ids[0]);
    expect(fx.find((e) => e.kind === 'emit').evt.type).toBe('elevatorCall');
    expect(pw.state(ids[0])).toBe(0);
    expect(fx.some((e) => e.kind === 'message')).toBe(false);
  });

  it('pickup: ilk kullanımda eşya verir (var olan eşya), ikinci kez boş; kalıcı', () => {
    PICKUP_ITEMS.forEach((k) => expect(ITEMS[k], k).toBeTruthy());
    // pickup kullanan katalog tanımı yok: davranış doğrudan sınanır
    const b = getPropBehavior('pickup');
    const ctx = { time: 0, seed: 1, def: null, world: null };
    const p = {
      id: 9, t: 13, x: 0, y: 0, z: 0, yaw: 0, variant: 0, flags: 0,
    };
    const st = { state: 0, rflags: 0, extra: undefined, tmp: null };
    const r = b.onUse(ctx, p, st, null);
    expect(r.state).toBe(1);
    expect(r.effects.find((e) => e.kind === 'giveItem').item).toBe(PICKUP_ITEMS[0]);
    const r2 = b.onUse(ctx, p, { state: 1, rflags: 0, extra: undefined, tmp: null }, null);
    expect(r2.state).toBeUndefined();
    expect(r2.effects.some((e) => e.kind === 'giveItem')).toBe(false);
  });
});

describe('genel', () => {
  it('her etkileşimli iç mekân tanımı kullanılabilir: hata fırlatmaz, her efekt geçerli, ileti güvenli', () => {
    H.owner = OWNER_BY_INTERIOR.market;
    H.indoor = { kind: 'market', it: { clues: [] }, owner: H.owner };
    const defs = INTERIOR_DEFS.filter((d) => d.interact);
    const { pw, ids } = world(defs.map((d) => d.key));
    ids.forEach((id, i) => {
      for (let n = 0; n < 5; n++) {
        let fx;
        expect(() => { fx = pw.use(id, { x: 5.5, y: 64, z: 9, night: n % 2 === 0, rain: n % 3 === 0 }); }, defs[i].key).not.toThrow();
        fx.forEach((e) => expect(isEffect(e), defs[i].key).toBe(true));
        const m = msg(fx);
        if (m) expect(isSafeText(m), defs[i].key + ': ' + m).toBe(true);
      }
      expect(typeof pw.hint(id)).toBe('string');
    });
    for (let t = 0; t < 900; t++) pw.tick(1 / 60);
    const fx = pw.tick(1 / 60);
    expect(Array.isArray(fx)).toBe(true);
  });

  it('belirlenimci: aynı kullanım dizisi aynı efektleri üretir', () => {
    const run = () => {
      const { pw, ids } = world(['kitaplik', 'holo_ekran', 'buzdolabi', 'robot_kedi'], { baseId: 5000 });
      const out = [];
      for (let i = 0; i < 12; i++) ids.forEach((id) => out.push(JSON.stringify(pw.use(id).map((e) => Object.assign({}, e, { id: 0 })))));
      return out.join('|').replace(/"id":\d+/g, '');
    };
    expect(run()).toBe(run());
  });
});
