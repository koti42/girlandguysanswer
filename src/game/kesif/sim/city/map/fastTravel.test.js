import { describe, expect, it } from 'vitest';
import {
  FAST_TRAVEL, TRAVEL_MESSAGES, dangerNow, insideLockedRoom, nodeById, parseNodeId, travelNodes, travelRules,
} from './fastTravel.js';
import { getCityPlan } from '../cityPlan.js';
import { interiorAt } from '../interior/lockLookup.js';
import { doorSides } from '../interior/locks.js';
import { planBuilding, getLot } from '../cityPlan.js';
import { dimSeed } from '../../dim/dimensions.js';
import { scanText } from '../citySafeData.js';
import { mulberry32 } from '../../rng.js';

const SEED = dimSeed(77, 'neon');
const node = { id: 't3', kind: 'terminal', index: 3 };
const OK = {
  node, found: true, inCity: true, dead: false, transition: false, ui: 'map', mission: false, driving: false, danger: false, lockedInterior: false, cooldown: 0, kredi: 50, dist: 300,
};

describe('hızlı seyahat: düğümler', () => {
  it('kimlik çözümü: t0..t15, m0..m28; bozuk girdi null', () => {
    expect(parseNodeId('t0')).toEqual({ kind: 'terminal', index: 0 });
    expect(parseNodeId('t15')).toEqual({ kind: 'terminal', index: 15 });
    expect(parseNodeId('t16')).toBeNull();
    expect(parseNodeId('m4')).toEqual({ kind: 'metro', index: 4 });
    ['', 'x1', 't', 't-1', 't1.5', '__proto__', null, undefined, 5, {}, 't001'].forEach((v) => expect(parseNodeId(v)).toBeNull());
  });

  it('yalnız bulunmuş terminaller (0 hep) ve metro durakları listelenir; adlar güvenli', () => {
    const none = travelNodes(SEED, 0, 0);
    expect(none.map((n) => n.id)).toEqual(['t0']);
    const some = travelNodes(SEED, (1 << 3) | (1 << 15), 0b10001);
    expect(some.map((n) => n.id)).toEqual(['t0', 't3', 't15', 'm0', 'm4']);
    const all = travelNodes(SEED, 0xffff, 0b11111);
    expect(all.length).toBe(21);
    const plan = getCityPlan(SEED);
    all.forEach((n) => {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)).toBe(true);
      expect(scanText(n.name)).toEqual([]);
      expect(n.name.length).toBeGreaterThan(3);
      if (n.kind === 'terminal') expect(n.x).toBe(plan.terminals[n.index].x);
    });
    const names = all.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
    expect(nodeById(SEED, 't2').name).toBe(all.find((n) => n.id === 't2').name);
    expect(nodeById(SEED, 'm9')).toBeNull();
    expect(nodeById(SEED, 'zz')).toBeNull();
    // bulunmamış düğüm listede asla yok
    expect(travelNodes(SEED, 1 << 5, 0).some((n) => n.id === 't4' || n.id === 'm0')).toBe(false);
  });

  it('terminal 0 maskede olmasa da hep bulunmuş; maske üst bitleri yok sayılır', () => {
    expect(travelNodes(SEED, 0x10000, 0).map((n) => n.id)).toEqual(['t0']);
  });
});

