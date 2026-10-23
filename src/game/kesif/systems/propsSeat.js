/*
 * KEŞİF props sistemi — OTURMA / YATMA denetleyicisi. `propSeat` olayı (sit davranışı) → oyuncu gövdesi koltuğa kilitlenir, kamera alçalır;
 * zıpla / F / ölüm / boyut değişimi / ışınlanma ile kalkılır. Kalkış: koltuğun önü/yanı gibi ilk BOŞ yer (yoksa yerinde).
 *
 *   const sc = createSeatController(G)
 *   sc.start(evt)        propSeat olayı: {id,key,x,y,z,yaw,pitch,eye,pose,closes}; aynı koltuktaysa kalkar
 *   sc.fixedUpdate(dt)   fizikten SONRA (props sistemi order 23): gövdeyi sabitler, kalkış girdisini izler
 *   sc.stand(reason)     elle kalk (reason: 'jump'|'use'|'dim'|'dead'|'teleport'|'api')      sc.active → koltuk | null
 * G alanları (hepsi isteğe bağlı; yoksa sessizce atlanır): G.body, G.player, G.inputState, G.eyeSim, G.world, G.props, G.emit.
 * Olaylar: seated {id,pose} · stood {id,reason}. Hapis yok: kalkış her zaman bir konum üretir (ilk boş aday, yoksa yerinde).
 */
import { isBoxFree } from '../sim/physics.js';
import { seatExits } from '../sim/props/propSeat.js';

const GUARD = 0.35; // başlangıçtan sonra çıkış girdisi yok sayılır (aynı F basışı)
const MAX_DRIFT = 1.5; // ışınlanma/itilme: gövde koltuktan bu kadar uzaklaşırsa kalkılmış sayılır

export function createSeatController(G) {
  let seat = null;
  let t = 0;

  function say(text) {
    if (G.hud) G.hud.hint = text;
  }

  function emit(e) {
    if (typeof G.emit === 'function') G.emit(e);
  }

  function lock(b, s) {
    b.x = s.x;
    b.y = s.y;
    b.z = s.z;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
    b.onGround = true;
    b.sprinting = false;
    b.crouching = false;
    b.eyeH += (s.eye - b.eyeH) * 0.3;
    if (G.eyeSim) {
      G.eyeSim.x = b.x;
      G.eyeSim.y = b.y + b.eyeH;
      G.eyeSim.z = b.z;
    }
  }

  const api = {
    get active() {
      return seat;
    },

    start(e) {
      const b = G.body;
      if (!b || !e || !Number.isFinite(e.x + e.y + e.z + e.yaw + e.eye)) return false;
      if (G.player && G.player.dead) return false;
      if (seat && seat.id === e.id) {
        api.stand('use');
        return true;
      }
      if (seat) api.stand('api');
      seat = {
        id: e.id, key: e.key, x: e.x, y: e.y, z: e.z, yaw: e.yaw, pitch: Number.isFinite(e.pitch) ? e.pitch : 0, eye: e.eye, pose: e.pose, closes: !!e.closes, spot: e.spot || 0, t0: t,
      };
      if (G.player) {
        G.player.yaw = e.yaw;
        G.player.pitch = seat.pitch;
      }
      if (b.flying) b.flying = false;
      lock(b, seat);
      emit({ type: 'seated', id: seat.id, pose: seat.pose });
      return true;
    },

    stand(reason) {
      const s = seat;
      if (!s) return false;
      seat = null;
      const b = G.body;
      if (b) {
        const pw = G.props;
        const e = pw && typeof pw.entry === 'function' ? pw.entry(s.id) : null;
        let spot = null;
        if (e && G.world && reason !== 'dim' && reason !== 'teleport') {
          const cands = seatExits(e.def, e.prop, { spot: s.spot || 0 });
          for (let i = 0; i < cands.length && !spot; i++) {
            const c = cands[i];
            if (isBoxFree(G.world, c.x - 0.31, c.y + 0.03, c.z - 0.31, c.x + 0.31, c.y + 1.77, c.z + 0.31)
              && !isBoxFree(G.world, c.x - 0.2, c.y - 0.12, c.z - 0.2, c.x + 0.2, c.y - 0.002, c.z + 0.2)) spot = c;
          }
          if (!spot) spot = { x: s.x, y: e.prop.y, z: s.z }; // yerinde kalk (koltuk kutusu içinde serbest geçiş)
        }
        if (spot) {
          b.x = spot.x;
          b.y = spot.y;
          b.z = spot.z;
          b.vx = 0;
          b.vy = 0;
          b.vz = 0;
        } else if (reason !== 'dim' && reason !== 'teleport') {
          b.y = s.y - 0.3;
        }
      }
      if (s.closes && G.props && typeof G.props.setState === 'function') G.props.setState(s.id, 0);
      emit({ type: 'stood', id: s.id, reason: reason || 'api' });
      say('');
      return true;
    },

    fixedUpdate(dt) {
      t += dt > 0 ? dt : 0;
      if (!seat) return;
      const b = G.body;
      if (!b) { seat = null; return; }
      if (G.player && G.player.dead) { api.stand('dead'); return; }
      const dx = b.x - seat.x;
      const dz = b.z - seat.z;
      if (dx * dx + dz * dz > MAX_DRIFT * MAX_DRIFT || Math.abs(b.y - seat.y) > 6) {
        // ışınlanma/itilme: kalkılmış say (konuma dokunma)
        api.stand('teleport');
        return;
      }
      const s = G.inputState;
      if (s && t - seat.t0 > GUARD && (s.jumpPressed || s.interactPressed)) {
        api.stand(s.jumpPressed ? 'jump' : 'use');
        return;
      }
      lock(b, seat);
    },
  };
  return api;
}
