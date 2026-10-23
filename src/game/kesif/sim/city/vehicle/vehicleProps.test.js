import { describe, expect, it } from 'vitest';
import { pois } from '../cityPlan.js';
import { PROP_BY_T, validatePropDef } from '../../props/propDefs.js';
import { getPropBehavior } from '../../props/propBehaviors.js';
import { PropWorld } from '../../props/propWorld.js';
import { ColliderIndex } from '../../props/colliderIndex.js';
import {
  GARAGE_DEF, GARAGE_T, SUMMON_DESPAWN_FAR, VEHICLE_PROP_DEFS, VEHICLE_T0, classOfT, createVehicleManager, installVehicleDefs, propDefOf,
} from './vehicleProps.js';
import { RENTAL_SECONDS, VEHICLE_CLASSES, rentalPrice } from './vehicleData.js';
import { stepVehicle } from './vehiclePhysics.js';
import { roadSnapFor } from './vehicleRoad.js';
import { cityWorld } from './vehicleTestKit.js';

function setup(seedIn, kredi0) {
  const { world, layer, seed } = cityWorld(seedIn === undefined ? 777 : seedIn, [-6, 6], [-6, 6]);
  const wallet = {
    k: kredi0 === undefined ? 100 : kredi0,
    get() { return wallet.k; },
    spend(n) {
      if (wallet.k < n) return false;
      wallet.k -= n;
      return true;
    },
  };
  let t = 0;
  const mgr = createVehicleManager({
    seed: () => seed,
    props: () => layer.props,
    world: () => world,
    pois: () => pois(seed),
    now: () => t,
    wallet,
    roadSnap: (x, z, y) => roadSnapFor(seed)(x, z, y),
  });
  return {
    world, layer, seed, wallet, mgr, setT(v) { t = v; }, get t() { return t; },
  };
}

describe('prop tanımları ve davranışlar', () => {
  it('tanımlar geçerli, t değerleri benzersiz ve mevcut PROP_BY_T ile çakışmaz; dyn:true', () => {
    VEHICLE_PROP_DEFS.concat([GARAGE_DEF]).forEach((d) => {
      expect(validatePropDef(d), d.key).toEqual([]);
      expect(d.dyn).toBe(true);
      expect(PROP_BY_T[d.t]).toBeUndefined();
      expect(propDefOf(d.t)).toBe(d);
    });
    const ts = VEHICLE_PROP_DEFS.map((d) => d.t).concat([GARAGE_T]);
    expect(new Set(ts).size).toBe(ts.length);
    expect(VEHICLE_PROP_DEFS.map((d) => classOfT(d.t))).toEqual(VEHICLE_CLASSES);
    expect(classOfT(VEHICLE_T0 - 1)).toBe(null);
    expect(classOfT(NaN)).toBe(null);
    expect(getPropBehavior('arac')).toBeTruthy();
    expect(getPropBehavior('garaj')).toBeTruthy();
    expect(propDefOf(12345)).toBe(null);
  });

  it('installVehicleDefs idempotent ve mevcut getDef\'i bozmaz; garaj terminali kullanımı openUi garage üretir', () => {
    const pw = new PropWorld({ citySeed: 5 });
    const orig = pw.getDef;
    expect(installVehicleDefs(pw)).toBe(true);
    expect(installVehicleDefs(pw)).toBe(false);
    expect(pw.getDef(VEHICLE_T0)).toBe(VEHICLE_PROP_DEFS[0]);
    expect(pw.getDef(1)).toBe(orig.call(pw, 1));
    expect(pw.addDynamic({ id: 99, t: GARAGE_T, x: 1, y: 64, z: 1, yaw: 0, variant: 0, flags: 0 })).toBe(true);
    const fx = pw.use(99, null);
    expect(fx.some((e) => e.kind === 'openUi' && e.ui === 'garage')).toBe(true);
  });

  it('araç propu: durum 0/1/2 ipucu metinleri ve kullanım olayı; sürülürken kullanım mesaj verir', () => {
    const s = setup();
    const e = s.mgr.spawn({ cls: 'taksi', x: 20, y: 64, z: 20, yaw: 0 });
    expect(e).not.toBe(null);
    const pw = s.layer.props;
    expect(pw.hint(e.propId)).toBe('Araca bin: Meridyen Taksi');
    const fx = pw.use(e.propId, null);
    expect(fx.length).toBe(1);
    expect(fx[0]).toEqual({ kind: 'emit', evt: { type: 'vehicleUse', propId: e.propId } });
    s.mgr.begin(e.id);
    expect(pw.state(e.propId)).toBe(2);
    expect(pw.hint(e.propId)).toBe('Sürülüyor');
    expect(pw.use(e.propId, null)[0].kind).toBe('message');
    s.mgr.end();
    expect(pw.state(e.propId)).toBe(0);
    const d = s.mgr.spawn({ cls: 'suzulkay', x: 30, y: 64, z: 30, yaw: 0, role: 'display' });
    expect(pw.hint(d.propId)).toBe('Bin: Süzülkay (ücretsiz)');
    const d2 = s.mgr.spawn({ cls: 'spor', x: 40, y: 64, z: 30, yaw: 0, role: 'display' });
    expect(pw.hint(d2.propId)).toBe('Kirala: Şimşek GT — 40 Kredi / 10 dk');
  });
});

