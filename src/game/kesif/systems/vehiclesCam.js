/*
 * KEŞİF — sürücü kamerası (vehicles sistemi yardımcısı). Çekirdek kamera donanımından (gameCamera) SONRA, frameUpdate'te kamerayı ezer.
 *
 *   createDriverCamera(G) → { mode (0 takip · 1 kaput · 2 uzak), cycle(), reset(entry), update(dt, alpha, interp, entry), state }
 *   Takip: mesafe = def.cam.dist + 0,04·|u| (uzak ×1,7), yükseklik def.cam.height; yaw hıza doğru 5/sn gecikmeyle döner (|u| > 3), duvara ışın çekme (kısalır);
 *          kaput: göz = def.cam.hood (araç yerel), araçla birlikte döner.
 *   FOV = taban + min(14, 0,25·|u|) (+10 nitro); kısıtlı hareket / erişilebilirlik: FOV payı ×0,3 ve en çok +4, sarsıntı yok.
 *   Darbe sarsıntısı 0,25 sn (kısıtlı harekette yok). Kamera, kaput modunda aracın gövde eğimini (pitch/roll) yumuşakça izler.
 */
import { raycastBlocks, createRayHit } from '../sim/raycast.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * Math.max(0, dt)));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function createDriverCamera(G) {
  const st = {
    mode: 0, yaw: 0, dist: 6.5, fov: 70, shakeT: 0, shake: 0, seed: 0, initialized: false, pitch: 0, roll: 0, hoodPitch: 0,
  };
  const ray = createRayHit();
  const rayOpts = { solidOnly: true, out: ray };
  const origin = { x: 0, y: 0, z: 0 };
  const dir = { x: 0, y: 0, z: 0 };

  function reducedMotion() {
    return !!(G.reducedMotion || G.accessibility);
  }

  return {
    state: st,
    get mode() {
      return st.mode;
    },
    set mode(m) {
      st.mode = m === 1 || m === 2 ? m : 0;
    },
    cycle() {
      st.mode = (st.mode + 1) % 3;
      st.initialized = false;
      return st.mode;
    },
    bump(impact) {
      if (reducedMotion()) return;
      st.shakeT = 0.25;
      st.shake = clamp(0.01 + impact * 0.0022, 0.01, 0.045);
    },
    reset(entry) {
      st.initialized = false;
      if (entry) st.yaw = entry.v.yaw;
    },
    /** interp: {x,y,z,yaw,pitch,roll} ara değerli poz (alpha ile). */
    update(dt, interp, entry) {
      const cam = G.camera;
      if (!cam || !entry) return;
      const v = entry.v;
      const d = v.def;
      const sp = Math.sqrt(v.vx * v.vx + v.vz * v.vz);
      const reduced = reducedMotion();
      if (!st.initialized) {
        st.yaw = interp.yaw;
        st.dist = d.cam.dist;
        st.fov = G.settings && Number.isFinite(G.settings.fov) ? G.settings.fov : 70;
        st.initialized = true;
      }
      const baseFov = G.settings && Number.isFinite(G.settings.fov) ? clamp(G.settings.fov, 50, 100) : 70;
      let fovAdd = Math.min(14, 0.25 * sp) + (v.nitroOn ? 10 : 0);
      if (reduced) fovAdd = Math.min(4, fovAdd * 0.3);
      st.fov = damp(st.fov, baseFov + fovAdd, 6, dt);

      let cx;
      let cy;
      let cz;
      let yaw;
      let pitch;
      let roll = 0;
      if (st.mode === 1) {
        const sy = Math.sin(interp.yaw);
        const cyw = Math.cos(interp.yaw);
        const hx = d.cam.hood[0];
        const hz = d.cam.hood[2];
        // yerel: +z ileri; dünya: ileri = (−sin, −cos), sağ = (cos, −sin)
        cx = interp.x + (-sy) * hz + cyw * hx;
        cz = interp.z + (-cyw) * hz + (-sy) * hx;
        cy = interp.y + d.cam.hood[1];
        yaw = interp.yaw;
        st.hoodPitch = damp(st.hoodPitch, interp.pitch * 0.5, 8, dt);
        pitch = st.hoodPitch;
        roll = reduced ? 0 : -interp.roll * 0.4;
      } else {
        const far = st.mode === 2 ? 1.7 : 1;
        const want = (d.cam.dist + 0.04 * sp) * far;
        if (sp > 3) {
          const tgt = Math.atan2(-v.vx, -v.vz);
          const blend = sp > 6 ? 1 : (sp - 3) / 3;
          st.yaw += angleDiff(tgt, st.yaw) * (1 - Math.exp(-5 * blend * dt));
        } else st.yaw += angleDiff(interp.yaw, st.yaw) * (1 - Math.exp(-3.5 * dt));
        // yaw, araç yönünden en çok 80° ayrılır (yana bakan kamera olmasın)
        const dv = angleDiff(st.yaw, interp.yaw);
        if (Math.abs(dv) > 1.4) st.yaw = interp.yaw + Math.sign(dv) * 1.4;
        const fx = -Math.sin(st.yaw);
        const fz = -Math.cos(st.yaw);
        const h = d.cam.height * far;
        origin.x = interp.x;
        origin.y = interp.y + d.height * 0.7;
        origin.z = interp.z;
        dir.x = -fx;
        dir.y = (h - d.height * 0.7) / want;
        dir.z = -fz;
        const dl = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1;
        dir.x /= dl; dir.y /= dl; dir.z /= dl;
        let allowed = want;
        if (G.world) {
          const hit = raycastBlocks(G.world, origin, dir, want + 0.4, rayOpts);
          if (hit) allowed = clamp(hit.t - 0.4, 1.2, want);
        }
        st.dist = allowed < st.dist ? allowed : damp(st.dist, allowed, 5, dt);
        cx = origin.x + dir.x * st.dist;
        cy = origin.y + dir.y * st.dist;
        cz = origin.z + dir.z * st.dist;
        // aracın biraz önünü seyret
        const lx = interp.x + fx * Math.min(3, 1 + sp * 0.06);
        const lz = interp.z + fz * Math.min(3, 1 + sp * 0.06);
        const ly = interp.y + d.height * 0.6;
        const dx = lx - cx;
        const dz = lz - cz;
        yaw = Math.atan2(-dx, -dz);
        pitch = Math.atan2(ly - cy, Math.sqrt(dx * dx + dz * dz));
      }
      let sx = 0;
      let sy2 = 0;
      if (st.shakeT > 0 && !reduced) {
        st.shakeT = Math.max(0, st.shakeT - dt);
        st.seed += dt * 90;
        const k = (st.shakeT / 0.25) * st.shake;
        sx = Math.sin(st.seed * 1.7) * k;
        sy2 = Math.cos(st.seed * 2.3) * k;
      }
      cam.position.set(cx, cy + sy2, cz);
      cam.rotation.set(clamp(pitch, -1.3, 1.3) + sx * 0.5, yaw, roll + sx * 0.3, 'YXZ');
      if (Math.abs(cam.fov - st.fov) > 0.02) {
        cam.fov = st.fov;
        cam.updateProjectionMatrix();
      }
      cam.updateMatrixWorld(true);
      // oyun içi alıcılar (nişan/etkileşim): göz = kamera
      if (G.eye) {
        G.eye.x = cx; G.eye.y = cy; G.eye.z = cz;
      }
      if (G.look) {
        const cp = Math.cos(pitch);
        G.look.x = -Math.sin(yaw) * cp;
        G.look.y = Math.sin(pitch);
        G.look.z = -Math.cos(yaw) * cp;
      }
      if (G.character && G.character.root.visible) G.character.root.visible = false;
      if (G.viewModel && G.viewModel.setVisible) G.viewModel.setVisible(false);
    },
  };
}
