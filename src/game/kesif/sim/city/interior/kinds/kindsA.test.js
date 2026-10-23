/*
 * interiors_a testleri: kapsül daire, loft, hacker odası, oyuncu odası, ramen barı, klinik.
 * Her tür × 3 varyant × (tohumlardan seçilen ≥ 20 parsel): doğrulayıcı, prop/ışık/kilit/sahip kuralları, belirlenimcilik, kesit birleşimi, gerçek chunk dünyasında BFS.
 */
import { describe, expect, it } from 'vitest';
import { citySeed, digest } from '../../cityPlanTestKit.js';
import { MOOD_HUES, AMBIENT_KEYS, OWNER_BY_INTERIOR } from '../../ownerData.js';
import { findBrandCollision, isSafeText } from '../../citySafeData.js';
import { getCatalogDef } from '../../../props/propCatalog.js';
import { makeFrame } from '../frame.js';
import { NO_LOCK, packCode } from '../furnishA.js';
import { assignClues, solveReachability } from '../locks.js';
import {
  INTERIOR_ERRORS, clearInteriorCache, frameOf, getInterior, listInteriors, planInterior, setInteriorStrict,
} from '../index.js';
import {
  MAX_LIGHTS_PER_ROOM, buildingOf, doorClearanceBoxes, planReachability, propBoxes, reachableFromStreet, validateInterior,
} from '../graph.js';
import {
  HEIGHT, chunkWorld, emitSlices, emitWhole, interiorLots, regionOf,
} from '../testKit.js';

const paletteOf = (impl, variant) => impl.palette({ variant, kind: impl.kind }, null);
/** Her iç mekânda bulunması gereken kimlik mobilyaları (türün asıl işlevi). */
const REQUIRED = {
  kapsul_daire: ['kapsul_yatak', 'dus_kabini'],
  loft: ['kanepe', 'yatak', 'dev_holo_ekran'],
  hacker_odasi: ['sunucu_rafi', 'cok_ekranli_masa', 'is_tezgahi'],
  oyuncu_odasi: ['cok_ekranli_masa', 'kanepe', 'arcade_makinesi'],
  ramen_bari: ['ramen_tezgahi', 'tabure', 'mutfak_tezgahi'],
  klinik: ['muayene_yatagi', 'robot_doktor_istasyonu', 'tarayici_cihaz', 'kasa_masasi'],
};
const KINDS = ['kapsul_daire', 'loft', 'hacker_odasi', 'oyuncu_odasi', 'ramen_bari', 'klinik'];
const SEEDS = Array.from({ length: 20 }, (_, i) => citySeed(i + 1));
const N = 20;

setInteriorStrict(true);

/** (tür, varyant) için: 20 tohumun HER BİRİNDEN bir parsel (ortadaki) + kapsam özel durumları (kule çekirdeği engelli, H<4, 4 kapı yüzü). */
const CACHE = {};
function pick(kind, variant, n) {
  const key = kind + ':' + variant + ':' + n;
  if (CACHE[key]) return CACHE[key];
  const perSeed = SEEDS.map(() => []);
  const all = [];
  SEEDS.forEach((seed, si) => {
    interiorLots(seed, { kinds: [kind], filter: (bp) => bp.interior.variant === variant }).forEach((q) => {
      const e = Object.assign({ seed, si }, q);
      perSeed[si].push(e);
      all.push(e);
    });
  });
  const out = [];
  const used = new Set();
  const take = (q) => { if (q && !used.has(q)) { used.add(q); out.push(q); } };
  perSeed.forEach((list) => { if (list.length) take(list[Math.floor(list.length / 2)]); });
  const frameOf = (q) => makeFrame(q.bp, q.lot, {});
  all.filter((q) => frameOf(q).obstacles.length > 0).slice(0, 4).forEach(take);
  all.filter((q) => frameOf(q).H < 4).slice(0, 2).forEach(take);
  ['n', 'e', 's', 'w'].forEach((face) => take(all.find((q) => q.bp.doors[0].face === face && !used.has(q))));
  CACHE[key] = out;
  return out;
}

const ALL = [];
KINDS.forEach((kind) => [0, 1, 2].forEach((variant) => pick(kind, variant, N).forEach((q) => ALL.push(Object.assign({ kind, variant }, q)))));

