/*
 * KEŞİF sim — BÜYÜ: Simya Kazanı (demleme) ve iksir içme. Saf; saat yok, süre `tick(dt)` ile ilerler.
 *
 *   new BrewManager()
 *     .start(pos, recipeId, bottles, inv) → {ok, reason?, message?, missing?}   şişe + malzeme tüketir (1–3 şişe)
 *     .tick(dt) → [{type:'potionBrewed', ...}]          30 sn dolunca iksir hazır olur (olay tamamlanma anında)
 *     .collect(pos, inv) → {ok, reason?, message?, items, left}   hazır iksirleri çantaya alır (sığmayan kazanda kalır)
 *     .get(pos) → {recipeId,name,bottles,out,total,secondsLeft,progress01,done} | null
 *     .removeAt(pos) → [{item,count}]   kazan kırılınca iade (hazırsa iksirler, değilse şişe + malzeme)
 *     .list() · .serialize() · .restore(raw)
 *   drinkPotion(state, inv, addr, ctx) → {ok, reason?, message?, events[]}   ctx.survival: heal için can durumu
 * pos: {x,y,z} ya da "x,y,z". Hata nedenleri start: 'tarif' 'şişe' 'malzeme' 'meşgul' 'sınır'.
 */
import { WORLD_Y_MAX, WORLD_Y_MIN } from './constants.js';
import { ITEM_BOTTLE, ITEM_HEAL_POTION, POTION_KEYS } from './magicData.js';
import { BREW_MAX_BOTTLES, BREW_RECIPES, brewRecipe } from './magicRecipes.js';
import { addEffect } from './magicEffects.js';
import { addMana } from './magicState.js';
import { heal } from './survival.js';
import { itemByKey } from './items.js';

const MAX_CAULDRONS = 256;
const COORD = 1000000;

function keyOf(pos) {
  if (typeof pos === 'string') {
    const p = pos.split(',');
    if (p.length !== 3) return null;
    return keyOf({ x: Number(p[0]), y: Number(p[1]), z: Number(p[2]) });
  }
  if (!pos || typeof pos !== 'object') return null;
  const x = Math.floor(Number(pos.x));
  const y = Math.floor(Number(pos.y));
  const z = Math.floor(Number(pos.z));
  if (![x, y, z].every(Number.isFinite)) return null;
  if (y < WORLD_Y_MIN || y > WORLD_Y_MAX || Math.abs(x) > COORD || Math.abs(z) > COORD) return null;
  return x + ',' + y + ',' + z;
}
function posOf(key) {
  const p = key.split(',');
  return { x: Number(p[0]), y: Number(p[1]), z: Number(p[2]) };
}

const MSG = Object.freeze({
  tarif: 'Bu tarif bilinmiyor.',
  şişe: 'Yeterli boş şişen yok.',
  malzeme: 'Malzemeler eksik.',
  meşgul: 'Kazan zaten dolu.',
  sınır: 'Kazan sayısı sınırına ulaşıldı.',
  yok: 'Burada demlenen bir şey yok.',
  hazır_değil: 'İksir henüz hazır değil.',
  dolu_çanta: 'Çantanda yer yok.',
});

export class BrewManager {
  constructor() {
    this.cauldrons = new Map();
  }

  has(pos) {
    const k = keyOf(pos);
    return k !== null && this.cauldrons.has(k);
  }

  get(pos) {
    const k = keyOf(pos);
    const c = k !== null ? this.cauldrons.get(k) : null;
    return c ? this._view(c) : null;
  }

  _view(c) {
    const r = brewRecipe(c.recipeId);
    return {
      recipeId: c.recipeId,
      name: r ? r.name : c.recipeId,
      bottles: c.bottles,
      out: c.out,
      total: c.total,
      secondsLeft: c.done ? 0 : Math.max(0, Math.ceil(c.t)),
      progress01: c.done ? 1 : Math.max(0, Math.min(1, 1 - c.t / c.total)),
      done: c.done,
    };
  }

  /** Tarif listesi (arayüz): çanta kaç şişe/malzeme sağlıyor, üretilebilir mi. */
  recipes(inv) {
    return BREW_RECIPES.map((r) => {
      const ins = r.in.map((p) => ({ item: p.item, count: p.count, have: inv ? inv.count(p.item) : 0 }));
      return {
        id: r.id, name: r.name, out: r.out, time: r.time, in: ins,
        craftable: ins.every((p) => p.have >= p.count),
      };
    });
  }

