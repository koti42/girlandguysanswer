/*
 * KEŞİF mobs sistemi — oyuncu dövüşü (girdi → sim/combat): yakın dövüş, yay, ışın tüfeği, kalkan, portal tabancası, yetenek tuşları.
 *
 *   createCombat(G, c) → sistem nesnesi {name:'mobs.combat', order:-60, fixedUpdate, onAction, ...} + { applyAction(), reset(), state }
 *     c: { sound(name,x,y,z,vol,pitch), shots:{flash,muzzle}, particles }
 *
 * SIRA: bu sistem blok sisteminden ÖNCE çalışır (order −60) ve girdinin kime ait olduğunu belirler:
 *   G.combatClaim = {attack, use}   true → savaş bu karedeki sol/sağ tık girdisini TÜKETTİ; blok sistemi kırma/yerleştirme/kullanmayı
 *                                   bu kare yapmamalı. (attackPressed/placePressed kenar bayrakları da burada silinir.)
 *   G.aimEntity (= G.mobTarget)     nişandaki yaratık (erişim içinde, duvarsız) | null — blok sistemi doluyken kırmaz; hedef adı/HUD okur.
 *   G.player.blocking / G.body.blocking   kalkan kaldırıldı mı.
 * Girdi: sol = saldır/yay germe/ateş/mavi portal; sağ = kalkan (basılı)/yay (basılı)/turuncu portal; ability3 = portal ateşi (yetenek varsa).
 * Yay: basılı tut (sol ya da sağ), bırak → ok (cephane tüketilir). Işın tüfeği: basılı = otomatik ateş. Yaratık nişandayken sol tık blok kırmaz.
 */
import {
  cancelBowCharge, playerMelee, releaseBow, startBowCharge, updateCombat, weaponStats,
} from '../sim/combat.js';
import { createRayHit, raycastBlocks, raycastEntities } from '../sim/raycast.js';
import { pickInteract } from '../sim/props/propInteract.js';
import { ITEMS } from '../sim/items.js';
import { BLOCKS } from '../sim/blocks.js';
import { EXHAUSTION } from '../sim/survival.js';
import {
  PORTAL_HEX, PORTAL_RANGE, ammoInfo, claimFor, fireRayGunSafe, heldKind, nextPortalColor, swingKindFor,
} from './mobsLogic.js';

const PITCH_MAX = Math.PI / 2 - 0.02;
const BUFFER = 0.16;

const targetable = (e) => !e.dead && !e.hidden && !e.removed;

