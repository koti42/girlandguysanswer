import { describe, expect, it } from 'vitest';
import {
  EMOTES, NPCS, NPC_BY_ID, NPC_HINTS, NPC_KINDS, OWNER_NPCS, STREET_NPCS, getNpc, hourOf, npcAvailable, npcHash, npcLook,
} from './npcData.js';
import {
  OWNER_STATION_KINDS, adjustSpots, clearPlaceCache, facingYaw, findFreeSpot, ownerLotCenter, ownerSpot, ownerSpots, placeStreetNpcs, standHeight,
} from './npcPlace.js';
import { isValidAvatar, normalizeAvatar } from '../../../../avatar/catalog.js';
import { OWNERS } from '../ownerData.js';
import { chunkReader } from '../cityContentTestKit.js';
import {
  getCityPlan, getLot, planBuilding, surface, pois,
} from '../cityPlan.js';
import { planInterior } from '../interior/index.js';
import { SURF } from '../cityRoads.js';

describe('npcData: kadro', () => {
  it('16 sahip + 30 sokak NPC\'si; kimlik benzersiz ve güvenli; tür kümesi; getNpc proto güvenli', () => {
    expect(OWNER_NPCS).toHaveLength(16);
    expect(STREET_NPCS).toHaveLength(30);
    expect(NPCS).toHaveLength(46);
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(46);
    NPCS.forEach((n) => {
      expect(n.id).toMatch(/^[a-z0-9_]{1,24}$/);
      expect(NPC_KINDS).toContain(n.kind);
      expect(['insan', 'robot']).toContain(n.species);
      expect(n.personality.length).toBeGreaterThanOrEqual(2);
      n.emotes.forEach((e) => expect(EMOTES).toContain(e));
      expect(NPC_BY_ID[n.id]).toBe(n);
    });
    expect(getNpc('kerem').name).toBe('Kerem');
    expect(getNpc('__proto__')).toBe(null);
    expect(getNpc('toString')).toBe(null);
    expect(getNpc(null)).toBe(null);
    OWNERS.forEach((o) => {
      const n = getNpc(o.id);
      expect(n.kind).toBe('owner');
      expect(n.interior).toBe(o.interior);
      expect(n.species).toBe(o.species);
      expect(n.shop.pool).toBeTruthy();
    });
  });

  it('istenen roller var: rehberler, satıcılar, kuryeler, taksi amiri, yarış hakemi, tamirci, DJ, ev sahibi, mentorlar, fotoğrafçı, robotlar', () => {
    const count = (k) => STREET_NPCS.filter((n) => n.kind === k).length;
    expect(count('guide')).toBe(7);
    expect(count('vendor')).toBe(6);
    expect(count('courier')).toBe(2);
    expect(count('taxi')).toBe(1);
    expect(count('marshal')).toBe(2);
    expect(count('mechanic')).toBe(1);
    expect(count('dj')).toBe(1);
    expect(count('host')).toBe(1);
    expect(count('mentor')).toBe(3);
    expect(count('photographer')).toBe(1);
    expect(count('robot')).toBe(2);
    expect(count('elder')).toBe(1);
    expect(count('kid')).toBe(2);
    STREET_NPCS.filter((n) => n.kind === 'kid').forEach((n) => expect(n.scale).toBeLessThan(0.8));
  });

  it('görünüm: kimlikten belirlenimci; avatar şemasında geçerli; çocuk ölçeği; robot bayrağı; çeşitlilik', () => {
    const seen = new Set();
    NPCS.forEach((n) => {
      const a = npcLook(n);
      expect(npcLook(n)).toEqual(a);
      expect(npcLook(n.id)).toEqual(a);
      expect(isValidAvatar(a), n.id).toBe(true);
      expect(normalizeAvatar(a)).toMatchObject({ body: a.body, skin: a.skin });
      expect(a.scale).toBe(n.scale);
      expect(a.robot).toBe(n.gender === 'r');
      seen.add(JSON.stringify([a.skin, a.hair, a.top, a.bottom, a.acc]));
    });
    expect(seen.size).toBeGreaterThanOrEqual(40); // neredeyse hepsi benzersiz
    expect(NPCS.filter((n) => npcLook(n).robot).map((n) => n.id).sort()).toEqual(['cikrik', 'dr_bolt', 'robot_bip', 'robot_pili']);
  });

  it('çizelge: sahipler hep içeride; bilinen saatlerde müsaitlik; her saatte ≥3 satıcı ve ≥2 rehber açık; yağmurda dışarıdakiler sığınır', () => {
    OWNER_NPCS.forEach((n) => { for (let h = 0; h < 24; h += 3) expect(npcAvailable(n, h, false)).toBe(true); });
    const orhan = getNpc('satici_orhan');
    expect(npcAvailable(orhan, 12, false)).toBe(true);
    expect(npcAvailable(orhan, 3, false)).toBe(false);
    expect(npcAvailable(getNpc('dj_piksel'), 23, false)).toBe(true); // gece yarısını aşan aralık
    expect(npcAvailable(getNpc('dj_piksel'), 2, false)).toBe(true);
    expect(npcAvailable(getNpc('dj_piksel'), 12, false)).toBe(false);
    expect(npcAvailable(getNpc('rehber_zeynep'), 4, false)).toBe(true);
    expect(npcAvailable(getNpc('fotografci_irmak'), 12, true)).toBe(false);
    expect(npcAvailable(getNpc('fotografci_irmak'), 12, false)).toBe(true);
    expect(npcAvailable(getNpc('cocuk_alp'), 12, true)).toBe(false);
    expect(npcAvailable(null, 12, false)).toBe(false);
    expect(npcAvailable(orhan, NaN, false)).toBe(true);
    expect(npcAvailable(orhan, -3, false)).toBe(npcAvailable(orhan, 21, false));
    for (let h = 0; h < 24; h += 0.5) {
      const v = STREET_NPCS.filter((n) => n.kind === 'vendor' && npcAvailable(n, h, false)).length;
      const g = STREET_NPCS.filter((n) => n.kind === 'guide' && npcAvailable(n, h, false)).length;
      expect(v, 'satıcı ' + h).toBeGreaterThanOrEqual(3);
      expect(g, 'rehber ' + h).toBeGreaterThanOrEqual(2);
      expect(STREET_NPCS.some((n) => n.kind === 'taxi' && npcAvailable(n, h, false))).toBe(true);
    }
    // oyun başlangıcı 19:30 (motor fazı 0,5625 = kayıtlı kesir 0,8125 − origin 0,25)
    expect(hourOf(0.5625)).toBeCloseTo(19.5, 5);
    expect(hourOf(0)).toBe(6);
    expect(hourOf(0.25)).toBe(12);
    expect(hourOf(-1)).toBe(6);
  });

  it('ipucu tablosu: metinler ≤80 kr, kimlikler küçük harf', () => {
    expect(Object.keys(NPC_HINTS).length).toBeGreaterThanOrEqual(15);
    Object.keys(NPC_HINTS).forEach((k) => {
      expect(k).toMatch(/^[a-z0-9_]{1,24}$/);
      expect(NPC_HINTS[k].length).toBeLessThanOrEqual(80);
    });
    expect(npcHash(1, 'a')).not.toBe(npcHash(2, 'a'));
    expect(npcHash(1, 'a')).toBe(npcHash(1, 'a'));
  });
});