  /** Kazanı başlatır. bottles 1..3 (şişe adedi = çıkacak iksir adedi). */
  start(pos, recipeId, bottles, inv) {
    const k = keyOf(pos);
    const r = brewRecipe(recipeId);
    if (k === null || !r) return { ok: false, reason: 'tarif', message: MSG.tarif };
    if (this.cauldrons.has(k)) return { ok: false, reason: 'meşgul', message: MSG.meşgul };
    if (this.cauldrons.size >= MAX_CAULDRONS) return { ok: false, reason: 'sınır', message: MSG.sınır };
    const n = Math.max(1, Math.min(BREW_MAX_BOTTLES, Math.floor(Number(bottles)) || 1));
    if (!inv.infinite && inv.count(ITEM_BOTTLE) < n) return { ok: false, reason: 'şişe', message: MSG.şişe };
    const missing = [];
    if (!inv.infinite) {
      for (let i = 0; i < r.in.length; i++) {
        const have = inv.count(r.in[i].item);
        if (have < r.in[i].count) missing.push({ item: r.in[i].item, need: r.in[i].count, have });
      }
    }
    if (missing.length) return { ok: false, reason: 'malzeme', message: MSG.malzeme, missing };
    if (!inv.infinite) {
      inv.remove(ITEM_BOTTLE, n);
      for (let i = 0; i < r.in.length; i++) inv.remove(r.in[i].item, r.in[i].count);
    }
    this.cauldrons.set(k, { recipeId: r.id, bottles: n, out: r.out, t: r.time, total: r.time, done: false });
    return { ok: true, bottles: n, seconds: r.time, recipe: r.id };
  }

  /** dt sn ilerlet. Tamamlanan her kazan için {type:'potionBrewed'} döner. */
  tick(dt) {
    const events = [];
    if (!(dt > 0) || this.cauldrons.size === 0) return events;
    this.cauldrons.forEach((c, k) => {
      if (c.done) return;
      c.t -= dt;
      if (c.t <= 0) {
        c.t = 0;
        c.done = true;
        const p = posOf(k);
        events.push({
          type: 'potionBrewed', recipe: c.recipeId, item: c.out, count: c.bottles, x: p.x, y: p.y, z: p.z,
        });
      }
    });
    return events;
  }

  /** Hazır iksirleri alır. Çanta dolarsa kalan kazanda durur (left > 0). */
  collect(pos, inv) {
    const k = keyOf(pos);
    const c = k !== null ? this.cauldrons.get(k) : null;
    if (!c) return { ok: false, reason: 'yok', message: MSG.yok, items: [], left: 0 };
    if (!c.done) return { ok: false, reason: 'hazır_değil', message: MSG.hazır_değil, items: [], left: c.bottles };
    const left = inv.add(c.out, c.bottles);
    const got = c.bottles - left;
    if (got <= 0) return { ok: false, reason: 'dolu_çanta', message: MSG.dolu_çanta, items: [], left };
    if (left > 0) c.bottles = left;
    else this.cauldrons.delete(k);
    return { ok: true, items: [{ item: c.out, count: got }], left };
  }

  /** Kazan kırıldı: içindekileri iade listesi olarak döner ve kaydı siler. */
  removeAt(pos) {
    const k = keyOf(pos);
    const c = k !== null ? this.cauldrons.get(k) : null;
    if (!c) return [];
    this.cauldrons.delete(k);
    if (c.done) return [{ item: c.out, count: c.bottles }];
    const r = brewRecipe(c.recipeId);
    const out = [{ item: ITEM_BOTTLE, count: c.bottles }];
    if (r) r.in.forEach((p) => out.push({ item: p.item, count: p.count }));
    return out;
  }

  list() {
    const out = [];
    this.cauldrons.forEach((c, k) => out.push(Object.assign({ pos: posOf(k) }, this._view(c))));
    return out;
  }

  clear() {
    this.cauldrons.clear();
  }

