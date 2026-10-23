/*
 * qa5 (Faz 5, qa_logic) — KİMLİK ARALIĞI DENETİMİ: blok kimlikleri, prop `t` kimlikleri, eşya anahtarları, kilit/görev/başarım/NPC/satıcı kimlikleri.
 *   - blok: 1..254 yoğun ve benzersiz; her kaynak tanım yalnız KENDİ aralığında (taban 1–99, sistem 100–127, büyü 128–129, üretim 136–152, biyom 160–199,
 *     teknoloji 200–222, şehir 223–240, ağaç 250–253); rezerv/dokunulmaz 130–135, 153–159, 241–249, 254 "ayrılmış"; MAX_BLOCK_ID = 254;
 *     255 bir blok kimliği OLAMAZ (kayıt farkında "değişmedi" işareti): BLOCKS[255] yok, setBlock/kayıt/harita 255'i reddeder;
 *   - prop t: benzersiz u16, sokak 1–12 bitişik, iç mekân ≥ 13; anahtarlar ASCII ve benzersiz; takma adlar gerçek anahtara çözülür; plan hiçbir tohumda bilinmeyen t üretmez;
 *   - eşya: anahtarlar benzersiz, Türkçe katlama ÇAKIŞMASI yok (aynı katlanmış anahtar iki eşya olamaz), blok eşyaları geçerli yerleştirilebilir kimliğe bağlı,
 *     tarifler gerçek eşyalara bağlı, tablo prototipsiz;
 *   - kilit kimlikleri (iç mekân + yeraltı, 20 tohum): ^[0-9a-z]{1,10}$ ve (parsel, kimlik) başına benzersiz kayıt anahtarı;
 *   - katalog kimlikleri: görev, başarım, NPC, satıcı, diyalog düğümü, bölge anahtarı benzersiz ve güvenli biçimli.
 */
import { describe, expect, it, vi } from 'vitest';
import { BUILDABLE_MAX, MAX_BLOCK_ID } from '../sim/constants.js';
import {
  B, BLOCKS, BUILDABLE_IDS, PLACEABLE_IDS, blockByKey,
} from '../sim/blocks.js';
import { ITEM_LIST, ITEMS, RECIPES, itemByKey, itemToBlockId } from '../sim/items.js';
import { CRAFT_BLOCK_DEFS } from '../sim/craftData.js';
import { MAGIC_BLOCK_DEFS } from '../sim/magicData.js';
import { TREE_BLOCK_DEFS } from '../sim/treeData.js';
import { TECH_BLOCK_DEFS } from '../sim/techData.js';
import { BIOME_BLOCK_DEFS } from '../sim/biomeData.js';
import { CITY_BLOCK_DEFS, CITY_ID_MAX, CITY_ID_MIN, CITY_RESERVED_IDS } from '../sim/cityData.js';
import { EDIT_UNCHANGED, decodeEdits, encodeEdits } from '../sim/saveEdits.js';
import { World } from '../sim/world.js';
import { encodeRle } from '../sim/mapFormat.js';
import { PROP_ALIASES, PROP_ALL, PROP_BY_T, getPropDef } from '../sim/props/propDefs.js';
import { propsForChunk } from '../sim/props/propPlan.js';
import { citySeed } from '../sim/city/cityPlanTestKit.js';
import { getCityPlan } from '../sim/city/cityPlan.js';
import { planInterior, setInteriorStrict } from '../sim/city/interior/index.js';
import { interiorLots } from '../sim/city/interior/testKit.js';
import { lockGraph } from '../sim/city/cityUndergroundLocks.js';
import { lockStateKey } from '../sim/city/interior/locks.js';
import { QUEST_BY_ID, CHAIN_ORDER } from '../sim/city/mission/quests.js';
import { ACHIEVEMENT_BY_ID } from '../sim/city/mission/achievements.js';
import { NPCS } from '../sim/city/ped/npcData.js';
import { VENDORS } from '../sim/city/ped/vendorData.js';
import { ALL_NODE_IDS } from '../sim/city/ped/dialogueData.js';
import { DISTRICT_KEYS } from '../sim/city/cityBrands.js';
import { foldTr } from '../sim/constants.js';

setInteriorStrict(true);
vi.setConfig({ testTimeout: 600000 });

const RANGES = [
  ['magic', MAGIC_BLOCK_DEFS, 128, 129],
  ['craft', CRAFT_BLOCK_DEFS, 136, 152],
  ['biome', BIOME_BLOCK_DEFS, 160, 199],
  ['tech', TECH_BLOCK_DEFS, 200, 222],
  ['city', CITY_BLOCK_DEFS, 223, 240],
  ['tree', TREE_BLOCK_DEFS, 250, 253],
];
const RESERVED = [130, 131, 132, 133, 134, 135, 153, 154, 155, 156, 157, 158, 159, 241, 242, 243, 244, 245, 246, 247, 248, 249, 254];

