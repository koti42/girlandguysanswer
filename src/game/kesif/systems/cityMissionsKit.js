/*
 * KEŞİF — görev/keşif sistemlerinin ORTAK araçları (discovery_missions). cityMissions (31), cityDiscovery (34) ve cityApi (35) aynı çekirdeği paylaşır:
 * şehir blobu (dims.neon.city; yükleme sonrası nesne kimliği DEĞİŞEBİLİR → her çağrıda yeniden okunur), Kredi cüzdanı, bildirimler, oyuncu/araç konumu.
 *
 *   getKit(G) → kit (G.cityMissionKit önbelleği)
 *   kit.ctx() → DimCtx('neon') | null          kit.blob() → ensureCityState(ctx.city)   (şehir dışında da blob erişilebilir: kayıt ctx'te kalır)
 *   kit.inCity() → bool                        kit.seed() → şehir tohumu | -1           kit.catalog() → discovery katalogu
 *   kit.pos(out) → {x,y,z,speed,cls,veh,driving,yaw}     kit.accessible() → erişilebilirlik modu
 *   kit.say(text, key) · kit.banner(text, sub, opts) · kit.discover(name) · kit.kredi(n, why) → bool · kit.give(item, n) → verilen
 *   kit.terminalMask() → int · kit.metrics() → metricsOf(blob, …)
 */
import { createWallet } from '../sim/city/ped/npcSave.js';
import { ensureCityState, metricsOf } from '../sim/city/cityState.js';
import { buildDiscovery } from '../sim/city/mission/discovery.js';

export function getKit(G) {
  if (G.cityMissionKit) return G.cityMissionKit;
  const out = { x: 0, y: 64, z: 0, speed: 0, cls: null, veh: null, driving: false, yaw: 0 };
  const wallet = createWallet(() => kit.blob(), (e) => G.emit(e));
  const kit = {
    wallet,
    ctx() {
      const m = G.dimMgr;
      return m && typeof m.get === 'function' ? m.get('neon') : null;
    },
    blob() {
      const c = kit.ctx();
      if (!c) return null;
      if (!c.city || typeof c.city !== 'object') c.city = { v: 1 };
      return ensureCityState(c.city);
    },
    inCity() {
      return G.dim === 'neon' && !!G.world && !!G.body;
    },
    seed() {
      return kit.inCity() ? G.world.seed | 0 : -1;
    },
    catalog() {
      const s = kit.seed();
      return s === -1 ? null : buildDiscovery(s);
    },
    pos(o) {
      const r = o || out;
      const b = G.body;
      const e = G.vehicles && G.vehicles.driven ? G.vehicles.driven : null;
      if (e && e.v) {
        const v = e.v;
        r.x = v.x; r.y = v.y; r.z = v.z;
        r.speed = Math.hypot(v.vx || 0, v.vz || 0);
        r.cls = v.cls;
        r.veh = e;
        r.driving = true;
        r.yaw = v.yaw || 0;
      } else if (b) {
        r.x = b.x; r.y = b.y; r.z = b.z;
        r.speed = Math.hypot(b.vx || 0, b.vz || 0);
        r.cls = null;
        r.veh = null;
        r.driving = false;
        r.yaw = G.player ? G.player.yaw : 0;
      }
      return r;
    },
    accessible() {
      return !!(G.accessibility);
    },
    say(text, key) {
      if (!text) return;
      if (typeof G.hint === 'function') G.hint(text, { ttl: 4200, priority: 4, key: key || 'mis:' + text, cooldown: 600 });
      else if (G.hud) G.hud.hint = text;
      if (typeof G.speak === 'function') G.speak(text);
    },
    banner(text, sub, opts) {
      if (typeof G.banner === 'function') G.banner(text, sub || '', Object.assign({ key: 'mis:' + text, kind: 'info', duration: 3600, priority: 4 }, opts || null));
      if (typeof G.speak === 'function') G.speak(text + (sub ? '. ' + sub : ''));
    },
    discover(name) {
      G.emit({ type: 'discover', name });
    },
    kredi(n, why) {
      if (!Number.isFinite(n) || n <= 0) return false;
      return wallet.add(Math.floor(n), why || 'gorev');
    },
    give(item, n) {
      const inv = G.inventory;
      if (!inv || !item || !(n > 0)) return 0;
      let left = n;
      if (typeof inv.canAdd === 'function' && !inv.canAdd(item, n)) {
        if (G.em && typeof G.em.spawnItem === 'function' && G.body) {
          G.em.spawnItem(item, n, G.body.x, G.body.y + 0.6, G.body.z);
          return n;
        }
        return 0;
      }
      left = inv.add(item, n);
      return n - (Number.isFinite(left) ? left : 0);
    },
    terminalMask() {
      const c = kit.ctx();
      return c && c.terminals && Number.isFinite(c.terminals.found) ? c.terminals.found | 0 : 0;
    },
    metrics() {
      const c = kit.blob();
      if (!c) return metricsOf(null);
      const tm = kit.terminalMask();
      return metricsOf(c, { terminalMask: tm });
    },
  };
  G.cityMissionKit = kit;
  return kit;
}