describe('interiors_a — kayıt', () => {
  it('altı tür glob ile yüklenir; ayak izi ownerData/archetypes ile uyumlu; ≥ 3 varyant paleti', () => {
    KINDS.forEach((k) => {
      const impl = getInterior(k);
      expect(impl, k).not.toBeNull();
      expect(listInteriors()).toContain(k);
      const fp = impl.footprint(0);
      expect(fp.w * fp.d).toBeGreaterThan(30);
      expect(OWNER_BY_INTERIOR[k]).toBeDefined();
      const pals = [0, 1, 2].map((v) => paletteOf(impl, v));
      expect(new Set(pals.map((p) => p.floor + ':' + p.wall + ':' + p.trim)).size, k + ' paletler farklı').toBe(3);
    });
  });

  it('her (tür, varyant) için en az 20 test parseli bulunur', () => {
    KINDS.forEach((k) => [0, 1, 2].forEach((v) => {
      const list = pick(k, v, N);
      expect(list.length, k + ' v' + v).toBeGreaterThanOrEqual(N);
      expect(new Set(list.map((q) => q.si)).size, k + ' v' + v + ' farklı tohum').toBeGreaterThanOrEqual(16);
    }));
  });
});

describe('interiors_a — plan değişmezleri', () => {
  it('validateInterior geçer; 20–40 prop, 8–14 farklı katalog anahtarı, oda başına ≤ 4 ışık, hava ≥ %70, plan düzeyi tam ulaşım', () => {
    const bad = [];
    ALL.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      if (!it) { bad.push(q.kind + '#' + q.bp.id + ' plan null'); return; }
      const v = validateInterior(it, { reach: true });
      if (!v.ok) bad.push(q.kind + ' v' + q.variant + ' #' + q.bp.id + ': ' + v.errors.slice(0, 3).join(' | '));
      const keys = new Set(it.props.map((p) => p.kind));
      if (it.props.length < 20 || it.props.length > 40) bad.push(q.kind + ' v' + q.variant + ' #' + q.bp.id + ' prop sayısı ' + it.props.length);
      if (keys.size < 8 || keys.size > 14) bad.push(q.kind + ' v' + q.variant + ' #' + q.bp.id + ' farklı anahtar ' + keys.size);
      it.props.forEach((p) => { if (!getCatalogDef(p.kind)) bad.push('katalog dışı ' + p.kind); });
      const per = {};
      it.lights.forEach((l) => { per[l.room] = (per[l.room] || 0) + 1; });
      Object.keys(per).forEach((r) => { if (per[r] > MAX_LIGHTS_PER_ROOM) bad.push('ışık > 4 ' + r); });
      const rep = planReachability(it);
      if (rep.fraction < 0.7 || rep.unreachableRooms.length) bad.push(q.kind + ' v' + q.variant + ' #' + q.bp.id + ' plan erişimi ' + rep.fraction.toFixed(2));
    });
    expect(bad).toEqual([]);
    expect(INTERIOR_ERRORS.length).toBe(0);
  });

  it('sahip, imza eşya, çip, ortam sesi, mood, yerleşim verisi', () => {
    ALL.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      const own = OWNER_BY_INTERIOR[q.kind];
      expect(it.kindOwnerId, q.kind).toBe(own.id);
      if (q.bp.ownerId) {
        expect(it.ownerId).toBe(q.bp.ownerId);
        expect(it.owner && it.owner.id).toBe(q.bp.ownerId);
      }
      expect(it.signature, q.kind + ' imza').not.toBeNull();
      expect(it.signature.itemKey).toBe(own.signature.itemKey);
      expect(it.chips.length, q.kind + ' çip').toBeGreaterThanOrEqual(1);
      expect(AMBIENT_KEYS).toContain(it.ambient);
      expect(it.ambient).toBe(own.mood.ambient);
      expect(MOOD_HUES).toContain(it.mood.hue);
      expect(it.mood.light).toBeGreaterThanOrEqual(8);
      expect(it.mood.light).toBeLessThanOrEqual(14);
      expect(it.ownerPost, q.kind + ' sahip konumu').not.toBeNull();
      expect(Number.isFinite(it.ownerPost.x + it.ownerPost.y + it.ownerPost.z)).toBe(true);
      const room = it.rooms.find((r) => r.id === it.ownerPost.room);
      expect(room, 'sahip odası').toBeDefined();
      expect(it.ownerPost.x).toBeGreaterThanOrEqual(room.x0);
      expect(it.ownerPost.x).toBeLessThan(room.x1);
      expect(it.ownerPost.z).toBeGreaterThanOrEqual(room.z0);
      expect(it.ownerPost.z).toBeLessThan(room.z1);
      expect(it.layout && it.layout.rooms.length).toBe(it.rooms.length);
      const ow = it.anchors.filter((a) => a.type === 'owner');
      expect(ow.length, q.kind + ' sahip çapası').toBe(1);
      expect(ow[0].x).toBe(it.ownerPost.x);
      expect(ow[0].room).toBe(it.ownerPost.room);
      if (q.kind === 'ramen_bari') expect(it.anchors.some((a) => a.type === 'vendor' && a.key === 'ramen_tezgahi'), 'ramen tezgâh çapası').toBe(true);
    });
  });

  it('imza ve çip noktaları bir odanın içinde ve çarpışma kutusuna gömülü değil', () => {
    ALL.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      const inRoom = (p) => it.rooms.some((r) => p.x >= r.x0 && p.x < r.x1 && p.z >= r.z0 && p.z < r.z1);
      expect(inRoom(it.signature), q.kind + ' imza odada').toBe(true);
      it.chips.forEach((c) => expect(inRoom(c), q.kind + ' çip odada').toBe(true));
      // çapalar (çip, yerdeki imza, sahip konumu) hiçbir çarpışma kutusunun içinde değil
      const boxes = propBoxes(it.props.filter((p) => !/^kapi|^gizli_kapi/.test(p.kind)));
      const buried = (x, z, y0, y1) => boxes.some((e) => e.boxes.some((b) => b[0] < x + 0.3 && b[3] > x - 0.3 && b[2] < z + 0.3 && b[5] > z - 0.3 && b[4] > y0 + 0.05 && b[1] < y1));
      it.chips.forEach((c) => expect(buried(c.x, c.z, c.y, c.y + 1), q.kind + ' çip gömülü').toBe(false));
      expect(buried(it.ownerPost.x, it.ownerPost.z, it.ownerPost.y, it.ownerPost.y + 1.8), q.kind + ' sahip konumu gömülü').toBe(false);
      if (it.signature.y <= it.bounds.y0 + 0.01) expect(buried(it.signature.x, it.signature.z, it.signature.y, it.signature.y + 1), q.kind + ' imza gömülü').toBe(false);
    });
  });

  it('varyantlar ayırt edilir: oda yerleşimi (en az 2 farklı), palet ve mood farklı; her varyant ışık/oda sayısıyla tutarlı', () => {
    KINDS.forEach((k) => {
      const sigs = [0, 1, 2].map((v) => {
        const q = pick(k, v, N)[0];
        const it = planInterior(q.bp, q.lot);
        return { rooms: it.layout.rooms.length, lay: it.layout.v, hue: it.mood.hue + ':' + it.mood.light, ids: it.rooms.map((r) => r.id).sort().join(',') };
      });
      expect(new Set(sigs.map((s) => s.lay)).size, k + ' layout.v').toBe(3);
      expect(new Set(sigs.map((s) => s.ids)).size, k + ' oda kimlikleri').toBeGreaterThanOrEqual(2);
      expect(new Set(sigs.map((s) => s.hue)).size, k + ' mood').toBeGreaterThanOrEqual(2);
    });
  });

  it('belirlenimci: önbellek temizlense de plan özdeş; emit bayt-özdeş', () => {
    ALL.filter((q, i) => i % 6 === 0).forEach((q) => {
      const d1 = digest(planInterior(q.bp, q.lot));
      clearInteriorCache();
      const d2 = digest(planInterior(q.bp, q.lot));
      expect(d2, q.kind + ' v' + q.variant).toBe(d1);
      const region = regionOf(q.bp);
      const a = emitWhole(q.bp, q.lot, region);
      const b = emitWhole(q.bp, q.lot, region);
      expect(a.blocks.every((v, i) => v === b.blocks[i])).toBe(true);
    });
  });
});

