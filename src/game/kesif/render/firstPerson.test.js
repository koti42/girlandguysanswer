import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ITEM_LIST } from '../sim/items.js';
import {
  HOLD_STANCE, SHOULDER, SWING_DURATION, computeFpPose, createFirstPerson, createFpPose, solveTwoBone,
} from './firstPerson.js';
import { itemSpec } from './itemPalette.js';
import { defaultAvatar } from '../../avatar/catalog.js';

const A = 0.3;
const B = 0.26;

/** Düz ileri kinematik: kol XYZ Euler + dirsek bükümü → el konumu (omuz orijinde). */
function fk(ik) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ik.x, ik.y, ik.z, 'XYZ'));
  const elbow = new THREE.Vector3(0, -A, 0).applyQuaternion(q);
  const qf = new THREE.Quaternion().setFromEuler(new THREE.Euler(ik.f, 0, 0, 'XYZ'));
  const fore = new THREE.Vector3(0, -B, 0).applyQuaternion(qf).applyQuaternion(q);
  return elbow.add(fore);
}

describe('firstPerson: saf poz ve IK', () => {
  it('solveTwoBone: erişilebilir hedeflere 1 mm içinde ulaşır (çeşitli hedef ve ipuçları)', () => {
    const out = {};
    const targets = [
      [0.1, -0.3, -0.35], [-0.2, -0.1, -0.3], [0.0, -0.45, -0.1], [-0.3, -0.2, -0.2], [0.05, 0.1, -0.35], [0.2, -0.35, 0.05],
      [-0.1, -0.15, -0.45], [0.25, 0.0, -0.3],
    ];
    const poles = [[0.9, -0.5, 0.35], [0, -1, 0], [1, 0, 0], [0.5, -0.5, 0.7]];
    targets.forEach((t) => {
      poles.forEach((p) => {
        solveTwoBone(out, t[0], t[1], t[2], p[0], p[1], p[2], A, B);
        const h = fk(out);
        expect(h.distanceTo(new THREE.Vector3(t[0], t[1], t[2])), JSON.stringify([t, p])).toBeLessThan(1e-3);
        expect(out.f).toBeGreaterThanOrEqual(0);
        expect(out.f).toBeLessThanOrEqual(Math.PI);
      });
    });
  });

  it('solveTwoBone: ulaşılamayan hedefte kol tamamen uzanır ve reach=1; yakın hedefte reach<1', () => {
    const out = {};
    solveTwoBone(out, 0, -2, 0, 0, 0, 1, A, B);
    expect(out.reach).toBe(1);
    expect(out.f).toBeLessThan(0.4);
    const far = fk(out);
    expect(far.length()).toBeCloseTo(A + B, 1);
    solveTwoBone(out, 0.05, -0.2, -0.1, 0, 0, 1, A, B);
    expect(out.reach).toBeLessThan(0.5);
  });

  it('computeFpPose: tüm tutuşlar × durumlar için sonlu ve sınırlı dönüşler', () => {
    const holds = Object.keys(HOLD_STANCE);
    const out = createFpPose();
    const swings = [null, ...Object.keys(SWING_DURATION).flatMap((kind) => [0, 0.3, 0.7, 1].map((k) => ({ kind, k })))];
    holds.forEach((hold) => {
      swings.forEach((swing) => {
        [0, 0.5, 1].forEach((sprint) => {
          computeFpPose(out, {
            t: 1.7, bobPhase: 2.2, bobAmp: 0.8, sprint, crouch: 0.4, air: 0.2, hold, miningK: swing ? -1 : 0.5, swing,
            bowCharge: 0.9, nocked: true, eatK: 0.5, reduce: 1, turnYaw: 3, turnPitch: -2,
          });
          ['R', 'L'].forEach((s) => Object.keys(out[s]).forEach((k) => {
            expect(Number.isFinite(out[s][k]), hold + s + k).toBe(true);
            expect(Math.abs(out[s][k])).toBeLessThan(3.6);
          }));
          Object.keys(out.root).forEach((k) => expect(Number.isFinite(out.root[k])).toBe(true));
          expect(Math.abs(out.root.px)).toBeLessThan(0.2);
          expect(Math.abs(out.root.py)).toBeLessThan(0.2);
          expect(Math.abs(out.root.pz)).toBeLessThan(0.3);
        });
      });
    });
  });

  it('itemPalette tutuşları (hold) viewmodel duruş tablosunda bulunur', () => {
    ITEM_LIST.forEach((it) => expect(Object.keys(HOLD_STANCE), it.key).toContain(itemSpec(it).hold));
  });

  it('kırma döngüsü: kol yukarı kalkıp iner; kılıç savurması kolu yana süpürür; ateşte geri tepme ve parlama', () => {
    const out = createFpPose();
    const base = { t: 0, bobPhase: 0, bobAmp: 0, sprint: 0, crouch: 0, air: 0, hold: 'tool', miningK: -1, swing: null, bowCharge: 0, eatK: -1, reduce: 1 };
    computeFpPose(out, base);
    const rest = out.R.x;
    computeFpPose(out, { ...base, miningK: 0.36 });
    const peak = out.R.x;
    computeFpPose(out, { ...base, miningK: 0.58 });
    const down = out.R.x;
    expect(peak).toBeGreaterThan(rest + 0.7);
    expect(down).toBeLessThan(peak - 0.8);
    computeFpPose(out, { ...base, hold: 'sword', swing: { kind: 'slash', k: 0.25 } });
    const zOut = out.R.z;
    computeFpPose(out, { ...base, hold: 'sword', swing: { kind: 'slash', k: 0.55 } });
    expect(out.R.z).toBeLessThan(zOut - 0.8);
    computeFpPose(out, { ...base, hold: 'gun', swing: { kind: 'fire', k: 0.05 } });
    expect(out.root.pz).toBeGreaterThan(0.01);
    expect(out.flashAmount).toBeGreaterThan(0.5);
    computeFpPose(out, { ...base, hold: 'gun', swing: { kind: 'fire', k: 0.9 } });
    expect(out.flashAmount).toBe(0);
  });

  it('yürüme salınımı faza göre değişir; reduce (hareket azaltma) genliği küçültür; koşuda gövde öne eğilir', () => {
    const out = createFpPose();
    const p = { t: 0, bobPhase: 0, bobAmp: 1, sprint: 0, crouch: 0, air: 0, hold: 'tool', miningK: -1, swing: null, bowCharge: 0, eatK: -1, reduce: 1 };
    computeFpPose(out, p);
    const a = out.root.rz;
    computeFpPose(out, { ...p, bobPhase: Math.PI });
    const b = out.root.rz;
    expect(Math.abs(a - b)).toBeGreaterThan(0.05);
    computeFpPose(out, { ...p, reduce: 0.3 });
    expect(Math.abs(out.root.rz)).toBeLessThan(Math.abs(a));
    computeFpPose(out, { ...p, sprint: 1 });
    expect(out.root.rx).toBeGreaterThan(0.25);
  });

  it('yay çekme/yeme IK ağırlıkları: yay yalnızca bow tutuşunda, yeme ilerlemeyle', () => {
    const out = createFpPose();
    const p = { t: 0, bobPhase: 0, bobAmp: 0, sprint: 0, crouch: 0, air: 0, hold: 'bow', miningK: -1, swing: null, bowCharge: 1, eatK: -1, reduce: 1 };
    computeFpPose(out, p);
    expect(out.bowW).toBeGreaterThan(0.9);
    computeFpPose(out, { ...p, bowCharge: 0 });
    expect(out.bowW).toBe(0);
    computeFpPose(out, { ...p, hold: 'tool', bowCharge: 1 });
    expect(out.bowW).toBe(0);
    computeFpPose(out, { ...p, hold: 'food', bowCharge: 0, eatK: 0.5 });
    expect(out.eatW).toBeGreaterThan(0.9);
    computeFpPose(out, { ...p, hold: 'food', bowCharge: 0, eatK: -1 });
    expect(out.eatW).toBe(0);
  });
});

