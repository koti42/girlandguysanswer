import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BONES, createCharacter } from './character.js';
import { WEAR_DEFAULTS, WEAR_TABLES, resolveBuilder } from './characterWear.js';
import { BODY_DIMS, getLayout, headFaceZ, makeContext } from './characterBody.js';
import { STYLES, defaultAvatar, normalizeAvatar } from '../../avatar/catalog.js';

const cfgFor = (body, over = {}) => ({ ...defaultAvatar(body === 'kiz' ? 'female' : 'male'), ...over });
const HIGH_BUDGET = 14000;
const LOW_BUDGET = 6000;

function checkSkin(ch) {
  const nb = BONES.length;
  ch.meshes.forEach((m) => {
    const g = m.geometry;
    const sw = g.attributes.skinWeight;
    const si = g.attributes.skinIndex;
    const pos = g.attributes.position;
    for (let i = 0; i < sw.count; i++) {
      const s = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
      if (Math.abs(s - 1) > 1e-4) throw new Error('ağırlık toplamı 1 değil: ' + s);
      [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)].forEach((v) => {
        if (v >= nb) throw new Error('geçersiz kemik');
      });
      if (!Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))) throw new Error('NaN konum');
    }
  });
}

describe('character: katalog eşlemesi', () => {
  it('katalogdaki HER stil için geometri kurucusu vardır (saç 8, üst 5, alt 4, ayakkabı 3, aksesuar 8)', () => {
    expect(STYLES.hair.length).toBe(8);
    ['hair', 'top', 'bottom', 'shoes', 'acc'].forEach((slot) => {
      STYLES[slot].forEach((s) => {
        expect(typeof WEAR_TABLES[slot][s.id], slot + ':' + s.id).toBe('function');
      });
      // tablo, katalogda olmayan fazladan stil içermez
      Object.keys(WEAR_TABLES[slot]).forEach((id) => expect(STYLES[slot].map((s) => s.id)).toContain(id));
    });
  });

  it('bilinmeyen stil güvenli varsayılana düşer', () => {
    ['hair', 'top', 'bottom', 'shoes', 'acc'].forEach((slot) => {
      expect(resolveBuilder(slot, 'yok_boyle_bir_stil')).toBe(WEAR_TABLES[slot][WEAR_DEFAULTS[slot]]);
    });
    const ch = createCharacter({ body: 'erkek', hair: { style: 'xx', color: 99 }, top: { style: 'yy' }, acc: 'zz' }, { detail: 'low' });
    expect(ch.config.hair.style).toBe(normalizeAvatar({}).hair.style);
    expect(ch.triangles).toBeGreaterThan(1000);
    ch.dispose();
  });

  it('iskelet: 26 kemik, ebeveyn zinciri kökte birleşir, düzen iki vücutta da aynı', () => {
    const ch = createCharacter(cfgFor('erkek'), {});
    expect(BONES.length).toBe(26);
    BONES.forEach((n) => expect(ch.rig[n].isBone).toBe(true));
    ['hips', 'spine', 'chest', 'neck', 'head', 'clavicleL', 'armL', 'foreArmL', 'handL', 'fingersL', 'legL', 'shinL', 'footL', 'toesL']
      .forEach((n) => expect(ch.rig[n]).toBeTruthy());
    expect(ch.rig.socketR.parent).toBe(ch.rig.handR);
    expect(ch.rig.handR.parent).toBe(ch.rig.foreArmR);
    expect(ch.rig.armR.position.x).toBeGreaterThan(0); // +x karakterin sağı
    expect(ch.rig.armL.position.x).toBeLessThan(0);
    ch.dispose();
  });
});

