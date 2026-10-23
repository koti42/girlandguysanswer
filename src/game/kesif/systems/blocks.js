/*
 * KEŞİF — "blocks" sistemi (order 20): hedef seçimi, blok kırma/yerleştirme/kullanma, sandıklar, istasyonlar, envanter ve üretim api'si.
 *
 * Çekirdek (gameCtx/G) sözleşmesine göre bir sistemdir; gameSystems.js bu dosyayı otomatik yükler (createSystem).
 *
 *   fixedUpdate (60 Hz): düşen bloklar → hedef (G.eyeSim + G.look) → kullan/yerleştir (placePressed/interactPressed kenarı; basılı
 *                        tutarak tekrar) → yeme → kırma (breakHeld/attackPressed)
 *   frameUpdate        : çerçeve (G.highlight.setTarget), çatlak (setBreakProgress), yerleştirme hayaleti, hud.target {block,name,progress}
 *   onAction           : 'drop' (Q: 1 adet; çömelirken tüm yığın)
 *   onEvent            : uiChanged (sandık/istasyon kapanışı), itemPickup (ses/parçacık + 'itemPickedUp'), blockBroken by:'beam' (destek zinciri)
 *   api()              : addendum §E envanter/üretim/sandık/palet yüzeyi (blocksInventoryApi, blocksCraft, blocksPalette)
 *   serialize/restore  : { v, chests:[[ "x,y,z", slots ]], bed:{x,y,z}|null }
 *
 * Girdi sahipliği: G.combatClaim (mobs.combat, order −60) {attack,use} doluysa kırma/yerleştirme/kullanma o tikte yapılmaz; G.aimEntity doluyken blok kırılmaz.
 * Oturum sözleşmesi: G.readOnly (harita) → kırma/koyma/üretim yok; reddedilen eylem G.emit({type:'actionDenied', reason:'readOnly'|'bounds'|'height'|'system'})
 *   (oturum sistemi varsa ipucunu o yazar, yoksa yerel ipucu). Bağlamsal ipucu: etkileşimli bloğa bakınca G.hud.hint = "[Sağ tık] Sandığı aç"
 *   (dokunmatik/kolda "Kullan: …"); başkasının yazdığı ipucunun üstüne yazılmaz.
 * Yayılan olaylar: blockBroken{x,y,z,id,by,item}, blockPlaced{x,y,z,id,item,by}, blockUse{x,y,z,id,item,handled} (tüketilmeyen kullanım; 'content' handled=true işaretlerse yerleştirme yapılmaz),
 *   chestOpened, doorToggled, leverToggled, bedUsed, slept, eaten{item}, armorEquipped, itemUse{item}, itemCrafted{item,count,recipeId,station},
 *   itemPickedUp{item,count}, blockLanded. Bulmaca bildirimi (blockPlaced/blockBroken/use → G.puzzles.handleInteract) bu sistem tarafından
 *   DOĞRUDAN yapılır (başka sistem aynı olayları ikinci kez iletmemeli).
 *
 * G'ye eklenenler: G.pickupItem(item,count,dur)→kalan (EntityManager.update ctx.pickup olarak verilir), G.chestPos, G.bedSpawn,
 *   G.blocks {destroyBlock, placeBlockAt, toggleDoor, openChest, tossItem, state}.
 * Okunan isteğe bağlı alan: G.aimEntity (mobs sistemi: nişandaki yaratık; doluysa blok kırılmaz).
 */
import { ITEMS } from '../sim/items.js';
import {
  canAct, createState, deny, isReadOnly, setHint, tickHint,
} from './blocksCore.js';
import { acquireFixed, clearVisuals, frameVisuals } from './blocksTarget.js';
import { destroyBlock, resetBreak, updateBreak } from './blocksBreak.js';
import { placeBlockAt, placeHeld } from './blocksPlace.js';
import { dispatchUse, openChest, toggleDoor, applyHeldItem } from './blocksUse.js';
import { cancelEat, updateEat } from './blocksEat.js';
import { afterRemoval, tickFall } from './blocksSupport.js';
import { restoreChests, serializeChests } from './blocksChest.js';
import { createInventoryApi, tossItem } from './blocksInventoryApi.js';
import { createCraftApi } from './blocksCraft.js';
import { buildPalette } from './blocksPalette.js';