describe('interiors_a — kilitler', () => {
  const LOCK_ID = /^[0-9a-z]{1,10}$/;
  function roomOfCell(it, x, z) {
    return it.rooms.find((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) || null;
  }
  /** Giriş odasından, tier < t olan kilitlerin kapıları açık sayılarak ulaşılan oda kümesi. */
  function reach(it, tierLimit, skipLockId) {
    const seen = new Set([it.entry.room]);
    const st = [it.entry.room];
    while (st.length) {
      const c = st.pop();
      it.graph.forEach(([a, b, did]) => {
        const d = it.doors.find((q) => q.id === did);
        const other = a === c ? b : b === c ? a : null;
        if (!other || seen.has(other)) return;
        if (d.lock && d.lock.kind !== 'serbest' && (d.lock.id === skipLockId || d.lock.tier >= tierLimit)) return;
        seen.add(other);
        st.push(other);
      });
    }
    return seen;
  }

  it('kilit kimliği/tür/kademe geçerli ve benzersiz; DAG: ipucu kilidin arkasında değil, sağlayıcı kademesi küçük; kilit düzeneği prop var', () => {
    const kinds = {};
    ALL.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      const ids = new Set();
      expect(it.locks.length, q.kind).toBe(it.doors.filter((d) => d.lock).length);
      it.locks.forEach((l) => {
        expect(l.id).toMatch(LOCK_ID);
        expect(ids.has(l.id)).toBe(false);
        ids.add(l.id);
        expect(['serbest', 'kod', 'mini_hack', 'kart']).toContain(l.kind);
        expect(l.tier).toBeGreaterThanOrEqual(0);
        expect(l.tier).toBeLessThanOrEqual(3);
        const d = it.doors.find((x) => x.id === l.door);
        expect(d && d.lock && d.lock.id).toBe(l.id);
        kinds[q.kind + ':' + l.kind] = (kinds[q.kind + ':' + l.kind] || 0) + 1;
        if (l.kind === 'kod') {
          expect(l.data.code.length).toBe(l.data.digits);
          l.data.code.forEach((c) => { expect(c).toBeGreaterThanOrEqual(1); expect(c).toBeLessThanOrEqual(6); });
        }
        if (l.kind === 'mini_hack') expect(['simon', 'levers', 'dice']).toContain(l.data.game);
        if (l.kind === 'kart') expect(l.data.card).toBeLessThanOrEqual(3);
        if (l.kind !== 'serbest') {
          const padKey = l.kind === 'kart' ? 'kart_okuyucu' : l.kind === 'mini_hack' ? 'hack_terminali' : 'kod_paneli';
          expect(it.props.some((p) => p.kind === padKey), q.kind + ' ' + padKey).toBe(true);
          const pad = it.props.find((p) => p.slot === l.pad);
          expect(pad && pad.kind, q.kind + ' kilit pad').toBe(padKey);
          // kilit bir odaya açılır: sokaktan ulaşım, bu kilit kapalı sayılınca B tarafı ulaşılamaz (kilit gerçekten engeller)
          const gr = it.graph.find((e) => e[2] === l.door);
          const closed = reach(it, 99, l.id);
          expect(closed.has(gr[0]) !== closed.has(gr[1]) || closed.size < it.rooms.length, 'kilit bir bölümü ayırır').toBe(true);
        }
        // ipucu sağlayıcı
        if (l.clue && l.clue.type === 'prop') {
          const p = it.props.find((x) => x.slot === l.clue.slot);
          expect(p, q.kind + ' ipucu prop').toBeDefined();
          expect(p.kind).toBe(l.clue.key);
          const rm = roomOfCell(it, Math.floor(p.x), Math.floor(p.z)) || it.rooms.find((r) => r.id === l.clue.room);
          const open = reach(it, l.tier, l.id);
          expect(open.has(l.clue.room), q.kind + ' ipucu odası kilidin ARKASINDA olamaz').toBe(true);
          expect(rm).not.toBeNull();
        }
        if (l.clue && l.clue.type === 'city') expect(l.tier).toBeLessThanOrEqual(1);
        if (l.clue && l.clue.type === 'lock') {
          // kart kilidi: kartı iç mekândaki DÜŞÜK kademeli bir kilit verir (DAG)
          const prov = it.locks.find((x) => x.id === l.clue.source);
          expect(prov, q.kind + ' kart sağlayıcısı').toBeDefined();
          expect(prov.tier).toBeLessThan(l.data.card);
          expect(['kod', 'mini_hack']).toContain(prov.kind);
        }
      });
      // ipucu propları: gerçek ipucu kilidin kodunu paketler (propIndoor şeması), süs kod notları NO_LOCK (0); clues kaydı prop konumuna işaret eder
      it.props.filter((p) => p.kind === 'kod_notu').forEach((p) => {
        if (p.data === NO_LOCK) return;
        const l = it.locks.find((x) => x.clue && x.clue.slot === p.slot);
        expect(l, q.kind + ' ipucu bağı').toBeDefined();
        expect(p.data).toBe(packCode(l.data.code));
        const rec = it.clues.find((c) => c.lockId === l.id);
        expect(rec && rec.slot).toBe(p.slot);
        expect(Math.abs(rec.x - p.x) + Math.abs(rec.z - p.z)).toBeLessThan(1e-9);
      });
      // iç kapıdan çıkış: kilit yalnız girişte (kilitli kapının B tarafı sokağa bağlı kalır)
      expect(it.doors.filter((d) => d.kind === 'street' && d.lock).length).toBe(0);
    });
    // hacker odası her varyantta kilitli; klinik V1 kart, V2 kod
    expect(kinds['hacker_odasi:kod']).toBeGreaterThan(0);
    expect(kinds['hacker_odasi:mini_hack']).toBeGreaterThan(0);
    expect(kinds['klinik:kart']).toBeGreaterThan(0);
    expect(kinds['klinik:kod']).toBeGreaterThan(0);
  });

  it('locks.js çözücüsü (sabit nokta): dış kart OLMADAN, ipucu zorunlu — her bina kendi içinde çözülebilir; her kod kilidinin notu bulunur', () => {
    const bad = [];
    ALL.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      const r = solveReachability(it, { seed: q.seed, lotId: q.bp.id, requireClues: true, externalCards: [] });
      if (!r.ok || r.dag.violations.length) bad.push(q.kind + ' v' + q.variant + ' #' + q.bp.id + ' ' + JSON.stringify(r.unsolved) + r.dag.violations.join(';'));
      const clues = assignClues(it);
      it.locks.forEach((l) => { if (l.kind === 'kod' && !clues.has(l.id)) bad.push(q.kind + ' #' + q.bp.id + ' ipucu eşleşmedi ' + l.id); });
    });
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('gizli oda (hacker V2): bildirilir, kapısı raf propu, `serbest`; odası graf üzerinden ulaşılır', () => {
    pick('hacker_odasi', 2, N).forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      expect(it.hidden).not.toBeNull();
      const d = it.doors.find((x) => x.id === it.hidden.door);
      expect(d.prop).toBe('gizli_kapi_raf');
      expect(d.lock.kind).toBe('serbest');
      expect(it.props.some((p) => p.kind === 'gizli_kapi_raf')).toBe(true);
      expect(reach(it, 99, '').has(it.hidden.room)).toBe(true);
    });
  });
});