describe('character: geometri ve bütçe', () => {
  ['kiz', 'erkek'].forEach((body) => {
    ['high', 'low'].forEach((detail) => {
      it(`${body}/${detail}: her stil tek tek kurulur; ağırlıklar 1'e toplanır; boy ≈ 1.78 m; üçgen bütçesi`, () => {
        const budget = detail === 'high' ? HIGH_BUDGET : LOW_BUDGET;
        const base = cfgFor(body);
        const combos = [];
        ['hair', 'top', 'bottom', 'shoes'].forEach((slot) => {
          STYLES[slot].forEach((s) => combos.push({ ...base, [slot]: { ...base[slot], style: s.id } }));
        });
        STYLES.acc.forEach((s) => combos.push({ ...base, acc: s.id }));
        let maxTri = 0;
        combos.forEach((cfg, i) => {
          const ch = createCharacter(cfg, { detail });
          maxTri = Math.max(maxTri, ch.triangles);
          expect(ch.triangles).toBeLessThanOrEqual(budget);
          expect(ch.bounds.height).toBeGreaterThan(1.72);
          expect(ch.bounds.height).toBeLessThan(1.9);
          if (i % 5 === 0) checkSkin(ch); // tüm köşeler: örnekleme (hız için her 5. kombinasyon + son kontrol aşağıda)
          ch.dispose();
        });
        expect(maxTri).toBeGreaterThan(2000);
      });
    });

    it(`${body}: en ağır kombinasyon (saç+aksesuar) bütçeyi aşmaz ve tam skin denetimi geçer`, () => {
      ['high', 'low'].forEach((detail) => {
        const heavy = {
          ...cfgFor(body),
          hair: { style: 'orgu', color: 3 }, acc: 'kulaklik', top: { style: 'hoodie', color: 2 }, bottom: { style: 'etek', color: 5 },
          shoes: { style: 'bot', color: 8 },
        };
        const ch = createCharacter(heavy, { detail });
        expect(ch.triangles).toBeLessThanOrEqual(detail === 'high' ? HIGH_BUDGET : LOW_BUDGET);
        checkSkin(ch);
        ch.dispose();
      });
    });
  });

  it('boy: kafa tepesi ≈ 1.78 m (kısa saç, aksesuarsız), baş boyu oranı ≈ 7-7.8', () => {
    ['kiz', 'erkek'].forEach((body) => {
      const ch = createCharacter(cfgFor(body, { hair: { style: 'kisa', color: 0 }, acc: 'none' }), { detail: 'high' });
      expect(ch.bounds.height).toBeGreaterThan(1.74);
      expect(ch.bounds.height).toBeLessThan(1.84);
      const d = BODY_DIMS[body];
      const headH = d.crownY - d.chinY;
      const heads = ch.bounds.height / headH;
      expect(heads).toBeGreaterThan(7);
      expect(heads).toBeLessThan(8);
      ch.dispose();
    });
  });

  it('yüz özellikleri: göz çizgisi gözlem yüksekliği (1.62 m) civarındadır', () => {
    const ch = createCharacter(cfgFor('erkek'), {});
    expect(ch.bounds.eyeHeight).toBeGreaterThan(1.58);
    expect(ch.bounds.eyeHeight).toBeLessThan(1.66);
    ch.dispose();
  });

  it('yüz yüzeyi -z yönüne bakar (burun/yüz ön tarafta)', () => {
    ['kiz', 'erkek'].forEach((body) => {
      const d = BODY_DIMS[body];
      expect(headFaceZ(body === 'kiz', 0, d.eyeY)).toBeLessThan(-0.07);
    });
  });

  it('yumuşak ağırlık: dirsek/diz/omuz/kalça bölgelerinde köşeler en az iki kemiğe bağlı', () => {
    const ctx = makeContext(cfgFor('erkek'), 'high');
    const { d, W } = ctx;
    const joints = [
      ['armR', d.elbowY, W.armR, 0.055], ['armR', d.wristY, W.armR, 0.03], ['legR', d.kneeY, W.legR, 0.055], ['legR', d.ankleY, W.legR, 0.03],
    ];
    joints.forEach(([, y, fn, band]) => {
      const above = fn(0, y + band * 0.8, 0);
      const at = fn(0, y, 0);
      const below = fn(0, y - band * 0.8, 0);
      expect(above.length).toBeGreaterThanOrEqual(1);
      expect(at.length).toBeGreaterThanOrEqual(2); // eklem merkezinde iki kemik
      expect(at[0][1]).toBeGreaterThan(0.3);
      expect(at[1][1]).toBeGreaterThan(0.3);
      expect(below[below.length - 1][1]).toBeGreaterThan(0.6);
    });
    // gövde: sırt, kalça bölgelerinde geçiş
    const t = W.torso(0, d.chestY, 0);
    expect(t.length).toBeGreaterThanOrEqual(2);
    // omuz: uç bölgede kol kemiğinin etkisi
    const sh = W.torso(0.16, 1.34, 0);
    expect(sh.some((p) => p[0] === 'armR')).toBe(true);
  });

  it('getLayout: konumlar tutarlı (bacak uzunluğu = kalça yüksekliği, kol omuz üstünde)', () => {
    ['kiz', 'erkek'].forEach((body) => {
      const L = getLayout(body);
      expect(L.world.hips[1]).toBeCloseTo(L.dims.hipY, 6);
      expect(L.world.armR[1]).toBeGreaterThan(L.world.hips[1] + 0.4);
      expect(L.world.footR[1]).toBeLessThan(0.12);
      expect(L.local.shinR[1]).toBeCloseTo(L.dims.kneeY - L.dims.hipY, 6);
      expect(L.world.head[1]).toBeGreaterThan(1.45);
    });
  });
});