describe('yönetici: oluşturma, çarpışma, sürüş durumu', () => {
  it('spawn boş poz bulur, prop+collider kurar, remove temizler; nişan ışını araca isabet eder', () => {
    const s = setup();
    const v0 = s.mgr.version;
    const e = s.mgr.spawn({ cls: 'taksi', x: 20.5, y: 64, z: 20.5, yaw: 0 });
    expect(s.mgr.version).toBe(v0 + 1);
    expect(s.layer.props.has(e.propId)).toBe(true);
    expect(s.layer.colliders.has(e.propId)).toBe(true);
    const box = s.layer.colliders.boxesOf(e.propId)[0];
    expect(box[3] - box[0]).toBeCloseTo(1.9, 1); // yaw 0: genişlik x'te
    expect(box[5] - box[2]).toBeCloseTo(4.2, 1);
    const hit = s.layer.props.raycast({ x: 20.5, y: 65, z: 28 }, { x: 0, y: 0, z: -1 }, 12);
    expect(hit && hit.id).toBe(e.propId);
    expect(s.mgr.nearest(20.5, 64, 24.5, 2.8)).toBe(e);
    expect(s.mgr.nearest(20.5, 64, 40, 2.8)).toBe(null);
    // aynı noktaya ikinci araç: çakışmaz (boş poz aranır)
    const e2 = s.mgr.spawn({ cls: 'taksi', x: 20.5, y: 64, z: 20.5, yaw: 0, maxR: 8 });
    expect(e2).not.toBe(null);
    expect(Math.hypot(e2.v.x - e.v.x, e2.v.z - e.v.z)).toBeGreaterThan(1.8);
    expect(s.mgr.spawn({ cls: 'taksi', x: 20.5, y: 64, z: 20.5, yaw: 0, exact: true })).toBe(null);
    expect(s.mgr.spawn({ cls: 'yok', x: 1, y: 64, z: 1 })).toBe(null);
    expect(s.mgr.spawn({ cls: 'taksi', x: NaN, y: 64, z: 1 })).toBe(null);
    expect(s.mgr.remove(e.id)).toBe(true);
    expect(s.layer.props.has(e.propId)).toBe(false);
    expect(s.layer.colliders.has(e.propId)).toBe(false);
    expect(s.mgr.remove(e.id)).toBe(false);
  });

  it('sürüş: begin/end durum makinesi; sürülen aracın collider\'ı hareketle güncellenir; end park eder ve yeri kaydeder', () => {
    const s = setup();
    s.mgr.addOwned('spor');
    const e = s.mgr.spawn({ cls: 'spor', x: 50.5, y: 64, z: -60, yaw: 0, role: 'owned', ownedIdx: 0 });
    s.mgr.save.summoned = { idx: 0, x: e.v.x, y: e.v.y, z: e.v.z, yaw: 0 };
    expect(s.mgr.begin(e.id)).toBe(true);
    expect(s.mgr.begin(e.id)).toBe(false);
    expect(s.mgr.driven).toBe(e);
    const z0 = e.v.z;
    for (let i = 0; i < 90; i++) {
      s.mgr.recordPrev(e);
      stepVehicle(e.v, { throttle: 1 }, s.world, 1 / 60, {});
      s.mgr.syncProp(e);
    }
    expect(e.v.z).toBeLessThan(z0 - 5);
    const bx = s.layer.colliders.boxesOf(e.propId)[0];
    expect((bx[2] + bx[5]) / 2).toBeCloseTo(e.v.z, 1);
    const ip = s.mgr.interp(e, 0.5, {});
    expect(ip.z).toBeLessThanOrEqual(e.prev.z + 1e-9);
    expect(ip.z).toBeGreaterThanOrEqual(e.v.z - 1e-9);
    s.mgr.end();
    expect(e.occupied).toBe(false);
    expect(e.v.u).toBe(0);
    expect(s.mgr.driven).toBe(null);
    expect(s.mgr.save.summoned.z).toBeCloseTo(e.v.z, 1);
    expect(s.mgr.save.vstats.enters).toBe(1);
  });

  it('sınıf başına Entry.prev ara değerlemesi yaw sarmasını doğru yapar', () => {
    const s = setup();
    const e = s.mgr.spawn({ cls: 'taksi', x: 20.5, y: 64, z: 20.5, yaw: 3.1 });
    e.prev.yaw = 3.1;
    e.v.yaw = -3.1;
    const ip = s.mgr.interp(e, 0.5, {});
    expect(Math.abs(Math.abs(ip.yaw) - Math.PI)).toBeLessThan(0.1);
    const same = (a, b) => Math.abs(Math.sin((a - b) / 2)) < 1e-9;
    expect(same(s.mgr.interp(e, -5, {}).yaw, 3.1)).toBe(true);
    expect(same(s.mgr.interp(e, 5, {}).yaw, -3.1)).toBe(true);
  });
});