describe('interiors_a — aile güvenliği', () => {
  it('sahip adı/unvanı/satırları, oda/kapı kimlikleri ve imza adları güvenli; gerçek marka çakışması yok', () => {
    const seen = new Set();
    ALL.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      const strs = [];
      const walk = (o) => {
        if (typeof o === 'string') strs.push(o);
        else if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') Object.keys(o).forEach((k) => { strs.push(k); walk(o[k]); });
      };
      walk({ rooms: it.rooms.map((r) => [r.id, r.role]), doors: it.doors.map((d) => [d.id, d.kind, d.prop]), props: it.props.map((p) => p.kind), sig: it.signature, ambient: it.ambient, locks: it.locks.map((l) => [l.id, l.kind, l.clue]) });
      if (it.owner) walk([it.owner.name, it.owner.title, it.owner.lines]);
      strs.forEach((s) => {
        if (seen.has(s)) return;
        seen.add(s);
        const clean = String(s).replace(/_/g, ' ');
        expect(isSafeText(clean), 'güvensiz: ' + s).toBe(true);
        expect(findBrandCollision(clean), 'marka: ' + s).toBeNull();
      });
    });
  });
});

describe('interiors_a — yayım (kesit birleşimi = bütün) ve gerçek chunk dünyasında BFS', () => {
  it('chunk dilimlerinin birleşimi, tüm parsel inşasıyla bayt-özdeş (ileri ve ters sıra)', () => {
    let n = 0;
    ALL.filter((q, i) => i % 5 === 0).forEach((q) => {
      const region = regionOf(q.bp);
      const bw = emitWhole(q.bp, q.lot, region);
      [emitSlices(q.bp, q.lot, region, 'forward'), emitSlices(q.bp, q.lot, region, 'reverse')].forEach((slices) => {
        for (let cz = region.z0 / 16; cz < region.z1 / 16; cz++) {
          for (let cx = region.x0 / 16; cx < region.x1 / 16; cx++) {
            const arr = slices.get(cx + ',' + cz);
            let diff = 0;
            for (let y = 0; y < HEIGHT; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) if (arr[(y << 8) + (lz << 4) + lx] !== bw.get(cx * 16 + lx, y, cz * 16 + lz)) diff++;
            expect(diff, q.kind + ' v' + q.variant + ' #' + q.bp.id).toBe(0);
          }
        }
      });
      n++;
    });
    expect(n).toBeGreaterThan(20);
  });

  it('sokaktan her odaya %100 ulaşım (gerçek bloklar + prop çarpışması, kilitler çözülmüş), ulaşılabilir hava ≥ %70', () => {
    const worlds = {};
    const bad = [];
    ALL.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      worlds[q.si] = worlds[q.si] || chunkWorld(SEEDS[q.si]);
      const r = reachableFromStreet(worlds[q.si], it.props, buildingOf(q.bp, it));
      if (!r.ok || r.unreachableRooms.length) bad.push(q.kind + ' v' + q.variant + ' #' + q.bp.id + ' ' + r.streetOk + ' ' + r.fraction.toFixed(2) + ' ' + r.unreachableRooms.join('/'));
    });
    expect(bad).toEqual([]);
  });

  it('kapı önü 3×2 boş ve hiçbir prop sokak kapısını/iç kapıları kapatmaz (doğrulayıcı kapsar); içeriden çıkış serbest: her oda sokak kapısına yürünür', () => {
    ALL.filter((q, i) => i % 3 === 0).forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      const zones = it.doors.filter((d) => !d.from).map((d) => doorClearanceBoxes(d)[0]);
      expect(zones.length).toBeGreaterThanOrEqual(1);
      // her oda giriş odasından erişilir (graf) ve plan düzeyi BFS tam
      const rep = planReachability(it);
      expect(rep.startBlocked).toBe(false);
      expect(rep.unreachableRooms).toEqual([]);
    });
  });
});