describe('hızlı seyahat: kural matrisi', () => {
  it('tüm koşullar uygunken tamam', () => {
    const r = travelRules(OK);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('tamam');
  });

  const CASES = [
    ['bilinmiyor (düğüm yok)', { node: null }, 'bilinmiyor'],
    ['bilinmiyor (bulunmamış)', { found: false }, 'bilinmiyor'],
    ['şehir dışı', { inCity: false }, 'sehir'],
    ['ölü', { dead: true }, 'olu'],
    ['geçiş sürüyor', { transition: true }, 'gecis'],
    ['panel açık (envanter)', { ui: 'inventory' }, 'arayuz'],
    ['panel açık (diyalog)', { ui: 'dialogue' }, 'arayuz'],
    ['görevde', { mission: true }, 'gorev'],
    ['araçta', { driving: true }, 'arac'],
    ['tehlike', { danger: true }, 'tehlike'],
    ['kilitli oda', { lockedInterior: true }, 'kilitli'],
    ['bekleme', { cooldown: 4.2 }, 'bekle'],
    ['aynı yer', { dist: 3 }, 'ayni'],
    ['Kredi yetmiyor', { kredi: FAST_TRAVEL.cost - 1 }, 'kredi'],
  ];
  CASES.forEach(([name, patch, reason]) => {
    it('reddedilir: ' + name, () => {
      const r = travelRules(Object.assign({}, OK, patch));
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(reason);
      expect(r.message.length).toBeGreaterThan(5);
      expect(scanText(r.message)).toEqual([]);
    });
  });

  it('harita açıkken (ui map) ve oyun içi (ui none) serbest', () => {
    expect(travelRules(Object.assign({}, OK, { ui: 'map' })).ok).toBe(true);
    expect(travelRules(Object.assign({}, OK, { ui: 'none' })).ok).toBe(true);
    expect(travelRules(Object.assign({}, OK, { ui: undefined })).ok).toBe(true);
  });

  it('öncelik sırası: bilinmiyor > şehir > ölü > geçiş > arayüz > görev > araç > tehlike > kilitli > bekleme > aynı > Kredi', () => {
    const order = ['bilinmiyor', 'sehir', 'olu', 'gecis', 'arayuz', 'gorev', 'arac', 'tehlike', 'kilitli', 'bekle', 'ayni', 'kredi'];
    const bad = {
      node: null, inCity: false, dead: true, transition: true, ui: 'inventory', mission: true, driving: true, danger: true, lockedInterior: true, cooldown: 5, dist: 1, kredi: 0, found: false,
    };
    const fix = {
      bilinmiyor: { node, found: true }, sehir: { inCity: true }, olu: { dead: false }, gecis: { transition: false }, arayuz: { ui: 'none' }, gorev: { mission: false }, arac: { driving: false },
      tehlike: { danger: false }, kilitli: { lockedInterior: false }, bekle: { cooldown: 0 }, ayni: { dist: 200 }, kredi: { kredi: 100 },
    };
    let ctx = Object.assign({}, bad);
    order.forEach((reason) => {
      expect(travelRules(ctx).reason).toBe(reason);
      ctx = Object.assign({}, ctx, fix[reason]);
    });
    expect(travelRules(ctx).ok).toBe(true);
  });

  it('bekleme mesajı kalan saniyeyi söyler; Kredi sınırı tam eşik; NaN/bozuk bağlam atmaz', () => {
    expect(travelRules(Object.assign({}, OK, { cooldown: 7.1 })).message).toContain('8 sn');
    expect(travelRules(Object.assign({}, OK, { kredi: FAST_TRAVEL.cost })).ok).toBe(true);
    expect(travelRules(Object.assign({}, OK, { kredi: NaN })).reason).toBe('kredi');
    expect(travelRules(Object.assign({}, OK, { dist: NaN })).ok).toBe(true);
    expect(travelRules(null).ok).toBe(false);
    expect(travelRules({}).reason).toBe('bilinmiyor');
    expect(TRAVEL_MESSAGES.tamam).toBeTruthy();
  });

  it('fuzz: rastgele bağlamlarda her çıktı geçerli {ok, reason, message}', () => {
    const r = mulberry32(8);
    const reasons = new Set(['bilinmiyor', 'sehir', 'olu', 'gecis', 'arayuz', 'gorev', 'arac', 'tehlike', 'kilitli', 'bekle', 'ayni', 'kredi', 'tamam']);
    for (let i = 0; i < 500; i++) {
      const c = {
        node: r() < 0.9 ? node : null, found: r() < 0.9, inCity: r() < 0.9, dead: r() < 0.1, transition: r() < 0.1, ui: ['none', 'map', 'pause', 'dialogue', undefined][Math.floor(r() * 5)],
        mission: r() < 0.2, driving: r() < 0.2, danger: r() < 0.2, lockedInterior: r() < 0.1, cooldown: r() < 0.3 ? r() * 12 : 0, kredi: Math.floor(r() * 12) - 2, dist: r() * 400,
      };
      const res = travelRules(c);
      expect(reasons.has(res.reason)).toBe(true);
      expect(res.ok).toBe(res.reason === 'tamam');
      if (res.ok) {
        // başarı yalnız tüm kapılar açıkken
        expect(!c.dead && !c.transition && !c.mission && !c.driving && !c.danger && !c.lockedInterior && c.inCity && c.found && c.kredi >= FAST_TRAVEL.cost && c.dist >= FAST_TRAVEL.minDist).toBe(true);
      }
    }
  });

  it('sabitler: küçük Kredi bedeli, 10 sn bekleme, 3 sn / 0,4 sn karartma', () => {
    expect(FAST_TRAVEL.cost).toBeGreaterThan(0);
    expect(FAST_TRAVEL.cost).toBeLessThanOrEqual(10);
    expect(FAST_TRAVEL.cooldown).toBe(10);
    expect(FAST_TRAVEL.blackout).toBe(3);
    expect(FAST_TRAVEL.blackoutReduced).toBeLessThanOrEqual(0.5);
  });
});

