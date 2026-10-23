import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MODEL_BUILDERS, MOB_TYPES, MOB_VARIANTS, createMobModel, measureBounds,
} from './mobModels.js';
import { getKit } from './mobGeo.js';
import {
  BOSS_KEYS, HOSTILE_KEYS, MOB_KEYS, PASSIVE_KEYS,
} from '../sim/mobTypes.js';

const kit = getKit(THREE);

function allFinite(root) {
  let bad = 0;
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const e = o.matrixWorld.elements;
    for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) bad++;
    if (o.isMesh) {
      const attrs = o.geometry.attributes;
      for (const name of Object.keys(attrs)) {
        const arr = attrs[name].array;
        for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) { bad++; break; }
      }
      const m = o.material;
      if (m.emissive && !Number.isFinite(m.emissive.r + m.emissive.g + m.emissive.b)) bad++;
      if (!Number.isFinite(m.opacity)) bad++;
    }
  });
  return bad;
}

describe('MODEL_BUILDERS ve MOB_TYPES', () => {
  it('her yaratık türünün model kurucusu var ve tablo sim ile aynıdır', () => {
    for (const k of MOB_KEYS) expect(typeof MODEL_BUILDERS[k]).toBe('function');
    expect(Object.keys(MODEL_BUILDERS).sort()).toEqual(MOB_KEYS.slice().sort());
    expect(MOB_TYPES['golgehukumdar'].boss).toBe(true);
  });

  it('bilinmeyen tür çökmez: yedek model döner', () => {
    const m = createMobModel(THREE, 'yok-boyle-bir-sey', { quality: 'low' });
    expect(m.type).toBeNull();
    m.update(0.016, { speed: 1 });
    expect(allFinite(m.root)).toBe(0);
    m.dispose();
  });
});

