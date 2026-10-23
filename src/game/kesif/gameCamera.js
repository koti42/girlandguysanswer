/*
 * KEŞİF — kamera: birinci/üçüncü şahıs, duvara duyarlı omuz-üstü bom, FOV, baş sallanması, iniş çökmesi, su altı bayrakları.
 *
 * Saf matematik (node'da test edilir):
 *   cameraFar(viewDist)                     camera.far ≥ (viewDist+2)·24, en az 256
 *   fovTarget(base, st)                     koşu +8°, uçuş koşusu +10°, planör +6°, su altı −4° (kısıtlı harekette ±)
 *   boomLength(hit, want, margin, min)      ışın isabeti → izin verilen bom uzunluğu (duvara girmez)
 *   boomDirection(mode, yaw, pitch, out)    göz → kamera yönü (birim): 'tp' arkaya, 'tpf' öne (+ omuz kayması ayrı)
 *   stepBoom(cur, allowed, dt)              engelde ANINDA kısalır, serbestte yumuşak uzar
 *   bobOffsets(phase, amp, out)             baş sallanması (dikey/yanal/yuvarlanma)
 *   dampTo(cur, target, rate, dt)           üstel yumuşatma
 *   stepSpring(s, dt)                       iniş çökmesi yayı {x,v}
 *
 * createCameraRig(G) → { update(dt, alpha), state, setBase(fov), snap() }
 *   - G.body/G.player/G.world/G.camera/G.character/G.viewModel okur; G.eye, G.look yazar.
 *   - Kare başına ayırma yok (ortak nesneler yeniden kullanılır).
 */
import { lookDir } from './sim/physics.js';
import { raycastBlocks, createRayHit } from './sim/raycast.js';
import { BLOCKS } from './sim/blocks.js';

