/*
 * KEŞİF — "magic" sistemi (order 25): Büyü Masası (büyüleme), Simya Kazanı (iksir), asalar (büyü), mana, durum etkileri.
 * gameSystems.js bu dosyayı otomatik yükler (createSystem). Saf sim: sim/magic*.js (KESIF_MAGIC.md); burası oyun katmanı.
 *
 *   fixedUpdate : mods (büyü + etki → tek sayı kümesi; fizik/survival/combat/blocks G.mods'u okur) → mana/bekleme/etki ilerlet →
 *                 kazanlar → yanma/yavaşlama → iksir içme → asa basılı tutma tekrarı → panel yakınlık denetimi
 *   frameUpdate : HUD (hud.mana / hud.effects / hud.spell, ≈12 Hz), parıltı zamanı, Gece Görüşü yumuşatma, kazan/masa yayıcıları
 *   onEvent     : blockUse (masa/kazan paneli), uiChanged, died/respawn, effectAdded/Ended (seslendirme), inventoryChanged (tarif keşfi)
 *   api()       : getEnchantInfo enchant rerollEnchant getBrewInfo startBrew collectBrew castSpell getSpellList useManaCrystal
 *                 drinkPotion getMagicInfo getMagicUi  (magicApi.js)
 *   serialize   : {v, m:{state,brew}, seen:[…], brewed:[…]}  (oturum kaydı systems.magic)
 *
 * G'ye eklenenler: G.magic {state, brew}, G.mods, G.magicUi {kind, pos, cauldronPos, shelfCount}, G.nightVisionK,
 *   G.magicUse(itemKey) (blocksUse.applyHeldItem sağ tık yönlendirmesi), G.magicUseSlot(slotIndex) (envanter "Kullan").
 * Mod kuralı: yalnız macera modunda etkin (insa/harita: mods kimlik, panel/asa/iksir kapalı, mana gizli).
 */
import {
  computeMods, createMagic, createMods, magicHud, magicUseKind, potionOf, resetMods,
  restoreMagicAll, serializeMagicAll, tickMagic, tickMobStatuses, countShelves, clearEffects, BREW_RECIPES,
  drinkPotion,
} from '../sim/magic.js';
import { MAGIC_BLOCK_IDS } from '../sim/magicData.js';
import { itemByKey } from '../sim/items.js';
import { setGlintTime } from '../render/enchantGlint.js';
import { createCaster } from './magicCast.js';
import { createMagicWorld } from './magicWorld.js';
import { createMagicApi } from './magicApi.js';

const HUD_EVERY = 0.08;
const DRINK_TIME = 1.0;
const PANEL_REACH = 7.5;
const SEEN_MAX = 160;

const API_NAMES = [
  'getEnchantInfo', 'enchant', 'rerollEnchant', 'getBrewInfo', 'startBrew', 'collectBrew', 'castSpell', 'getSpellList',
  'useManaCrystal', 'drinkPotion', 'getMagicInfo', 'getMagicUi',
];

const BREW_INGREDIENTS = (() => {
  const set = new Set();
  BREW_RECIPES.forEach((r) => r.in.forEach((p) => set.add(p.item)));
  return Array.from(set);
})();