describe('interiors_a — kapsam taraması (tüm parseller, 3 tohum, plan düzeyi)', () => {
  it('tüm parsellerde plan null değil, doğrulayıcıdan geçer, prop/anahtar bütçesi, sahip konumu/imza/çip odada', () => {
    const bad = [];
    let n = 0;
    SEEDS.slice(0, 3).forEach((seed) => {
      interiorLots(seed, { kinds: KINDS }).forEach(({ lot, bp }) => {
        const it = planInterior(bp, lot);
        n++;
        if (!it) { bad.push('null #' + bp.id); return; }
        const v = validateInterior(it, { reach: true });
        if (!v.ok) { bad.push(bp.interior.kind + ' #' + bp.id + ' ' + v.errors.slice(0, 2).join('|')); return; }
        const keys = new Set(it.props.map((p) => p.kind));
        if (it.props.length < 20 || it.props.length > 40 || keys.size < 8 || keys.size > 14) bad.push(bp.interior.kind + ' #' + bp.id + ' props ' + it.props.length + '/' + keys.size);
        REQUIRED[bp.interior.kind].forEach((k) => { if (!it.props.some((p) => p.kind === k)) bad.push(bp.interior.kind + ' #' + bp.id + ' eksik ' + k); });
        const inRoom = (p) => it.rooms.some((r) => p.x >= r.x0 && p.x < r.x1 && p.z >= r.z0 && p.z < r.z1);
        if (!it.signature || !inRoom(it.signature) || !it.chips.length || !it.chips.every(inRoom) || !it.ownerPost || !inRoom(it.ownerPost)) bad.push(bp.interior.kind + ' #' + bp.id + ' imza/çip/sahip');
      });
    });
    expect(n).toBeGreaterThan(1500);
    expect(bad).toEqual([]);
    expect(INTERIOR_ERRORS.length).toBe(0);
  });

  it('örneklem çeşitli: 4 kapı yüzü, ayna, en az bir kule çekirdeği engelli parsel (loft/klinik/oyuncu), alçak (H=3) parsel', () => {
    const faces = new Set(ALL.map((q) => q.bp.doors[0].face));
    expect(faces.size).toBe(4);
    const frames = ALL.map((q) => makeFrame(q.bp, q.lot, {}));
    expect(frames.some((fr) => fr.obstacles.length > 0)).toBe(true);
    expect(ALL.some((q, i) => frames[i].obstacles.length > 0 && q.kind === 'klinik')).toBe(true);
    expect(ALL.some((q, i) => frames[i].obstacles.length > 0 && q.kind === 'loft')).toBe(true);
    expect(frames.some((fr) => fr.H === 3)).toBe(true);
    const swapped = ALL.filter((q, i) => (q.kind === 'ramen_bari' && frames[i].W < frames[i].D) || (q.kind === 'klinik' && frames[i].W < frames[i].D) || (q.kind === 'loft' && frames[i].W < frames[i].D));
    expect(swapped.length).toBeGreaterThan(5);
    const mirrors = ALL.map((q) => frameOf(planInterior(q.bp, q.lot)).mirror);
    expect(mirrors.some((m) => m)).toBe(true);
    expect(mirrors.some((m) => !m)).toBe(true);
  });

  it('kilit DAG sabit nokta: tüm kilitler (kod/ipucu/kart şehir kaynağı/mini oyun) çözülünce her oda açılır; hapis yok (çıkış her zaman serbest)', () => {
    ALL.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      const opened = new Set();
      const reachRooms = () => {
        const seen = new Set([it.entry.room]);
        const st = [it.entry.room];
        while (st.length) {
          const c = st.pop();
          it.graph.forEach(([a, b, did]) => {
            const other = a === c ? b : b === c ? a : null;
            if (!other || seen.has(other)) return;
            const d = it.doors.find((x) => x.id === did);
            if (d.lock && d.lock.kind !== 'serbest' && !opened.has(d.lock.id)) return;
            seen.add(other);
            st.push(other);
          });
        }
        return seen;
      };
      let progress = true;
      let guard = 0;
      while (progress && guard++ < 20) {
        progress = false;
        const rooms = reachRooms();
        it.locks.forEach((l) => {
          if (opened.has(l.id) || l.kind === 'serbest') return;
          const g = it.graph.find((e) => e[2] === l.door);
          if (!rooms.has(g[0]) && !rooms.has(g[1])) return; // kilide hâlâ ulaşılamıyor
          let ok = true;
          if (l.kind === 'kod' && l.clue && l.clue.type === 'prop') ok = rooms.has(l.clue.room);
          if (l.kind === 'kart' && l.clue && l.clue.type === 'prop') ok = rooms.has(l.clue.room);
          if (ok) { opened.add(l.id); progress = true; }
        });
      }
      const rooms = reachRooms();
      expect(rooms.size, q.kind + ' v' + q.variant + ' #' + q.bp.id + ' tüm odalar açılır').toBe(it.rooms.length);
    });
  });

  it('yayım yalnız kendi hacmine (+1 halka, zemin satırından tavana) yazar', () => {
    const SENT = 99;
    ALL.filter((q, i) => i % 4 === 1).forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      const region = regionOf(q.bp, 6);
      const bw = emitWhole(q.bp, q.lot, region, SENT);
      const B = it.bounds;
      for (let y = 0; y < HEIGHT; y++) {
        for (let z = region.z0; z < region.z1; z++) {
          for (let x = region.x0; x < region.x1; x++) {
            const inside = x >= B.x0 - 1 && x < B.x1 + 1 && z >= B.z0 - 1 && z < B.z1 + 1 && y >= B.y0 - 1 && y <= B.y1;
            if (!inside) {
              if (bw.get(x, y, z) !== SENT) throw new Error(q.kind + ' hacim dışına yazdı ' + x + ',' + y + ',' + z);
            }
          }
        }
      }
    });
  });
});