describe('npcPlace: yerleşim', () => {
  const SEEDS = [1, 5, 99, 4242, 123456, 7777777, 13579, 2468, 31337, 8675309];

  it('her tohumda 30 NPC çözülür; belirlenimci; donmuş; aralarında ≥1,6 blok; yürünebilir yüzeyde (asfalt/şerit/zebra/su yok)', () => {
    const ok = [SURF.SIDEWALK, SURF.PLAZA, SURF.GROUND, SURF.PARK, SURF.QUAY];
    SEEDS.forEach((seed) => {
      clearPlaceCache();
      const a = placeStreetNpcs(seed);
      const b = placeStreetNpcs(seed);
      expect(a).toBe(b);
      expect(a).toHaveLength(30);
      expect(Object.isFrozen(a)).toBe(true);
      expect(new Set(a.map((s) => s.id)).size).toBe(30);
      a.forEach((s) => {
        expect(NPC_BY_ID[s.id], s.id).toBeTruthy();
        expect(Number.isFinite(s.x + s.y + s.z + s.yaw)).toBe(true);
        expect(ok, seed + ' ' + s.id + ' yüzey').toContain(surface(seed, s.x, s.z));
        expect(Math.abs(s.yaw)).toBeLessThanOrEqual(Math.PI + 1e-9);
      });
      clearPlaceCache();
      expect(placeStreetNpcs(seed)).toEqual(a);
    });
  });

  it('gerçek bloklarda: ham yerler boş (ayak+baş havada, zemin katı); adjustSpots hiçbirini yitirmez ve ≥1,6 aralık bırakır', () => {
    SEEDS.slice(0, 6).forEach((seed) => {
      const rd = chunkReader(seed);
      const probe = { getBlock: (x, y, z) => rd.getBlock(x, y, z) };
      const spots = placeStreetNpcs(seed);
      const adj = adjustSpots(probe, spots);
      expect(adj).toHaveLength(spots.length);
      adj.forEach((s) => {
        const f = findFreeSpot(probe, s.x, s.y, s.z, { maxR: 0 });
        expect(f, seed + ' ' + s.id).toBeTruthy();
      });
      for (let i = 0; i < adj.length; i++) {
        for (let j = i + 1; j < adj.length; j++) {
          expect(Math.hypot(adj[i].x - adj[j].x, adj[i].z - adj[j].z), adj[i].id + '/' + adj[j].id).toBeGreaterThanOrEqual(1.55);
        }
      }
      // ham yerlerin çoğu zaten boş (kayma gerekmez)
      const moved = adj.filter((s) => Math.hypot(s.x - spots.find((q) => q.id === s.id).x, s.z - spots.find((q) => q.id === s.id).z) > 1.2).length;
      expect(moved).toBeLessThanOrEqual(5);
    });
  });

  it('çıpalar: rehber ilgili terminalin yakınında; satıcılar Pazar\'da; kurye masasında; hakem yarış kapısında; çocuk yetişkinin yanında', () => {
    const seed = 4242;
    const spots = placeStreetNpcs(seed);
    const P = pois(seed);
    const by = (id) => spots.find((s) => s.id === id);
    const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    for (let k = 0; k <= 6; k++) {
      const id = k === 0 ? 'rehber_zeynep' : ['rehber_arda', 'rehber_lale', 'rehber_baran', 'rehber_deniz', 'rehber_selin', 'rehber_yesim'][k - 1];
      const t = P.find((p) => p.type === 'portal_terminal' && p.terminal === k);
      expect(near(by(id), t), id).toBeLessThan(8);
    }
    const t2 = P.find((p) => p.type === 'portal_terminal' && p.terminal === 2);
    ['satici_orhan', 'satici_gulsum', 'satici_pelin', 'satici_yusuf', 'satici_mehtap', 'satici_nadir'].forEach((id) => {
      expect(near(by(id), t2), id).toBeLessThan(120);
    });
    const v = ['satici_orhan', 'satici_gulsum', 'satici_pelin', 'satici_yusuf', 'satici_mehtap', 'satici_nadir'].map(by);
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) expect(near(v[i], v[j])).toBeGreaterThanOrEqual(7);
    const gate0 = P.find((p) => p.type === 'race_gate' && p.raceId === 0);
    expect(near(by('hakem_kaan'), gate0)).toBeLessThan(20);
    const desk = P.find((p) => p.type === 'courier_desk' && p.terminal === 2);
    expect(near(by('kurye_ela'), desk)).toBeLessThan(6);
    expect(near(by('cocuk_alp'), by('buyukbaba_riza'))).toBeLessThan(4);
    expect(near(by('cocuk_elif'), by('rehber_zeynep'))).toBeLessThan(4);
    const rent = P.find((p) => p.type === 'rental' && p.terminal === 0);
    expect(near(by('taksi_sevgi'), rent)).toBeLessThan(5);
  });

  it('facingYaw: yaw 0 = −z; ileri vektörü hedefe bakar', () => {
    const y = facingYaw(0, 0, 0, -5);
    expect(y).toBeCloseTo(0, 6);
    const y2 = facingYaw(0, 0, 5, 0);
    expect(-Math.sin(y2)).toBeCloseTo(1, 6);
    expect(-Math.cos(y2)).toBeCloseTo(0, 6);
    expect(facingYaw(1, 1, 1, 1)).toBe(0);
  });

  it('standHeight: plaka (yarım blok) üstünde 0,5 yükseklik; tam blok/baş boşluğu yoksa null', () => {
    const slab = (id) => ({ getBlock: (x, y) => (y <= 63 ? 1 : y === 64 ? id : 0) });
    expect(standHeight(slab(0), 3.5, 64, 3.5)).toBe(64);
    expect(standHeight(slab(95), 3.5, 64, 3.5)).toBe(64.5); // taş plaka
    expect(standHeight(slab(1), 3.5, 64, 3.5)).toBe(null); // tam blok
    const low = { getBlock: (x, y) => (y <= 63 ? 1 : y === 65 ? 1 : 0) };
    expect(standHeight(low, 3.5, 64, 3.5)).toBe(null); // baş boşluğu yok
    const sunk = { getBlock: (x, y) => (y <= 62 ? 1 : y === 63 ? 95 : 0) };
    expect(standHeight(sunk, 3.5, 64, 3.5)).toBe(63.5); // zemin yarım plaka
    expect(standHeight({ getBlock: () => 0 }, 3.5, 64, 3.5)).toBe(null); // havada
  });

  it('findFreeSpot: katı zeminde kayar, yoksa null; çarpışma sorgusu dikkate alınır', () => {
    const flat = { getBlock: (x, y) => (y <= 63 ? 1 : 0) };
    expect(findFreeSpot(flat, 10.2, 64, 5.7)).toEqual({ x: 10.5, y: 64, z: 5.5 });
    const wall = { getBlock: (x, y) => (y <= 63 ? 1 : (x >= 10 && x < 13 ? 1 : 0)) };
    const f = findFreeSpot(wall, 11.5, 64, 5.5);
    expect(f).toBeTruthy();
    expect(f.x < 10 || f.x >= 13).toBe(true);
    expect(findFreeSpot({ getBlock: () => 1 }, 0, 64, 0)).toBe(null);
    const blocked = { getBlock: flat.getBlock, isBlocked: (x, y, z) => Math.abs(x - 10.5) < 0.1 && Math.abs(z - 5.5) < 0.1 };
    const g = findFreeSpot(blocked, 10.5, 64, 5.5);
    expect(g).toBeTruthy();
    expect(g.x === 10.5 && g.z === 5.5).toBe(false);
  });
});