export function createSystem(G) {
  const M = {
    caster: null,
    mw: null,
    drink: {
      active: false, t: 0, slot: -1, item: null, needRelease: false, bubT: 0,
    },
    seen: new Set(),
    brewed: new Set(),
    knownRecipes: new Set(),
    hudT: 0,
    hudDirty: true,
    panelT: 0,
    nv: 0,
    heldSpellKey: null,
    silent: false,
  };

  const reduced = () => !!(G.reducedMotion || G.accessibility);
  const macera = () => G.mode === 'macera';

  function hint(text, secs) {
    if (typeof G.hint === 'function') G.hint(text, { ttl: Math.round((secs || 2) * 1000), priority: 3, key: 'magic:' + text, cooldown: 1200 });
    else if (G.hud) G.hud.hint = text;
  }

  /* ------------------------------------------------------------------------------------------
   * Tarif keşfi: malzemelerin hepsi bir kez görüldüyse tarif defterine yazılır
   * ---------------------------------------------------------------------------------------- */
  function scanSeen(announce) {
    const inv = G.inventory;
    if (!inv) return;
    for (let i = 0; i < BREW_INGREDIENTS.length; i++) {
      const k = BREW_INGREDIENTS[i];
      if (!M.seen.has(k) && inv.count(k) > 0 && M.seen.size < SEEN_MAX) M.seen.add(k);
    }
    BREW_RECIPES.forEach((r) => {
      if (M.knownRecipes.has(r.id)) return;
      if (M.brewed.has(r.id) || r.in.every((p) => M.seen.has(p.item))) {
        M.knownRecipes.add(r.id);
        if (announce && macera()) {
          const text = 'Yeni simya tarifi: ' + r.name + '.';
          hint(text, 4);
          G.speak(text);
          G.sound('quest', undefined, { vol: 0.4 });
        }
      }
    });
  }

  M.recipeKnown = (id) => M.knownRecipes.has(id);
  M.scanSeen = scanSeen;

  /* ------------------------------------------------------------------------------------------
   * Panel açma
   * ---------------------------------------------------------------------------------------- */
  function shelfCountAt(pos) {
    return countShelves((x, y, z) => G.world.getBlock(x, y, z), pos.x, pos.y, pos.z);
  }

  function openPanel(kind, x, y, z) {
    if (!macera()) {
      hint('Büyü ve simya yalnızca macera modunda kullanılır.', 2.5);
      G.sound('ui_error', undefined, { vol: 0.4 });
      return true;
    }
    const pos = { x, y, z };
    G.magicUi.kind = kind;
    G.magicUi.pos = pos;
    G.magicUi.cauldronPos = kind === 'brew' ? pos : null;
    G.magicUi.shelfCount = kind === 'enchant' ? shelfCountAt(pos) : 0;
    scanSeen(false);
    if (G.viewModel && typeof G.viewModel.swing === 'function') G.viewModel.swing('use');
    G.sound(kind === 'enchant' ? 'ui_open' : 'bubble', undefined, { vol: 0.6 });
    G.setUi(kind);
    return true;
  }

  function closePanelState() {
    G.magicUi.kind = null;
    G.magicUi.pos = null;
    G.magicUi.cauldronPos = null;
    G.magicUi.shelfCount = 0;
  }

  /* ------------------------------------------------------------------------------------------
   * İksir içme (basılı tutma ya da dokunma; eşya değişimi/hasar/arayüz iptal eder)
   * ---------------------------------------------------------------------------------------- */
  function cancelDrink() {
    const d = M.drink;
    if (!d.active) return;
    d.active = false;
    d.t = 0;
    if (G.fpState.eating !== -1) G.fpState.eating = -1;
  }

  function refuseDrink(p) {
    const sv = G.survival;
    const st = G.magic.state;
    if (p.heal && !p.effect && sv.hp >= sv.maxHp) return 'Canın zaten dolu.';
    if (p.mana && !p.effect && st.mana >= st.maxMana) return 'Manan zaten dolu.';
    return null;
  }

  function startDrink(itemKey) {
    const d = M.drink;
    if (d.active) return true;
    if (d.needRelease) return true;
    const p = potionOf(itemKey);
    if (!p || G.player.dead) return true;
    const why = refuseDrink(p);
    if (why) {
      hint(why, 1.8);
      G.sound('ui_error', undefined, { vol: 0.4 });
      d.needRelease = true;
      return true;
    }
    d.active = true;
    d.t = 0;
    d.bubT = 0.2;
    d.slot = G.inventory.selected;
    d.item = itemKey;
    G.fpState.eating = 0;
    return true;
  }

  function finishDrink(slotIndex) {
    const r = drinkPotion(G.magic.state, G.inventory, 's' + slotIndex, { survival: G.survival });
    if (!r.ok) {
      if (r.message) hint(r.message, 1.8);
      G.sound('ui_error', undefined, { vol: 0.4 });
      return false;
    }
    emitAll(r.events);
    G.sound('potion_drink', G.body, { vol: 0.8 });
    G.haptic('light');
    if (G.particles) {
      const it = itemByKey(M.drink.item);
      const c = it && typeof it.color === 'number' ? it.color : 0xb08cff;
      const b = G.body;
      G.particles.magicBurst({ x: b.x, y: b.y + 1.0, z: b.z }, c, { radius: 0.9, scale: 0.7 });
    }
    M.hudDirty = true;
    return true;
  }

  function updateDrink(dt) {
    const d = M.drink;
    const s = G.inputState;
    if (d.needRelease && !s.placeHeld) d.needRelease = false;
    if (!d.active) return;
    const inv = G.inventory;
    const hold = !!s.placeHeld || !!s.touch || G.accessibility;
    const keep = inv.selected === d.slot && inv.heldItem() === d.item && !G.player.dead && G.ui === 'none';
    if (!keep || !hold) {
      cancelDrink();
      return;
    }
    d.t += dt;
    d.bubT -= dt;
    if (d.bubT <= 0) {
      d.bubT = 0.28;
      G.sound('bubble', G.body, { vol: 0.3, pitch: 1.05 });
    }
    if (d.t < DRINK_TIME) {
      G.fpState.eating = Math.min(0.999, d.t / DRINK_TIME);
      return;
    }
    const slot = d.slot;
    d.active = false;
    d.t = 0;
    d.needRelease = true;
    G.fpState.eating = -1;
    if (finishDrink(slot) && G.viewModel && G.viewModel.swing) G.viewModel.swing('use');
  }

  /* ------------------------------------------------------------------------------------------
   * Kullan (sağ tık / dokun-yerleştir) yönlendirmesi
   * ---------------------------------------------------------------------------------------- */
  function useHeld(itemKey) {
    const kind = magicUseKind(itemKey);
    if (!kind) return false;
    if (!macera()) {
      hint('Büyü eşyaları yalnızca macera modunda çalışır.', 2.2);
      G.sound('ui_error', undefined, { vol: 0.4 });
      return true;
    }
    if (kind === 'asa') {
      M.caster.cast({ fresh: true });
      return true;
    }
    if (kind === 'iksir') return startDrink(itemKey);
    if (kind === 'mana_kristali') {
      M.api.useManaCrystal();
      return true;
    }
    return false;
  }

  /** Envanter "Kullan": iksir anında içilir, mana kristali kullanılır; asa/diğerleri için undefined (eline alma). */
  function useSlot(index) {
    const slot = G.inventory.slotAt(index);
    if (!slot) return undefined;
    const kind = magicUseKind(slot.item);
    if (!kind || kind === 'asa') return undefined;
    if (!macera()) {
      hint('Büyü eşyaları yalnızca macera modunda çalışır.', 2.2);
      return false;
    }
    if (kind === 'iksir') {
      const why = refuseDrink(potionOf(slot.item) || {});
      if (why) {
        hint(why, 1.8);
        G.sound('ui_error', undefined, { vol: 0.4 });
        return false;
      }
      M.drink.item = slot.item;
      return finishDrink(index);
    }
    return !!M.api.useManaCrystal().ok;
  }

  function emitAll(list) {
    if (!list) return;
    for (let i = 0; i < list.length; i++) G.emit(list[i]);
  }

  /* ------------------------------------------------------------------------------------------
   * HUD
   * ---------------------------------------------------------------------------------------- */
  function writeHud() {
    const hud = G.hud;
    if (!macera()) {
      if (hud.mana.max !== 0) hud.mana = { value: 0, max: 0 };
      if (hud.effects.length) hud.effects = [];
      if (hud.spell) hud.spell = null;
      return;
    }
    const held = G.inventory ? G.inventory.heldItem() : null;
    const m = magicHud(G.magic.state, held);
    hud.mana = m.mana;
    hud.effects = m.effects;
    hud.spell = m.spell;
  }

  /* ------------------------------------------------------------------------------------------
   * Sistem
   * ---------------------------------------------------------------------------------------- */
  /** Masa/kazan kaydı bir blok değişimiyle silinince: kazandaki malzeme geri bırakılır, açık panel kapanır. */
  function onWorldMagicRemoved(e) {
    if (e.cauldron) {
      const back = G.magic.brew.removeAt({ x: e.x, y: e.y, z: e.z });
      for (let i = 0; i < back.length; i++) {
        if (G.em && typeof G.em.spawnItem === 'function') {
          G.em.spawnItem(back[i].item, back[i].count, e.x + 0.5, e.y + 0.6, e.z + 0.5, { vx: 0, vy: 2.6, vz: 0, delay: 0.4 });
        }
      }
    }
    if (G.magicUi.kind && G.magicUi.pos && G.magicUi.pos.x === e.x && G.magicUi.pos.y === e.y && G.magicUi.pos.z === e.z) G.setUi(null);
  }

  const sys = {
    name: 'magic',
    order: 25,

    /** Boyut değişti: büyü masası/kazan kayıtları (dünyanın bloklarından türer) ve aboneliği yeni dünya için kurulur. */
    onDimension() {
      if (!M.mw) return;
      M.mw.dispose();
      M.mw = createMagicWorld(G);
      M.mw.scan();
      M.mw.attach(onWorldMagicRemoved);
      G.magicUi.kind = null;
      G.magicUi.pos = null;
      G.magicUi.cauldronPos = null;
      M.hudDirty = true;
    },

    init() {
      G.magic = createMagic(G.seed);
      G.mods = createMods();
      G.magicUi = {
        kind: null, pos: null, cauldronPos: null, shelfCount: 0,
      };
      G.nightVisionK = 0;
      M.caster = createCaster(G, { hint, dirty: () => { M.hudDirty = true; } });
      M.mw = createMagicWorld(G);
      M.mw.scan();
      M.mw.attach(onWorldMagicRemoved);
      M.api = createMagicApi(G, M, { hint, emitAll, shelfCountAt });
      G.magicUse = useHeld;
      G.magicUseSlot = useSlot;
      scanSeen(false);
    },

    fixedUpdate(_G, dt) {
      const st = G.magic.state;
      if (macera()) computeMods(G.inventory, st.effects, G.mods);
      else resetMods(G.mods);
      if (G.em) G.em.luck = G.mods.luck; // Yağmacı: ok/büyü ile öldürmede de ganimet şansı (yakın dövüş src.luck'u zaten taşır)
      if (!macera()) return;
      const ended = tickMagic(st, dt, G.mods);
      if (ended.length) {
        for (let i = 0; i < ended.length; i++) G.emit(ended[i]);
        M.hudDirty = true;
      }
      const brewed = G.magic.brew.tick(dt);
      if (brewed.length) {
        for (let i = 0; i < brewed.length; i++) {
          const e = brewed[i];
          G.emit(e);
          const near = G.body.x - e.x - 0.5;
          if (near * near + (G.body.z - e.z - 0.5) * (G.body.z - e.z - 0.5) < 40 * 40) {
            G.sound('brew_done', { x: e.x + 0.5, y: e.y + 0.5, z: e.z + 0.5 }, { vol: 0.9 });
            if (G.particles) G.particles.pickup({ x: e.x + 0.5, y: e.y + 1.1, z: e.z + 0.5 }, 0x9dffb0);
          }
        }
      }
      tickMobStatuses(G.em, dt);
      updateDrink(dt);
      M.mw.tick(dt, G.magic.brew.list());
      // asa basılı tutma: bekleme dolunca tekrar eder (ilk basış applyHeldItem → useHeld ile zaten yapıldı)
      const s = G.inputState;
      if (s.placeHeld && !s.placePressed && G.ui === 'none' && !G.player.dead && M.caster.spellKindOfHeld()) {
        const plc = G.blocks && G.blocks.state ? G.blocks.state.plc : null;
        const claimed = !!(G.combatClaim && G.combatClaim.use);
        if (!claimed && !(plc && plc.holdBlocked)) M.caster.cast({ fresh: false });
      }
      // panel: oyuncu uzaklaşırsa/masa kaybolursa kapanır; kitaplık değişince kademe yeniden sayılır
      M.panelT -= dt;
      if (M.panelT <= 0) {
        M.panelT = 0.4;
        const ui = G.magicUi;
        if (ui.kind && ui.pos) {
          const b = G.body;
          const dx = ui.pos.x + 0.5 - b.x;
          const dy = ui.pos.y + 0.5 - (b.y + 0.9);
          const dz = ui.pos.z + 0.5 - b.z;
          const want = ui.kind === 'enchant' ? MAGIC_BLOCK_IDS.TABLE : MAGIC_BLOCK_IDS.CAULDRON;
          if (dx * dx + dy * dy + dz * dz > PANEL_REACH * PANEL_REACH || G.world.getBlock(ui.pos.x, ui.pos.y, ui.pos.z) !== want) G.setUi(null);
          else if (ui.kind === 'enchant') {
            const n = shelfCountAt(ui.pos);
            if (n !== ui.shelfCount) {
              ui.shelfCount = n;
              M.hudDirty = true;
              if (G.markDirty) G.markDirty('hotbar');
              G._invDirty = true; // paneller sürüm sayacını yeniler
            }
          }
        }
      }
    },

    frameUpdate(_G, dt) {
      setGlintTime(typeof performance !== 'undefined' ? performance.now() / 1000 : 0, reduced());
      // Gece Görüşü: 0..1 yumuşak geçiş (render minLight/hemi'yi yükseltir)
      const target = macera() && G.mods.nightVision ? 1 : 0;
      if (M.nv !== target) {
        const k = Math.min(1, dt * 1.6);
        M.nv += (target - M.nv) * k;
        if (Math.abs(M.nv - target) < 0.01) M.nv = target;
        G.nightVisionK = M.nv;
      }
      M.hudT += dt;
      if (M.hudDirty || M.hudT >= HUD_EVERY) {
        M.hudT = 0;
        M.hudDirty = false;
        writeHud();
      }
    },

    onEvent(_G, e) {
      switch (e.type) {
        case 'blockUse':
          if (e.id === MAGIC_BLOCK_IDS.TABLE) {
            openPanel('enchant', e.x, e.y, e.z);
            e.handled = true;
          } else if (e.id === MAGIC_BLOCK_IDS.CAULDRON) {
            openPanel('brew', e.x, e.y, e.z);
            e.handled = true;
          }
          break;
        case 'uiChanged':
          if (e.ui !== 'enchant' && e.ui !== 'brew') closePanelState();
          if (e.ui !== 'none') cancelDrink();
          break;
        case 'inventoryChanged':
          scanSeen(true);
          M.hudDirty = true;
          break;
        case 'died':
          clearEffects(G.magic.state.effects);
          cancelDrink();
          M.hudDirty = true;
          break;
        case 'respawn':
          clearEffects(G.magic.state.effects);
          G.magic.state.mana = G.magic.state.maxMana;
          M.hudDirty = true;
          break;
        case 'effectAdded': {
          const text = e.refreshed ? e.name + ' yenilendi.' : e.name + ' etkisi başladı.';
          G.speak(text);
          M.hudDirty = true;
          break;
        }
        case 'effectEnded':
          G.speak(e.name + ' etkisi bitti.');
          M.hudDirty = true;
          break;
        case 'spellCast':
          M.hudDirty = true;
          break;
        case 'playerHurtBy':
        case 'playerHurt':
          cancelDrink();
          break;
        default:
          break;
      }
    },

    api() {
      // api(), init'ten önce de çağrılabilir: yöntemler çağrı anında M.api'ye yönlenir
      const out = {};
      API_NAMES.forEach((n) => {
        out[n] = (...args) => (M.api ? M.api[n](...args) : undefined);
      });
      return out;
    },

    serialize() {
      if (!G.magic) return null;
      return {
        v: 1,
        m: serializeMagicAll(G.magic),
        seen: Array.from(M.seen),
        brewed: Array.from(M.brewed),
      };
    },

    restore(_G, data) {
      if (!data || typeof data !== 'object') return;
      restoreMagicAll(G.magic, data.m);
      M.seen.clear();
      M.brewed.clear();
      M.knownRecipes.clear();
      const ok = (k) => typeof k === 'string' && k.length < 64;
      if (Array.isArray(data.seen)) {
        for (let i = 0; i < data.seen.length && i < SEEN_MAX; i++) if (ok(data.seen[i]) && BREW_INGREDIENTS.indexOf(data.seen[i]) >= 0) M.seen.add(data.seen[i]);
      }
      if (Array.isArray(data.brewed)) {
        for (let i = 0; i < data.brewed.length && i < 32; i++) {
          if (ok(data.brewed[i]) && BREW_RECIPES.some((r) => r.id === data.brewed[i])) M.brewed.add(data.brewed[i]);
        }
      }
      scanSeen(false);
      M.hudDirty = true;
    },

    dispose() {
      cancelDrink();
      if (M.mw) M.mw.dispose();
      G.magicUse = null;
      G.magicUseSlot = null;
    },
  };
  M.sys = sys;
  return sys;
}
