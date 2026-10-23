/*
 * KEŞİF — geliştirme/test yardımcıları (api._debug()). Yalnızca ?debug=1, opts.debug ya da geliştirme derlemesinde var.
 *
 *   buildDebug(G, d) → {
 *     G, getG(), getPose() → {x,y,z,yaw,pitch,vx,vy,vz,onGround,flying,...}
 *     tp(x,y,z,opts?)               güvenli ışınlanma ({safe:false} ham)
 *     setTime(faz|'gündüz'|'gün batımı'|'gece'|'şafak', freeze?)     saat; freeze:true → saat durur
 *     setWeather('clear'|'rain'|'snow'|'storm'|null, intensity?)      null → hava benzetimine dön
 *     setInput(obj|null)            G.inputOverride: {moveX,moveZ,jump,sprint,crouch,breakHeld,…, lookDX/lookDY (tüketilir), events:[…]}
 *     stepFixed(n, input?)          n sabit adım (çizim yok; belirlenimci test); input verilirse override olarak kurulur
 *     advance(ms, frameMs=16.7)     gerçek kare işlevini (çizim dahil) sanal süre kadar çalıştırır
 *     action(type, extra?)          eylem yönlendir (ör. 'camera', 'pause', 'inventory')
 *     look(yaw, pitch)              bakış ayarla
 *     unlockZones(n=4)              1..n bölge mührünü açar (akış/dolaşma testi)
 *     readPixels(x,y,w,h)           son çizimden RGBA bayt (alt-sol köken); çizim sonrası aynı görevde çağır
 *     render()                      bir kare çiz (readPixels öncesi)
 *     info()                        renderer.info + chunkManager.getStats() kopyası
 *   }
 */
import { setClockPhase } from './sim/daynight.js';
import { mapTimePhase } from './gameWorld.js';

const TIME_NAMES = { şafak: 0.02, sabah: 0.08, gündüz: 0.22, öğle: 0.25, 'gün batımı': 0.5, akşam: 0.52, gece: 0.75 };

export function buildDebug(G, d) {
  const b = G.body;
  const dbg = {
    G,
    getG: () => G,
    getPose() {
      const p = G.player;
      return {
        x: b.x, y: b.y, z: b.z, yaw: p.yaw, pitch: p.pitch, vx: b.vx, vy: b.vy, vz: b.vz,
        onGround: b.onGround, flying: b.flying, crouching: b.crouching, sprinting: b.sprinting, swimming: b.swimming,
        inLiquid: b.inLiquid, hp: G.survival.hp, hunger: G.survival.hunger, dead: p.dead, cameraMode: p.cameraMode, ui: G.ui,
      };
    },
    tp(x, y, z, opts) {
      return d.player.teleport(x, y, z, opts);
    },
    setTime(v, freeze) {
      let ph;
      if (typeof v === 'number') ph = v;
      else if (Object.prototype.hasOwnProperty.call(TIME_NAMES, v)) ph = TIME_NAMES[v];
      else ph = mapTimePhase(v);
      setClockPhase(G.clock, ph);
      if (freeze !== undefined) G.clock.frozen = !!freeze;
      return ph;
    },
    setWeather(kind, intensity) {
      if (!kind) {
        G._weatherForce = null;
        return null;
      }
      const inten = intensity === undefined ? (kind === 'storm' ? 0.95 : kind === 'clear' ? 0 : 0.7) : intensity;
      G._weatherForce = {
        kind: kind === 'storm' ? 'rain' : kind, intensity: kind === 'clear' ? 0 : inten, cover: kind === 'clear' ? 0.12 : 0.55 + inten * 0.4,
      };
      return G._weatherForce;
    },
    setInput(obj) {
      G.inputOverride = obj ? Object.assign({
        moveX: 0, moveZ: 0, jump: false, jumpPressed: false, crouch: false, sprint: false, breakHeld: false, placeHeld: false,
        attackPressed: false, placePressed: false, interactPressed: false, lookDX: 0, lookDY: 0, events: [],
      }, obj) : null;
      return G.inputOverride;
    },
    stepFixed(n, input) {
      if (input !== undefined) dbg.setInput(input);
      const steps = Math.max(0, Math.floor(n) || 0);
      for (let i = 0; i < steps; i++) {
        d.player.pollInput(1 / 60);
        d.fixedPass(1 / 60);
        d.player.clearEdges();
      }
      return dbg.getPose();
    },
    advance(ms, frameMs) {
      const fm = frameMs > 0 ? frameMs : 1000 / 60;
      let t = Math.max(0, ms);
      while (t > 0) {
        const step = Math.min(fm, t);
        d.frameBody(step);
        t -= step;
      }
      return dbg.getPose();
    },
    action(type, extra) {
      d.dispatchAction(Object.assign({ type }, extra || {}));
    },
    unlockZones(upTo) {
      const n = Number.isFinite(upTo) ? upTo : 4;
      for (let i = 1; i <= n; i++) G.world.unlockZone(i);
      return n;
    },
    look(yaw, pitch) {
      if (Number.isFinite(yaw)) G.player.yaw = yaw;
      if (Number.isFinite(pitch)) G.player.pitch = Math.max(-1.55, Math.min(1.55, pitch));
    },
    render() {
      d.render.render(0);
    },
    readPixels(x, y, w, h) {
      const gl = G.renderer.getContext();
      const out = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return out;
    },
    info() {
      const info = G.renderer.info;
      return {
        render: Object.assign({}, info.render),
        memory: Object.assign({}, info.memory),
        chunks: Object.assign({}, G.chunkManager.getStats()),
        quality: Object.assign({}, G.quality.settings),
        post: G.postfx.enabled,
        light: Object.assign({}, d.render.lightAtEye),
        cam: { mode: G.player.cameraMode, blend: d.camRig.state.blend, fov: G.camera.fov, far: G.camera.far },
      };
    },
  };
  return dbg;
}