  serialize() {
    const out = {};
    Array.from(this.cauldrons.keys()).sort().forEach((k) => {
      const c = this.cauldrons.get(k);
      out[k] = [c.recipeId, c.bottles, Math.round(c.t * 10) / 10, c.total, c.done ? 1 : 0];
    });
    return out;
  }

  /** Doğrulayarak yükler (atmaz); geçersiz kazanlar atılır. */
  restore(raw) {
    this.cauldrons.clear();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return this;
    const ks = Object.keys(raw);
    for (let i = 0; i < ks.length && this.cauldrons.size < MAX_CAULDRONS; i++) {
      const k = keyOf(ks[i]);
      const v = raw[ks[i]];
      if (k === null || k !== ks[i] || !Array.isArray(v)) continue;
      const r = brewRecipe(v[0]);
      if (!r) continue;
      const bottles = Math.max(1, Math.min(BREW_MAX_BOTTLES, Math.floor(Number(v[1])) || 1));
      const done = v[4] === 1 || v[4] === true;
      const t = Number(v[2]);
      this.cauldrons.set(k, {
        recipeId: r.id,
        bottles,
        out: r.out,
        total: r.time,
        t: done ? 0 : Number.isFinite(t) ? Math.max(0, Math.min(r.time, t)) : r.time,
        done,
      });
    }
    return this;
  }
}

/* ------------------------------------------------------------------------------------------------
 * İksir içme
 * ---------------------------------------------------------------------------------------------- */
const DRINK_MSG = Object.freeze({
  yok: 'Bu yuvada iksir yok.',
  iksir_degil: 'Bu bir iksir değil.',
  can_dolu: 'Canın zaten dolu.',
  mana_dolu: 'Manan zaten dolu.',
  etki: 'Bu etki şu an eklenemedi.',
});

/**
 * İksir verisi: {effect?,level?,seconds?,heal?,mana?} | null. Mevcut Şifa İksiri (item:şifa_iksiri, yiyecek yolu) de
 * {heal:12} olarak tanınır; yani drinkPotion onu da içirir (şişe geri verir, 'potionDrunk' yayar).
 */
export function potionOf(itemKey) {
  const it = itemByKey(itemKey);
  if (!it) return null;
  if (it.potion && POTION_KEYS.indexOf(it.key) >= 0) return it.potion;
  if (it.key === ITEM_HEAL_POTION && it.food) return { heal: it.food.heal };
  return null;
}

/**
 * addr yuvasındaki iksiri içer: etki/can/mana uygular, şişe geri verir (Şifa İksiri dahil). Olaylar: 'effectAdded',
 * 'potionDrunk'. Can/mana zaten doluysa saf iyileştirme iksiri içilmez (tüketilmez).
 */
export function drinkPotion(state, inv, addr, ctx) {
  const c = ctx || {};
  const slot = typeof inv.slotByAddr === 'function' ? inv.slotByAddr(addr) : inv.slots[addr];
  if (!slot) return { ok: false, reason: 'yok', message: DRINK_MSG.yok, events: [] };
  const it = itemByKey(slot.item);
  const p = potionOf(slot.item);
  if (!it || !p) {
    return { ok: false, reason: 'iksir_degil', message: DRINK_MSG.iksir_degil, events: [] };
  }
  const events = [];
  if (p.heal && !p.effect && c.survival && c.survival.hp >= c.survival.maxHp) {
    return { ok: false, reason: 'can_dolu', message: DRINK_MSG.can_dolu, events };
  }
  if (p.mana && !p.effect && state.mana >= state.maxMana) {
    return { ok: false, reason: 'mana_dolu', message: DRINK_MSG.mana_dolu, events };
  }
  if (p.effect) {
    const r = addEffect(state.effects, p.effect, p.level || 1, p.seconds, 'iksir');
    if (!r.ok) return { ok: false, reason: 'etki', message: DRINK_MSG.etki, events };
    events.push(r.event);
  }
  if (p.heal && c.survival) heal(c.survival, p.heal);
  if (p.mana) addMana(state, p.mana);
  if (typeof inv.takeFromSlot === 'function') inv.takeFromSlot(addr, 1);
  else if (!inv.infinite) inv.remove(it.key, 1);
  const left = inv.add(ITEM_BOTTLE, 1);
  events.push({ type: 'potionDrunk', item: it.key, name: it.name });
  return { ok: true, events, bottleLeft: left };
}
