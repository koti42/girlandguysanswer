/*
 * KEŞİF tech sistemi — taşınan cihazlar: jetpack, tarayıcı, enerji kalkanı tepkileri, "kullan" yönlendirmesi.
 *
 *   createGear(T) → {
 *     stepJetpack(dt)            fizikten SONRA: itiş süresini yakıta çevirir, alev + ses, toplu 'jetpackFuel' olayı, yakıt bitti uyarısı
 *     stepScanner(dt)            çubukta Tarayıcı varken periyodik tarama (tickScanner) + efektler
 *     scanNow() → {ok,…}         elle tarama (sağ tık / api.scan)
 *     refuel() → {ok,…}          Enerji Hücresiyle jetpack yakıtı (kısayol / sağ tık / envanter "Kullan")
 *     useHeld(key) → bool        applyHeldItem yönlendirmesi (tarayıcı: tara, jetpack: yakıt yükle)
 *     useSlot(index) → bool|undefined
 *     onShield(e)                'shieldAbsorb' olayı: ses + parıltı + okuma
 *   }
 *
 * Kurallar: jetpack itişi parkur sürerken ve macera dışında kapalıdır (mods.thrust sıfırlanır). Jetpack yalnız ÇUBUKTA taşınırken çalışır.
 */
import { structuresInRegion } from '../sim/structures.js';
import { getMobType } from '../sim/mobTypes.js';
import {
  jetpackStatus, refuelJetpack, tickJetpack,
} from '../sim/techMods.js';
import { pingNow, tickScanner } from '../sim/techScanner.js';
import { techOf } from '../sim/techCharge.js';
import { say } from './techCtx.js';

const BATCH = 0.25;