/* Ağır tam tarama (yalnız IA_FULL=1): 8 tohumdaki TÜM parsellerde gerçek bloklarla sokaktan BFS.
 * Bilinen YUKARI AKIŞ hatası (cityplan buildingPlan.extStairFor): dış yangın merdiveni kapı önü hücresini kaplarsa sokak kapıya varamaz
 * (street=false); bu parseller ayrı sayılır ve her birinin nedeni gerçekten dış merdiven çakışması olmalıdır. */
const FULL = !!(globalThis.process && globalThis.process.env && globalThis.process.env.IA_FULL);
describe('interiors_a — tam tarama (IA_FULL=1)', () => {
  (FULL ? it : it.skip)('8 tohum × tüm parseller: sokaktan her odaya ulaşım, hava ≥ %70', () => {
    const bad = [];
    const upstream = [];
    let n = 0;
    SEEDS.slice(0, 8).forEach((seed) => {
      const world = chunkWorld(seed);
      interiorLots(seed, { kinds: KINDS }).forEach(({ lot, bp }) => {
        const it = planInterior(bp, lot);
        const r = reachableFromStreet(world, it.props, buildingOf(bp, it));
        n++;
        if (!r.streetOk) {
          const es = bp.extStair;
          const f = bp.doors[0].front;
          const onStair = !!es && (es.flights.some((c) => c.x === f.x && c.z === f.z) || (es.landing && es.landing.cells && es.landing.cells.some((c) => c.x === f.x && c.z === f.z)));
          (onStair ? upstream : bad).push(bp.interior.kind + ' #' + bp.id + ' kapı önü ' + (onStair ? 'dış merdivenle çakışıyor' : 'kapalı'));
          return;
        }
        if (!r.ok || r.unreachableRooms.length || r.fraction < 0.7) bad.push(bp.interior.kind + ' v' + bp.interior.variant + ' #' + bp.id + ' ' + r.fraction.toFixed(3) + ' ' + r.unreachableRooms.join('/'));
      });
    });
    expect(n).toBeGreaterThan(3000);
    expect(bad.slice(0, 20)).toEqual([]);
    console.log('yukarı akış (dış merdiven kapı önünü kapatıyor): ' + upstream.length);
  }, 900000);
});