export const CAM = Object.freeze({
  near: 0.06,
  tpDistance: 3.6,
  tpFrontDistance: 3.2,
  tpShoulder: 0.5,
  tpLift: 0.2,
  margin: 0.32,
  minBoom: 0.35,
  pitchLimit: Math.PI / 2 - 0.02,
  blendRate: 9,
  showCharacterAt: 0.12,
  hideViewModelAt: 0.04,
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** camera.far: sis/görüş + yedek; (viewDist+2)·24 ve en az 256. */
export function cameraFar(viewDist) {
  const vd = Number.isFinite(viewDist) ? viewDist : 7;
  return Math.max(256, (Math.max(2, vd) + 2) * 24);
}

/** Hedef FOV (derece). st: {sprinting, flying, gliding, underwater, speed, reduced}. Kısıtlı harekette etki yarıya iner. */
export function fovTarget(base, st) {
  const s = st || {};
  const b = Number.isFinite(base) ? clamp(base, 40, 120) : 70;
  let d = 0;
  if (s.sprinting) d += s.flying ? 10 : 8;
  if (s.gliding) d += 6;
  if (s.underwater) d -= 4;
  if (s.reduced) d *= 0.4;
  return b + d;
}

/**
 * Bom uzunluğu: ışın isabet mesafesi (null = yok) ve istenen uzunluk. İsabetin `margin` önünde durur,
 * en az `min`. İsabet yoksa istenen uzunluk.
 */
export function boomLength(hit, want, margin, min) {
  if (hit === null || hit === undefined || !(hit >= 0)) return want;
  const m = margin === undefined ? CAM.margin : margin;
  const lo = min === undefined ? CAM.minBoom : min;
  return clamp(hit - m, Math.min(lo, want), want);
}

/** Göz → kamera yönü. 'tp': bakışın tersi (arkadan); 'tpf': bakış yönü (önden, oyuncuya dönük). */
export function boomDirection(mode, yaw, pitch, out) {
  lookDir(yaw, pitch, out);
  if (mode !== 'tpf') {
    out.x = -out.x;
    out.y = -out.y;
    out.z = -out.z;
  }
  return out;
}

/** Engelde hemen kısalır; serbestte hız 5/sn ile uzar. */
export function stepBoom(cur, allowed, dt) {
  if (allowed < cur) return allowed;
  return cur + (allowed - cur) * Math.min(1, dt * 5);
}

/** Baş sallanması: phase rad, amp 0..1 → out {y, x, roll}. */
export function bobOffsets(phase, amp, out) {
  out.y = Math.abs(Math.sin(phase)) * -0.035 * amp + 0.012 * amp;
  out.x = Math.cos(phase) * 0.014 * amp;
  out.roll = Math.cos(phase) * 0.006 * amp;
  return out;
}

export function dampTo(cur, target, rate, dt) {
  return cur + (target - cur) * (1 - Math.exp(-rate * Math.max(0, dt)));
}

/** Sönümlü yay: s {x, v}; hedef 0. */
export function stepSpring(s, dt) {
  const k = 160;
  const c = 16;
  let t = Math.min(dt, 0.05);
  while (t > 1e-6) {
    const h = Math.min(t, 1 / 120);
    s.v += (-k * s.x - c * s.v) * h;
    s.x += s.v * h;
    t -= h;
  }
  return s;
}

/* ------------------------------------------------------------------------------------------------
 * Kamera donanımı
 * ---------------------------------------------------------------------------------------------- */
export function createCameraRig(G) {
  const cam = G.camera;
  const st = {
    blend: 0,
    deadK: 0,
    boom: CAM.tpDistance,
    fov: 70,
    baseFov: 70,
    bobPhase: 0,
    bobAmp: 0,
    dip: { x: 0, v: 0 },
    shake: 0,
    shakeT: 0,
    underwater: false,
    inLava: false,
    inBlock: false,
    dist: 0,
    yawRate: 0,
    pitchRate: 0,
    pos: { x: 0, y: 0, z: 0 },
    mode: 'fp',
  };
  const dir = { x: 0, y: 0, z: -1 };
  const eye = { x: 0, y: 0, z: 0 };
  const bob = { y: 0, x: 0, roll: 0 };
  const ray = createRayHit();
  const rayOpts = { solidOnly: true, out: ray };
  const sideDir = { x: 0, y: 0, z: 0 };
  const origin = { x: 0, y: 0, z: 0 };
  let lastYaw = null;
  let lastPitch = null;
  let seed = 0;

  function setBase(fov) {
    st.baseFov = Number.isFinite(fov) ? clamp(fov, 40, 120) : 70;
  }

  function liquidAt(x, y, z) {
    const w = G.world;
    const id = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    if (!id) return 0;
    const b = BLOCKS[id];
    if (!b || !b.liquid) return 0;
    return b.damage > 0 ? 2 : 1;
  }

  function update(dt, alpha) {
    const b = G.body;
    const p = G.player;
    const rs = G._rs;
    const a = clamp(alpha, 0, 1);
    // enterpolasyonlu gövde konumu
    const px = rs ? rs.px + (b.x - rs.px) * a : b.x;
    const py = rs ? rs.py + (b.y - rs.py) * a : b.y;
    const pz = rs ? rs.pz + (b.z - rs.pz) * a : b.z;
    const eh = rs ? rs.peh + (b.eyeH - rs.peh) * a : b.eyeH;
    eye.x = px;
    eye.y = py + eh;
    eye.z = pz;

    const reduced = !!(G.reducedMotion || G.accessibility);
    // bakış vektörü (alıcılar için)
    lookDir(p.yaw, p.pitch, G.look);

    // dönüş hızı (viewmodel gecikmesi)
    if (lastYaw === null || dt <= 0) {
      st.yawRate = 0;
      st.pitchRate = 0;
    } else {
      let dy = p.yaw - lastYaw;
      if (dy > Math.PI) dy -= Math.PI * 2;
      else if (dy < -Math.PI) dy += Math.PI * 2;
      st.yawRate = dampTo(st.yawRate, dy / dt, 14, dt);
      st.pitchRate = dampTo(st.pitchRate, (p.pitch - lastPitch) / dt, 14, dt);
    }
    lastYaw = p.yaw;
    lastPitch = p.pitch;

    // FP ↔ TP geçişi
    const wantTp = p.cameraMode === 'tp' || p.cameraMode === 'tpf';
    st.blend = dampTo(st.blend, wantTp ? 1 : 0, CAM.blendRate, dt);
    if (Math.abs(st.blend - (wantTp ? 1 : 0)) < 0.004) st.blend = wantTp ? 1 : 0;
    if (wantTp) st.mode = p.cameraMode;

    // baş sallanması + iniş çökmesi + hasar sarsıntısı
    const moving = b.onGround && !b.swimming && !b.flying ? clamp(b.speed / 4.3, 0, 1.3) : 0;
    st.bobAmp = dampTo(st.bobAmp, reduced ? 0 : moving, 8, dt);
    if (b.speed > 0.2 && b.onGround) st.bobPhase += dt * (5.2 + b.speed * 1.45);
    bobOffsets(st.bobPhase, st.bobAmp * (1 - st.blend), bob);
    stepSpring(st.dip, dt);
    let sx = 0;
    let sy = 0;
    if (st.shakeT > 0 && !reduced) {
      st.shakeT = Math.max(0, st.shakeT - dt);
      seed += dt * 90;
      const k = (st.shakeT / 0.28) * st.shake;
      sx = Math.sin(seed * 1.7) * k;
      sy = Math.cos(seed * 2.3) * k;
    }

    // ölüm: kamera yavaşça yere çöker ve yan yatar (kısıtlı harekette yalnız çöker)
    st.deadK = dampTo(st.deadK, p.dead ? 1 : 0, p.dead ? 2.6 : 8, dt);
    let cx = eye.x + bob.x * Math.cos(p.yaw);
    let cy = eye.y + bob.y + st.dip.x * (1 - st.blend * 0.7) + sy - st.deadK * 0.95 * (1 - st.blend);
    let cz = eye.z - bob.x * Math.sin(p.yaw);
    let yaw = p.yaw;
    let pitch = p.pitch;

    // TP bom
    st.dist = 0;
    if (st.blend > 0.003) {
      const front = st.mode === 'tpf';
      const want = front ? CAM.tpFrontDistance : CAM.tpDistance;
      boomDirection(st.mode, p.yaw, p.pitch, dir);
      // omuz: sağa (arkadan) ya da yok (önden)
      const sh = front ? 0 : CAM.tpShoulder;
      const rx = Math.cos(p.yaw);
      const rz = -Math.sin(p.yaw);
      origin.x = eye.x;
      origin.y = eye.y + CAM.tpLift * st.blend;
      origin.z = eye.z;
      // omuz kaydırmasını önce duvara karşı sına
      let shoulder = 0;
      if (sh > 0) {
        sideDir.x = rx;
        sideDir.z = rz;
        const hs = raycastBlocks(G.world, origin, sideDir, sh + 0.2, rayOpts);
        shoulder = hs ? clamp(hs.t - 0.2, 0, sh) : sh;
      }
      origin.x += rx * shoulder * st.blend;
      origin.z += rz * shoulder * st.blend;
      const hit = raycastBlocks(G.world, origin, dir, want + CAM.margin, rayOpts);
      const allowed = boomLength(hit ? hit.t : null, want, CAM.margin, CAM.minBoom);
      st.boom = stepBoom(st.boom, allowed, dt);
      const d = st.boom * st.blend;
      st.dist = d;
      cx = origin.x + dir.x * d;
      cy = origin.y + dir.y * d;
      cz = origin.z + dir.z * d;
      // blend 0→1 iken d büyür: kamera gözden omuz-üstü konuma süzülür (FP↔TP geçişi)
      if (front) {
        yaw = p.yaw + Math.PI;
        pitch = -p.pitch;
      }
    }

    // kamera kutusu: yer altı/blok içi sıvı bayrakları
    const lq = liquidAt(cx, cy, cz);
    st.underwater = lq > 0;
    st.inLava = lq === 2;

    cam.position.set(cx, cy, cz);
    cam.rotation.set(clamp(pitch, -CAM.pitchLimit, CAM.pitchLimit) + sx * 0.5, yaw, bob.roll + sx * 0.3 + (reduced ? 0 : st.deadK * 0.5), 'YXZ');
    st.pos.x = cx;
    st.pos.y = cy;
    st.pos.z = cz;

    // FOV
    const tgt = fovTarget(st.baseFov, {
      sprinting: b.sprinting && b.speed > 3, flying: b.flying, gliding: b.gliding, underwater: st.underwater, reduced,
    });
    st.fov = dampTo(st.fov || tgt, tgt, 7, dt);
    if (Math.abs(cam.fov - st.fov) > 0.02) {
      cam.fov = st.fov;
      cam.updateProjectionMatrix();
    }
    G.eye.x = eye.x;
    G.eye.y = eye.y;
    G.eye.z = eye.z;
    cam.updateMatrixWorld(true);

    // görünürlük: karakter TP'de, kollar FP'de
    if (G.character) {
      const show = st.blend > CAM.showCharacterAt && !p.dead;
      if (G.character.root.visible !== show) G.character.root.visible = show;
      if (p.dead && !G.character.root.visible) G.character.root.visible = st.blend > CAM.showCharacterAt;
      G.character.root.position.set(px, py, pz);
    }
    if (G.viewModel) {
      const showVm = st.blend < CAM.hideViewModelAt && !p.dead;
      G.viewModel.setVisible(showVm);
    }
  }

  /** Işınlanma/yeniden doğuş sonrası: geçişleri ve yayları sıfırla. */
  function snap() {
    st.dip.x = 0;
    st.dip.v = 0;
    st.shakeT = 0;
    st.deadK = 0;
    st.boom = CAM.tpDistance;
    st.blend = G.player.cameraMode === 'fp' ? 0 : 1;
    lastYaw = null;
  }

  /** Olaylar: iniş (impact b/s) ve hasar (0..1) için kamera tepkisi. */
  function onLand(impact) {
    st.dip.v -= clamp(impact * 0.07, 0, 1.6);
  }
  function onHurt(amount) {
    st.shake = clamp(0.012 + amount * 0.004, 0.012, 0.05);
    st.shakeT = 0.28;
  }

  return {
    update, state: st, setBase, snap, onLand, onHurt,
  };
}