export function createGear(T) {
  const G = T.G;
  const pos = { x: 0, y: 0, z: 0 };
  const jet = T.jet;

  const acc = {
    getBlock: (x, y, z) => G.world.getBlock(x, y, z),
    structures(x, z, r) {
      let list = [];
      try {
        list = structuresInRegion(G.seed, x - r, z - r, x + r, z + r);
      } catch {
        list = [];
      }
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (typeof s.zone === 'number' && G.world.isZoneUnlocked && !G.world.isZoneUnlocked(s.zone)) continue;
        out.push({
          type: s.type, name: s.name, x: s.x, y: s.y, z: s.z,
        });
      }
      return out;
    },
    mobs(x, y, z, r) {
      if (!G.em || typeof G.em.queryMobs !== 'function') return [];
      const list = G.em.queryMobs(x, z, r);
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.hidden || Math.abs(e.y - y) > r) continue;
        const mt = getMobType(e.type);
        out.push({
          type: e.type, name: mt ? mt.name : e.type, x: e.x, y: e.y + (e.h || 1) * 0.5, z: e.z, hostile: !!(mt && mt.hostile),
        });
      }
      return out;
    },
  };
  const sctx = { pos, acc };

  function playerPos() {
    const b = G.body;
    pos.x = b.x; pos.y = b.y + 0.9; pos.z = b.z;
    return pos;
  }

  /* --------------------------------------------------------------------------------------------
   * Jetpack
   * ------------------------------------------------------------------------------------------ */
  function flushJet(extra) {
    if (jet.acc <= 0 && !extra) return;
    const st = jetpackStatus(G.inventory);
    G.emit({
      type: 'jetpackFuel', fuel: st.fuel, max: st.max, burned: Math.round(jet.acc * 1000) / 1000, empty: st.empty, refueled: !!extra,
    });
    jet.acc = 0;
    jet.accT = 0;
  }

  function stepJetpack(dt) {
    const b = G.body;
    const inv = G.inventory;
    if (G.hud && G.hud.parkour && G.mods) {
      G.mods.thrust = 0; // parkur: jetpack kapalı (yarışma adil kalsın)
      G.mods.thrustVy = 0;
    }
    const r = tickJetpack(inv, b, { autoRefuel: true });
    const thrusting = !!b.thrusting && r.burned > 0;
    jet.thrusting = thrusting;
    jet.has = r.max > 0;
    if (r.refueled) {
      flushJet(true);
      G.sound('tech:charge', undefined, { vol: 0.5, pitch: 0.9 });
      say(T, 'jet:cell', 'Enerji Hücresi yakıta çevrildi.', { secs: 2.5, cooldown: 1 });
    }
    if (thrusting) {
      jet.acc += r.burned;
      jet.accT += dt;
      jet.soundT -= dt;
      jet.flameT -= dt;
      if (jet.soundT <= 0) {
        jet.soundT = 0.12;
        G.sound('tech:jetpack', b, { vol: 0.55, pitch: 0.95 + ((G.time.tick * 5) % 7) / 60 });
      }
      if (jet.flameT <= 0 && G.particles && G.particles.jetFlame) {
        jet.flameT = 0.035;
        const vis = T.visuals;
        // üçüncü şahıs: sırttaki jetpack'in iki lülesinden; birinci şahıs: ayakların biraz gerisinden
        const nz = vis && vis.backpack && G.player.cameraMode !== 'fp' ? vis.backpack.nozzles(T.nz) : null;
        if (nz && nz.length) {
          for (let i = 0; i < nz.length; i++) G.particles.jetFlame(nz[i], b.vx, b.vy, b.vz);
        } else {
          pos.x = b.x; pos.y = b.y + 0.15; pos.z = b.z;
          G.particles.jetFlame(pos, b.vx, b.vy, b.vz);
        }
      }
      if (jet.accT >= BATCH) flushJet(false);
      T.hudDirty = true;
    } else if (jet.wasThrusting) {
      flushJet(false);
      T.hudDirty = true;
    }
    jet.wasThrusting = thrusting;
    // yakıt bitti uyarısı: havada zıplama basılı + çubukta jetpack var + yakıt ve hücre yok
    if (!thrusting && G.inputState.jump && !b.onGround && !b.inLiquid && !b.flying) {
      const st = jetpackStatus(inv);
      if (st.has && st.empty && st.cells < 1) {
        if (say(T, 'jet:empty', 'Jetpack yakıtı bitti: Enerji Hücresi ya da şarj gerekli.', { secs: 3, cooldown: 3 })) {
          G.sound('tech:jetpack_empty', b, { vol: 0.6 });
        }
      }
    }
  }

  /* --------------------------------------------------------------------------------------------
   * Tarayıcı
   * ------------------------------------------------------------------------------------------ */
  function afterScan(ev, manual) {
    if (!ev) return;
    const b = G.body;
    G.emit(ev);
    G.sound('tech:scan', undefined, { vol: manual ? 0.5 : 0.28 });
    if (G.particles && G.particles.scanPulse) G.particles.scanPulse({ x: b.x, y: b.y, z: b.z }, 0x5ad7ff);
    const pings = T.tech.scanner.pings;
    T.scanFlash = G.time ? G.time.seconds : 0;
    if (pings.length > 0) {
      const p = pings[0];
      // otomatik taramalar ekran okuyucuyu boğmaz (20 sn'de en çok bir kez); elle taramada her zaman okunur
      const msg = 'Tarama: ' + pings.length + ' hedef. En yakın: ' + p.name + ', ' + Math.round(p.dist) + ' blok.';
      if (manual) G.speak(msg);
      else say(T, 'scan:auto', msg, { hint: false, cooldown: 20 });
      // en yakın birkaç hedefte yıldız parıltısı (derinlikten bağımsız ışık zerresi)
      if (G.particles && G.particles.pingGlint) {
        for (let i = 0; i < pings.length && i < 6; i++) G.particles.pingGlint({ x: pings[i].x, y: pings[i].y, z: pings[i].z }, pings[i].color);
      }
      G.sound('tech:blip', undefined, { vol: manual ? 0.35 : 0.2 });
    } else if (manual) {
      G.speak('Tarama: yakında bir şey yok.');
    }
    T.hudDirty = true;
  }

  function stepScanner(dt) {
    playerPos();
    const ev = tickScanner(T.tech, G.inventory, dt, sctx);
    if (ev) afterScan(ev);
  }

  function scanNow() {
    const r = pingNow(T.tech, G.inventory, { pos: playerPos(), acc });
    if (r.ok) {
      afterScan(r.event, true);
      return r;
    }
    G.sound('tech:deny', undefined, { vol: 0.45 });
    say(T, 'scan:' + r.reason, r.message || 'Tarama yapılamadı.', { secs: 3, cooldown: 1.5 });
    return r;
  }

  /* --------------------------------------------------------------------------------------------
   * Jetpack yakıt / kullan
   * ------------------------------------------------------------------------------------------ */
  function refuel() {
    const r = refuelJetpack(G.inventory);
    if (r.ok) {
      G.sound('tech:charge', undefined, { vol: 0.6 });
      if (G.particles && G.particles.chargeBurst) G.particles.chargeBurst({ x: G.body.x, y: G.body.y + 1.0, z: G.body.z }, 0xffb060);
      flushJet(true);
      say(T, 'jet:refuel', 'Jetpack doldu: +' + r.added + ' yakıt.', { secs: 2.5, cooldown: 0.8 });
      T.hudDirty = true;
    } else {
      G.sound('tech:deny', undefined, { vol: 0.45 });
      say(T, 'jet:no:' + r.reason, r.message || 'Yakıt yüklenemedi.', { secs: 3, cooldown: 1.5 });
    }
    return r;
  }

  function useHeld(key) {
    const t = techOf(key);
    if (!t || G.mode !== 'macera') return false;
    if (t.kind === 'scanner') {
      scanNow();
      return true;
    }
    if (t.kind === 'jetpack') {
      refuel();
      return true;
    }
    return false;
  }

  function useSlot(index) {
    const s = G.inventory.slotAt(index);
    if (!s) return undefined;
    const t = techOf(s.item);
    if (!t || G.mode !== 'macera') return undefined;
    if (t.kind === 'jetpack') {
      if (index >= G.inventory.hotbarSize) {
        say(T, 'jet:slot', 'Jetpack çalışması için hızlı çubukta olmalı.', { secs: 3, cooldown: 1.5 });
        return false;
      }
      return !!refuel().ok;
    }
    if (t.kind === 'scanner') {
      if (index >= G.inventory.hotbarSize) return undefined;
      return !!scanNow().ok;
    }
    return undefined;
  }

  function onShield(e) {
    const b = G.body;
    G.sound('tech:shield', undefined, { vol: 0.6 });
    if (G.particles && G.particles.shieldFlash) G.particles.shieldFlash({ x: b.x, y: b.y + 1.1, z: b.z });
    say(T, 'shield', 'Enerji kalkanı ' + (Math.round(e.amount * 10) / 10) + ' hasarı emdi.', { hint: false, cooldown: 2 });
    T.hudDirty = true;
  }

  return {
    stepJetpack, stepScanner, scanNow, refuel, useHeld, useSlot, onShield, flushJet,
  };
}
