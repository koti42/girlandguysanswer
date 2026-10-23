/*
 * KEŞİF büyü sistemi — genel api yöntemleri (addendum §E'ye ek; KESIF_MAGIC.md §7). Paneller (EnchantPanel/BrewPanel) bunları çağırır.
 *
 *   getEnchantInfo(target?)     büyüleme paneli verisi (seçili yuva ya da adres: 's12' | 'a0' | indeks)
 *   enchant(optionId, target?)  teklifi uygular → {ok, offer?, ench?, reason?, message?}; başarıda ses/parçacık/olay
 *   rerollEnchant()             teklifleri yeniden çek (1 büyü tozu)
 *   getBrewInfo()               kazan paneli: {cauldron, recipes[{…,discovered}], bottles, maxBottles}
 *   startBrew(recipeId, bottles=3) · collectBrew()
 *   castSpell()                 eldeki asayla büyü (arayüz/test); getSpellList()
 *   useManaCrystal() · drinkPotion(addr) · getMagicInfo() · getMagicUi()
 * Yalnız macera modunda çalışır; diğer modlarda {ok:false, reason:'mod'}.
 */
import {
  applyEnchantOffer, brewInfo, consumeManaCrystal, drinkPotion, enchantInfo, hudEffects, rerollEnchant, spellList,
  magicDescribe,
} from '../sim/magic.js';
import { itemByKey } from '../sim/items.js';

const DENY = Object.freeze({ ok: false, reason: 'mod', message: 'Büyü ve simya yalnızca macera modunda kullanılır.' });

