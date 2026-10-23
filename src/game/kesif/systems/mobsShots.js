/*
 * KEŞİF mobs sistemi — mermi görünümleri, enerji ışını/portal izi, kanca ipi.
 *
 *   createShots(G) → { update(dt, alpha, cam, time), flash(ax,ay,az,bx,by,bz,color,radius,life), muzzle(out), dispose(), stats }
 *
 *  - em.projectiles → ok (sap + uç + tüy; blokta saplı kalır), buz mızrağı (parlak sivri), kaya (dönen kaya parçası). Havadaki
 *    mermiler hız yönünde döner, sim hızıyla öngörülür; iz parçacığı (arrowTrail) düşük sıklıkta.
 *  - flash(): kısa ömürlü, parlak iç + yumuşak dış silindir (ışın tüfeği, mob ışını, portal tabancası izi). 10 yuvalı havuz.
 *  - Kanca ipi: fizik gövdesinin grapple durumu etkinken elden hedef noktaya ince halat + uçta çengel.
 * Havuzlar; kare başı ayırma yok (Vector3/Quaternion yeniden kullanılır).
 */
import { createKeyedSlots, createFreeList } from './mobsPool.js';

const MAX_PROJ = 96;
const FLASH_SLOTS = 10;
const SHOW = 90;
const TICK = 1 / 60;
const TRAIL_EVERY = {
  ok: 0.05, mizrak: 0.035, kaya: 0.07, buyuates: 0.018, buyubuz: 0.022,
};
const TRAIL_COLOR = {
  ok: 0xe8e0d0, mizrak: 0xaee4ff, kaya: 0xb0a090, buyuates: 0xff9a3a, buyubuz: 0xc8f0ff,
};