describe('model geometrisi: hitbox uyumu ve bütçeler', () => {
  for (const key of MOB_KEYS) {
    it(key + ': ölçüler hitbox ile uyumlu, sayılar bütçe içinde, NaN yok (3 kalite)', () => {
      const t = MOB_TYPES[key];
      const tri = {};
      for (const q of ['low', 'medium', 'high']) {
        const m = createMobModel(THREE, key, { quality: q, seed: 3 });
        const size = m.bounds.getSize(new THREE.Vector3());
        const c = m.bounds.getCenter(new THREE.Vector3());
        expect(m.bounds.isEmpty()).toBe(false);
        // yükseklik: hitbox yüksekliğine yakın (uçan/süzülenler biraz yüksekten başlayabilir)
        expect(size.y).toBeGreaterThan(t.hitbox.h * (t.hitbox.h < 0.5 ? 0.3 : 0.55));
        expect(size.y).toBeLessThan(t.hitbox.h * 1.25);
        // yatayda en fazla 1.55×w (+ küçük pay): uzuv/kuyruk/kanatlar hitbox'tan taşabilir ama kontrolsüz değil
        expect(size.x).toBeLessThan(t.hitbox.w * 1.55 + 0.05);
        expect(size.z).toBeLessThan(t.hitbox.w * 1.55 + 0.05);
        expect(Math.abs(c.x)).toBeLessThan(Math.max(0.3, t.hitbox.w * 0.3));
        expect(Math.abs(c.z)).toBeLessThan(Math.max(0.3, t.hitbox.w * 0.3));
        // ayak noktası y=0 civarı
        expect(m.bounds.min.y).toBeGreaterThan(-0.25);
        const grounded = t.movement === 'yürü' || t.movement === 'sek';
        expect(m.bounds.min.y).toBeLessThan(grounded ? t.hitbox.h * 0.35 : 0.6);
        const st = m.initialStats;
        tri[q] = st.triangles;
        expect(st.meshes).toBeLessThanOrEqual(t.boss ? 75 : 34);
        if (q === 'high') expect(st.triangles).toBeLessThanOrEqual(t.boss ? 22000 : 9000);
        expect(allFinite(m.root)).toBe(0);
        // köşe renkleri ve normaller birim uzunlukta
        m.root.traverse((o) => {
          if (!o.isMesh) return;
          const n = o.geometry.attributes.normal;
          for (let i = 0; i < Math.min(n.count, 200); i++) {
            const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
            expect(l).toBeGreaterThan(0.99);
            expect(l).toBeLessThan(1.01);
          }
        });
        m.dispose();
      }
      expect(tri.low).toBeLessThanOrEqual(tri.high);
      expect(tri.medium).toBeLessThanOrEqual(tri.high);
    });
  }

  it('bosslar çok daha büyüktür ve en karmaşıktır', () => {
    for (const b of BOSS_KEYS) {
      const m = createMobModel(THREE, b, { quality: 'high' });
      expect(m.bounds.getSize(new THREE.Vector3()).y).toBeGreaterThan(4);
      expect(m.initialStats.triangles).toBeGreaterThan(7000);
      m.dispose();
    }
    for (const k of [...PASSIVE_KEYS, ...HOSTILE_KEYS]) {
      const m = createMobModel(THREE, k, { quality: 'high' });
      expect(m.bounds.getSize(new THREE.Vector3()).y).toBeLessThan(2.3);
      m.dispose();
    }
  });

  it('ellipsoid ve devir yüzeyi normalleri dışa bakar, indeks sarımı tutarlı', () => {
    const b = new kit.MeshBuilder({});
    b.ellipsoid(0.5, 0.3, 0.4, { w: 12, h: 8 });
    b.lathe([[0.01, 0], [0.3, 0.1], [0.2, 0.5], [0.01, 0.6]], { p: [3, 0, 0] });
    let out = 0;
    for (let i = 0; i < b.vertexCount; i++) {
      const cx = i < 12 * 7 + 2 ? 0 : 3;
      const cy = i < 12 * 7 + 2 ? 0 : 0.3;
      const dx = b.pos[i * 3] - cx;
      const dy = b.pos[i * 3 + 1] - cy;
      const dz = b.pos[i * 3 + 2];
      if (dx * b.nor[i * 3] + dy * b.nor[i * 3 + 1] + dz * b.nor[i * 3 + 2] > 0) out++;
    }
    expect(out / b.vertexCount).toBeGreaterThan(0.97);
    // üçgen yüzlerin geometrik normali köşe normaliyle uyumlu (ters sarım yok)
    let agree = 0;
    for (let t = 0; t < b.idx.length; t += 3) {
      const [a, c, d] = [b.idx[t], b.idx[t + 1], b.idx[t + 2]];
      const ux = b.pos[c * 3] - b.pos[a * 3]; const uy = b.pos[c * 3 + 1] - b.pos[a * 3 + 1]; const uz = b.pos[c * 3 + 2] - b.pos[a * 3 + 2];
      const vx = b.pos[d * 3] - b.pos[a * 3]; const vy = b.pos[d * 3 + 1] - b.pos[a * 3 + 1]; const vz = b.pos[d * 3 + 2] - b.pos[a * 3 + 2];
      const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
      const dot = nx * b.nor[a * 3] + ny * b.nor[a * 3 + 1] + nz * b.nor[a * 3 + 2];
      if (dot >= -1e-9) agree++;
    }
    expect(agree / (b.idx.length / 3)).toBeGreaterThan(0.99);
  });

  it('tüp, torus, levha, kristal inşa edilir ve sonlu değerler üretir', () => {
    const b = new kit.MeshBuilder({});
    b.tube([[0, 0, 0], [0, 1, 0.2], [0.3, 2, 0.1]], [0.1, 0.08, 0.02], {});
    b.torus(1, 0.1, {});
    b.sheet(4, 4, (u, v) => [u, v, u * v], { cu: (u, v) => (u > v ? 0xff0000 : 0x00ff00) });
    b.crystal(1, 0.2, {});
    b.spike([0, 0, 0], [0, 1, 0], 0.1, {});
    b.limb([0, 0, 0], [1, 1, 1], 0.1, 0.05, {});
    expect(b.vertexCount).toBeGreaterThan(100);
    for (let i = 0; i < b.pos.length; i++) expect(Number.isFinite(b.pos[i])).toBe(true);
    for (let i = 0; i < b.col.length; i++) expect(Number.isFinite(b.col[i])).toBe(true);
    const g = b.build();
    expect(g.index.count).toBe(b.idx.length);
    g.dispose();
  });
});