export function createMagicApi(G, M, h) {
  const macera = () => G.mode === 'macera';
  const inv = () => G.inventory;
  const pos = () => G.magicUi.pos;

  function nameOf(key) {
    const it = itemByKey(key);
    return it ? it.name : key;
  }

  function getEnchantInfo(target) {
    if (!macera()) return Object.assign({ slot: null, enchantable: false, offers: [], lines: [] }, DENY);
    const info = enchantInfo(G.magic.state, inv(), target === undefined || target === null ? undefined : target, G.magicUi.shelfCount);
    info.table = pos() && G.magicUi.kind === 'enchant' ? { x: pos().x, y: pos().y, z: pos().z } : null;
    return info;
  }

  function enchant(optionId, target) {
    if (!macera()) return DENY;
    const addr = target === undefined || target === null ? inv().selected : target;
    const res = applyEnchantOffer(G.magic.state, inv(), addr, optionId, G.magicUi.shelfCount);
    if (!res.ok) {
      G.sound('ui_error', undefined, { vol: 0.45 });
      return res;
    }
    h.emitAll([res.event]);
    const p = pos();
    const tier = res.offer ? res.offer.tier : 1;
    G.sound('enchant', undefined, { vol: 0.9 });
    G.haptic('medium');
    if (G.particles && G.particles.enchantBurst && p) G.particles.enchantBurst({ x: p.x + 0.5, y: p.y + 0.85, z: p.z + 0.5 }, tier);
    const slot = inv().slotByAddr(addr);
    const lines = slot ? magicDescribe(slot) : [];
    G.speak(nameOf(res.event.item) + ' büyülendi. ' + lines.slice(0, 3).join(', '));
    M.hudDirty = true;
    G._invDirty = true;
    if (typeof G.publishHud === 'function') G.publishHud(true);
    return res;
  }

  function reroll() {
    if (!macera()) return DENY;
    const r = rerollEnchant(G.magic.state, inv());
    if (!r.ok) G.sound('ui_error', undefined, { vol: 0.45 });
    else G.sound('ui_click', undefined, { vol: 0.5, pitch: 1.3 });
    G._invDirty = true;
    return r;
  }

  function getBrewInfo() {
    if (!macera() || !G.magicUi.cauldronPos) return null;
    M.scanSeen(false); // çantadaki son malzemelerle tarif defterini güncelle (envanter olayını beklemeden)
    const info = brewInfo(G.magic.brew, G.magicUi.cauldronPos, inv());
    info.pos = { x: G.magicUi.cauldronPos.x, y: G.magicUi.cauldronPos.y, z: G.magicUi.cauldronPos.z };
    info.recipes = info.recipes.map((r) => Object.assign({}, r, {
      discovered: M.recipeKnown(r.id),
      outName: nameOf(r.out),
      in: r.in.map((p) => Object.assign({}, p, { seen: p.have > 0 || M.seen.has(p.item) })),
    }));
    info.known = info.recipes.filter((r) => r.discovered).length;
    return info;
  }

  function startBrew(recipeId, bottles) {
    if (!macera()) return DENY;
    const p = G.magicUi.cauldronPos;
    if (!p) return { ok: false, reason: 'yok', message: 'Önce bir Simya Kazanı aç.' };
    const info = getBrewInfo();
    const rec = info ? info.recipes.find((r) => r.id === recipeId) : null;
    if (rec && !rec.discovered) return { ok: false, reason: 'tarif', message: 'Bu tarif henüz keşfedilmedi.' };
    const r = G.magic.brew.start(p, recipeId, bottles === undefined ? 3 : bottles, inv());
    if (!r.ok) {
      G.sound('ui_error', undefined, { vol: 0.45 });
      return r;
    }
    M.brewed.add(recipeId);
    G.sound('bubble', { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 }, { vol: 0.9, pitch: 0.9 });
    G.haptic('light');
    G.speak('Demleme başladı. ' + r.bottles + ' şişe, ' + r.seconds + ' saniye.');
    G._invDirty = true;
    return r;
  }

  function collectBrew() {
    if (!macera()) return DENY;
    const p = G.magicUi.cauldronPos;
    if (!p) return { ok: false, reason: 'yok', message: 'Önce bir Simya Kazanı aç.' };
    const r = G.magic.brew.collect(p, inv());
    if (!r.ok) {
      if (r.reason !== 'hazır_değil') G.sound('ui_error', undefined, { vol: 0.45 });
      return r;
    }
    for (let i = 0; i < r.items.length; i++) G.emit({ type: 'itemPickedUp', item: r.items[i].item, count: r.items[i].count });
    G.sound('pickup', undefined, { vol: 0.7, pitch: 1.1 });
    G.haptic('light');
    if (G.particles) G.particles.pickup({ x: p.x + 0.5, y: p.y + 1.1, z: p.z + 0.5 }, 0x9dffb0);
    G.speak(nameOf(r.items[0].item) + ' alındı.');
    G._invDirty = true;
    return r;
  }

  function useManaCrystal() {
    if (!macera()) return DENY;
    const r = consumeManaCrystal(G.magic.state, inv());
    if (!r.ok) {
      h.hint(r.message || 'Kullanılamadı.', 2);
      G.sound('ui_error', undefined, { vol: 0.4 });
      return r;
    }
    h.emitAll([r.event]);
    G.sound('enchant', undefined, { vol: 0.6, pitch: 1.2 });
    G.haptic('medium');
    const b = G.body;
    if (G.particles) G.particles.magicBurst({ x: b.x, y: b.y + 1, z: b.z }, 0x5ab8ff, { radius: 1.2, scale: 0.8 });
    h.hint('Azami mana ' + r.max + '.', 3);
    G.speak('Azami mana ' + r.max + ' oldu.');
    M.hudDirty = true;
    return r;
  }

  function drinkApi(addr) {
    if (!macera()) return DENY;
    const r = drinkPotion(G.magic.state, inv(), addr, { survival: G.survival });
    if (!r.ok) {
      if (r.message) h.hint(r.message, 1.8);
      G.sound('ui_error', undefined, { vol: 0.4 });
      return r;
    }
    h.emitAll(r.events);
    G.sound('potion_drink', G.body, { vol: 0.8 });
    M.hudDirty = true;
    G._invDirty = true;
    return r;
  }

  function getMagicInfo() {
    const st = G.magic.state;
    return {
      mana: { value: Math.floor(st.mana), max: st.maxMana },
      effects: hudEffects(st.effects),
      spells: spellList(st),
      enchantCount: st.enchantCount,
      enabled: macera(),
    };
  }

  return {
    getEnchantInfo,
    enchant,
    rerollEnchant: reroll,
    getBrewInfo,
    startBrew,
    collectBrew,
    castSpell: () => M.caster.cast({ fresh: true }),
    getSpellList: () => spellList(G.magic.state),
    useManaCrystal,
    drinkPotion: drinkApi,
    getMagicInfo,
    getMagicUi: () => ({
      kind: G.magicUi.kind,
      pos: G.magicUi.pos ? { x: G.magicUi.pos.x, y: G.magicUi.pos.y, z: G.magicUi.pos.z } : null,
      shelfCount: G.magicUi.shelfCount,
    }),
  };
}