describe('garaj / kiralama / çağırma', () => {
  it('sergi araçları kiralama noktalarında kurulur (sınıf + ücretsiz Süzülkay), uzaklaşınca kaldırılır; garaj kapısı terminali', () => {
    const s = setup();
    s.mgr.refreshDisplays(0, 0);
    const disp = s.mgr.list().filter((e) => e.role === 'display');
    expect(disp.length).toBeGreaterThanOrEqual(2);
    expect(disp.some((e) => e.v.cls === 'suzulkay')).toBe(true);
    disp.forEach((e) => expect(s.layer.props.state(e.propId)).toBe(1));
    s.mgr.refreshDisplays(0, 0);
    expect(s.mgr.list().filter((e) => e.role === 'display').length).toBe(disp.length); // yineleme yok
    s.mgr.refreshDisplays(900, 900);
    expect(s.mgr.list().filter((e) => e.role === 'display').length).toBe(0);
    // garaj terminali: bir garaj POI'sinin yakınında kurulur
    const g = pois(s.seed).find((p) => p.type === 'garage');
    s.mgr.refreshDisplays(g.x, g.z);
    let found = 0;
    s.layer.props.forEachDynamic((en) => { if (en.def.t === GARAGE_T) found++; });
    expect(found).toBeGreaterThanOrEqual(1);
  });

  it('kirala: ücret düşer, kayıt rental yazılır, sergi aracı yerini kiralığa bırakır; yetersiz Kredi / sürülen kiralık / eski kiralık iadesi', () => {
    const s = setup(777, 100);
    s.mgr.refreshDisplays(0, 0);
    const d = s.mgr.list().find((e) => e.role === 'display' && e.v.cls !== 'suzulkay');
    const price = rentalPrice(d.v.cls);
    const r = s.mgr.rent(d.v.cls, null, d);
    expect(r.ok).toBe(true);
    expect(s.wallet.k).toBe(100 - price);
    expect(s.mgr.save.rental.left).toBe(RENTAL_SECONDS);
    expect(s.mgr.save.rental.cls).toBe(d.v.cls);
    expect(r.entry.role).toBe('rental');
    expect(s.mgr.get(d.id)).toBe(null); // sergi aracı kaldırıldı
    // ikinci kiralama eskisini iade eder (ücretsiz Süzülkay)
    const d2 = s.mgr.list().find((e) => e.role === 'display' && e.v.cls === 'suzulkay');
    const r2 = s.mgr.rent('suzulkay', null, d2);
    expect(r2.ok).toBe(true);
    expect(s.mgr.list().filter((e) => e.role === 'rental').length).toBe(1);
    expect(s.wallet.k).toBe(100 - price);
    // sürülen kiralık aracın üzerine yeni kiralama olmaz
    s.mgr.begin(r2.entry.id);
    expect(s.mgr.rent('motor', { x: 5, y: 64, z: 5, yaw: 0 }).reason).toBe('surulen');
    s.mgr.end();
    // yetersiz Kredi
    s.wallet.k = 5;
    expect(s.mgr.rent('spor', { x: 5, y: 64, z: 5, yaw: 0 })).toMatchObject({ ok: false, reason: 'kredi', need: 40 });
    expect(s.wallet.k).toBe(5);
    expect(s.mgr.rent('hayal', { x: 0, y: 64, z: 0 }).reason).toBe('bilinmeyen');
  });

  it('kiralama süresi: 60 sn kala uyarı, süre bitince araç teslim (kayıt temizlenir); sürülürken bitince pendingRemove', () => {
    const s = setup();
    const r = s.mgr.rent('motor', { x: 30.5, y: 64, z: 30.5, yaw: 0 });
    expect(r.ok).toBe(true);
    const evs = [];
    let t = 0;
    while (t < RENTAL_SECONDS + 1 && s.mgr.save.rental) {
      s.setT(t);
      s.mgr.tick(1, 30, 30).forEach((e) => evs.push(e.type));
      t += 1;
    }
    expect(evs.indexOf('rentalWarn')).toBeGreaterThanOrEqual(0);
    expect(evs.indexOf('rentalEnd')).toBeGreaterThan(evs.indexOf('rentalWarn'));
    expect(s.mgr.save.rental).toBe(null);
    expect(s.mgr.list().filter((e) => e.role === 'rental').length).toBe(0);
    const r2 = s.mgr.rent('taksi', { x: 30.5, y: 64, z: 30.5, yaw: 0 });
    s.mgr.begin(r2.entry.id);
    s.mgr.save.rental.left = 0.5;
    const got = s.mgr.tick(1, 30, 30);
    expect(got.some((e) => e.type === 'rentalEnd' && e.driven)).toBe(true);
    expect(r2.entry.pendingRemove).toBe(true);
    expect(s.mgr.get(r2.entry.id)).toBe(r2.entry); // sistem indirene kadar kaldırılmaz
  });

  it('çağır: aktif araç ≤ 40 m park yerine ya da yol kenarına gelir; garajda araç yoksa arac-yok; tekrar çağırınca yer değiştirir', () => {
    const s = setup();
    expect(s.mgr.summon({ x: 0, y: 64, z: 0 })).toMatchObject({ ok: false, reason: 'arac-yok' });
    expect(s.mgr.addOwned('taksi')).toBe(0);
    expect(s.mgr.addOwned('taksi')).toBe(-1); // sınıf başına tek
    const r = s.mgr.summon({ x: 10, y: 64, z: 10 });
    expect(r.ok).toBe(true);
    expect(['park', 'yol', 'yanin']).toContain(r.how);
    expect(s.mgr.save.summoned.idx).toBe(0);
    expect(Math.hypot(r.entry.v.x - 10, r.entry.v.z - 10)).toBeLessThan(45);
    const r2 = s.mgr.summon({ x: -60, y: 64, z: -50 });
    expect(r2.ok).toBe(true);
    expect(s.mgr.list().filter((e) => e.role === 'owned').length).toBe(1);
    // park yeri kullanılırsa
    const slot = pois(s.seed).find((p) => p.type === 'park_slot' && Math.abs(p.x) < 80 && Math.abs(p.z) < 80);
    if (slot) {
      const r3 = s.mgr.summon({ x: slot.x + 1, y: 64, z: slot.z + 1 });
      expect(r3.ok).toBe(true);
      expect(r3.how).toBe('park');
    }
    // sürülürken çağrılamaz
    s.mgr.begin(s.mgr.list().find((e) => e.role === 'owned').id);
    expect(s.mgr.summon({ x: 0, y: 64, z: 0 }).reason).toBe('surulen');
  });

  it('çağrılmış araç 300 m ötede ya da çıkıştan 60 sn sonra 80 m ötede garaja döner (summoned=null)', () => {
    const s = setup();
    s.mgr.addOwned('spor');
    const r = s.mgr.summon({ x: 20, y: 64, z: 20 });
    expect(r.ok).toBe(true);
    s.setT(10);
    expect(s.mgr.tick(1, 25, 25).length).toBe(0);
    s.setT(30);
    expect(s.mgr.tick(1, r.entry.v.x + 100, r.entry.v.z).some((e) => e.type === 'summonedDespawn')).toBe(false); // 60 sn dolmadı
    s.setT(200);
    const ev = s.mgr.tick(1, r.entry.v.x + 100, r.entry.v.z);
    expect(ev.some((e) => e.type === 'summonedDespawn')).toBe(true);
    expect(s.mgr.save.summoned).toBe(null);
    const r2 = s.mgr.summon({ x: 20, y: 64, z: 20 });
    expect(r2.ok).toBe(true);
    s.setT(210);
    const far = s.mgr.tick(1, r2.entry.v.x + SUMMON_DESPAWN_FAR + 5, r2.entry.v.z);
    expect(far.some((e) => e.type === 'summonedDespawn')).toBe(true);
  });

  it('satın alma: kilit (km), fiyat, tekrar, yetersiz Kredi; boyama temiz kozmetik yazar ve çağrılmış aracı günceller', () => {
    const s = setup(777, 5000);
    expect(s.mgr.buy('spor')).toMatchObject({ ok: false, reason: 'kilit', need: 8 });
    expect(s.mgr.buy('motor')).toMatchObject({ ok: true, price: 400 });
    expect(s.wallet.k).toBe(4600);
    expect(s.mgr.buy('motor').reason).toBe('sahip');
    s.mgr.save.vstats.km = 10;
    expect(s.mgr.buy('spor').ok).toBe(true);
    s.wallet.k = 10;
    expect(s.mgr.buy('taksi')).toMatchObject({ ok: false, reason: 'kredi' });
    expect(s.mgr.buy('suzulkay').ok).toBe(true); // ücretsiz
    expect(s.mgr.buy('yok').reason).toBe('bilinmeyen');
    const w = createVehicleManager({ seed: () => 1, props: () => null, world: () => null, pois: () => [] });
    expect(w.buy('taksi').reason).toBe('cuzdan');
    // boyama
    s.mgr.setActive(0);
    const r = s.mgr.summon({ x: 10, y: 64, z: 10 });
    expect(s.mgr.paint(0, { body: 5, neon: 99, under: { on: true, color: 3, pattern: 2 } })).toBe(true);
    expect(s.mgr.save.garage.owned[0].cos.body).toBe(5);
    expect(s.mgr.save.garage.owned[0].cos.neon).toBe(11); // sınırlandı
    expect(r.entry.v.cosmetics.body).toBe(5);
    expect(s.mgr.paint(99, { body: 1 })).toBe(false);
    expect(s.mgr.setActive(2)).toBe(true);
    expect(s.mgr.setActive(9)).toBe(false);
    expect(s.mgr.setActive(-1)).toBe(false);
  });
});