/* ------------------------------------------------------------------------------------------------
 * Boyut taraması: gerçek parselin kapısına bağlı SENTETİK dikdörtgenlerle (4 yüz × 6 boyut × 3 varyant × 6 tür) plan + doğrulayıcı + yayım
 * ---------------------------------------------------------------------------------------------- */
function mockBp(bp, W, D, k) {
  const d = bp.doors[0];
  const dx = d.x;
  const dz = d.z;
  const hw = Math.floor(W / 2);
  let r;
  if (d.face === 'n') r = { x0: dx - hw, x1: dx - hw + W, z0: dz + 1, z1: dz + 1 + D };
  else if (d.face === 's') r = { x0: dx - hw, x1: dx - hw + W, z0: dz - D, z1: dz };
  else if (d.face === 'e') r = { x0: dx - D, x1: dx, z0: dz - hw, z1: dz - hw + W };
  else r = { x0: dx + 1, x1: dx + 1 + D, z0: dz - hw, z1: dz - hw + W };
  const interior = Object.assign({}, bp.interior, r);
  return Object.assign({}, bp, { id: bp.id * 100 + k, interior, core: [] });
}

describe('interiors_a — boyut taraması (sentetik dikdörtgenler)', () => {
  it('her tür/varyant/yüz/boyutta plan geçerli (doğrulayıcı), prop/anahtar bütçesi sağlanır, yayım hata vermez ve kesit birleşimi = bütün', () => {
    const bad = [];
    let n = 0;
    KINDS.forEach((kind) => {
      const fp = getInterior(kind).footprint(0);
      const dims = [[fp.w, fp.d], [fp.d, fp.w], [fp.w + 1, fp.d], [fp.w, fp.d + 1], [fp.w + 2, fp.d + 2], [fp.d + 1, fp.w]];
      [0, 1, 2].forEach((variant) => {
        ['n', 'e', 's', 'w'].forEach((face) => {
          const q = ALL.find((x) => x.kind === kind && x.variant === variant && x.bp.doors[0].face === face && makeFrame(x.bp, x.lot, {}).obstacles.length === 0 && makeFrame(x.bp, x.lot, {}).H >= 4);
          if (!q) return;
          dims.forEach(([w, d], di) => {
            const bp2 = mockBp(q.bp, w, d, di + 1);
            clearInteriorCache();
            const lot2 = { id: bp2.id };
            const it = planInterior(bp2, lot2);
            n++;
            const tag = kind + ' v' + variant + ' ' + face + ' ' + w + 'x' + d;
            if (!it) { bad.push(tag + ' plan null'); return; }
            const v = validateInterior(it, { reach: true });
            if (!v.ok) bad.push(tag + ' ' + v.errors.slice(0, 2).join('|'));
            const keys = new Set(it.props.map((p) => p.kind));
            if (it.props.length < 16 || it.props.length > 40 || keys.size < 7 || keys.size > 14) bad.push(tag + ' prop ' + it.props.length + '/' + keys.size);
            try {
              const region = regionOf(bp2, 4);
              const bw = emitWhole(bp2, lot2, region);
              const s1 = emitSlices(bp2, lot2, region, 'forward');
              for (let cz = region.z0 / 16; cz < region.z1 / 16; cz++) {
                for (let cx = region.x0 / 16; cx < region.x1 / 16; cx++) {
                  const arr = s1.get(cx + ',' + cz);
                  for (let y = 60; y < 80; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) if (arr[(y << 8) + (lz << 4) + lx] !== bw.get(cx * 16 + lx, y, cz * 16 + lz)) throw new Error('kesit farkı');
                }
              }
            } catch (e) {
              bad.push(tag + ' yayım: ' + e.message);
            }
          });
        });
      });
    });
    expect(n).toBeGreaterThan(300);
    expect(bad.slice(0, 20)).toEqual([]);
    clearInteriorCache();
  });
});