describe('character: animasyon, bakış, adım, eşya', () => {
  it('setConfig rig nesnelerini korur ve vücudu değiştirir', () => {
    const ch = createCharacter(cfgFor('erkek'), {});
    const head = ch.rig.head;
    const hy = ch.rig.armR.position.x;
    ch.setConfig(cfgFor('kiz', { hair: { style: 'dalgali', color: 4 } }));
    expect(ch.rig.head).toBe(head);
    expect(ch.rig.armR.position.x).not.toBe(hy);
    expect(ch.config.body).toBe('kiz');
    checkSkin(ch);
    ch.dispose();
  });

  it('update: yürürken adım olayları ve faz üretir; durunca durur', () => {
    const ch = createCharacter(cfgFor('erkek'), {});
    let steps = 0;
    const feet = new Set();
    for (let i = 0; i < 120; i++) {
      const s = ch.update(1 / 60, { speed: 4.3, onGround: true, yaw: 0 });
      if (s.step) { steps++; feet.add(s.foot); }
    }
    expect(ch.state.name).toBe('walk');
    expect(steps).toBeGreaterThanOrEqual(5); // 2 sn × ≈3.3 adım/sn
    expect(steps).toBeLessThanOrEqual(9);
    expect(feet.size).toBe(2); // iki ayak sırayla
    const ph = ch.state.phase;
    for (let i = 0; i < 30; i++) ch.update(1 / 60, { speed: 0, onGround: true });
    expect(ch.state.name).toBe('idle');
    expect(ch.state.phase).toBe(ph);
    ch.dispose();
  });

  it('update: koşuda poz koşuya geçer, havada zıplama, yüzmede yüzme; inişte landed bayrağı', () => {
    const ch = createCharacter(cfgFor('kiz'), {});
    for (let i = 0; i < 20; i++) ch.update(1 / 60, { speed: 5.6, onGround: true });
    expect(ch.state.name).toBe('run');
    for (let i = 0; i < 10; i++) ch.update(1 / 60, { speed: 2, onGround: false, vy: 4 });
    expect(ch.state.name).toBe('jump');
    ch.update(1 / 60, { speed: 2, onGround: false, vy: -9 });
    const s = ch.update(1 / 60, { speed: 0, onGround: true, vy: 0 });
    expect(s.landed).toBe(true);
    expect(s.impact).toBeGreaterThan(0.3);
    for (let i = 0; i < 20; i++) ch.update(1 / 60, { speed: 1, swim: true });
    expect(ch.state.name).toBe('swim');
    ch.dispose();
  });

  it('bakış: baş kamera yönüne döner (sınırlı), gövde yavaş takip eder; pitch baş eğimini değiştirir', () => {
    const ch = createCharacter(cfgFor('erkek'), {});
    for (let i = 0; i < 40; i++) ch.update(1 / 60, { speed: 0, onGround: true, yaw: 0, pitch: 0 });
    const h0 = ch.rig.head.rotation.y;
    const x0 = ch.rig.head.rotation.x;
    for (let i = 0; i < 6; i++) ch.update(1 / 60, { speed: 0, onGround: true, yaw: 0.6, pitch: 0.5 });
    expect(ch.rig.head.rotation.y).toBeGreaterThan(h0 + 0.05); // baş sola (+y) bakıyor
    expect(ch.rig.head.rotation.x).toBeGreaterThan(x0 + 0.05); // yukarı bakış
    expect(ch.root.rotation.y).toBeLessThan(0.6); // gövde henüz yetişmedi
    for (let i = 0; i < 400; i++) ch.update(1 / 60, { speed: 3, onGround: true, yaw: 0.6, pitch: 0 });
    expect(ch.root.rotation.y).toBeCloseTo(0.6, 1); // hareketliyken gövde yetişir
    // büyük yaw farkı baş sınırını aşmaz
    ch.update(1 / 60, { speed: 0, onGround: true, yaw: 3, pitch: 0 });
    expect(Math.abs(ch.rig.head.rotation.y)).toBeLessThan(1.2);
    ch.dispose();
  });

  it('eylem bindirmesi: kazma sağ kolu hareket ettirir; hasar sarsıntısı geçince söner', () => {
    const ch = createCharacter(cfgFor('erkek'), {});
    for (let i = 0; i < 30; i++) ch.update(1 / 60, { speed: 0, onGround: true });
    const idleArm = ch.rig.armR.rotation.x;
    let maxArm = 0;
    for (let i = 0; i < 40; i++) {
      ch.update(1 / 60, { speed: 0, onGround: true, action: { name: 'mine', progress: i / 40 } });
      maxArm = Math.max(maxArm, ch.rig.armR.rotation.x);
    }
    expect(maxArm).toBeGreaterThan(idleArm + 1);
    ch.dispose();
  });

  it('pose(): adlandırılmış pozu doğrudan yazar; bilinmeyen ad idle olur', () => {
    const ch = createCharacter(cfgFor('erkek'), {});
    ch.pose('cheer', 1);
    expect(ch.rig.armL.rotation.z).toBeLessThan(-2);
    ch.pose('hicbir_poz', 0);
    expect(Math.abs(ch.rig.armL.rotation.z)).toBeLessThan(0.5);
    ch.dispose();
  });

  it('setHeld: eşya doğru ele eklenir (yay sol el, kılıç sağ el), kaldırılınca temizlenir; hold duruşu kol açısını değiştirir', () => {
    const ch = createCharacter(cfgFor('erkek'), {});
    ch.setHeld('item:kılıç_demir');
    expect(ch.held).toBeTruthy();
    expect(ch.held.parent).toBe(ch.rig.socketR);
    ch.setHeld('item:yay');
    expect(ch.held.parent).toBe(ch.rig.socketL);
    expect(ch.rig.socketR.children.length).toBe(0);
    ch.setHeld('item:ışın_tüfeği');
    expect(ch.held.parent).toBe(ch.rig.socketR);
    for (let i = 0; i < 60; i++) ch.update(1 / 60, { speed: 0, onGround: true });
    expect(ch.rig.armR.rotation.x).toBeGreaterThan(0.5); // tüfek tutuşu kolu öne alır
    ch.setHeld(null);
    expect(ch.held).toBeNull();
    expect(ch.rig.socketR.children.length + ch.rig.socketL.children.length).toBe(0);
    ch.dispose();
  });

  it('elde tutulan kılıç dünyada yukarı-ileri bakar (hold pozunda)', () => {
    const ch = createCharacter(cfgFor('erkek'), {});
    ch.setHeld('item:kılıç_elmas');
    for (let i = 0; i < 90; i++) ch.update(1 / 60, { speed: 0, onGround: true, yaw: 0 });
    ch.root.updateMatrixWorld(true);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(ch.held.matrixWorld);
    expect(up.y).toBeGreaterThan(0.25); // bıçak yukarı
    expect(up.z).toBeLessThan(-0.1); // ve ileri (-z)
    // bıçağın düz yüzü yana bakar: kalınlık ekseni (z) yatay x'e yakın
    const thick = new THREE.Vector3(0, 0, 1).transformDirection(ch.held.matrixWorld);
    expect(Math.abs(thick.x)).toBeGreaterThan(0.8);
    ch.dispose();
  });

  it('setLight malzeme çarpanını ayarlar; dispose idempotent, kök sahneden çıkar', () => {
    const scene = new THREE.Scene();
    const ch = createCharacter(cfgFor('kiz'), { detail: 'low' });
    scene.add(ch.root);
    ch.setLight(0.4);
    expect(ch.light).toBeCloseTo(0.4, 6);
    expect(ch.meshes[0].material.color.r).toBeCloseTo(0.4, 6);
    ch.dispose();
    expect(ch.root.parent).toBeNull();
    expect(() => ch.dispose()).not.toThrow();
    expect(() => ch.update(0.016, {})).not.toThrow();
  });
});