describe('hızlı seyahat: tehlike', () => {
  it('çatışma, can kaybı, boss ya da yakın zamanda hasar tehlikedir', () => {
    expect(dangerNow({ combat: 0 })).toBe(false);
    expect(dangerNow({ combat: 0.5 })).toBe(true);
    expect(dangerNow({ hurtFlash: 0.3 })).toBe(true);
    expect(dangerNow({ boss: true })).toBe(true);
    expect(dangerNow({ sinceHurt: 3 })).toBe(true);
    expect(dangerNow({ sinceHurt: 30 })).toBe(false);
    expect(dangerNow({ sinceHurt: -1 })).toBe(false);
    expect(dangerNow(null)).toBe(false);
  });
});

describe('hızlı seyahat: kilitli iç mekân', () => {
  it('açık sokak, geçersiz konum ve iç mekân dışı asla kilitli sayılmaz', () => {
    expect(insideLockedRoom(SEED, 0, 64, 0, () => false)).toBe(false);
    expect(insideLockedRoom(SEED, NaN, 64, 0, () => false)).toBe(false);
    expect(insideLockedRoom(SEED, 99999, 64, 99999, () => false)).toBe(false);
  });

  it('kilitli kapının DERİN tarafındaki oda kilitli; giriş tarafı ve çözülmüş kilit değil', () => {
    const plan = getCityPlan(SEED);
    let checked = 0;
    plan.owners.forEach((o) => {
      const lot = getLot(SEED, o.lotId);
      const bp = planBuilding(SEED, lot);
      const r = bp.interior;
      if (!r) return;
      const cx = Math.floor((r.x0 + r.x1) / 2);
      const cz = Math.floor((r.z0 + r.z1) / 2);
      const hit = interiorAt(SEED, cx, cz);
      if (!hit) return;
      const sides = doorSides(hit.it);
      sides.forEach((s) => {
        const lk = s.door.lock;
        if (!lk || lk.kind === 'serbest') return;
        const deep = hit.it.rooms.find((rm) => rm.id === s.deep);
        const entry = hit.it.rooms.find((rm) => rm.id === s.entry);
        if (!deep || !entry) return;
        const dx = (deep.x0 + deep.x1) / 2;
        const dz = (deep.z0 + deep.z1) / 2;
        const dy = deep.y0 + 1;
        expect(insideLockedRoom(SEED, dx, dy, dz, () => false)).toBe(true);
        expect(insideLockedRoom(SEED, dx, dy, dz, (id) => id === lk.id)).toBe(false);
        checked++;
      });
    });
    expect(checked).toBeGreaterThan(0);
  });
});
