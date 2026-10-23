import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ITEM_LIST, ITEMS } from '../sim/items.js';
import { TOOL_TIERS } from '../sim/constants.js';
import {
  BUILDERS, HELD_KINDS, createDroppedItem, createHeldItemModel, disposeHeldItemCache, disposeHeldItemModel, getHeldPlacement,
  setHeldItemAtlas,
} from './heldItems.js';
import { ARMOR_PALETTES, MODEL_KINDS, TIER_KEYS, TIER_PALETTES, blockFallbackColor, itemSpec, kindCoverage } from './itemPalette.js';
import { createCharacter } from './character.js';
import { defaultAvatar } from '../../avatar/catalog.js';
import { blockByKey } from '../sim/blocks.js';

function meshes(model) {
  const out = [];
  model.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

describe('itemPalette: eşya → model türü', () => {
  it("items.js'teki HER eşya tanımlı bir model türüne çözülür ve türün kurucusu vardır", () => {
    expect(ITEM_LIST.length).toBeGreaterThan(200);
    ITEM_LIST.forEach((it) => {
      const spec = itemSpec(it);
      expect(MODEL_KINDS, it.key).toContain(spec.kind);
      expect(typeof BUILDERS[spec.kind], it.key + ' → ' + spec.kind).toBe('function');
      expect(Number.isFinite(spec.color)).toBe(true);
    });
  });

  it('MODEL_KINDS ile kurucu tablosu birebir; her tür en az bir eşyada kullanılır ("flat" yedeği hariç)', () => {
    expect(Object.keys(BUILDERS).sort()).toEqual(MODEL_KINDS.slice().sort());
    expect(HELD_KINDS).toEqual(MODEL_KINDS);
    const cov = kindCoverage();
    MODEL_KINDS.filter((k) => k !== 'flat').forEach((k) => expect(cov[k], k).toBeGreaterThan(0));
  });

  it('7 alet kademesi için ayrı palet; her kademe farklı renk, elmas/kuantum ışıyan', () => {
    expect(TIER_KEYS).toEqual(TOOL_TIERS.map((t) => t.key));
    const heads = new Set();
    TIER_KEYS.forEach((k) => {
      const P = TIER_PALETTES[k];
      ['head', 'light', 'dark', 'edge', 'handle', 'handleDark', 'wrap'].forEach((f) => expect(Number.isFinite(P[f]), k + '.' + f).toBe(true));
      heads.add(P.head);
    });
    expect(heads.size).toBe(7);
    expect(TIER_PALETTES.elmas.glow).not.toBeNull();
    expect(TIER_PALETTES.kuantum.glow).not.toBeNull();
    expect(TIER_PALETTES.demir.glow).toBeNull();
    // her alet/kılıç eşyası kendi kademesinin paletini alır
    ITEM_LIST.filter((i) => i.model === 'tool' || i.model === 'sword').forEach((i) => {
      const spec = itemSpec(i);
      expect(spec.palette).toBe(TIER_PALETTES[spec.tier]);
      expect(i.key.endsWith('_' + spec.tier)).toBe(true);
    });
    // zırh setleri paletleri
    ['deri', 'bakır', 'demir', 'altın', 'elmas', 'kuantum'].forEach((s) => expect(ARMOR_PALETTES[s]).toBeTruthy());
  });

  it('blok yedek rengi: renkli bloklar adındaki renge, bilinmeyen anahtar kararlı karmaya düşer', () => {
    expect(blockFallbackColor(blockByKey('beton_kırmızı'))).toBe(0xc8312f);
    expect(blockFallbackColor(blockByKey('cam_mavi'))).toBe(0x2f5fc8);
    const fake = { key: 'tamamen_uydurma_blok' };
    expect(blockFallbackColor(fake)).toBe(blockFallbackColor(fake));
    expect(blockFallbackColor(null)).toBe(0x888888);
  });

  it('bilinmeyen eşya anahtarı genel "flat" yedeğe düşer', () => {
    expect(itemSpec('yok:böyle').kind).toBe('flat');
    expect(itemSpec(null).kind).toBe('flat');
  });
});

describe('heldItems: modeller', () => {
  it('her eşya için model kurulur: en az bir mesh, sonlu sınır kutusu, size > 0, spec bağlı', () => {
    ITEM_LIST.forEach((it) => {
      const m = createHeldItemModel(THREE, it.key);
      expect(m, it.key).toBeTruthy();
      const ms = meshes(m);
      expect(ms.length, it.key).toBeGreaterThan(0);
      const box = new THREE.Box3().setFromObject(m);
      expect(Number.isFinite(box.min.x + box.max.x + box.min.y + box.max.y + box.min.z + box.max.z), it.key).toBe(true);
      expect(m.userData.size, it.key).toBeGreaterThan(0.05);
      expect(m.userData.spec.key).toBe(it.key);
      const sz = box.getSize(new THREE.Vector3());
      expect(Math.max(sz.x, sz.y, sz.z), it.key).toBeLessThan(2.5);
      expect(Math.max(sz.x, sz.y, sz.z), it.key).toBeGreaterThan(0.04);
      disposeHeldItemModel(m);
    });
  });

  it('boş anahtar null; ASCII takma ad çözülür', () => {
    expect(createHeldItemModel(THREE, '')).toBeNull();
    expect(createHeldItemModel(THREE, null)).toBeNull();
    expect(createHeldItemModel(THREE, 'item:kilic_demir').userData.kind).toBe('sword');
  });

  it('aynı kademedeki 3 alet/kılıç kademe malzemesini paylaşır; farklı kademeler farklı malzeme kullanır', () => {
    const headMat = (key) => meshes(createHeldItemModel(THREE, key)).map((m) => m.material.color.getHex());
    const demir = headMat('item:kazma_demir');
    const altin = headMat('item:kazma_altın');
    expect(demir.some((c) => c === TIER_PALETTES.demir.head)).toBe(true);
    expect(altin.some((c) => c === TIER_PALETTES.altın.head)).toBe(true);
    expect(demir).not.toEqual(altin);
    const elmas = meshes(createHeldItemModel(THREE, 'item:kılıç_elmas')).some((m) => m.material.emissiveIntensity > 0 || m.material.blending === THREE.AdditiveBlending);
    expect(elmas).toBe(true);
  });

  it('araçlar katmanlı pahlı ekstrüzyon (düz sprite değil): kazma başlığı ≥3 katman, kalınlık > 0', () => {
    const m = createHeldItemModel(THREE, 'item:kazma_taş');
    const layered = meshes(m).filter((x) => x.geometry.type === 'ExtrudeGeometry');
    expect(layered.length).toBeGreaterThanOrEqual(3);
    layered.forEach((x) => {
      x.geometry.computeBoundingBox();
      const s = x.geometry.boundingBox.getSize(new THREE.Vector3());
      expect(s.z).toBeGreaterThan(0.02);
    });
  });

  it('geometri/malzeme önbelleği paylaşılır: aynı tür iki model aynı geometriyi kullanır; dispose önbelleğe dokunmaz', () => {
    const a = createHeldItemModel(THREE, 'item:kılıç_demir');
    const b = createHeldItemModel(THREE, 'item:kılıç_demir');
    const ga = meshes(a).map((m) => m.geometry);
    const gb = meshes(b).map((m) => m.geometry);
    expect(ga[0]).toBe(gb[0]);
    disposeHeldItemModel(a);
    expect(a.parent).toBeNull();
    // ikinci model hâlâ geçerli
    expect(meshes(b)[0].geometry.attributes.position.count).toBeGreaterThan(0);
    disposeHeldItemModel(b);
    disposeHeldItemModel(b); // idempotent
  });

  it('blok küpü: atlas verilince UV atlas hücrelerine eşlenir; atlasız renkli yedek (köşe renkleri yüz gölgeli)', () => {
    const flat = createHeldItemModel(THREE, 'blok:taş');
    const fm = meshes(flat)[0];
    const col = fm.geometry.attributes.color;
    expect(col.count).toBe(24);
    // üst yüz (index 2) en parlak, alt yüz (3) en karanlık
    expect(col.getX(2 * 4)).toBeGreaterThan(col.getX(3 * 4));
    const fakeAtlas = {
      map: new THREE.Texture(),
      uvFor: (i) => [0.1 * i, 0.5, 0.1 * i + 0.05, 0.55],
    };
    const m = createHeldItemModel(THREE, 'blok:taş', fakeAtlas);
    const geo = meshes(m)[0].geometry;
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0.5 - 1e-6);
      expect(uv.getY(i)).toBeLessThanOrEqual(0.55 + 1e-6);
    }
    expect(meshes(m)[0].material.map).toBe(fakeAtlas.map);
    // varsayılan atlas
    setHeldItemAtlas(fakeAtlas);
    expect(meshes(createHeldItemModel(THREE, 'blok:kum'))[0].material.map).toBe(fakeAtlas.map);
    setHeldItemAtlas(null);
    expect(meshes(createHeldItemModel(THREE, 'blok:kum'))[0].material.map).toBeNull();
  });

  it('meşale ve fener titreşir (update çağrılabilir, ölçek zamanla değişir) ve alev çapası vardır', () => {
    ['blok:meşale', 'blok:fener'].forEach((k) => {
      const m = createHeldItemModel(THREE, k);
      expect(m.userData.flameAnchor).toBeTruthy();
      expect(typeof m.userData.update).toBe('function');
      const sc = new Set();
      for (let t = 0; t < 2; t += 0.13) {
        m.userData.update(t, 0.016);
        m.updateMatrixWorld(true);
        let sum = 0;
        m.traverse((o) => { if (o.isMesh) sum += o.matrixWorld.elements[5]; });
        sc.add(sum.toFixed(5));
      }
      expect(sc.size).toBeGreaterThan(2);
    });
  });

  it('yay: kiriş çekilince ok ucu geriye (+z) kayar ve ok görünür olur', () => {
    const m = createHeldItemModel(THREE, 'item:yay');
    const bow = m.userData.bow;
    expect(bow).toBeTruthy();
    bow.setDraw(0, false);
    const z0 = bow.bead.position.z;
    bow.setDraw(1, true);
    expect(bow.bead.position.z).toBeGreaterThan(z0 + 0.3);
    expect(bow.nocked).toBe(true);
    bow.setDraw(0.5);
    expect(bow.bead.position.z).toBeGreaterThan(z0 + 0.15);
    expect(bow.bead.position.z).toBeLessThan(z0 + 0.3);
  });

  it('ışın tüfeği/portal tabancası: namlu çapası (muzzle) ve parlayan çekirdek; çekirdek titreşir', () => {
    ['item:ışın_tüfeği', 'item:portal_tabancası'].forEach((k) => {
      const m = createHeldItemModel(THREE, k);
      expect(m.userData.muzzle).toBeTruthy();
      expect(m.userData.muzzle.position.z).toBeLessThan(-0.3); // namlu -z'de
      expect(meshes(m).some((x) => x.material.isMeshBasicMaterial)).toBe(true); // ışıyan parçalar
      m.userData.update(0.3);
      m.userData.update(0.8);
    });
  });

  it('yere düşen eşya: küçük boy, dönme + salınım, gölge ve parıltı; update ile değişir', () => {
    ['blok:taş', 'item:kılıç_kuantum', 'item:elma', 'item:anahtar_kristali_z2'].forEach((k) => {
      const d = createDroppedItem(THREE, k);
      expect(typeof d.userData.update).toBe('function');
      const box = new THREE.Box3().setFromObject(d);
      const sz = box.getSize(new THREE.Vector3());
      expect(Math.max(sz.x, sz.y, sz.z)).toBeLessThan(0.7);
      expect(d.userData.height).toBeGreaterThan(0.1);
      const pivot = d.children[0];
      d.userData.update(0, 0.016);
      const y0 = pivot.position.y;
      const r0 = pivot.rotation.y;
      d.userData.update(0.4, 0.016);
      expect(pivot.rotation.y).not.toBe(r0);
      expect(pivot.position.y).not.toBe(y0);
    });
  });

  it('elde duruş (placement): her tür için birim kuaterniyon, sonlu konum; yay/kalkan sol el; fp ölçeği tp\'den farklı olabilir', () => {
    MODEL_KINDS.forEach((kind) => {
      const it = ITEM_LIST.find((i) => itemSpec(i).kind === kind) || ITEMS['item:kalkan'];
      const m = createHeldItemModel(THREE, it.key);
      ['tp', 'fp'].forEach((view) => {
        const p = getHeldPlacement(m, view);
        const ql = Math.hypot(...p.quat);
        expect(ql, kind).toBeCloseTo(1, 5);
        p.pos.forEach((v) => expect(Number.isFinite(v)).toBe(true));
        expect(p.scale).toBeGreaterThan(0.3);
        expect(['L', 'R']).toContain(p.hand);
      });
    });
    expect(getHeldPlacement(createHeldItemModel(THREE, 'item:yay')).hand).toBe('L');
    expect(getHeldPlacement(createHeldItemModel(THREE, 'item:kalkan')).hand).toBe('L');
    expect(getHeldPlacement(createHeldItemModel(THREE, 'item:kılıç_demir')).hand).toBe('R');
  });

  it("karakter elinde: tüfek namlusu ileri (-z), yay yukarı, kazma başlığı yukarıda (dünya yönleri)", () => {
    const ch = createCharacter(defaultAvatar('male'), { detail: 'low' });
    const dirOf = (model, axis) => new THREE.Vector3(axis[0], axis[1], axis[2]).transformDirection(model.matrixWorld);
    ch.setHeld('item:ışın_tüfeği');
    for (let i = 0; i < 90; i++) ch.update(1 / 60, { speed: 0, onGround: true, yaw: 0 });
    ch.root.updateMatrixWorld(true);
    const barrel = dirOf(ch.held, [0, 0, -1]);
    expect(barrel.z).toBeLessThan(-0.5);
    expect(Math.abs(barrel.y)).toBeLessThan(0.7);
    ch.setHeld('item:kazma_demir');
    for (let i = 0; i < 90; i++) ch.update(1 / 60, { speed: 0, onGround: true, yaw: 0 });
    ch.root.updateMatrixWorld(true);
    expect(dirOf(ch.held, [0, 1, 0]).y).toBeGreaterThan(0.2);
    ch.dispose();
  });

  it('disposeHeldItemCache önbelleği boşaltır ve sonrasında modeller yine kurulur', () => {
    createHeldItemModel(THREE, 'item:yay');
    disposeHeldItemCache();
    const m = createHeldItemModel(THREE, 'item:yay');
    expect(meshes(m).length).toBeGreaterThan(3);
  });
});