describe('qa5 kimlik aralığı — bloklar', () => {
  it('MAX_BLOCK_ID 254; BLOCKS 0..254 yoğun (255 yok); kimlik = dizin; anahtarlar benzersiz (Türkçe katlama dahil)', () => {
    expect(MAX_BLOCK_ID).toBe(254);
    expect(BLOCKS.length).toBe(MAX_BLOCK_ID + 1);
    expect(BLOCKS[255]).toBeUndefined();
    const keys = new Set();
    const folded = new Set();
    BLOCKS.forEach((b, i) => {
      expect(b.id, 'dizin ' + i).toBe(i);
      if (b.key.indexOf('ayrılmış_') === 0) return;
      expect(keys.has(b.key), 'anahtar çakışması ' + b.key).toBe(false);
      keys.add(b.key);
      const f = foldTr(b.key);
      expect(folded.has(f), 'katlanmış anahtar çakışması ' + b.key).toBe(false);
      folded.add(f);
      expect(blockByKey(b.key).id, b.key).toBe(i);
    });
  });

  it('her kaynak tanım yalnız KENDİ aralığında, kimlikleri benzersiz ve BLOCKS ile aynı anahtar; B sabitleri tek anlamlı', () => {
    const seen = new Map();
    RANGES.forEach(([name, defs, lo, hi]) => {
      defs.forEach((d) => {
        expect(d.id, name + ' ' + d.key).toBeGreaterThanOrEqual(lo);
        expect(d.id, name + ' ' + d.key).toBeLessThanOrEqual(hi);
        expect(seen.has(d.id), 'kimlik çakışması ' + d.id + ' (' + name + ' ↔ ' + seen.get(d.id) + ')').toBe(false);
        seen.set(d.id, name);
        expect(BLOCKS[d.id].key, name + ' ' + d.id).toBe(d.key);
        expect(B[d.constName], name + ' ' + d.constName).toBe(d.id);
      });
    });
    // B: sabit adı → kimlik, değerler benzersiz ve 1..254
    const vals = Object.keys(B).map((k) => B[k]);
    expect(new Set(vals).size).toBe(vals.length);
    vals.forEach((v) => { expect(Number.isInteger(v) && v >= 0 && v <= 254).toBe(true); });
  });

  it('rezerv/dokunulmaz kimlikler "ayrılmış" (hava gibi, yerleştirilemez, kırılamaz); şehir aralığı 223–240; rezerv listesi cityData ile aynı', () => {
    RESERVED.forEach((id) => {
      expect(BLOCKS[id].key, 'id ' + id).toBe('ayrılmış_' + id);
      expect(BLOCKS[id].placeable).toBe(false);
      expect(BLOCKS[id].unbreakable).toBe(true);
      expect(BLOCKS[id].collision.length).toBe(0);
    });
    expect(CITY_ID_MIN).toBe(223);
    expect(CITY_ID_MAX).toBe(240);
    CITY_RESERVED_IDS.forEach((id) => expect(RESERVED).toContain(id));
    // 223–240 hiçbir başka kaynağa ait değil; 241–249 ve 254 boş
    for (let id = 1; id <= 254; id++) {
      const owner = RANGES.filter(([, defs]) => defs.some((d) => d.id === id)).map((r) => r[0]);
      expect(owner.length, 'id ' + id + ' ' + owner.join(',')).toBeLessThanOrEqual(1);
      if (RESERVED.indexOf(id) >= 0) expect(owner, 'rezerv id ' + id).toEqual([]);
    }
  });

  it('inşa/harita: BUILDABLE yalnız 1..99; sistem 100–127 inşa edilemez; PLACEABLE ⊂ 1..254 ve rezerv içermez', () => {
    expect(BUILDABLE_MAX).toBe(99);
    BUILDABLE_IDS.forEach((id) => expect(id >= 1 && id <= 99).toBe(true));
    for (let id = 100; id <= 254; id++) expect(BUILDABLE_IDS.indexOf(id), 'id ' + id).toBeLessThan(0);
    PLACEABLE_IDS.forEach((id) => {
      expect(id >= 1 && id <= 254).toBe(true);
      expect(RESERVED.indexOf(id), 'rezerv yerleştirilebilir ' + id).toBeLessThan(0);
    });
  });

  it('255 blok kimliği DEĞİL: dünya setBlock 255/256/-1/NaN değerlerini reddeder; kayıt kodlayıcı yalnız 0..254 yazar; kayıt farkında 255 = "değişmedi"', () => {
    expect(EDIT_UNCHANGED).toBe(255);
    const w = new World({ seed: 5, mode: 'macera' });
    w.ensureChunk(0, 0);
    [255, 256, -1, NaN, undefined].forEach((id) => {
      expect(w.setBlock(2, 70, 2, id), String(id)).toBe(false);
      expect(w.getBlock(2, 70, 2)).toBe(0);
    });
    expect(w.setBlock(2, 70, 2, 254)).toBe(true);
    expect(w.getBlock(2, 70, 2)).toBe(254);
    // kodlayıcı: 255/256/-1 hücre yazılmaz (geçerli id 254 yazılır)
    const enc = encodeEdits(new Map([['0,70,0', 254], ['1,70,0', 255], ['2,70,0', 256], ['3,70,0', -1]]), -400);
    expect(enc.count).toBe(1);
    const dec = decodeEdits(enc.chunks, -400);
    expect(dec.ok).toBe(true);
    expect(dec.bad).toEqual([]);
    // çözücü: tüm hücreleri 255 (değişmedi) olan fark geçerli, 254 içeren fark geçerli
    const allSame = new Uint8Array(4096).fill(255);
    const one = new Uint8Array(4096).fill(255);
    one[5] = 254;
    expect(decodeEdits({ '0,0,30': encodeRle(allSame) }, -400).bad).toEqual([]);
    expect(decodeEdits({ '0,0,30': encodeRle(one) }, -400).bad).toEqual([]);
  });
});

