/*
 * KEŞİF tech sistemi — AÇIK DÜNYA PORTAL TABANCASI (oyun katmanı). Saf kurallar: sim/techPortal.js + TechState.
 *
 *   createPortalGun(T) → {
 *     shoot(color, hit) → bool        mobs.combat bulmaca 'portalShot'unu işlemediyse çağrılır (G.techPortalShoot)
 *     step(dt)                        fizikten sonra: kırık portalları kapat, çıkışı önceden yükle, oyuncu/eşya/yaratık geçişi
 *     check(hit) → {ok, reason?, message?}   bulmaca odası / mühür / yapı kuralları (saf okuma)
 *   }
 *
 * BOYUT KİPİ (Neon Meridyen; sözleşme §5): `G.portalMode` 'normal' | 'boyut' (eylem `portalMode`: masaüstü T, dokunmatik düğme). 'boyut' kipinde ateş
 * (sol/sağ tık ya da ability3) mavi/turuncu portal AÇMAZ; bulunulan boyuta göre boyut kapısı açar (systems/dimGate.js: overworld → 'out', şehir → 'back';
 * 12 şarj, ilk kez Kuantum Çekirdeği). mobsCombat.shootPortal en başta G.dimPortalFire(color)'ı çağırır (true = işlendi).
 *     toggleMode() / setMode(m) → bool       mode → 'normal'|'boyut'
 *
 * Kurallar (ek, oyun tasarımı):
 *  - Bulmaca odasında (G.puzzles.ownerAt) portal tabancası YALNIZ bulmacanın kendi mantığıyla çalışır; açık dünya portalı açılmaz.
 *  - Mühür Bariyeri (sistem bloğu) zaten desteklenmez; kilitli bölgeye (world.isZoneUnlocked) portal açılmaz ve oraya geçilmez.
 *  - Boss arenası ve mühür sunağı duvarlarına portal açılmaz (kapı/kilit atlatılmasın).
 *  - Giriş hızı: fizik çarpışmayı çözdükten sonra duvara dönük hız sıfırlandığından, adım ÖNCESİ hız (T.pre) ve yürüme niyeti kullanılır.
 */
import { getMobType } from '../sim/mobTypes.js';
import { PLAYER } from '../sim/physics.js';
import { portalGunFire, portalGunStatus } from '../sim/techMods.js';
import {
  COLORS, portalEntry, portalFrame, travelThrough,
} from '../sim/techPortal.js';
import {
  parkourActive, puzzleOwned, say, structureGatedAt, zoneUnlockedAt,
} from './techCtx.js';
import { ensureAround } from './techUse.js';
import { portalHex } from '../render/cosmetics.js';

const COLOR_NAME = { mavi: 'Mavi', turuncu: 'Turuncu' };
const ENTITY_EVERY = 0.1;
const PRUNE_EVERY = 0.25;

