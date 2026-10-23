/*
 * KEŞİF büyü sistemi — asa ile büyü yapma: sim'in ürettiği etkileri (mermi, şifa, sıçrayış, fx) oyunda yürütür.
 *
 *   createCaster(G, hooks) → { cast(opts) → {ok, reason?, spell?}, blinkTarget(dir, dist) → {x,y,z}|null, spellKindOfHeld() }
 *     hooks: { hint(text, secs), dirty() }   (arayüz ipucu / HUD'u hemen yenile)
 *
 * cast(): castHeldSpell(state, inv, {eye, look, mods, dead}) → effects[] sırayla yürütülür:
 *   projectile → G.em.fireProjectile(...spellProjectileOpts)   hasar combat'a 'magic' kaynağıyla düşer; yanma/yavaşlama sim'de uygulanır
 *   heal       → survival.heal + şifa halkası
 *   blink      → güvenli iniş (altı dolu, lav/boşluk değil) bulunana dek kısaltılır; G.teleport (düşme sıfırlanır)
 *   fx         → asa ucunda renkli parıltı + ses
 * Çalışma kuralı: yalnız macera modunda (insa/harita'da asa devre dışı; büyü mermisi blok kırmaz, yalnız yaratığa zarar verir).
 */
import {
  castHeldSpell, resolveBlink, spellDef, spellForStaff, spellProjectileOpts,
} from '../sim/magic.js';
import { heal } from '../sim/survival.js';
import { isBoxFree } from '../sim/physics.js';
import { B, getBlock } from '../sim/blocks.js';

const SOUND = {
  ates_topu: ['spell:fire:cast', 1],
  buz_mizragi: ['spell:ice:cast', 1],
  sifa_isigi: ['spell:heal:cast', 0.9],
  kuantum_sicrayisi: ['spell:blink:cast', 1],
};

const eyeP = { x: 0, y: 0, z: 0 };
const fxP = { x: 0, y: 0, z: 0 };
const ctx = { eye: eyeP, look: null, mods: null, dead: false };
const flat = { x: 0, y: 0, z: 0 };
const bodyHit = new Float64Array(6);