describe('firstPerson: createFirstPerson', () => {
  function make(extra = {}) {
    const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 200);
    const scene = new THREE.Scene();
    scene.add(cam);
    const fp = createFirstPerson(THREE, cam, { avatarConfig: defaultAvatar('male'), ...extra });
    return { cam, scene, fp };
  }
  const meshesOf = (o) => { const a = []; o.traverse((x) => { if (x.isMesh) a.push(x); }); return a; };

  it('kameraya bağlanır; kollar iki SkinnedMesh (ten+giysi, deri) içerir; update/dispose hatasız', () => {
    const { cam, fp } = make();
    expect(fp.group.parent).toBe(cam);
    const ms = meshesOf(fp.group);
    expect(ms.some((m) => m.isSkinnedMesh)).toBe(true);
    for (let i = 0; i < 60; i++) fp.update(1 / 60, { speed: 4.3, onGround: true, skyLight: 1, blockLight: 0 });
    fp.dispose();
    expect(fp.group.parent).toBeNull();
    expect(() => fp.dispose()).not.toThrow();
    expect(() => fp.update(0.016, {})).not.toThrow();
  });

  it('yürürken sallanır (kök konumu değişir), durunca nefes seviyesine döner; koşunca öne eğilir', () => {
    const { fp } = make();
    fp.setHeld('item:kazma_demir');
    for (let i = 0; i < 30; i++) fp.update(1 / 60, { speed: 0, onGround: true });
    const arms = fp.group.children[0];
    const ys = [];
    for (let i = 0; i < 90; i++) {
      fp.update(1 / 60, { speed: 4.3, onGround: true });
      ys.push(arms.position.y);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.008);
    for (let i = 0; i < 120; i++) fp.update(1 / 60, { speed: 5.6, sprint: true, onGround: true });
    expect(arms.rotation.x).toBeGreaterThan(0.2);
    for (let i = 0; i < 240; i++) fp.update(1 / 60, { speed: 0, onGround: true });
    expect(Math.abs(arms.rotation.x)).toBeLessThan(0.06);
    fp.dispose();
  });

  it('kırma tuşu basılıyken kol salınır; swing() tek seferlik darbeyi oynatır ve süre sonunda biter', () => {
    const { fp } = make();
    fp.setHeld('item:kazma_demir');
    for (let i = 0; i < 30; i++) fp.update(1 / 60, { speed: 0 });
    const rest = fp.pose.R.x;
    let mx = -9;
    let mn = 9;
    for (let i = 0; i < 90; i++) {
      fp.update(1 / 60, { speed: 0, breaking: true });
      mx = Math.max(mx, fp.pose.R.x);
      mn = Math.min(mn, fp.pose.R.x);
    }
    expect(mx).toBeGreaterThan(rest + 0.5);
    expect(mx - mn).toBeGreaterThan(0.6);
    for (let i = 0; i < 60; i++) fp.update(1 / 60, { speed: 0 });
    fp.setHeld('item:kılıç_demir');
    for (let i = 0; i < 30; i++) fp.update(1 / 60, { speed: 0 });
    const z0 = fp.pose.R.z;
    fp.swing('slash');
    let minZ = 9;
    let maxZ = -9;
    for (let i = 0; i < 12; i++) { fp.update(1 / 60, { speed: 0 }); minZ = Math.min(minZ, fp.pose.R.z); maxZ = Math.max(maxZ, fp.pose.R.z); }
    expect(maxZ - minZ).toBeGreaterThan(0.5);
    for (let i = 0; i < 90; i++) fp.update(1 / 60, { speed: 0 });
    expect(fp.pose.R.z).toBeCloseTo(z0, 1);
    fp.swing('bilinmeyen_tur'); // bilinmeyen tür 'mine'a düşer, hata atmaz
    fp.update(1 / 60, {});
    fp.dispose();
  });

  it('elde eşya: tüm eşyalar kurulur; bow/gun/torch özellikleri; el yuvası ve viewmodel malzemeleri', () => {
    const { fp } = make();
    ITEM_LIST.forEach((it) => {
      fp.setHeld(it.key);
      expect(fp.held, it.key).toBeTruthy();
      fp.update(1 / 60, { speed: 1, onGround: true });
    });
    fp.setHeld('item:yay');
    expect(fp.holdKind).toBe('bow');
    for (let i = 0; i < 30; i++) fp.update(1 / 60, { bowCharge: i / 30, nocked: true });
    const bow = fp.held.userData.bow;
    expect(bow.draw).toBeGreaterThan(0.9);
    expect(bow.nocked).toBe(true);
    // IK sonrası sağ el, kiriş ucuna yakın (≤ 12 cm)
    const bead = new THREE.Vector3();
    bow.bead.getWorldPosition(bead);
    const hand = new THREE.Vector3();
    fp.group.updateWorldMatrix(true, true);
    meshesOf(fp.group).filter((m) => m.isSkinnedMesh)[0].skeleton.bones.find((b) => b.name === 'handR').getWorldPosition(hand);
    expect(hand.distanceTo(bead)).toBeLessThan(0.14);
    fp.setHeld(null);
    expect(fp.held).toBeNull();
    fp.dispose();
  });

  it('meşale: titreşen nokta ışığı açık (>0), diğer eşyada kapalı; ateş: parlama görünür olur ve söner', () => {
    const { fp } = make();
    fp.setHeld('blok:meşale');
    const vals = new Set();
    for (let i = 0; i < 40; i++) {
      fp.update(1 / 60, { speed: 0 });
      vals.add(fp.light.intensity.toFixed(3));
    }
    expect(fp.light.intensity).toBeGreaterThan(1);
    expect(vals.size).toBeGreaterThan(10);
    fp.setHeld('item:ışın_tüfeği');
    fp.update(1 / 60, {});
    expect(fp.light.intensity).toBe(0);
    const muzzle = fp.held.userData.muzzle;
    fp.swing('fire');
    fp.update(1 / 60, {});
    expect(muzzle.children.some((c) => c.visible)).toBe(true);
    expect(fp.uniforms.uFpFlash.value.z).toBeGreaterThan(0.1);
    for (let i = 0; i < 20; i++) fp.update(1 / 60, {});
    expect(fp.uniforms.uFpFlash.value.z).toBe(0);
    fp.dispose();
  });

  it('dünya ışığı: gece ortam ışığı gündüzden düşük; blok ışığı (mağara meşalesi) ısıtır; su altı maviye çeker', () => {
    const { fp } = make();
    fp.update(1 / 60, { skyLight: 1, blockLight: 0 });
    const day = fp.uniforms.uFpAmb.value.clone();
    const daySun = fp.uniforms.uFpSun.value.clone();
    fp.update(1 / 60, { skyLight: 0.05, blockLight: 0 });
    const night = fp.uniforms.uFpAmb.value.clone();
    expect(night.x).toBeLessThan(day.x * 0.5);
    expect(fp.uniforms.uFpSun.value.x).toBeLessThan(daySun.x * 0.2);
    fp.update(1 / 60, { skyLight: 0.05, blockLight: 1 });
    const cave = fp.uniforms.uFpAmb.value.clone();
    expect(cave.x).toBeGreaterThan(night.x + 0.2);
    expect(cave.x).toBeGreaterThan(cave.z); // sıcak ton
    fp.update(1 / 60, { skyLight: 1, underwater: true });
    expect(fp.uniforms.uFpAmb.value.x).toBeLessThan(day.x);
    // güneş yönü kamera uzayına dönüştürülür (birim vektör)
    fp.update(1 / 60, { skyLight: 1, sunDir: { x: 0, y: 1, z: 0 } });
    expect(fp.uniforms.uFpSunDir.value.length()).toBeCloseTo(1, 5);
    fp.dispose();
  });

  it('derinlik sıkıştırma: tüm viewmodel malzemeleri gl_Position.z\'yi yakın banda sıkıştırır (duvara girmez)', () => {
    const { fp } = make();
    fp.setHeld('item:kılıç_elmas');
    const mats = new Set(meshesOf(fp.group).map((m) => m.material));
    expect(mats.size).toBeGreaterThan(2);
    mats.forEach((mat) => {
      expect(typeof mat.onBeforeCompile).toBe('function');
      const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>\n',
        fragmentShader: '#include <common>\n#include <opaque_fragment>\n',
      };
      mat.onBeforeCompile(shader);
      expect(shader.vertexShader).toContain('gl_Position.z = gl_Position.z * uFpDepth - gl_Position.w * (1.0 - uFpDepth);');
      expect(shader.uniforms.uFpDepth).toBeTruthy();
      if (mat.isMeshStandardMaterial) {
        expect(shader.fragmentShader).toContain('uFpAmb');
        expect(shader.fragmentShader).toContain('outgoingLight = fpL + totalEmissiveRadiance;');
      }
    });
    // matematik: z_clip' = z*K - w*(1-K) → NDC [-1, -1+2K]
    const K = fp.uniforms.uFpDepth.value;
    [-1, -0.3, 0.5, 1].forEach((zNdc) => {
      const w = 2.7;
      const zc = zNdc * w;
      const z2 = (zc * K - w * (1 - K)) / w;
      expect(z2).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(z2).toBeLessThanOrEqual(-1 + 2 * K + 1e-9);
    });
    // kopya malzeme: orijinal (paylaşılan) önbellek malzemeleri değiştirilmez
    const orig = meshesOf(fp.held).map((m) => m.material);
    orig.forEach((m) => expect(m.onBeforeCompile.toString()).toContain('Object.keys(U)'));
    fp.dispose();
  });

  it('setSkin kolları yeniden kurar (üst stili/rengi değişince geometri değişir); setVisible', () => {
    const { fp } = make();
    const sig = () => meshesOf(fp.group).filter((m) => m.isSkinnedMesh).map((m) => m.geometry.attributes.color.array.reduce((a, v) => a + v, 0).toFixed(3)).join(',');
    const before = sig();
    fp.setSkin({ ...defaultAvatar('female'), top: { style: 'tisort', color: 3 }, skin: 4 });
    const after = sig();
    expect(after).not.toBe(before);
    fp.setVisible(false);
    expect(fp.group.visible).toBe(false);
    fp.setVisible(true);
    expect(fp.group.visible).toBe(true);
    fp.dispose();
  });

  it('omuz noktası kamera uzayında sağ-alt-ön; kollar kamera görüşünde (ekran sınırı içinde) eşya tutarken', () => {
    expect(SHOULDER.x).toBeGreaterThan(0);
    expect(SHOULDER.y).toBeLessThan(0);
    const { cam, fp } = make();
    fp.setHeld('item:kılıç_demir');
    for (let i = 0; i < 60; i++) fp.update(1 / 60, { speed: 0 });
    cam.updateMatrixWorld(true);
    fp.group.updateWorldMatrix(true, true);
    const hand = new THREE.Vector3();
    meshesOf(fp.group).filter((m) => m.isSkinnedMesh)[0].skeleton.bones.find((b) => b.name === 'handR').getWorldPosition(hand);
    const ndc = hand.clone().project(cam);
    expect(Math.abs(ndc.x)).toBeLessThan(1);
    expect(Math.abs(ndc.y)).toBeLessThan(1);
    expect(ndc.x).toBeGreaterThan(0); // sağ yarıda
    expect(ndc.y).toBeLessThan(0.1); // alt yarıda
    // el kameradan makul uzaklıkta (near düzleminin ötesi)
    expect(hand.distanceTo(cam.position)).toBeGreaterThan(0.3);
    expect(hand.distanceTo(cam.position)).toBeLessThan(0.9);
    fp.dispose();
  });
});