export function createCombat(G, c) {
  const cs = G.combat;
  const s = G.inputState;
  const body = G.body;
  const em = G.em;
  const claim = { attack: false, use: false };
  G.combatClaim = claim;
  G.aimEntity = null;
  G.mobTarget = null;
  const cand = [];
  const eopts = { filter: null, pad: 0.12, out: undefined };
  const entOut = { entity: null, t: 0, point: { x: 0, y: 0, z: 0 }, face: { nx: 0, ny: 0, nz: 0 } };
  eopts.out = entOut;
  const solidHit = createRayHit();
  const solidOpts = { solidOnly: true, out: solidHit };
  const blockHit = createRayHit();
  const blockOpts = { out: blockHit };
  const portalHit = createRayHit();
  const portalOpts = { out: portalHit };
  const eye = { x: 0, y: 0, z: 0 };
  const mz = { x: 0, y: 0, z: 0 };
  const endP = { x: 0, y: 0, z: 0 };
  const nrm = { x: 0, y: 1, z: 0 };
  const act = { name: 'attack', progress: 0, charge: 0 };
  const st = {
    lastHeld: null, buffer: 0, action: '', actionT: 0, actionDur: 0, portal: 'mavi', warnT: 0, portalWarnT: 0, wasBlocking: false,
  };
  let swingTick = 0;

  const reduced = () => !!(G.reducedMotion || G.accessibility);

  function swing(kind) {
    if (G.viewModel && typeof G.viewModel.swing === 'function') G.viewModel.swing(kind);
  }

  function setAction(name, dur) {
    st.action = name;
    st.actionT = dur;
    st.actionDur = dur;
  }

  function warn(text, sound) {
    if (st.warnT > 0) return;
    st.warnT = 1.2;
    if (sound) c.sound(sound, body.x, body.y, body.z, 0.6, 1);
    G.speak(text);
  }

  /** Nişandaki yaratık: erişimde ve araya katı blok girmemiş. → entity | null */
  function pickMob(reach, pad) {
    eye.x = G.eyeSim.x; eye.y = G.eyeSim.y; eye.z = G.eyeSim.z;
    cand.length = 0;
    em.hash.query(eye.x, eye.z, reach + 3, cand, targetable);
    if (cand.length === 0) return null;
    eopts.pad = 0.12 + (pad || 0);
    const eh = raycastEntities(cand, eye, G.look, reach, eopts);
    cand.length = 0;
    if (!eh) return null;
    const bh = raycastBlocks(G.world, eye, G.look, eh.t, solidOpts);
    if (bh && bh.t < eh.t - 0.02) return null;
    return eh.entity;
  }

  function blockInteractive() {
    eye.x = G.eyeSim.x; eye.y = G.eyeSim.y; eye.z = G.eyeSim.z;
    // etkileşimli prop (Boyut Terminali, otomat…): portal tabancası/yay/ışın elde iken sağ tık ateşlenmez, prop kullanılır
    if (G.props && typeof G.props.raycast === 'function' && pickInteract(G.props, eye, G.look, 5, null)) return true;
    const h = raycastBlocks(G.world, eye, G.look, 5, blockOpts);
    if (!h) return false;
    const b = BLOCKS[h.id];
    return !!(b && b.interact);
  }

  function kick() {
    if (reduced()) return;
    const p = G.player;
    p.pitch = Math.min(PITCH_MAX, p.pitch + 0.009);
  }

  /* ---------------------------------------------------------------------------------------------
   * Yakın dövüş
   * ------------------------------------------------------------------------------------------- */
  function doMelee(held, target) {
    const want = s.attackPressed || st.buffer > 0 || (s.breakHeld && cs.atkCd <= 0);
    if (!want) return;
    if (cs.atkCd > 0) {
      if (s.attackPressed && cs.atkCd < BUFFER) st.buffer = BUFFER;
      return;
    }
    st.buffer = 0;
    const res = playerMelee(em, cs, body, G.look, held, {
      inventory: G.inventory, aimAssist: s.aimAssist || 0, mods: G.mode === 'macera' ? G.mods : undefined, // Keskinlik/Alev/Buz/Geri Tepme/Yağmacı/Güç
    });
    if (!res.ok) return;
    const kind = swingKindFor(held);
    swing(kind);
    setAction('attack', 0.34);
    swingTick = G.time.tick;
    if (res.hit === 'entity') {
      mz.x = target.x; mz.y = target.y + target.h * 0.5; mz.z = target.z;
      c.sound('hit', mz.x, mz.y, mz.z, res.crit ? 1 : 0.8, res.crit ? 1.3 : 1 + ((G.time.tick * 7) % 9) / 60);
      if (res.crit) G.particles.hitSpark(mz, null, 0xffd23a, 10);
      if (!G.survival.easy && G.mode === 'macera') G.survival.exhaustion += EXHAUSTION.attack;
      if (res.broke) {
        G.sound('ui_error');
        G.speak('Eşyan kırıldı.');
      }
    } else {
      c.sound('hit', body.x, body.y, body.z, 0.25, 1.6);
    }
  }

  /* ---------------------------------------------------------------------------------------------
   * Yay
   * ------------------------------------------------------------------------------------------- */
  function doBow(held) {
    const down = s.breakHeld || s.placeHeld;
    const want = down && !(s.placeHeld && !s.breakHeld && blockInteractive());
    if (!cs.charging && want && cs.atkCd <= 0) {
      const a = ammoInfo(G.inventory, held);
      if (!a.ok) {
        if (s.attackPressed || s.placePressed) warn('Okun kalmadı.', 'gun_empty');
      } else if (startBowCharge(cs, held)) {
        c.sound('ui_click', body.x, body.y, body.z, 0.35, 0.7);
      }
    }
    if (cs.charging && !want) {
      const r = releaseBow(em, cs, body, G.look, held, G.inventory, G.mode === 'macera' ? G.mods : undefined); // Güç/Sonsuzluk/Alev/Buz
      if (r.fired) {
        swing('release');
        setAction('fire', 0.3);
        if (r.broke) {
          G.sound('ui_error');
          G.speak('Yayın kırıldı.');
        }
      } else if (r.reason === 'cephane yok') {
        warn('Okun kalmadı.', 'gun_empty');
      }
    }
    G.fpState.bowCharge = cs.charging ? cs.charge : 0;
    G.fpState.nocked = cs.charging;
  }

  /* ---------------------------------------------------------------------------------------------
   * Işın tüfeği
   * ------------------------------------------------------------------------------------------- */
  function doGun(held) {
    if (cs.atkCd > 0) return;
    if (!(s.attackPressed || s.placePressed || s.breakHeld || s.placeHeld)) return;
    // yalnızca sağ tıkla ve nişandaki blok etkileşimliyse (sandık, kapı…) ateş etme
    if (!s.breakHeld && !s.attackPressed && blockInteractive()) return;
    const r = fireRayGunSafe(em, cs, body, G.look, held, G.inventory, { blocks: G.mode !== 'harita' });
    if (r.fired) {
      swing('fire');
      setAction('fire', 0.22);
      kick();
      G.haptic('light');
      if (r.broke) {
        G.sound('ui_error');
        G.speak('Işın tüfeğin bozuldu.');
      }
    } else if (r.reason === 'cephane yok') {
      warn('Enerji hücren bitti.', 'gun_empty');
    }
  }

  /* ---------------------------------------------------------------------------------------------
   * Portal tabancası
   * ------------------------------------------------------------------------------------------- */
  function shootPortal(color) {
    if (!G.world) return false;
    // Boyut kipi (Neon Meridyen): ateş portal değil boyut kapısı açar (systems/techPortalGun → dimGate)
    if (G.portalMode === 'boyut' && typeof G.dimPortalFire === 'function' && G.dimPortalFire(color)) return true;
    eye.x = G.eyeSim.x; eye.y = G.eyeSim.y; eye.z = G.eyeSim.z;
    const hit = raycastBlocks(G.world, eye, G.look, PORTAL_RANGE, portalOpts);
    c.shots.muzzle(mz);
    swing('fire');
    setAction('fire', 0.22);
    const hex = PORTAL_HEX[color];
    if (!hit) {
      endP.x = eye.x + G.look.x * PORTAL_RANGE;
      endP.y = eye.y + G.look.y * PORTAL_RANGE;
      endP.z = eye.z + G.look.z * PORTAL_RANGE;
      c.shots.flash(mz.x, mz.y, mz.z, endP.x, endP.y, endP.z, hex, 0.04, 0.2);
      c.sound('gun_empty', body.x, body.y, body.z, 0.4, 1.4);
      return false;
    }
    c.shots.flash(mz.x, mz.y, mz.z, hit.point.x, hit.point.y, hit.point.z, hex, 0.05, 0.24);
    c.sound('portal', hit.point.x, hit.point.y, hit.point.z, 0.5, color === 'mavi' ? 1.25 : 0.95);
    const f = hit.face;
    // bulmaca sistemi 'portalShot' olayını işler ve evt.handled = true yazar (içerik sistemi yoksa doğrudan PuzzleManager'a)
    const evt = {
      type: 'portalShot', x: hit.x, y: hit.y, z: hit.z, face: { nx: f.nx, ny: f.ny, nz: f.nz }, color, handled: false,
    };
    G.emit(evt);
    let handled = evt.handled === true;
    if (!handled && !G.getSystem('content') && G.puzzles && typeof G.puzzles.handleInteract === 'function') {
      handled = !!G.puzzles.handleInteract({
        type: 'portalShot', x: hit.x, y: hit.y, z: hit.z, face: evt.face, color,
      });
    }
    // bulmaca odası portalı değilse: açık dünya portalı (systems/tech; bulmaca odası/mühür/yapı kuralları orada denetlenir)
    let techTried = false;
    if (!handled && G.mode === 'macera' && typeof G.techPortalShoot === 'function') {
      techTried = true;
      handled = G.techPortalShoot(color, hit) === true;
    }
    nrm.x = f.nx; nrm.y = f.ny; nrm.z = f.nz;
    G.particles.beamImpact(hit.point, nrm, hex);
    if (handled) st.portal = nextPortalColor(color, true);
    else if (!techTried && st.portalWarnT <= 0) {
      st.portalWarnT = 3;
      c.sound('puzzle_wrong', hit.point.x, hit.point.y, hit.point.z, 0.4, 1);
      G.speak('Bu yüzeye portal açılamaz. Beyaz panelleri dene.');
    }
    return handled;
  }

  /* ---------------------------------------------------------------------------------------------
   * Ana adım
   * ------------------------------------------------------------------------------------------- */
  function release() {
    if (cs.charging) cancelBowCharge(cs);
    claim.attack = false;
    claim.use = false;
    G.mobTarget = null;
    G.aimEntity = null;
    if (G.player.blocking) {
      G.player.blocking = false;
      body.blocking = false;
    }
    G.fpState.bowCharge = 0;
    G.fpState.nocked = false;
  }

  function fixedUpdate(_G, dt) {
    claim.attack = false;
    claim.use = false;
    if (st.warnT > 0) st.warnT -= dt;
    if (st.portalWarnT > 0) st.portalWarnT -= dt;
    if (st.buffer > 0) st.buffer -= dt;
    if (st.actionT > 0) st.actionT -= dt;
    body.dead = G.player.dead;
    body.yaw = G.player.yaw;
    if (G.time.paused || !G.worldReady || G.player.dead || G.ui !== 'none') {
      release();
      return;
    }
    updateCombat(cs, dt);
    const held = G.inventory ? G.inventory.heldItem() : null;
    if (held !== st.lastHeld) {
      if (cs.charging) cancelBowCharge(cs);
      st.lastHeld = held;
      st.buffer = 0;
    }
    const kind = heldKind(held);

    // kalkan
    const it = held ? ITEMS[held] : null;
    const blocking = kind === 'shield' && !!s.placeHeld;
    if (blocking !== st.wasBlocking) {
      st.wasBlocking = blocking;
      G.player.blocking = blocking;
      body.blocking = blocking;
      if (blocking) c.sound('block', body.x, body.y, body.z, 0.25, 1.5);
    }
    body.shieldReduce = it && it.shield ? it.shield.reduce : 0.6;

    // nişan
    let target = null;
    if (kind === 'melee' || kind === 'none' || kind === 'shield') {
      target = pickMob(weaponStats(held).reach, s.aimAssist || 0);
    } else if (kind === 'bow' || kind === 'gun') {
      target = pickMob(40, 0);
    }
    G.mobTarget = target;
    G.aimEntity = target;

    switch (kind) {
      case 'melee':
      case 'none':
      case 'shield':
        if (target) doMelee(held, target);
        break;
      case 'bow':
        doBow(held);
        break;
      case 'gun':
        doGun(held);
        break;
      case 'portal':
        if (s.attackPressed) shootPortal('mavi');
        else if (s.placePressed && !blockInteractive()) shootPortal('turuncu'); // kol/sandığa sağ tık = kullan
        break;
      default:
        break;
    }
    if (kind !== 'bow') {
      G.fpState.bowCharge = 0;
      G.fpState.nocked = false;
    }

    let bi = false;
    if (kind === 'bow' || kind === 'gun') bi = s.placeHeld && !s.breakHeld ? blockInteractive() : false;
    else if (kind === 'portal') bi = (s.placePressed || s.placeHeld || s.interactPressed) && !s.attackPressed ? blockInteractive() : false;
    const cl = claimFor(kind, !!target, bi, s.placeHeld, blocking);
    claim.attack = cl.attack;
    claim.use = cl.use;
    if (claim.attack) s.attackPressed = false;
    if (claim.use) s.placePressed = false;
  }

  function onAction(_G, a) {
    if (!a || G.player.dead || G.ui !== 'none') return;
    if (a.type === 'ability3' && G.abilities.portalGun && G.world) {
      shootPortal(st.portal);
    }
  }

  /** Kare başı: TP karakter eylemi (saldırı/yay/ateş). */
  function applyAction() {
    if (G.player.dead) return;
    if (cs.charging) {
      act.name = 'bow-draw';
      act.charge = cs.charge;
      act.progress = cs.charge;
      G.charAction = act;
    } else if (st.actionT > 0) {
      act.name = st.action;
      act.progress = 1 - st.actionT / st.actionDur;
      act.charge = 0;
      G.charAction = act;
    } else if (G.charAction === act) {
      G.charAction = null;
    }
  }

  function reset() {
    cancelBowCharge(cs);
    cs.atkCd = 0;
    cs.cells = 0;
    st.buffer = 0;
    st.actionT = 0;
    G.player.blocking = false;
    body.blocking = false;
    st.wasBlocking = false;
  }

  const system = {
    name: 'mobs.combat',
    order: -60,
    fixedUpdate,
    onAction,
  };
  return {
    system, applyAction, reset, state: st, shootPortal, get lastSwingTick() { return swingTick; },
  };
}