const CHEST_LEAVE_DIST = 7;

export function createSystem(G) {
  const S = createState();
  const invApi = createInventoryApi(G, S);
  const craftApi = createCraftApi(G, S);

  function heldPlaces() {
    const key = G.inventory ? G.inventory.heldItem() : null;
    const it = key ? ITEMS[key] : null;
    return !!(it && it.placesBlock);
  }

  /** Kullan / yerleştir tuşuna basıldı (kenar). */
  function handlePress(s) {
    if (isReadOnly(G)) {
      dispatchUse(G, S);
      return;
    }
    const r = dispatchUse(G, S);
    S.plc.holdBlocked = r !== 'none';
    if (r !== 'none') return;
    if (s.interactPressed && !s.placePressed) {
      applyHeldItem(G, S);
      return;
    }
    if (heldPlaces()) {
      if (S.has) placeHeld(G, S, S.target, true);
    } else {
      applyHeldItem(G, S);
    }
  }

  function inactive() {
    S.has = false;
    if (S.brk.active || G.fpState.breaking) resetBreak(G, S);
    if (S.eat.active) cancelEat(G, S);
  }

  const sys = {
    name: 'blocks',
    order: 20,

    init() {
      G.chestPos = null;
      G.pickupItem = (item, count, dur, ench, charge) => {
        if (!G.inventory) return count;
        const left = G.inventory.addStack(item, count, dur, ench, charge);
        if (left > 0) {
          // çanta dolu: eşya yerde kalır; oyuncu neden alamadığını bilsin (4 sn'de bir)
          const t = G.time ? G.time.seconds : 0;
          if (t - S.fullHintT > 4 || t < S.fullHintT) {
            S.fullHintT = t;
            setHint(G, S, 'Çanta dolu: yerdeki eşyayı alamadın. Bir yuva boşalt.', 3);
          }
        }
        return left;
      };
      G.blocks = {
        state: S,
        destroyBlock: (x, y, z, o) => destroyBlock(G, S, x, y, z, o),
        placeBlockAt: (x, y, z, id, o) => placeBlockAt(G, S, x, y, z, id, o),
        toggleDoor: (x, y, z) => toggleDoor(G, S, x, y, z),
        openChest: (x, y, z, id) => openChest(G, S, x, y, z, id),
        tossItem: (item, count, dur, ench, charge) => tossItem(G, S, item, count, dur, ench, charge),
      };
    },

    fixedUpdate(_G, dt) {
      const p = S.plc;
      p.cool -= dt;
      p.failT -= dt;
      S.useCool -= dt;
      S.message.harita -= dt;
      tickHint(G, S, dt);
      if (S.charT > 0) {
        S.charT -= dt;
        if (S.charT <= 0 && G.charAction === S.charPlace) G.charAction = null;
      }
      tickFall(G, S, dt);
      if (S.chestPos && G.ui === 'chest' && G.body) {
        const dx = S.chestPos.x + 0.5 - G.body.x;
        const dy = S.chestPos.y + 0.5 - G.body.y - 0.9;
        const dz = S.chestPos.z + 0.5 - G.body.z;
        if (dx * dx + dy * dy + dz * dz > CHEST_LEAVE_DIST * CHEST_LEAVE_DIST) G.setUi(null);
      }
      if (!canAct(G)) {
        inactive();
        return;
      }
      acquireFixed(G, S);
      const s = G.inputState;
      if (!s.placeHeld) p.holdBlocked = false;
      const claim = G.combatClaim;
      const useClaimed = !!(claim && claim.use);
      if (isReadOnly(G) && S.message.harita <= 0 && S.has && (s.attackPressed || s.placePressed || (s.breakHeld && !(claim && claim.attack)))) {
        S.message.harita = 3;
        deny(G, S, 'readOnly', 'Bu harita salt okunur: gezip keşfedebilirsin ama blok kırıp koyamazsın.', 2.5);
      }
      if (useClaimed) {
        p.holdBlocked = true; // savaş (kalkan/portal/yay) sağ tık girdisini tüketti
      } else if ((s.placePressed || s.interactPressed) && S.useCool <= 0) {
        S.useCool = 0.1;
        handlePress(s);
      } else if (s.placeHeld && !p.holdBlocked && p.cool <= 0 && S.has && !isReadOnly(G) && heldPlaces()) {
        placeHeld(G, S, S.target, false);
      }
      updateEat(G, S, dt, s);
      updateBreak(G, S, dt, s);
    },

    frameUpdate() {
      if (!G.highlight) return;
      if (!canAct(G)) clearVisuals(G, S);
      else frameVisuals(G, S);
    },

    /** Boyut değişti: hedef/kırma/yeme/sandık/düşen blok kuyruğu eski dünyaya aitti (bkz. gameCtx onDimension sözleşmesi). */
    onDimension() {
      inactive();
      S.chestPos = null;
      G.chestPos = null;
      S.pinned = null;
      const f = S.fall;
      f.xs.length = 0;
      f.ys.length = 0;
      f.zs.length = 0;
      f.moved.length = 0;
      f.tries.length = 0;
      f.acc = 0;
      clearVisuals(G, S);
    },

    onAction(_G, a) {
      if (!a || a.type !== 'drop' || !canAct(G) || isReadOnly(G)) return;
      const inv = G.inventory;
      const slot = inv.held();
      if (!slot || inv.infinite) return;
      const n = G.inputState.crouch ? slot.count : 1;
      if (invApi.dropSlot('s' + inv.selected, n)) G.sound('ui_click', undefined, { vol: 0.4 });
    },

    onEvent(_G, evt) {
      switch (evt.type) {
        case 'uiChanged':
          if (evt.ui !== 'chest' && S.chestPos) {
            S.chestPos = null;
            G.chestPos = null;
          }
          if (evt.ui !== 'crafting') S.pinned = null;
          if (evt.ui !== 'none') {
            resetBreak(G, S);
            cancelEat(G, S);
          }
          break;
        case 'itemPickup': {
          const t = G.time.seconds;
          S.pos.x = evt.x; S.pos.y = evt.y; S.pos.z = evt.z;
          if (t - S.pickupT > 0.07) {
            S.pickupT = t;
            G.sound('pickup', S.pos, { vol: 0.55, pitch: 0.95 + ((G.time.tick * 7) % 11) / 60 });
          }
          if (G.particles && G.particles.pickup) G.particles.pickup(S.pos);
          G.emit({ type: 'itemPickedUp', item: evt.item, count: evt.count });
          break;
        }
        case 'blockBroken':
          if (evt.by === 'beam') afterRemoval(G, S, evt.x, evt.y, evt.z);
          break;
        case 'death':
        case 'died':
          resetBreak(G, S);
          cancelEat(G, S);
          break;
        default:
          break;
      }
    },

    api() {
      return {
        getInventorySnapshot: invApi.getInventorySnapshot,
        moveStack: invApi.moveStack,
        dropSlot: invApi.dropSlot,
        equipArmor: invApi.equipArmor,
        unequipArmor: invApi.unequipArmor,
        selectHotbar: invApi.selectHotbar,
        useSlot: invApi.useSlot,
        setCreativeSlot: invApi.setCreativeSlot,
        clearSlot: invApi.clearSlot,
        getChest: invApi.getChest,
        getStations: craftApi.getStations,
        getStationFocus: craftApi.getStationFocus,
        getRecipes: craftApi.getRecipes,
        craft: craftApi.craft,
        getBuildPalette: buildPalette,
      };
    },

    serialize() {
      // oturum sistemi (session) sandıkları ve yatak noktasını kendi kaydına yazar; çifte kayıt şişmesin
      if (typeof G.getSystem === 'function' && G.getSystem('session')) return null;
      return {
        v: 1,
        chests: serializeChests(G),
        bed: G.bedSpawn ? { x: G.bedSpawn.x, y: G.bedSpawn.y, z: G.bedSpawn.z } : null,
      };
    },

    restore(_G, data) {
      if (!data || typeof data !== 'object') return;
      restoreChests(G, data.chests);
      const b = data.bed;
      if (b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z)) {
        G.bedSpawn = { x: b.x, y: b.y, z: b.z };
      }
    },

    dispose() {
      resetBreak(G, S);
      G.chestPos = null;
    },
  };
  return sys;
}