export function createCaster(G, hooks) {
  const h = hooks || {};
  const hint = (t, s) => { if (h.hint) h.hint(t, s); };
  const world = () => G.world;

  /** Gövde (0,6×1,8) bu noktada boş mu (yüklü olmayan chunk dolu sayılır). */
  function bodyFree(x, y, z) {
    const w = world();
    if (!isBoxFree(w, x - 0.3, y + 0.001, z - 0.3, x + 0.3, y + 1.8, z + 0.3)) return false;
    // sahne propları (kapalı kapı, mobilya): sıçrayış kapıdan/mobilyadan geçmesin — kilitli odaya ışınlanıp kilidi atlamak engellenir (qa_p2)
    const cl = G.colliders || w.colliders;
    if (cl && typeof cl.queryRaw === 'function' && cl.queryRaw(x - 0.3, y + 0.001, z - 0.3, x + 0.3, y + 1.8, z + 0.3, bodyHit, 1) > 0) return false;
    return true;
  }

  /** Ayak noktasının altında 6 blok içinde güvenli zemin var mı (lav/boşluk/ateş değil). */
  function safeGround(x, y, z) {
    const w = world();
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const top = Math.floor(y + 0.001);
    for (let dy = 0; dy <= 6; dy++) {
      const id = w.getBlock(bx, top - dy, bz);
      if (id === null || id === undefined) return false;
      if (id === 0) continue;
      const rec = getBlock(id);
      if (!rec) return false;
      if (id === B.LAVA || id === B.LAVA_FLOW) return false;
      if (rec.liquid) return true; // su: yüzülebilir
      return !!rec.solid;
    }
    return false; // altı boşluk
  }

  /** Bakış yönünde en uzak güvenli iniş noktası; yoksa null. */
  function blinkTarget(dir, dist) {
    const b = G.body;
    const from = { x: b.x, y: b.y, z: b.z };
    // aşağı bakış yatay sıçrayış sayılır (ayaktan zemine doğru gitmek anında engele çarpar); yukarı bakış yükselir
    flat.x = dir.x; flat.y = dir.y > 0 ? dir.y : 0; flat.z = dir.z;
    if (flat.x * flat.x + flat.y * flat.y + flat.z * flat.z < 1e-6) return null;
    let cand = resolveBlink(from, flat, dist, bodyFree);
    let guard = 0;
    while (cand && !safeGround(cand.x, cand.y, cand.z) && guard++ < 40) {
      cand = cand.distance > 0.75 ? resolveBlink(from, flat, cand.distance - 0.5, bodyFree) : null;
    }
    return cand && cand.distance >= 2 ? cand : null; // 2 bloktan kısa sıçrayış anlamsız: önü kapalıysa büyü yapılmaz
  }

  function spellKindOfHeld() {
    const held = G.inventory ? G.inventory.held() : null;
    const key = held ? spellForStaff(held.item) : null;
    const def = key ? spellDef(key) : null;
    return def ? def.kind : null;
  }

  function muzzle() {
    if (G.player.cameraMode === 'fp' && G.camera) {
      fxP.x = G.camera.position.x + G.look.x * 0.6;
      fxP.y = G.camera.position.y - 0.12 + G.look.y * 0.6;
      fxP.z = G.camera.position.z + G.look.z * 0.6;
    } else {
      fxP.x = G.body.x + G.look.x * 0.5;
      fxP.y = G.body.y + 1.3;
      fxP.z = G.body.z + G.look.z * 0.5;
    }
    return fxP;
  }

  function runEffect(e, res) {
    switch (e.kind) {
      case 'projectile':
        if (G.em && typeof G.em.fireProjectile === 'function') {
          // mermi asanın ucundan çıkar (birinci şahısta sağ-yukarı, üçüncü şahısta elin hizası); yön bakış yönüdür
          const fp = G.player.cameraMode === 'fp';
          const rx = -G.look.z;
          const rz = G.look.x;
          const rl = Math.sqrt(rx * rx + rz * rz) || 1;
          const side = fp ? 0.22 : 0.3;
          G.em.fireProjectile(
            e.projectile, e.x + (rx / rl) * side, e.y + (fp ? 0.0 : -0.1), e.z + (rz / rl) * side,
            e.dx, e.dy, e.dz, e.speed, 'player', spellProjectileOpts(e),
          );
        }
        break;
      case 'heal':
        heal(G.survival, e.amount);
        if (G.particles && G.particles.healRing) {
          fxP.x = G.body.x; fxP.y = G.body.y; fxP.z = G.body.z;
          G.particles.healRing(fxP, e.color);
        }
        break;
      case 'blink': {
        const t = blinkTarget({ x: e.dx, y: e.dy, z: e.dz }, e.distance);
        if (!t) {
          res.blinkFailed = true;
          break;
        }
        if (G.particles && G.particles.blinkBurst) {
          fxP.x = G.body.x; fxP.y = G.body.y; fxP.z = G.body.z;
          G.particles.blinkBurst(fxP, e.color);
        }
        G.teleport(t.x, t.y, t.z, { safe: false });
        if (G.particles && G.particles.blinkBurst) {
          fxP.x = t.x; fxP.y = t.y; fxP.z = t.z;
          G.particles.blinkBurst(fxP, e.color);
        }
        G.sound('spell:blink:impact', G.body, { vol: 0.9 });
        break;
      }
      case 'fx': {
        const s = SOUND[e.spell];
        if (s) G.sound(s[0], G.body, { vol: s[1] });
        if (e.spell !== 'sifa_isigi' && e.spell !== 'kuantum_sicrayisi' && G.particles && G.particles.spellCast) {
          G.particles.spellCast(muzzle(), e.color);
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * opts.fresh: oyuncu bu karede bastı (başarısızlıkta ipucu/ses); false = basılı tutma tekrarı (sessiz).
   * Döner: {ok, reason?, spell?, broke?}.
   */
  function cast(opts) {
    const o = opts || {};
    const inv = G.inventory;
    if (!inv || G.mode !== 'macera' || G.player.dead) return { ok: false, reason: 'mod' };
    const kind = spellKindOfHeld();
    if (kind === 'heal' && G.survival.hp >= G.survival.maxHp) {
      if (o.fresh) {
        hint('Canın zaten dolu.', 1.8);
        G.sound('ui_error', undefined, { vol: 0.4 });
      }
      return { ok: false, reason: 'can_dolu' };
    }
    if (kind === 'blink') {
      // güvenli iniş yoksa büyü yapılmaz: mana, bekleme ve asa dayanıklılığı harcanmaz
      const held = inv.held();
      const def = held ? spellDef(spellForStaff(held.item)) : null;
      if (def && !blinkTarget(G.look, def.distance)) {
        if (o.fresh) {
          hint('Önünde güvenli bir iniş yeri yok.', 2);
          G.sound('ui_error', undefined, { vol: 0.4 });
        }
        return { ok: false, reason: 'iniş_yok' };
      }
    }
    eyeP.x = G.eyeSim.x; eyeP.y = G.eyeSim.y; eyeP.z = G.eyeSim.z;
    ctx.look = G.look;
    ctx.mods = G.mods;
    ctx.dead = G.player.dead;
    const res = castHeldSpell(G.magic.state, inv, ctx);
    if (!res.ok) {
      if (o.fresh && res.reason !== 'bekleme') {
        if (res.reason === 'mana') G.sound('mana_low', undefined, { vol: 0.7 });
        else G.sound('ui_error', undefined, { vol: 0.4 });
        hint(res.message || 'Büyü yapılamadı.', 1.8);
      }
      return { ok: false, reason: res.reason };
    }
    for (let i = 0; i < res.effects.length; i++) runEffect(res.effects[i], res);
    if (res.blinkFailed) {
      // sıçrayış hedefi bulunamadı: mana ve bekleme yine de harcandı; oyuncuya nedenini söyle
      hint('Önünde güvenli bir iniş yeri yok.', 2);
    }
    if (G.viewModel && typeof G.viewModel.swing === 'function') G.viewModel.swing('fire');
    G.haptic('light');
    if (res.event) G.emit(res.event);
    if (res.broke) {
      G.sound('break:metal', undefined, { vol: 0.7 });
      G.haptic('medium');
      G.speak('Asan kırıldı.');
      hint('Asan kırıldı.', 3);
    }
    if (h.dirty) h.dirty();
    return { ok: true, spell: res.spell, broke: res.broke };
  }

  return {
    cast, blinkTarget, spellKindOfHeld, bodyFree, safeGround,
  };
}