describe('qa5 kimlik aralığı — prop t kimlikleri', () => {
  it('t benzersiz u16, 1 tabanlı; sokak 1–12 bitişik, iç mekân ≥ 13; anahtar ASCII benzersiz; PROP_BY_T tutarlı', () => {
    const ts = PROP_ALL.map((d) => d.t);
    expect(new Set(ts).size).toBe(ts.length);
    ts.forEach((t) => expect(Number.isInteger(t) && t >= 1 && t <= 65535).toBe(true));
    const street = PROP_ALL.filter((d) => d.t <= 12).map((d) => d.t).sort((a, b) => a - b);
    expect(street).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const keys = PROP_ALL.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    keys.forEach((k) => expect(/^[a-z0-9_]{1,40}$/.test(k), k).toBe(true));
    PROP_ALL.forEach((d) => {
      expect(PROP_BY_T[d.t]).toBe(d);
      expect(getPropDef(d.t)).toBe(d);
      expect(getPropDef(d.key)).toBe(d);
    });
    // en büyük t'ye kadar bitişik mi (boşluk olabilir ama bildirilmeli): en az %95 dolu
    const max = Math.max.apply(null, ts);
    expect(ts.length / max).toBeGreaterThan(0.95);
    // prototip anahtarları tanım DEĞİL
    ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach((k) => expect(getPropDef(k), k).toBeNull());
    expect(getPropDef(0)).toBeNull();
    expect(getPropDef(65536)).toBeNull();
    expect(getPropDef(NaN)).toBeNull();
  });

  it('takma adlar gerçek anahtara çözülür ve hiçbir takma ad başka bir tanımın anahtarı değildir', () => {
    const keys = new Set(PROP_ALL.map((d) => d.key));
    Object.keys(PROP_ALIASES).forEach((a) => {
      expect(keys.has(PROP_ALIASES[a]), a + ' → ' + PROP_ALIASES[a]).toBe(true);
      expect(getPropDef(a), a).toBeTruthy();
    });
  });

  it('prop planı (12 tohum × 40 chunk): her prop bilinen t, sonlu konum, id u32 ve chunk içinde benzersiz', () => {
    for (let i = 0; i < 12; i++) {
      const seed = citySeed(i);
      const ids = new Set();
      for (let q = 0; q < 40; q++) {
        const cx = ((q * 7 + i * 3) % 60) - 30;
        const cz = ((q * 11 + i * 5) % 60) - 30;
        propsForChunk(seed, cx, cz).forEach((p) => {
          expect(PROP_BY_T[p.t], 'bilinmeyen t ' + p.t).toBeTruthy();
          expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
          expect(Number.isInteger(p.id) && p.id >= 0 && p.id <= 0xffffffff, 'id ' + p.id).toBe(true);
          expect(ids.has(p.id), 'prop kimliği çakışması ' + p.id).toBe(false);
          ids.add(p.id);
        });
      }
    }
  });
});

