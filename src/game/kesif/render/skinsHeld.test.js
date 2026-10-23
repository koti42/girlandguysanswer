/*
 * Keşif görünümü × elde tutulan eşya (gerçek three, GL yok): skin yalnız PARAMETRE değiştirir — mesh sayısı, malzeme türü ve geometri kümesi
 * skin'siz modelle AYNI; skin'i kaldırmak varsayılan renkleri BİREBİR geri getirir; aynı skin ikinci kez hiçbir şey tahsis etmez;
 * önbellek sınırsız büyümez; ton döngüsü yalnız low-dışı/kısıtlı-hareket-dışı ve modele özel klonlarla.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ITEM_LIST } from '../sim/items.js';
import { itemSpec } from './itemPalette.js';
import {
  createHeldItemModel, disposeHeldItemCache, disposeHeldItemModel, pruneHeldSkinCache,
} from './heldItems.js';
import { basicMat, kitStats, pruneSkinMats, setSkinScope, stdMat } from './heldItemsKit.js';
import { releaseHeldItemCache, retainHeldItemCache } from './heldItems.js';
import { KESIF } from '../../shop/designs/kesif.js';
import { resolveSkinSet } from './skins.js';

const HIGH = { tier: 'high' };
const keyOfKind = (kind, tier) => ITEM_LIST.find((it) => itemSpec(it).kind === kind && (tier === undefined || itemSpec(it).tier === tier)).key;
const KEYS = {
  portalgun: keyOfKind('portalgun'),
  pick: keyOfKind('pick', 'demir'),
  axe: keyOfKind('axe', 'taş'),
  shovel: keyOfKind('shovel'),
  staff: keyOfKind('staff'),
  jetpack: keyOfKind('jetpack'),
};
const LOADOUT_FOR = {
  portalgun: { portal: 'portal:neon-sokak' },
  pick: { alet: 'alet:neon-serit' },
  axe: { alet: 'alet:lale-kirmizisi' },
  shovel: { alet: 'alet:buz-mavisi' },
  staff: { asa: 'asa:zumrut-orman' },
  jetpack: { jet: 'jet:altin-kivilcim' },
};

function snapshot(model) {
  const meshes = [];
  const geos = new Set();
  const types = {};
  model.traverse((o) => {
    if (!o.isMesh) return;
    meshes.push(o);
    geos.add(o.geometry);
    const m = o.material;
    types[m.type] = (types[m.type] || 0) + 1;
  });
  return { n: meshes.length, geos, types, colors: meshes.map((o) => (o.material.color ? o.material.color.getHex() : -1)) };
}

afterEach(() => disposeHeldItemCache());

describe('skin\'li model = aynı yapı, farklı parametre', () => {
  Object.keys(KEYS).forEach((kind) => {
    it(kind + ': mesh sayısı, malzeme türleri ve geometri kümesi skin\'siz modelle AYNI; renkler değişir', () => {
      const set = resolveSkinSet(LOADOUT_FOR[kind], HIGH);
      const base = createHeldItemModel(THREE, KEYS[kind]);
      const skinned = createHeldItemModel(THREE, KEYS[kind], undefined, set);
      const a = snapshot(base);
      const b = snapshot(skinned);
      expect(b.n).toBe(a.n);
      expect(b.types).toEqual(a.types);
      expect(b.geos.size).toBe(a.geos.size);
      a.geos.forEach((g) => expect(b.geos.has(g), 'aynı (paylaşılan) geometri').toBe(true));
      expect(b.colors).not.toEqual(a.colors);
      expect(skinned.userData.skinKey).not.toBe('');
      expect(base.userData.skinKey).toBe('');
      // tarif nesnesi dondurulmuş kalır
      expect(Object.isFrozen(itemSpec(KEYS[kind]))).toBe(true);
    });

    it(kind + ': skin\'i kaldırmak varsayılan görünümü BİREBİR geri getirir', () => {
      const before = snapshot(createHeldItemModel(THREE, KEYS[kind]));
      const set = resolveSkinSet(LOADOUT_FOR[kind], HIGH);
      createHeldItemModel(THREE, KEYS[kind], undefined, set);
      const none = createHeldItemModel(THREE, KEYS[kind], undefined, resolveSkinSet(null, HIGH));
      const after = snapshot(none);
      expect(after.colors).toEqual(before.colors);
      expect(after.n).toBe(before.n);
      expect(none.userData.skinKey).toBe('');
    });
  });

  it('skinlenmeyen türler (kılıç, yay, ışın tüfeği, kalkan) tüm yuvalar dolu olsa da DEĞİŞMEZ', () => {
    const all = resolveSkinSet({
      portal: 'portal:altin-kapi', alet: 'alet:yildiz-demiri', asa: 'asa:mercan', jet: 'jet:yildiz-izi', arac: 'arac:limonata', gecis: 'gecis:neon-dalga',
    }, HIGH);
    ['sword', 'bow', 'gun', 'shield', 'torch', 'block'].forEach((k) => {
      const it = ITEM_LIST.find((i) => itemSpec(i).kind === k);
      if (!it) return;
      const a = snapshot(createHeldItemModel(THREE, it.key));
      const b = snapshot(createHeldItemModel(THREE, it.key, undefined, all));
      expect(b.colors, k).toEqual(a.colors);
      expect(createHeldItemModel(THREE, it.key, undefined, all).userData.skinKey, k).toBe('');
    });
  });

  it('büyülü (#e) eşyada da çalışır ve parıltı korunur', () => {
    const set = resolveSkinSet(LOADOUT_FOR.pick, HIGH);
    const g = createHeldItemModel(THREE, KEYS.pick + '#e', undefined, set);
    expect(g.userData.glint).toBe(true);
    expect(g.userData.skinKey).not.toBe('');
  });
});

describe('önbellek ve tahsis', () => {
  it('aynı skin\'i ikinci kez uygulamak yeni malzeme/geometri tahsis ETMEZ', () => {
    const set = resolveSkinSet({ portal: 'portal:okyanus-akintisi', alet: 'alet:neon-serit', asa: 'asa:gece-moru', jet: 'jet:pembe-bulut' }, HIGH);
    Object.keys(KEYS).forEach((k) => createHeldItemModel(THREE, KEYS[k], undefined, set));
    const s1 = kitStats();
    Object.keys(KEYS).forEach((k) => disposeHeldItemModel(createHeldItemModel(THREE, KEYS[k], undefined, set)));
    expect(kitStats()).toEqual(s1);
  });

  it('29 skin art arda uygulanıp kullanılmayanlar budanınca malzeme sayısı sınırlı kalır', () => {
    // temel: skin yok
    Object.keys(KEYS).forEach((k) => createHeldItemModel(THREE, KEYS[k]));
    const base = kitStats().mats;
    let peak = 0;
    for (let r = 0; r < 2; r++) {
      KESIF.forEach((d) => {
        const set = resolveSkinSet({ [d.kind]: d.id }, HIGH);
        Object.keys(KEYS).forEach((k) => createHeldItemModel(THREE, KEYS[k], undefined, set));
        pruneHeldSkinCache(new Set(Object.keys(set).filter((s) => set[s] && set[s].key).map((s) => set[s].key)));
        peak = Math.max(peak, kitStats().mats);
      });
    }
    pruneHeldSkinCache(new Set());
    expect(kitStats().skinMats).toBe(0);
    expect(kitStats().mats).toBeLessThanOrEqual(base + 4);
    // tek skin'in tutabildiği en çok malzeme, tüm kayıtlı skin'lerinkinden çok daha az
    expect(peak - base).toBeLessThan(40);
  });

  it('budama kullanımdaki skin\'e dokunmaz; varsayılan görünümün malzemeleri (skinsiz) asla atılmaz', () => {
    const base = createHeldItemModel(THREE, KEYS.shovel);
    const baseColors = snapshot(base).colors;
    const set = resolveSkinSet(LOADOUT_FOR.shovel, HIGH);
    const m = createHeldItemModel(THREE, KEYS.shovel, undefined, set);
    const used = snapshot(m).colors;
    pruneHeldSkinCache(new Set([set.alet.key]));
    expect(snapshot(createHeldItemModel(THREE, KEYS.shovel, undefined, set)).colors).toEqual(used);
    pruneHeldSkinCache(new Set());
    expect(snapshot(createHeldItemModel(THREE, KEYS.shovel)).colors).toEqual(baseColors);
  });

  it('disposeHeldItemCache (oyun kapanışı) skin malzemelerini de temizler', () => {
    createHeldItemModel(THREE, KEYS.staff, undefined, resolveSkinSet({ asa: 'asa:mercan' }, HIGH));
    expect(kitStats().skinMats).toBeGreaterThan(0);
    disposeHeldItemCache();
    expect(kitStats()).toEqual({ geos: 0, mats: 0, skinMats: 0 });
  });
});

describe('gökkuşağı asa: ton döngüsü kuralları', () => {
  const cyc = (env) => createHeldItemModel(THREE, KEYS.staff, undefined, resolveSkinSet({ asa: 'asa:gokkusagi-isigi' }, env));
  const coreColor = (m) => { let c = -1; m.traverse((o) => { if (c < 0 && o.isMesh && o.material.isMeshBasicMaterial && !o.material.transparent) c = o.material.color.getHex(); }); return c; };

  it('high: modele özel klon malzemeler (owned), update ile renk döner; paylaşılan önbellek malzemesi DEĞİŞMEZ', () => {
    const shared = createHeldItemModel(THREE, KEYS.staff, undefined, resolveSkinSet({ asa: 'asa:mercan' }, HIGH));
    const sharedColor = coreColor(shared);
    const m = cyc(HIGH);
    expect((m.userData.owned || []).length).toBeGreaterThan(0);
    m.userData.update(0);
    const c0 = coreColor(m);
    m.userData.update(2.0);
    const c1 = coreColor(m);
    expect(c1).not.toBe(c0);
    // mercan skin'inin ortak malzemesi etkilenmedi
    expect(coreColor(createHeldItemModel(THREE, KEYS.staff, undefined, resolveSkinSet({ asa: 'asa:mercan' }, HIGH)))).toBe(sharedColor);
    // dispose klonları atar
    let disposed = 0;
    m.userData.owned.forEach((mat) => mat.addEventListener('dispose', () => { disposed++; }));
    const n = m.userData.owned.length;
    disposeHeldItemModel(m);
    expect(disposed).toBe(n);
  });

  it('low kademe ve kısıtlı hareket: klon YOK, renk sabit (ilk renk)', () => {
    [{ tier: 'low' }, { tier: 'high', reduced: true }].forEach((env) => {
      const m = cyc(env);
      expect((m.userData.owned || []).length).toBe(0);
      const c0 = coreColor(m);
      m.userData.update(0);
      m.userData.update(3.3);
      expect(coreColor(m)).toBe(c0);
      expect(Number.isFinite(c0)).toBe(true);
    });
  });

  it('güncelleme sıklığı ≤12/sn ve hiçbir karede NaN renk üretmez', () => {
    const m = cyc(HIGH);
    for (let i = 0; i < 400; i++) {
      m.userData.update(i / 60);
      m.traverse((o) => { if (o.isMesh && o.material.color) expect(Number.isFinite(o.material.color.r + o.material.color.g + o.material.color.b)).toBe(true); });
    }
  });
});

describe('tüm kademeler × tüm alet görünümleri: ek mesh/geometri/malzeme TÜRÜ yok', () => {
  it('her kazma/balta/kürek (7 kademe + elektrikli) × 6 alet skin\'i: mesh sayısı ve geometri kümesi taban modeli AŞMAZ (parlayan tabanda azalabilir)', () => {
    const tools = ITEM_LIST.filter((it) => ['pick', 'axe', 'shovel'].indexOf(itemSpec(it).kind) >= 0);
    expect(tools.length).toBeGreaterThanOrEqual(21);
    KESIF.filter((d) => d.kind === 'alet').forEach((d) => {
      const set = resolveSkinSet({ alet: d.id }, HIGH);
      tools.forEach((it) => {
        const a = snapshot(createHeldItemModel(THREE, it.key));
        const b = snapshot(createHeldItemModel(THREE, it.key, undefined, set));
        expect(b.n, it.key + ' × ' + d.id).toBeLessThanOrEqual(a.n);
        b.geos.forEach((g) => expect(a.geos.has(g), 'yeni geometri yok').toBe(true));
        Object.keys(b.types).forEach((t) => expect(a.types[t], 'yeni malzeme türü yok: ' + t).toBeGreaterThan(0));
        if (!itemSpec(it).palette.glow) expect(b.n, it.key + ' × ' + d.id).toBe(a.n);
      });
    });
  });
});

describe('malzeme önbelleği: paylaşılan renk ve oyun ömrü', () => {
  it('iki skin aynı rengi paylaşırsa malzeme YALNIZ ikisi de etkin değilken atılır; skin dışı malzemeye dokunulmaz', () => {
    const plain = stdMat(0x445566, { rough: 0.5 }); // skin kapsamı dışı (varsayılan görünüm)
    setSkinScope('A');
    const a = stdMat(0x123456, { rough: 0.3 });
    const bm = basicMat(0x654321, { bright: 1.2 });
    setSkinScope('B');
    expect(stdMat(0x123456, { rough: 0.3 })).toBe(a); // önbellek isabeti, aynı nesne
    setSkinScope(null);
    let disposed = 0;
    a.addEventListener('dispose', () => { disposed++; });
    pruneSkinMats(new Set(['B']));
    expect(disposed).toBe(0); // B hâlâ etkin → atılmaz
    expect(stdMat(0x123456, { rough: 0.3 })).toBe(a);
    pruneSkinMats(new Set(['A']));
    expect(disposed).toBe(0); // A etkin
    pruneSkinMats(new Set());
    expect(disposed).toBe(1);
    expect(stdMat(0x123456, { rough: 0.3 })).not.toBe(a); // yeniden üretilir
    expect(stdMat(0x445566, { rough: 0.5 })).toBe(plain); // skin dışı: dokunulmadı
    expect(basicMat(0x654321, { bright: 1.2 })).not.toBe(bm);
  });

  it('retain/release: önbellek SON oyun kapanınca boşalır (ardışık/çift oyun canlı olanı bozmaz)', () => {
    createHeldItemModel(THREE, KEYS.pick);
    retainHeldItemCache();
    retainHeldItemCache();
    releaseHeldItemCache();
    expect(kitStats().mats).toBeGreaterThan(0); // biri hâlâ açık
    releaseHeldItemCache();
    expect(kitStats().mats).toBe(0);
    releaseHeldItemCache(); // fazladan çağrı güvenli
    expect(kitStats().mats).toBe(0);
  });
});