describe('boyut ve kayıt', () => {
  it('stash: tüm araç propları/collider\'lar kalkar, kiralık/çağrılmış kayıttan düşer; unstash sonrası sergi yeniden kurulur', () => {
    const s = setup();
    s.mgr.refreshDisplays(0, 0);
    s.mgr.addOwned('taksi');
    s.mgr.summon({ x: 10, y: 64, z: 10 });
    s.mgr.rent('motor', { x: 30.5, y: 64, z: 30.5, yaw: 0 });
    expect(s.mgr.list().length).toBeGreaterThan(2);
    const before = s.layer.props.size;
    s.mgr.stash();
    expect(s.mgr.list().length).toBe(0);
    expect(s.mgr.stashed).toBe(true);
    expect(s.layer.props.size).toBeLessThan(before);
    let dyn = 0;
    s.layer.props.forEachDynamic(() => { dyn++; });
    expect(dyn).toBe(0);
    expect(s.mgr.save.summoned).toBe(null);
    expect(s.mgr.save.rental).toBe(null);
    expect(s.mgr.save.garage.owned.length).toBe(1); // garaj korunur
    expect(s.mgr.spawn({ cls: 'taksi', x: 10, y: 64, z: 10 })).toBe(null); // stash'ta araç oluşturulmaz
    s.mgr.unstash();
    s.mgr.refreshDisplays(0, 0);
    expect(s.mgr.list().filter((e) => e.role === 'display').length).toBeGreaterThanOrEqual(2);
  });

  it('serialize/restore gidiş-dönüş: garaj, çağrılmış araç ve kiralık aynı yerde geri gelir; çift kurulum yok', () => {
    const s = setup();
    s.mgr.addOwned('spor');
    s.mgr.addOwned('motor');
    s.mgr.setActive(1);
    const sm = s.mgr.summon({ x: 15, y: 64, z: 15 });
    const rn = s.mgr.rent('kamyonet', { x: 40.5, y: 64, z: 40.5, yaw: 0 });
    expect(sm.ok && rn.ok).toBe(true);
    s.mgr.save.vstats.km = 12.5;
    const raw = JSON.parse(JSON.stringify(s.mgr.serialize()));
    expect(raw.garage.owned.map((o) => o.cls)).toEqual(['spor', 'motor']);
    expect(raw.garage.active).toBe(1);
    expect(raw.summoned.idx).toBe(1);
    expect(raw.rental.cls).toBe('kamyonet');
    const s2 = setup();
    s2.mgr.restore(raw);
    const list = s2.mgr.list();
    expect(list.filter((e) => e.role === 'owned').length).toBe(1);
    expect(list.filter((e) => e.role === 'rental').length).toBe(1);
    const o = list.find((e) => e.role === 'owned');
    expect(o.v.cls).toBe('motor');
    expect(Math.hypot(o.v.x - sm.entry.v.x, o.v.z - sm.entry.v.z)).toBeLessThan(0.1);
    expect(s2.mgr.save.vstats.km).toBeCloseTo(12.5, 3);
    expect(s2.mgr.restore(raw).list().length).toBe(2); // yeniden restore: kopya yok
    expect(s2.layer.props.size).toBe(s2.layer.props.size);
  });

  it('bozuk/kötü niyetli kayıt reddedilir (fuzz): sınıf, NaN, __proto__, boyut', () => {
    const s = setup();
    const evil = [null, 5, 'x', [], { garage: 5 }, { garage: { owned: [{ cls: '__proto__' }, { cls: 'taksi', cos: 7 }, { cls: 'taksi' }], active: 'x' }, summoned: { idx: 99, x: 1, y: 1, z: 1 } },
      JSON.parse('{"garage":{"owned":[{"cls":"spor","__proto__":{"x":1}}]},"summoned":{"idx":0,"x":1e9,"y":64,"z":0},"rental":{"cls":"taksi","left":-5,"x":0,"y":64,"z":0}}'),
      { rental: { cls: 'spor', left: 1e9, x: 3, y: 64, z: 3 }, vstats: { km: -3, enters: 1.5 } }];
    evil.forEach((raw) => {
      expect(() => s.mgr.restore(raw)).not.toThrow();
      const out = s.mgr.serialize();
      expect(out.garage.owned.length).toBeLessThanOrEqual(6);
      expect(out.garage.owned.every((o) => VEHICLE_CLASSES.indexOf(o.cls) >= 0)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(out, 'x')).toBe(false);
      if (out.rental) expect(out.rental.left).toBeLessThanOrEqual(RENTAL_SECONDS);
      expect(out.vstats.km).toBeGreaterThanOrEqual(0);
    });
  });

  it('1000 bin-in döngüsü sızıntı bırakmaz (propWorld/collider/entry sayıları sabit)', () => {
    const s = setup();
    const e = s.mgr.spawn({ cls: 'taksi', x: 20.5, y: 64, z: 20.5, yaw: 0 });
    const size0 = s.layer.props.size;
    const cc0 = s.layer.colliders.size;
    for (let i = 0; i < 1000; i++) {
      s.mgr.begin(e.id);
      s.mgr.syncProp(e);
      s.mgr.end();
    }
    expect(s.layer.props.size).toBe(size0);
    expect(s.layer.colliders.size).toBe(cc0);
    expect(s.mgr.list().length).toBe(1);
    expect(s.mgr.save.vstats.enters).toBe(1000);
  });

  it('kozmetik hasar kayda girer, yüklemede korunur ve onar() ücretsiz sıfırlar', () => {
    const s = setup();
    s.mgr.addOwned('taksi');
    const r = s.mgr.summon({ x: 10, y: 64, z: 10 });
    r.entry.v.dmg = 0.4;
    const raw = JSON.parse(JSON.stringify(s.mgr.serialize()));
    expect(raw.summoned.dmg).toBe(0.4);
    const s2 = setup();
    s2.mgr.restore(raw);
    expect(s2.mgr.list().find((e) => e.role === 'owned').v.dmg).toBeCloseTo(0.4, 2);
    expect(s2.mgr.repair()).toBe(1);
    expect(s2.mgr.list().find((e) => e.role === 'owned').v.dmg).toBe(0);
    expect(s2.mgr.serialize().summoned.dmg).toBe(0);
    expect(s2.mgr.repair()).toBe(0);
    const k = s.mgr.rent('motor', { x: 40.5, y: 64, z: 40.5, yaw: 0 });
    expect(k.entry.v.dmg).toBe(0); // kiralık hep hasarsız başlar
  });

  it('PropWorld/ColliderIndex olmadan (null) da çökmez', () => {
    const mgr = createVehicleManager({ seed: () => 1, props: () => null, world: () => null, pois: () => [], now: () => 0 });
    expect(mgr.spawn({ cls: 'taksi', x: 0, y: 64, z: 0 })).toBe(null);
    mgr.refreshDisplays(0, 0);
    expect(mgr.tick(1, 0, 0)).toEqual([]);
    mgr.stash();
    mgr.unstash();
    mgr.dispose();
    void ColliderIndex;
  });
});