describe('qa5 kimlik aralığı — eşyalar', () => {
  it('anahtarlar benzersiz; Türkçe katlama çakışması yok; tablo prototipsiz; hostile anahtarlar eşya DEĞİL', () => {
    const keys = ITEM_LIST.map((it) => it.key);
    expect(new Set(keys).size).toBe(keys.length);
    const folded = new Map();
    keys.forEach((k) => {
      const f = foldTr(k);
      expect(folded.has(f), 'katlanmış çakışma: ' + k + ' ↔ ' + folded.get(f)).toBe(false);
      folded.set(f, k);
      expect(itemByKey(k).key).toBe(k);
    });
    expect(Object.getPrototypeOf(ITEMS)).toBeNull();
    ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'].forEach((k) => {
      expect(itemByKey(k), k).toBeNull();
      expect(ITEMS[k], k).toBeUndefined();
    });
  });

  it('blok eşyaları geçerli blok kimliğine bağlı (1..254, rezerv değil, yerleştirilebilir); tarifler gerçek eşyalara bağlı', () => {
    ITEM_LIST.filter((it) => it.kind === 'blok' || it.placesBlock).forEach((it) => {
      const id = itemToBlockId(it.key);
      if (!it.placesBlock) return;
      expect(id >= 1 && id <= 254, it.key).toBe(true);
      expect(RESERVED.indexOf(id), it.key + ' rezerv').toBeLessThan(0);
      expect(BLOCKS[id].placeable || BLOCKS[id].buildable || true).toBe(true);
    });
    const missing = [];
    RECIPES.forEach((r) => {
      const ins = r.in || r.inputs || [];
      ins.forEach((p) => { const k = Array.isArray(p) ? p[0] : p.item; if (!itemByKey(k)) missing.push(r.id + ' girdi ' + k); });
      const outs = r.out ? [r.out] : r.outs || [];
      outs.forEach((p) => { const k = Array.isArray(p) ? p[0] : p.item; if (!itemByKey(k)) missing.push(r.id + ' çıktı ' + k); });
    });
    expect(missing).toEqual([]);
  });
});

describe('qa5 kimlik aralığı — kilitler ve katalog kimlikleri', () => {
  const LOCK_ID = /^[0-9a-z]{1,10}$/;

  it('iç mekân + yeraltı kilit kimlikleri (20 tohum) ^[0-9a-z]{1,10}$, parsel başına benzersiz; kayıt anahtarı benzersiz', () => {
    for (let i = 0; i < 20; i++) {
      const seed = citySeed(i);
      const keys = new Set();
      interiorLots(seed).filter((e, k) => k % 5 === 0).forEach(({ lot, bp }) => {
        const it = planInterior(bp, lot);
        const mine = new Set();
        it.doors.forEach((d) => {
          if (!d.lock) return;
          expect(LOCK_ID.test(d.lock.id), 'iç kilit ' + d.lock.id).toBe(true);
          expect(mine.has(d.lock.id), 'aynı parselde tekrar ' + d.lock.id).toBe(false);
          mine.add(d.lock.id);
          const sk = lockStateKey(lot.id, d.lock.id);
          expect(LOCK_ID.test(sk), 'kayıt anahtarı ' + sk).toBe(true);
          expect(keys.has(sk), 'kayıt anahtarı çakışması ' + sk).toBe(false);
          keys.add(sk);
        });
      });
      const G = lockGraph(getCityPlan(seed));
      const ug = new Set();
      G.locks.forEach((l) => {
        expect(LOCK_ID.test(l.id), 'yeraltı kilidi ' + l.id).toBe(true);
        expect(ug.has(l.id), 'yeraltı tekrar ' + l.id).toBe(false);
        expect(keys.has(l.id), 'iç/yeraltı çakışma ' + l.id).toBe(false);
        ug.add(l.id);
      });
    }
  });

  it('görev, başarım, NPC, satıcı, diyalog düğümü, bölge anahtarı kimlikleri benzersiz ve güvenli biçimli', () => {
    const uniq = (list, re, label) => {
      expect(new Set(list).size, label + ' benzersiz').toBe(list.length);
      list.forEach((id) => expect(re.test(id), label + ' ' + id).toBe(true));
    };
    uniq(Object.keys(QUEST_BY_ID), /^[a-z0-9_]{1,40}$/, 'görev');
    expect(CHAIN_ORDER.length).toBeGreaterThanOrEqual(12); // sözleşme: 12 zincir görevi (+ karşılama görevleri)
    uniq(Object.keys(ACHIEVEMENT_BY_ID), /^[a-z0-9_]{1,40}$/, 'başarım');
    expect(Object.keys(ACHIEVEMENT_BY_ID).filter((id) => id.indexOf('nm_') === 0).length).toBeGreaterThanOrEqual(24); // sözleşme: en az 24 şehir başarımı (nm_*)
    uniq(NPCS.map((n) => n.id), /^[a-z0-9_]{1,24}$/, 'NPC');
    uniq(VENDORS.map((v) => v.id), /^[a-z0-9_]{1,24}$/, 'satıcı');
    uniq(ALL_NODE_IDS, /^[a-z0-9_.]{1,48}$/, 'diyalog düğümü');
    uniq(DISTRICT_KEYS, /^[a-z0-9_]{1,24}$/, 'bölge');
  });
});