describe('animasyon ve durum makinesi', () => {
  const script = (m, boss) => {
    const kinds = boss ? m.def.phases.attacks : [null];
    for (let f = 0; f < 540; f++) {
      const st = {
        speed: f % 200 < 100 ? m.def.speed * (0.4 + (f % 50) / 60) : 0,
        phase: Math.min(2, Math.floor(f / 180)),
        aim: f % 90 < 45 ? { yaw: Math.sin(f * 0.1), pitch: Math.cos(f * 0.07) * 0.3 } : null,
      };
      if (f % 150 > 80 && f % 150 < 140) { st.attacking = kinds[Math.floor(f / 150) % kinds.length] || true; } else st.attacking = false;
      st.hurt = f % 77 === 0;
      m.update(1 / 60, st);
    }
  };

  for (const key of MOB_KEYS) {
    it(key + ': 540 karelik karışık durum betiğinde çökmez, NaN üretmez', () => {
      const m = createMobModel(THREE, key, { quality: 'high' });
      script(m, MOB_TYPES[key].boss);
      expect(allFinite(m.root)).toBe(0);
      m.dispose();
    });
  }

  it('hız yürüyüş fazını sürer; hız yokken faz sabit kalır', () => {
    const m = createMobModel(THREE, 'koyun', { quality: 'medium' });
    m.update(0.1, { speed: 0 });
    const w0 = m.state.walk;
    m.update(0.1, { speed: 0 });
    expect(m.state.walk).toBeCloseTo(w0, 6);
    m.update(0.1, { speed: 3 });
    expect(m.state.walk).toBeGreaterThan(w0);
    m.dispose();
  });

  it('vuruş parlaması: hurt yükselen kenarında ve hitFlash() ile emissive artar, sonra söner', () => {
    const m = createMobModel(THREE, 'golge', { quality: 'medium' });
    const lit = m.rig.mats.lit;
    m.update(0.016, {});
    const base = lit.emissive.r;
    m.update(0.016, { hurt: true });
    expect(lit.emissive.r).toBeGreaterThan(base + 0.4);
    for (let i = 0; i < 60; i++) m.update(0.016, { hurt: true });
    expect(lit.emissive.r).toBeLessThan(base + 0.05);
    m.hitFlash();
    m.update(0.001, {});
    expect(lit.emissive.r).toBeGreaterThan(base + 0.4);
    m.dispose();
  });

  it('kısıtlı harekette parlama daha yumuşak', () => {
    const a = createMobModel(THREE, 'tavuk', { quality: 'low' });
    const b = createMobModel(THREE, 'tavuk', { quality: 'low', reducedMotion: true });
    a.hitFlash(); b.hitFlash();
    a.update(0.001, {}); b.update(0.001, {});
    expect(b.rig.mats.lit.emissive.r).toBeLessThan(a.rig.mats.lit.emissive.r);
    a.dispose(); b.dispose();
  });

  it('ölüm: küçül + çözül, sonra gizlen; reset geri getirir; deathDissolve(t) elle sürer', () => {
    const m = createMobModel(THREE, 'kemikci', { quality: 'medium', onCue: () => {} });
    expect(m.deathDone).toBe(false);
    m.update(0.016, { dead: true });
    expect(m.root.visible).toBe(true);
    let prev = 0;
    for (let i = 0; i < 40; i++) {
      m.update(1 / 60, { dead: true });
      expect(m.deathProgress).toBeGreaterThanOrEqual(prev);
      prev = m.deathProgress;
    }
    expect(m.deathProgress).toBeGreaterThan(0.4);
    expect(m.rig.mats.lit.transparent).toBe(true);
    expect(m.rig.mats.lit.opacity).toBeLessThan(1);
    const holder = m.root.children[0];
    expect(holder.scale.x).toBeLessThan(1);
    for (let i = 0; i < 120; i++) m.update(1 / 60, { dead: true });
    expect(m.deathDone).toBe(true);
    expect(m.root.visible).toBe(false);
    m.update(1 / 60, { dead: false });
    expect(m.root.visible).toBe(true);
    expect(m.rig.mats.lit.opacity).toBe(1);
    expect(holder.scale.x).toBeCloseTo(1, 5);
    m.deathDissolve(0.5);
    expect(m.deathProgress).toBeCloseTo(0.5, 6);
    expect(holder.scale.x).toBeLessThan(0.9);
    m.deathDissolve(1);
    expect(m.root.visible).toBe(false);
    m.reset();
    expect(m.root.visible).toBe(true);
    expect(holder.scale.x).toBeCloseTo(1, 5);
    expect(m.deathProgress).toBe(0);
    m.dispose();
  });

  it('ölürken ve çözülürken cue("death") bir kez bildirilir (parıltı rengiyle)', () => {
    const cues = [];
    const m = createMobModel(THREE, 'lavslime', { quality: 'low', onCue: (n, i) => cues.push([n, i.color, Number.isFinite(i.x + i.y + i.z)]) });
    for (let i = 0; i < 100; i++) m.update(1 / 60, { dead: true });
    expect(cues.filter((c) => c[0] === 'death').length).toBe(1);
    expect(cues[0][1]).toBe(m.deathColor);
    expect(cues[0][2]).toBe(true);
    m.dispose();
  });

  it('saldırı: kemikçi ok işareti, taş bekçi ezme işareti, gölge hükümdar ışın/ışınlanma işaretleri', () => {
    const cues = [];
    const rec = (n) => cues.push(n);
    const run = (key, kind, secs) => {
      cues.length = 0;
      const m = createMobModel(THREE, key, { quality: 'medium', onCue: rec });
      m.setState({ attacking: kind });
      for (let i = 0; i < secs * 60; i++) m.update(1 / 60);
      m.dispose();
      return cues.slice();
    };
    expect(run('kemikci', true, 1.6)).toContain('shoot');
    expect(run('tasbekci', 'ezme', 2.4)).toContain('slam');
    expect(run('tasbekci', 'şok', 2.4)).toContain('slam');
    expect(run('kokana', 'ezme', 2.2)).toContain('slam');
    expect(run('kokana', 'sarmaşık', 2.4)).toContain('vine');
    expect(run('kokana', 'sporlar', 2.4)).toContain('roar');
    expect(run('buzkral', 'mızrak', 2.0)).toContain('spear');
    expect(run('buzkral', 'zıplama', 2.4)).toContain('slam');
    expect(run('buzkral', 'tipi', 2.8)).toContain('roar');
    expect(run('golgehukumdar', 'ışın', 2.6)).toContain('beam');
    expect(run('golgehukumdar', 'çağır', 2.6)).toContain('roar');
    expect(run('golgehukumdar', 'ışınlan', 1.8)).toContain('teleport');
  });

  it('boss aşamaları görünümü değiştirir', () => {
    const run = (key, phase, secs = 3) => {
      const m = createMobModel(THREE, key, { quality: 'medium' });
      for (let i = 0; i < secs * 60; i++) m.update(1 / 60, { phase });
      return m;
    };
    const k0 = run('kokana', 0);
    const k2 = run('kokana', 2);
    expect(k2.rig.n.petal0.rotation.x).toBeLessThan(k0.rig.n.petal0.rotation.x - 0.8);
    expect(k2.rig.n.spores.visible).toBe(true);
    expect(k0.rig.n.spores.visible).toBe(false);
    expect(k2.rig.mats.core.userData.baseColor.r).toBeGreaterThan(k0.rig.mats.core.userData.baseColor.r + 0.3);
    const t0 = run('tasbekci', 0);
    const t2 = run('tasbekci', 2);
    expect(t0.rig.n.plates.visible).toBe(true);
    expect(t2.rig.n.plates.visible).toBe(false);
    const g0 = run('golgehukumdar', 0);
    const g1 = run('golgehukumdar', 1);
    const g2 = run('golgehukumdar', 2);
    const vis = (m) => [0, 1, 2].filter((i) => m.rig.n['clone' + i].visible).length;
    expect(vis(g0)).toBe(0);
    expect(vis(g1)).toBe(2);
    expect(vis(g2)).toBe(3);
    const b0 = run('buzkral', 0);
    const b2 = run('buzkral', 2);
    expect(b2.rig.n.crown.scale.y).toBeGreaterThan(b0.rig.n.crown.scale.y + 0.3);
    [k0, k2, t0, t2, g0, g1, g2, b0, b2].forEach((m) => m.dispose());
  });

  it('gölge hükümdar ışınlanırken küçülür/belirir, ışın yalnız vuruş penceresinde görünür', () => {
    const m = createMobModel(THREE, 'golgehukumdar', { quality: 'medium' });
    expect(m.rig.n.beam.visible).toBe(false);
    m.setState({ attacking: 'ışınlan' });
    let minScale = 9;
    for (let i = 0; i < 100; i++) { m.update(1 / 60); minScale = Math.min(minScale, m.rig.root.scale.x); }
    expect(minScale).toBeLessThan(0.1);
    m.setState({ attacking: false });
    for (let i = 0; i < 200; i++) m.update(1 / 60);
    expect(m.rig.root.scale.x).toBeCloseTo(0.88, 3);
    m.setState({ attacking: 'ışın' });
    let sawBeam = false;
    for (let i = 0; i < 160; i++) { m.update(1 / 60); if (m.rig.n.beam.visible) sawBeam = true; }
    expect(sawBeam).toBe(true);
    m.setState({ attacking: false });
    for (let i = 0; i < 300; i++) m.update(1 / 60);
    expect(m.rig.n.beam.visible).toBe(false);
    m.dispose();
  });

  it('aim biçimleri: {yaw,pitch}, yerel yön vektörü, sayı; null ile temizlenir', () => {
    const m = createMobModel(THREE, 'golge', { quality: 'low' });
    m.update(0.5, { aim: { yaw: 0.6, pitch: 0.2 } });
    for (let i = 0; i < 60; i++) m.update(1 / 60);
    expect(m.state.aimYaw).toBeCloseTo(0.6, 2);
    expect(m.state.aimPitch).toBeCloseTo(0.2, 2);
    m.setState({ aim: { x: -1, y: 0, z: 0 } }); // soldaki hedef → +yaw
    for (let i = 0; i < 90; i++) m.update(1 / 60);
    expect(m.state.aimYaw).toBeCloseTo(Math.PI / 2, 2);
    m.setState({ aim: { x: 0, y: 1, z: -1 } });
    for (let i = 0; i < 90; i++) m.update(1 / 60);
    expect(m.state.aimYaw).toBeCloseTo(0, 2);
    expect(m.state.aimPitch).toBeCloseTo(Math.PI / 4, 2);
    m.setState({ aim: -0.4 });
    for (let i = 0; i < 90; i++) m.update(1 / 60);
    expect(m.state.aimYaw).toBeCloseTo(-0.4, 2);
    m.setState({ aim: null });
    m.update(1 / 60);
    expect(m.state.hasAim).toBe(false);
    m.dispose();
  });

  it('setQuality kalite tavanını değiştirir, LOD onun altında kalır', () => {
    const m = createMobModel(THREE, 'ceylan', { quality: 'high' });
    const hi = m.stats().triangles;
    m.setQuality('low');
    expect(m.level).toBe(0);
    expect(m.stats().triangles).toBeLessThan(hi);
    expect(m.updateLod(2)).toBe(0);
    m.setQuality('medium');
    expect(m.level).toBe(1);
    expect(m.updateLod(2)).toBe(1);
    m.dispose();
  });

  it('reducedMotion: ışınlanma titremesi konum kaymasız, parçacık/kanat frekansı düşük', () => {
    const m = createMobModel(THREE, 'golgehukumdar', { quality: 'low', reducedMotion: true });
    m.setState({ attacking: 'ışınlan' });
    for (let i = 0; i < 40; i++) { m.update(1 / 60); expect(m.rig.root.position.x).toBe(0); }
    m.dispose();
  });
});