describe('npcPlace: iç mekân sahipleri (ownerPost)', () => {
  const SEEDS = [1, 5, 99, 4242, 123456, 7777777];

  it('her tohumda 16 sahibin duracağı yer çözülür; yalnız dr_bolt, cikrik ve sule kendi proplarıyla "station" (figürsüz); kalan 13 figürlü', () => {
    expect(OWNER_STATION_KINDS).toEqual(['robot_doktor_istasyonu', 'servo_tezgahi', 'kurye_tezgahi']);
    SEEDS.forEach((seed) => {
      const spots = ownerSpots(seed);
      expect(spots, 'tohum ' + seed).toHaveLength(16);
      expect(spots.filter((s) => s.station).map((s) => s.id).sort()).toEqual(['cikrik', 'dr_bolt', 'sule']);
      spots.forEach((s) => {
        expect(Number.isFinite(s.x + s.y + s.z + s.yaw)).toBe(true);
        expect(s.y).toBe(64);
        expect(((s.x % 1) + 1) % 1).toBeCloseTo(0.5, 6);
        expect(((s.z % 1) + 1) % 1).toBeCloseTo(0.5, 6);
        expect(ownerSpot(seed, s.id)).toBe(s); // önbellek
        const c = ownerLotCenter(seed, s.id);
        expect(Math.hypot(c.x - s.x, c.z - s.z)).toBeLessThan(60);
      });
    });
    expect(ownerSpot(1, 'yok')).toBe(null);
    expect(ownerLotCenter(1, 'yok')).toBe(null);
  });

  it('sahip yeri iç mekân kutusunun ve odalarının içinde, gerçek bloklarda boş (ayak+baş havada, zemin katı)', () => {
    SEEDS.slice(0, 4).forEach((seed) => {
      const rd = chunkReader(seed);
      const probe = { getBlock: (x, y, z) => rd.getBlock(x, y, z) };
      const plan = getCityPlan(seed);
      ownerSpots(seed).forEach((s) => {
        const lot = getLot(seed, plan.owners.get(s.id).lotId);
        const bp = planBuilding(seed, lot);
        const it = planInterior(bp, lot);
        const r = bp.interior;
        expect(s.x >= r.x0 && s.x < r.x1 && s.z >= r.z0 && s.z < r.z1, seed + ' ' + s.id).toBe(true);
        const room = (it.rooms || []).find((q) => s.x >= q.x0 && s.x < q.x1 + 1 && s.z >= q.z0 && s.z < q.z1 + 1);
        expect(room, seed + ' ' + s.id + ' oda').toBeTruthy();
        expect(findFreeSpot(probe, s.x, s.y, s.z, { maxR: 0 }), seed + ' ' + s.id + ' boş hücre').toBeTruthy();
      });
    });
  });

  it('figür yönü: prop yaw indeksinden (0:+Z 1:+X 2:−Z 3:−X) figür yönüne dönüşür (ileri = (−sin, −cos))', () => {
    const s = ownerSpots(4242).find((q) => !q.station);
    const fx = -Math.sin(s.yaw);
    const fz = -Math.cos(s.yaw);
    const PROP = [[0, 1], [1, 0], [0, -1], [-1, 0]][s.propYaw];
    expect(fx).toBeCloseTo(PROP[0], 6);
    expect(fz).toBeCloseTo(PROP[1], 6);
  });
});