export function createShots(G) {
  const THREE = G.THREE;
  const em = G.em;
  const group = new THREE.Group();
  group.name = 'mermiler';
  G.entityRoot.add(group);
  const Z = new THREE.Vector3(0, 0, 1);
  const Y = new THREE.Vector3(0, 1, 0);
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vD = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const pos = { x: 0, y: 0, z: 0 };
  const stats = { projectiles: 0, flashes: 0 };
  let disposed = false;
  const reduced = () => !!(G.reducedMotion || G.accessibility);

  /* ---- ortak geometri/malzeme ---- */
  const geos = [];
  const mats = [];
  const mkGeo = (g) => { geos.push(g); return g; };
  const mkMat = (m) => { mats.push(m); return m; };
  const shaftGeo = mkGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 5).rotateX(Math.PI / 2));
  const headGeo = mkGeo(new THREE.ConeGeometry(0.04, 0.12, 6).rotateX(Math.PI / 2));
  const fletchGeo = mkGeo(new THREE.BoxGeometry(0.1, 0.004, 0.12));
  const spearGeo = mkGeo(new THREE.ConeGeometry(0.1, 1.5, 6).rotateX(Math.PI / 2));
  const spearGlowGeo = mkGeo(new THREE.ConeGeometry(0.2, 1.7, 8).rotateX(Math.PI / 2));
  const rockGeo = mkGeo(new THREE.IcosahedronGeometry(0.42, 0));
  const unitCyl = mkGeo(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true));
  const shaftMat = mkMat(new THREE.MeshLambertMaterial({ color: 0x8a5a33 }));
  const headMat = mkMat(new THREE.MeshLambertMaterial({ color: 0xc9ced4 }));
  const fletchMat = mkMat(new THREE.MeshLambertMaterial({ color: 0xf3efe6, side: THREE.DoubleSide }));
  const spearMat = mkMat(new THREE.MeshBasicMaterial({ color: 0xd6f1ff, toneMapped: false }));
  const spearGlowMat = mkMat(new THREE.MeshBasicMaterial({
    color: 0x7fcfff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  const rockMat = mkMat(new THREE.MeshLambertMaterial({ color: 0x8c8274, flatShading: true }));
  // büyü mermileri: ateş topu (beyaz-turuncu çekirdek + yumuşak halo) ve buz mızrağı (parlak kristal sivri)
  const orbGeo = mkGeo(new THREE.SphereGeometry(1, 12, 9));
  const fireCoreMat = mkMat(new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false }));
  const fireMidMat = mkMat(new THREE.MeshBasicMaterial({
    color: 0xff7a1c, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false,
  }));
  const fireHaloMat = mkMat(new THREE.MeshBasicMaterial({
    color: 0xff5a10, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  const shardGeo = mkGeo(new THREE.OctahedronGeometry(0.14, 0).scale(0.7, 0.7, 4.4));
  const shardGlowGeo = mkGeo(new THREE.OctahedronGeometry(0.26, 0).scale(0.8, 0.8, 3.6));
  const iceCoreMat = mkMat(new THREE.MeshBasicMaterial({ color: 0xeafaff, toneMapped: false }));
  const iceGlowMat = mkMat(new THREE.MeshBasicMaterial({
    color: 0x7fd4ff, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));

  function buildArrow() {
    const g = new THREE.Group();
    const s = new THREE.Mesh(shaftGeo, shaftMat);
    const h = new THREE.Mesh(headGeo, headMat);
    h.position.z = 0.36;
    const f1 = new THREE.Mesh(fletchGeo, fletchMat);
    f1.position.z = -0.26;
    const f2 = new THREE.Mesh(fletchGeo, fletchMat);
    f2.position.z = -0.26;
    f2.rotation.z = Math.PI / 2;
    g.add(s, h, f1, f2);
    return g;
  }
  function buildSpear() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(spearGeo, spearMat), new THREE.Mesh(spearGlowGeo, spearGlowMat));
    return g;
  }
  function buildRock() {
    const m = new THREE.Mesh(rockGeo, rockMat);
    const g = new THREE.Group();
    g.add(m);
    return g;
  }
  function buildFireball() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(orbGeo, fireCoreMat);
    core.scale.setScalar(0.2);
    const mid = new THREE.Mesh(orbGeo, fireMidMat);
    mid.scale.setScalar(0.34);
    const halo = new THREE.Mesh(orbGeo, fireHaloMat);
    halo.scale.setScalar(0.9);
    g.add(halo, mid, core);
    g.userData.halo = halo;
    g.userData.mid = mid;
    return g;
  }
  function buildIceShard() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(shardGeo, iceCoreMat), new THREE.Mesh(shardGlowGeo, iceGlowMat));
    return g;
  }
  const pools = {
    buyuates: createFreeList(buildFireball, 8),
    buyubuz: createFreeList(buildIceShard, 8),
    ok: createFreeList(buildArrow, 24),
    mizrak: createFreeList(buildSpear, 12),
    kaya: createFreeList(buildRock, 8),
  };
  const keyed = createKeyedSlots(MAX_PROJ, 1);
  const projState = [];
  for (let i = 0; i < MAX_PROJ; i++) {
    projState.push({
      mesh: null, kind: '', dx: 0, dy: 0, dz: 1, trailT: 0, spin: 0,
    });
  }

  function acquireProj(slot, p) {
    const st = projState[slot.idx];
    const pool = pools[p.kind] || pools.ok;
    st.kind = pools[p.kind] ? p.kind : 'ok';
    st.mesh = pool.acquire();
    st.mesh.visible = true;
    if (st.mesh.parent !== group) group.add(st.mesh);
    const l = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) || 1;
    st.dx = p.vx / l; st.dy = p.vy / l; st.dz = p.vz / l;
    st.trailT = 0;
    st.spin = 0;
  }
  function releaseProj(slot) {
    const st = projState[slot.idx];
    if (!st.mesh) return;
    st.mesh.visible = false;
    if (!pools[st.kind].release(st.mesh)) group.remove(st.mesh);
    st.mesh = null;
  }

  /* ---- ışın / iz flaşları ---- */
  const flashes = [];
  for (let i = 0; i < FLASH_SLOTS; i++) {
    const inner = new THREE.Mesh(unitCyl, mkMat(new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    })));
    const outer = new THREE.Mesh(unitCyl, mkMat(new THREE.MeshBasicMaterial({
      color: 0x9affff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, side: THREE.DoubleSide,
    })));
    inner.visible = false;
    outer.visible = false;
    inner.frustumCulled = false;
    outer.frustumCulled = false;
    inner.renderOrder = 22;
    outer.renderOrder = 21;
    group.add(outer, inner);
    flashes.push({
      inner, outer, t: 0, life: 0, radius: 0.04, on: false,
    });
  }
  let flashNext = 0;

  function flash(ax, ay, az, bx, by, bz, color, radius, life) {
    if (disposed) return;
    const f = flashes[flashNext];
    flashNext = (flashNext + 1) % FLASH_SLOTS;
    vA.set(ax, ay, az);
    vB.set(bx, by, bz);
    vD.copy(vB).sub(vA);
    const len = vD.length();
    if (!(len > 0.05)) return;
    vD.multiplyScalar(1 / len);
    q.setFromUnitVectors(Y, vD);
    f.inner.quaternion.copy(q);
    f.outer.quaternion.copy(q);
    f.inner.position.copy(vA).addScaledVector(vD, len * 0.5);
    f.outer.position.copy(f.inner.position);
    f.inner.userData.len = len;
    f.radius = radius > 0 ? radius : 0.04;
    f.life = life > 0 ? life : 0.14;
    f.t = 0;
    f.on = true;
    f.outer.material.color.setHex(color === undefined ? 0x9affff : color);
    f.inner.visible = true;
    f.outer.visible = true;
  }

  /** Savaş ucunun dünya konumu: birinci şahısta elin yanı, değilse göğüs hizası. */
  function muzzle(out) {
    if (G.player.cameraMode === 'fp' && G.camera) {
      vA.set(0.2, -0.2, -0.75);
      G.camera.localToWorld(vA);
      out.x = vA.x; out.y = vA.y; out.z = vA.z;
    } else {
      const b = G.body;
      out.x = b.x; out.y = b.y + 1.25; out.z = b.z;
    }
    return out;
  }

  /* ---- kanca ipi ---- */
  const ropeMat = mkMat(new THREE.MeshBasicMaterial({ color: 0xd6d9dd, toneMapped: false }));
  const rope = new THREE.Mesh(unitCyl, ropeMat);
  rope.visible = false;
  rope.frustumCulled = false;
  group.add(rope);
  const hookGeo = mkGeo(new THREE.OctahedronGeometry(0.14, 0));
  const hook = new THREE.Mesh(hookGeo, mkMat(new THREE.MeshBasicMaterial({ color: 0xf0f3f6, toneMapped: false })));
  hook.visible = false;
  group.add(hook);

  function updateRope() {
    const gr = G.body && G.body.grapple;
    if (!gr || !gr.active) {
      rope.visible = false;
      hook.visible = false;
      return;
    }
    muzzle(pos);
    vA.set(pos.x, pos.y, pos.z);
    vB.set(gr.x, gr.y, gr.z);
    vD.copy(vB).sub(vA);
    const len = vD.length();
    if (!(len > 0.2)) {
      rope.visible = false;
      return;
    }
    vD.multiplyScalar(1 / len);
    q.setFromUnitVectors(Y, vD);
    rope.quaternion.copy(q);
    rope.position.copy(vA).addScaledVector(vD, len * 0.5);
    rope.scale.set(0.022, len, 0.022);
    rope.visible = true;
    hook.position.copy(vB);
    hook.visible = true;
  }

  function updateFlashes(dt) {
    let on = 0;
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i];
      if (!f.on) continue;
      f.t += dt;
      if (f.t >= f.life) {
        f.on = false;
        f.inner.visible = false;
        f.outer.visible = false;
        continue;
      }
      on++;
      const k = 1 - f.t / f.life;
      const len = f.inner.userData.len;
      const wob = reduced() ? 1 : 0.85 + 0.3 * Math.sin(f.t * 90);
      f.inner.scale.set(f.radius * k * wob, len, f.radius * k * wob);
      f.outer.scale.set(f.radius * 3.4 * (0.4 + 0.6 * k), len, f.radius * 3.4 * (0.4 + 0.6 * k));
      f.inner.material.opacity = 0.95 * k;
      f.outer.material.opacity = reduced() ? 0.22 * k : 0.38 * k;
    }
    stats.flashes = on;
  }

  function update(dt, alpha, cam, time) {
    if (disposed) return;
    const d = dt > 0.1 ? 0.1 : dt;
    const k = alpha * TICK;
    keyed.begin();
    const list = em.projectiles;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const dx = p.x - cam.x;
      const dz = p.z - cam.z;
      if (dx * dx + dz * dz > SHOW * SHOW) continue;
      const slot = keyed.use(p, 0);
      if (!slot) break;
      if (slot.fresh) acquireProj(slot, p);
      const st = projState[slot.idx];
      const m = st.mesh;
      n++;
      if (!p.stuck) {
        const l = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
        if (l > 0.01) {
          st.dx = p.vx / l; st.dy = p.vy / l; st.dz = p.vz / l;
        }
        m.position.set(p.x + p.vx * k, p.y + p.vy * k, p.z + p.vz * k);
      } else {
        m.position.set(p.x, p.y, p.z);
      }
      if (st.kind === 'buyuates') {
        const pulse = reduced() ? 1 : 0.92 + 0.14 * Math.sin(time * 17 + p.id);
        m.userData.halo.scale.setScalar(0.9 * pulse);
        m.userData.mid.scale.setScalar(0.34 * (2 - pulse) * 0.5 + 0.17);
        m.rotation.set(0, 0, 0);
      } else if (st.kind === 'kaya') {
        st.spin += d * 5;
        m.rotation.set(st.spin, st.spin * 0.7, 0);
        m.scale.setScalar(p.aoe && p.aoe.r > 1 ? 1.1 : 1);
      } else {
        vD.set(st.dx, st.dy, st.dz);
        m.quaternion.setFromUnitVectors(Z, vD);
      }
      if (!p.stuck && G.particles) {
        st.trailT -= d;
        if (st.trailT <= 0) {
          st.trailT = TRAIL_EVERY[st.kind] || 0.06;
          pos.x = m.position.x; pos.y = m.position.y; pos.z = m.position.z;
          if (st.kind === 'buyuates' && G.particles.fireTrail) G.particles.fireTrail(pos);
          else if (st.kind === 'buyubuz' && G.particles.frostTrail) G.particles.frostTrail(pos);
          else G.particles.arrowTrail(pos, TRAIL_COLOR[st.kind]);
        }
      }
    }
    keyed.end(releaseProj);
    stats.projectiles = n;
    updateFlashes(d);
    updateRope(time);
  }

  /** Shader'ları önceden derle: tüm mermi/iz mesh'lerini kısa süre görünür yap (renderer.compile). */
  const warmObjs = [];
  function warm(on) {
    if (on) {
      ['ok', 'mizrak', 'kaya', 'buyuates', 'buyubuz'].forEach((k) => {
        const m = pools[k].acquire();
        m.visible = true;
        if (m.parent !== group) group.add(m);
        warmObjs.push([k, m]);
      });
      for (let i = 0; i < flashes.length; i++) {
        flashes[i].inner.visible = true;
        flashes[i].outer.visible = true;
      }
      rope.visible = true;
      hook.visible = true;
    } else {
      while (warmObjs.length > 0) {
        const w = warmObjs.pop();
        w[1].visible = false;
        if (!pools[w[0]].release(w[1])) group.remove(w[1]);
      }
      for (let i = 0; i < flashes.length; i++) {
        flashes[i].inner.visible = flashes[i].on;
        flashes[i].outer.visible = flashes[i].on;
      }
      rope.visible = false;
      hook.visible = false;
    }
  }

  return {
    stats,
    update,
    flash,
    muzzle,
    warm,
    clear() {
      keyed.releaseAll(releaseProj);
      for (let i = 0; i < flashes.length; i++) {
        flashes[i].on = false;
        flashes[i].inner.visible = false;
        flashes[i].outer.visible = false;
      }
      rope.visible = false;
      hook.visible = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      G.entityRoot.remove(group);
      for (let i = 0; i < geos.length; i++) geos[i].dispose();
      for (let i = 0; i < mats.length; i++) mats[i].dispose();
    },
  };
}