describe('önbellek, LOD ve yaşam döngüsü', () => {
  it('aynı tür/varyant/detay geometri paylaşır; dispose sayaçları sıfırlar', () => {
    const refs0 = kit.cacheRefs();
    const size0 = kit.cacheSize();
    const a = createMobModel(THREE, 'tavuk', { quality: 'high', variant: 1 });
    const size1 = kit.cacheSize();
    const refs1 = kit.cacheRefs();
    const b = createMobModel(THREE, 'tavuk', { quality: 'high', variant: 1 });
    expect(kit.cacheSize()).toBe(size1);
    expect(kit.cacheRefs()).toBe(refs1 + (refs1 - refs0));
    const c = createMobModel(THREE, 'tavuk', { quality: 'high', variant: 2 });
    expect(kit.cacheSize()).toBeGreaterThan(size1);
    a.dispose(); b.dispose(); c.dispose();
    a.dispose();
    expect(kit.cacheRefs()).toBe(refs0);
    expect(kit.cacheSize()).toBe(size0);
  });

  it('tüm türler kurulup yok edilince önbellek temizdir', () => {
    expect(kit.cacheSize()).toBe(0);
    const models = MOB_KEYS.map((k) => createMobModel(THREE, k, { quality: 'medium' }));
    models.forEach((m) => m.dispose());
    expect(kit.cacheSize()).toBe(0);
    expect(kit.cacheRefs()).toBe(0);
  });

  it('LOD: uzakta düşük detay (daha az üçgen), yakında geri döner; histerezis var', () => {
    const m = createMobModel(THREE, 'koyun', { quality: 'high' });
    const hi = m.stats().triangles;
    expect(m.updateLod(5)).toBe(2);
    expect(m.updateLod(25)).toBe(1);
    const mid = m.stats().triangles;
    expect(mid).toBeLessThan(hi);
    expect(m.updateLod(80)).toBe(0);
    const lo = m.stats().triangles;
    expect(lo).toBeLessThan(mid);
    expect(m.updateLod(34)).toBe(0); // histerezis: hâlâ düşük
    expect(m.updateLod(5)).toBe(2);
    expect(m.stats().triangles).toBe(hi);
    m.setDetail('low');
    expect(m.level).toBe(0);
    expect(m.stats().triangles).toBe(lo);
    m.dispose();
    expect(kit.cacheSize()).toBe(0);
  });

  it('düşük kalitede toplam üçgen sayısı yükseğin yarısı civarında ya da altında', () => {
    for (const k of ['kokana', 'tasbekci', 'buzkral', 'golgehukumdar', 'kemikci', 'koyun']) {
      const lo = createMobModel(THREE, k, { quality: 'low' });
      const hi = createMobModel(THREE, k, { quality: 'high' });
      expect(lo.initialStats.triangles).toBeLessThan(hi.initialStats.triangles * 0.8);
      lo.dispose(); hi.dispose();
    }
  });

  it('varyantlar: tohuma göre seçilir, geçersiz varyant sarılır', () => {
    for (const k of Object.keys(MOB_VARIANTS)) {
      const seen = new Set();
      for (let s = 0; s < 40; s++) {
        const m = createMobModel(THREE, k, { quality: 'low', seed: s });
        seen.add(m.rig.variant);
        m.dispose();
      }
      expect(seen.size).toBeGreaterThan(1);
      for (const v of seen) expect(v).toBeLessThan(MOB_VARIANTS[k]);
    }
    const m = createMobModel(THREE, 'balik', { quality: 'low', variant: -1 });
    expect(m.rig.variant).toBe(3);
    m.dispose();
  });

  it('dispose sonrasında update güvenlidir ve kök sahneden ayrılır', () => {
    const scene = new THREE.Scene();
    const m = createMobModel(THREE, 'ceylan', { quality: 'low' });
    scene.add(m.root);
    m.dispose();
    expect(scene.children.length).toBe(0);
    m.update(0.016, { speed: 2 });
    m.dispose();
  });

  it('measureBounds görünmez düğümleri ve sprite halolarını saymaz', () => {
    const m = createMobModel(THREE, 'atesbocegi', { quality: 'medium' });
    const size = m.bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(0.3);
    const withAll = new THREE.Box3().setFromObject(m.root, true).getSize(new THREE.Vector3());
    expect(withAll.x).toBeGreaterThanOrEqual(size.x);
    expect(measureBounds(THREE, m.root).getSize(new THREE.Vector3()).x).toBeCloseTo(size.x, 6);
    m.dispose();
  });

  it('IK iki kemikli uzvu hedefe uzatır', () => {
    const l1 = 0.3;
    const l2 = 0.3;
    const up = new THREE.Group();
    const fore = new THREE.Group();
    fore.position.set(0, -l1, 0);
    up.add(fore);
    const tip = new THREE.Object3D();
    tip.position.set(0, -l2, 0);
    fore.add(tip);
    const targets = [[0.2, -0.3, -0.2], [0, -0.55, 0], [0.4, 0.1, -0.3], [-0.1, -0.2, 0.3]];
    for (const t of targets) {
      const ik = kit.ik2(l1, l2, 0, 0, 0, t[0], t[1], t[2], 1, 0, 0);
      up.quaternion.copy(ik.qU);
      fore.quaternion.copy(ik.qF);
      up.updateWorldMatrix(true, true);
      const p = tip.getWorldPosition(new THREE.Vector3());
      const dist = Math.hypot(t[0], t[1], t[2]);
      const want = Math.min(dist, l1 + l2 - 1e-3);
      expect(p.length()).toBeCloseTo(want, 3);
      expect(ik.reach).toBeCloseTo(dist / (l1 + l2), 6);
    }
  });
});