export function createPortalGun(T) {
  const G = T.G;
  // NOT: TechState boyuta özgüdür (G.tech = ctx.tech; tech sistemi onDimension'da T.tech'i yeniler) → her kullanımda T.tech okunur, burada ÖNBELLEĞE ALINMAZ
  const st = {
    pruneT: 0, entT: 0, warmT: 0, hintT: 0, humT: 1,
  };
  const vel = { x: 0, y: 0, z: 0 };
  const body = {
    x: 0, y: 0, z: 0, w: 0.6, h: 1.8,
  };
  const look = { yaw: 0, pitch: 0 };
  const getBlock = (x, y, z) => G.world.getBlock(x, y, z);

  /* --------------------------------------------------------------------------------------------
   * Boyut kipi
   * ------------------------------------------------------------------------------------------ */
  function setMode(m) {
    const next = m === 'boyut' ? 'boyut' : 'normal';
    if (G.mode !== 'macera' || !G.dimMgr) return false;
    if (next === 'boyut' && !G.abilities.portalGun) {
      say(T, 'pg:mode', 'Boyut kipi için önce Portal Tabancası yeteneğini kazanmalısın.', { secs: 3, cooldown: 1 });
      return false;
    }
    G.portalMode = next;
    G.sound('ui_click', undefined, { vol: 0.5 });
    say(T, 'pg:mode', next === 'boyut'
      ? 'Boyut kipi: ateş edince Neon Meridyen kapısı açılır (12 şarj). T: normal kip.'
      : 'Normal kip: mavi ve turuncu portallar. T: boyut kipi.', { secs: 3.2, cooldown: 0.2 });
    T.hudDirty = true;
    return true;
  }

  function toggleMode() {
    return setMode(G.portalMode === 'boyut' ? 'normal' : 'boyut');
  }

  /** mobsCombat.shootPortal'ın çağırdığı kanca: boyut kipinde ateş = kapı açma isteği (başarısızlık nedeni oyuncuya söylenir). */
  G.dimPortalFire = () => {
    if (G.portalMode !== 'boyut' || !G.dimGate) return false;
    G.dimGate.fire();
    return true;
  };

  /** Atış hedefi açık dünya kurallarına uyuyor mu? */
  function check(hit) {
    if (G.mode !== 'macera') return { ok: false, reason: 'mod', message: 'Portal Tabancası yalnızca macera modunda çalışır.' };
    if (parkourActive(G)) {
      return { ok: false, reason: 'parkur', message: 'Parkur sırasında portal tabancası kapalı: yarışma adil kalsın.' };
    }
    if (puzzleOwned(G, hit.x, hit.y, hit.z)) {
      return { ok: false, reason: 'bulmaca', message: 'Bulmaca odalarında portal yalnızca odanın kendi beyaz panellerine açılır.' };
    }
    if (!zoneUnlockedAt(G, hit.x, hit.z)) {
      return { ok: false, reason: 'muhur', message: 'Mühürlü bölgeye portal açılamaz.' };
    }
    if (structureGatedAt(G, hit.x, hit.y, hit.z)) {
      return { ok: false, reason: 'yapi', message: 'Bu yapının duvarlarına portal açılamaz.' };
    }
    return { ok: true };
  }

  function fail(reason, message) {
    G.sound('tech:portal_fail', undefined, { vol: 0.55 });
    say(T, 'pg:' + reason, message, { secs: 3, cooldown: 2.5 });
    return false;
  }

  function shoot(color, hit) {
    if (!hit || !hit.face) return false;
    const c = check(hit);
    if (!c.ok) return fail(c.reason, c.message);
    const inv = G.inventory;
    const gun = portalGunStatus(inv);
    if (!gun.has) return false;
    if (!gun.canFire) return fail('sarj', 'Portal Tabancasının şarjı bitti: Enerji Hücresi gerekli.');
    const before = T.tech.portals;
    const res = T.tech.shootPortal(color, hit, { world: G.world, eye: G.eyeSim, yaw: G.player.yaw });
    if (!res.ok) return fail(res.reason || 'yuzey', res.message || 'Buraya portal açılamaz.');
    // portalın İKİ hücresi ve arka hücreleri de kurala uymalı (komşu bloğa vurup bulmaca odasının/mühürlü bölgenin içine açmak yasak)
    const cells = res.portal.cells.concat(res.portal.back);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const cc = check({ x: c.x, y: c.y, z: c.z });
      if (!cc.ok) {
        T.tech.portals = before;
        return fail(cc.reason, cc.message);
      }
    }
    const fire = portalGunFire(inv);
    if (!fire.ok) {
      // beklenmeyen: bedel ödenemedi → portalı geri al
      T.tech.portals = before;
      return fail('sarj', fire.message || 'Portal şarjı yetmedi.');
    }
    if (fire.reloaded) say(T, 'pg:reload', 'Enerji Hücresi yüklendi: +12 portal şarjı.', { secs: 2.5, cooldown: 1 });
    G.sound(color === 'mavi' ? 'tech:portal_blue' : 'tech:portal_orange', G.body, { vol: 0.7 });
    const p = res.portal;
    const fr = portalFrame(p);
    if (G.particles && G.particles.portalPuff) G.particles.portalPuff({ x: fr.center[0] + fr.n[0] * 0.3, y: fr.center[1] + fr.n[1] * 0.3 + 0.5, z: fr.center[2] + fr.n[2] * 0.3 }, portalHex(G, color));
    G.emit(res.event);
    G.speak(COLOR_NAME[color] + ' portal açıldı' + (T.tech.portals.mavi && T.tech.portals.turuncu ? '. Portalların ikisi de hazır.' : '.'));
    G.haptic('light');
    T.hudDirty = true;
    return true;
  }

  /* --------------------------------------------------------------------------------------------
   * Geçiş
   * ------------------------------------------------------------------------------------------ */
  function entryVelocity() {
    const b = G.body;
    const pre = T.pre;
    vel.x = pre.vx; vel.y = pre.vy; vel.z = pre.vz;
    const s = G.inputState;
    const mx = s.moveX || 0;
    const mz = s.moveZ || 0;
    const m = Math.hypot(mx, mz);
    if (m > 0.3) {
      const yaw = G.player.yaw;
      const wx = Math.cos(yaw) * mx - Math.sin(yaw) * mz;
      const wz = -Math.sin(yaw) * mx - Math.cos(yaw) * mz;
      const sp = (s.sprint ? PLAYER.sprint : b.crouching ? PLAYER.crouch : PLAYER.walk) * Math.min(1, m);
      if (Math.hypot(vel.x, vel.z) < sp * 0.7) {
        vel.x = wx / m * sp;
        vel.z = wz / m * sp;
      }
    }
    return vel;
  }

  function nearPortal(maxD) {
    const b = G.body;
    for (let i = 0; i < 2; i++) {
      const p = T.tech.portals[COLORS[i]];
      if (!p) continue;
      const dx = p.x + 0.5 - b.x;
      const dy = p.y + 0.5 - (b.y + 0.9);
      const dz = p.z + 0.5 - b.z;
      if (dx * dx + dy * dy + dz * dz <= maxD * maxD) return COLORS[i];
    }
    return null;
  }

  function applyTravel(res, from) {
    const b = G.body;
    const fa = T.tech.portalFrames()[from];
    const ta = T.tech.portalFrames()[res.to];
    if (!zoneUnlockedAt(G, res.x, res.z)) {
      say(T, 'pg:zone', 'Portalın öbür ucu mühürlü bir bölgede: geçemezsin.', { secs: 3, cooldown: 3 });
      return false;
    }
    if (fa && G.particles && G.particles.portalPuff) {
      G.particles.portalPuff({ x: fa.center[0] + fa.n[0] * 0.3, y: fa.center[1] + fa.n[1] * 0.3, z: fa.center[2] + fa.n[2] * 0.3 }, portalHex(G, from));
    }
    G.sound('tech:portal_enter', G.body, { vol: 0.8 });
    T.lift = null; // asansör animasyonu sürerken portala girilirse eski x/z'ye geri çekmesin
    G.teleport(res.x, res.y, res.z, {
      safe: false, yaw: res.yaw, pitch: res.pitch,
    });
    b.vx = res.vx; b.vy = res.vy; b.vz = res.vz;
    b.onGround = false;
    b.coyote = 0;
    b.fallPeakY = res.y;
    if (ta && G.particles && G.particles.portalPuff) {
      G.particles.portalPuff({ x: ta.center[0] + ta.n[0] * 0.4, y: ta.center[1] + ta.n[1] * 0.4, z: ta.center[2] + ta.n[2] * 0.4 }, portalHex(G, res.to));
    }
    G.sound('tech:portal_exit', G.body, { vol: 0.8 });
    G.haptic('medium');
    G.emit(res.event);
    return true;
  }

  function travelPlayer() {
    const b = G.body;
    if (G.player.dead || G.ui !== 'none') return;
    body.x = b.x; body.y = b.y; body.z = b.z; body.w = b.w; body.h = b.h;
    look.yaw = G.player.yaw;
    look.pitch = G.player.pitch;
    const res = T.tech.travelPortal(body, entryVelocity(), look, G.world);
    if (!res) return;
    if (!res.ok) {
      if (res.reason === 'engelli') say(T, 'pg:blocked', 'Portalın çıkışı kapalı: öbür tarafta yer yok.', { secs: 3, cooldown: 4 });
      return;
    }
    applyTravel(res, res.from);
  }

  function travelEntities(now) {
    const em = G.em;
    if (!em || !em.items || typeof em.items.forEach !== 'function' || typeof em.queryMobs !== 'function') return;
    const frames = T.tech.portalFrames();
    for (let ci = 0; ci < 2; ci++) {
      const color = COLORS[ci];
      const p = T.tech.portals[color];
      const f = frames[color];
      if (!p || !f) continue;
      const c = f.center;
      const pass = (e, w, h, isItem) => {
        if (e.dead || e.removed || (e._pcd || 0) > now || (isItem && (e._pn || 0) >= 4)) return; // eşya en çok 4 kez geçer (sonsuz döngü yok)
        if (Math.abs(e.x - c[0]) > 2.2 || Math.abs(e.z - c[2]) > 2.2 || Math.abs(e.y - c[1]) > 2.6) return;
        body.x = e.x; body.y = e.y; body.z = e.z; body.w = w; body.h = h;
        vel.x = e.vx || 0; vel.y = e.vy || 0; vel.z = e.vz || 0;
        if (!portalEntry(p, body, vel)) return;
        const r = travelThrough(T.tech.portals, color, {
          x: e.x, y: e.y, z: e.z, w, h, vx: vel.x, vy: vel.y, vz: vel.z, yaw: e.yaw || 0, pitch: 0,
        }, getBlock);
        if (!r.ok || !zoneUnlockedAt(G, r.x, r.z)) {
          e._pcd = now + 1.5;
          return;
        }
        e.x = r.x; e.y = r.y; e.z = r.z;
        e.vx = r.vx; e.vy = r.vy; e.vz = r.vz;
        if (!isItem) e.yaw = r.yaw;
        e._pcd = now + (isItem ? 1.4 : 3);
        e._pn = (e._pn || 0) + 1;
        if (G.particles && G.particles.portalPuff) G.particles.portalPuff({ x: r.x, y: r.y + 0.3, z: r.z }, portalHex(G, r.to));
        G.sound('tech:portal_exit', { x: r.x, y: r.y, z: r.z }, { vol: 0.5 });
      };
      em.items.forEach((e) => pass(e, 0.3, 0.3, true));
      const mobs = em.queryMobs(c[0], c[2], 3);
      for (let i = 0; i < mobs.length; i++) {
        const e = mobs[i];
        const mt = getMobType(e.type);
        if (mt && mt.boss) continue;
        pass(e, e.w || 0.6, e.h || 1.6, false);
      }
    }
  }

  function step(dt) {
    if (G.mode !== 'macera') return;
    const mavi = T.tech.portals.mavi;
    const turuncu = T.tech.portals.turuncu;
    if (!mavi && !turuncu) return;
    st.pruneT -= dt;
    if (st.pruneT <= 0) {
      st.pruneT = PRUNE_EVERY;
      const closed = T.tech.pruneBrokenPortals(G.world);
      for (let i = 0; i < closed.length; i++) {
        G.emit({ type: 'portalClosed', color: closed[i] });
        G.sound('tech:portal_fail', G.body, { vol: 0.5 });
        say(T, 'pg:closed', COLOR_NAME[closed[i]] + ' portal kapandı: arkasındaki blok kırıldı.', { secs: 3, cooldown: 1 });
        T.hudDirty = true;
      }
    }
    // açık portalların uğultusu (yakındakiler; ≈ 2,4 sn'de bir, çok sessiz)
    st.humT -= dt;
    if (st.humT <= 0) {
      st.humT = 2.4;
      const hn = nearPortal(14);
      if (hn) {
        const hp = T.tech.portals[hn];
        G.sound('tech:portal_hum', { x: hp.x + 0.5, y: hp.y + 0.8, z: hp.z + 0.5 }, { vol: 0.35, pitch: hn === 'mavi' ? 1.05 : 0.92 });
      }
    }
    if (!(T.tech.portals.mavi && T.tech.portals.turuncu)) return;
    if (parkourActive(G)) return; // parkurda portallar geçit vermez (atlama/rekor adaleti)
    // yaklaşırken öbür ucun çevresini yükle (yüklenmemiş çıkış 'engelli' sayılır)
    st.warmT -= dt;
    if (st.warmT <= 0) {
      st.warmT = 0.5;
      const near = nearPortal(6);
      if (near) {
        const o = T.tech.portals[near === 'mavi' ? 'turuncu' : 'mavi'];
        ensureAround(G, o.x, o.y, o.z);
      }
    }
    travelPlayer();
    st.entT -= dt;
    if (st.entT <= 0) {
      st.entT = ENTITY_EVERY;
      travelEntities(G.time.seconds);
    }
  }

  return {
    shoot, step, check, state: st, setMode, toggleMode,
  };
}
