/*
 * KEŞİF sim/props — prop DAVRANIŞLARI ve EFEKT sözlüğü (saf). Sözleşme KESIF_CITY_CONTRACT §6.
 *
 *   registerPropBehavior(kind, {onUse(ctx, prop, st, actor) → res|null, tick?(ctx, prop, st, dt) → res|null, hint?(st, prop, ctx) → string,
 *                               volatile?: bool})   volatile: durum/extra KAYDA GİRMEZ, yüklemede sıfırlanır (geçici/sayaç davranışları)
 *       kind = PROP_DEFS[..].interact.kind. Aynı kind iki kez kaydedilirse hata fırlatır (props_content çakışması sessiz kalmasın).
 *   getPropBehavior(kind) → davranış | null           listPropBehaviors() → kind[]
 *   res = {state?:int, rflags?:int, extra?:sayı|metin|dizi, tmp?:any (kayda GİRMEZ), active?:bool (true: tick çağrılır), effects?:Effect[]}
 *   ctx = {time (sn, PropWorld.tick birikimi), seed, def, world (PropWorld), choiceUi:bool (seçim paneli kuran bir arayüz var mı)}
 *   st  = {state, rflags, extra, tmp}  (okunur; değişiklik res ile döner → belirlenimci)
 *   actor = {crouch?:bool, choice?:string, x?,y?,z?} | null
 *
 * EFEKTLER (puzzle efekt sözlüğü + şehir uzantıları; yürütücü sistem yazar, sim yalnız veri üretir):
 *   {kind:'sound',name,x?,y?,z?} {kind:'particles',fx,x,y,z,color?} {kind:'message',text} {kind:'giveItem',item,count}
 *   {kind:'spawn',type,x,y,z,opts?} {kind:'setBlock',x,y,z,id}                         (puzzle sözlüğü)
 *   {kind:'dialog',npc,node} {kind:'openUi',ui,...yük} {kind:'lock',lockId,op} {kind:'setProp',id,state} {kind:'emit',evt}
 *   {kind:'dimension',op:'back'|'home'}      boyut terminali: dimrt yürütür (ücretsiz `back` kapısı / başlangıç noktasına dönüş)
 *
 * Yerleşik davranışlar (Faz 1): dinlen (bank), otomat, oku (tabela/billboard), terminal (bilgi kioskı), boyut (boyut terminali = 16 terminal noktası).
 * Terminal keşfi: terminal/boyut ilk kullanımda {type:'terminalFound', terminal, first:true} yayar; durum 1 kalıcıdır (kayıt: [1,0]).
 * Metinler Türkçe, aile dostu; sayaçlar/seçimler hash'ten gelir (Math.random yok).
 */
import { signAt } from './propSigns.js';
import { hash32 } from '../rng.js';

export const EFFECT_KINDS = Object.freeze([
  'sound', 'particles', 'message', 'giveItem', 'spawn', 'setBlock',
  'dialog', 'openUi', 'lock', 'setProp', 'emit', 'dimension',
]);
const EFFECT_SET = Object.create(null);
EFFECT_KINDS.forEach((k) => { EFFECT_SET[k] = true; });

export function isEffect(e) {
  return !!e && typeof e === 'object' && typeof e.kind === 'string' && EFFECT_SET[e.kind] === true;
}

export const fx = Object.freeze({
  sound: (name, x, y, z) => ({ kind: 'sound', name, x, y, z }),
  particles: (name, x, y, z, color) => ({ kind: 'particles', fx: name, x, y, z, color }),
  message: (text) => ({ kind: 'message', text }),
  giveItem: (item, count) => ({ kind: 'giveItem', item, count: count === undefined ? 1 : count }),
  spawn: (type, x, y, z, opts) => ({ kind: 'spawn', type, x, y, z, opts }),
  setBlock: (x, y, z, id) => ({ kind: 'setBlock', x, y, z, id }),
  dialog: (npc, node) => ({ kind: 'dialog', npc, node }),
  openUi: (ui, payload) => Object.assign({ kind: 'openUi', ui }, payload || null),
  lock: (lockId, op) => ({ kind: 'lock', lockId, op }),
  setProp: (id, state) => ({ kind: 'setProp', id, state }),
  emit: (evt) => ({ kind: 'emit', evt }),
  dimension: (op) => ({ kind: 'dimension', op }),
});

const REGISTRY = new Map();

export function registerPropBehavior(kind, b) {
  if (typeof kind !== 'string' || !/^[a-z0-9_]{1,32}$/.test(kind)) throw new Error('registerPropBehavior: geçersiz kind ' + String(kind));
  if (!b || typeof b.onUse !== 'function') throw new Error('registerPropBehavior(' + kind + '): onUse işlevi gerekli');
  if (b.tick !== undefined && typeof b.tick !== 'function') throw new Error('registerPropBehavior(' + kind + '): tick işlev olmalı');
  if (b.hint !== undefined && typeof b.hint !== 'function') throw new Error('registerPropBehavior(' + kind + '): hint işlev olmalı');
  if (REGISTRY.has(kind)) throw new Error('registerPropBehavior: ' + kind + ' zaten kayıtlı');
  REGISTRY.set(kind, b);
  return b;
}

export function getPropBehavior(kind) {
  return REGISTRY.get(kind) || null;
}

export function listPropBehaviors() {
  return Array.from(REGISTRY.keys());
}

/** HUD ipucu metni: davranışın hint'i, yoksa tanımın istemi. */
export function propHint(def, st, prop, ctx) {
  if (!def || !def.interact) return '';
  const b = REGISTRY.get(def.interact.kind);
  if (b && b.hint) {
    const h = b.hint(st, prop, ctx);
    if (typeof h === 'string' && h) return h;
  }
  return def.interact.prompt;
}

/* ------------------------------------------------------------------------------------------------
 * Yerleşik davranışlar
 * ---------------------------------------------------------------------------------------------- */
const OTOMAT_LINES = Object.freeze([
  'Otomat bip dedi: "Bugünlük ikram bitti."',
  'Otomat ışıklarını yakıp söndürdü.',
  'Otomat: "Yarın yine gel, güzel bir gün dilerim!"',
  'Otomat sessizce mırıldandı.',
]);
const BENCH_LINES = Object.freeze([
  'Bankta biraz soluklandın. Şehir ışıl ışıl.',
  'Bankta oturup neon ışıklara baktın.',
  'Bankta kısa bir mola verdin.',
]);
const OTOMAT_BLINK_SEC = 1.6;
const ARM_SEC = 6;

registerPropBehavior('dinlen', {
  volatile: true,
  onUse(ctx, prop, st) {
    const line = BENCH_LINES[hash32((prop.id ^ (st.extra | 0) * 0x9e3779b1) | 0) % BENCH_LINES.length];
    const n = ((st.extra | 0) + 1) % 1000;
    return {
      extra: n,
      effects: [fx.sound('ui_click', prop.x, prop.y + 0.5, prop.z), fx.message(line)],
    };
  },
});

registerPropBehavior('otomat', {
  volatile: true,
  onUse(ctx, prop, st) {
    if (st.state === 1) return { effects: [] }; // yanıp sönerken tekrar kullanılamaz (spam yok)
    const uses = (st.extra | 0) + 1;
    const line = OTOMAT_LINES[hash32((prop.id ^ Math.imul(uses, 0x9e3779b1)) | 0) % OTOMAT_LINES.length];
    return {
      state: 1,
      extra: uses % 1000,
      tmp: { until: ctx.time + OTOMAT_BLINK_SEC },
      active: true,
      effects: [fx.sound('ui_click', prop.x, prop.y + 1, prop.z), fx.message(line)],
    };
  },
  tick(ctx, prop, st) {
    if (!st.tmp || ctx.time >= st.tmp.until) return { state: 0, tmp: null, active: false };
    return null;
  },
  hint(st) {
    return st.state === 1 ? 'Otomat çalışıyor…' : 'Otomatı kullan';
  },
});

registerPropBehavior('oku', {
  volatile: true,
  onUse(ctx, prop) {
    const e = signAt(prop.flags & 0xffff);
    if (!e) return { effects: [] };
    const text = e.kind === 'brand' ? e.text + ': ' + e.tagline : e.text;
    return { effects: [fx.message(text)] };
  },
  hint(st, prop) {
    const e = prop ? signAt(prop.flags & 0xffff) : null;
    if (!e) return 'Oku';
    return e.kind === 'brand' ? e.text + ' tabelasını oku' : 'Reklamı oku';
  },
});

registerPropBehavior('terminal', {
  onUse(ctx, prop, st) {
    const n = prop.flags & 15;
    const first = st.state === 0;
    const effects = [fx.sound('ui_open', prop.x, prop.y + 1, prop.z)];
    if (first) {
      effects.push(fx.message('Terminal bulundu! Yeniden doğuş noktan burası oldu.'));
      effects.push(fx.emit({ type: 'terminalFound', terminal: n, first: true }));
    } else {
      effects.push(fx.message('Terminal etkin. Yeniden doğuş noktan burada.'));
      effects.push(fx.openUi('terminal', { terminal: n }));
    }
    return { state: 1, effects };
  },
  hint(st) {
    return st.state === 0 ? 'Terminali etkinleştir' : 'Terminali kullan';
  },
});

const BOYUT_CHOICES = Object.freeze([
  Object.freeze({ id: 'back', label: 'Eve dön', effect: Object.freeze({ kind: 'dimension', op: 'back' }) }),
  Object.freeze({ id: 'home', label: 'Başlangıç noktasına dön', effect: Object.freeze({ kind: 'dimension', op: 'home' }) }),
]);

/** Boyut terminali: şehrin 16 terminal noktasıdır (cityplan: data = terminal no) — ilk kullanım terminali BULUR (yeniden doğuş noktası). */
registerPropBehavior('boyut', {
  onUse(ctx, prop, st, actor) {
    const n = prop.flags & 15;
    const first = st.state === 0;
    const effects = [fx.sound('ui_open', prop.x, prop.y + 1, prop.z)];
    if (first) effects.push(fx.emit({ type: 'terminalFound', terminal: n, first: true }));
    const pick = actor && (actor.choice === 'back' || actor.choice === 'home') ? actor.choice : null;
    const armed = !!(st.tmp && ctx.time < st.tmp.until);
    // seçim paneli yoksa: ikinci kullanım (≤6 sn içinde) onaylar; çömelerek kullanmak başlangıç noktasıdır
    const confirm = pick || (armed ? (actor && actor.crouch ? 'home' : 'back') : null);
    if (confirm) {
      if (first) effects.push(fx.message('Terminal bulundu! Yeniden doğuş noktan burası oldu.'));
      effects.push(fx.dimension(confirm));
      return {
        state: 1, tmp: null, active: false, effects,
      };
    }
    effects.push(fx.openUi('boyutTerminal', { title: 'Boyut Terminali', choices: BOYUT_CHOICES, terminal: n }));
    if (first) {
      effects.push(fx.message(ctx.choiceUi
        ? 'Terminal bulundu! Yeniden doğuş noktan burası oldu.'
        : 'Terminal bulundu! Tekrar kullan: eve dön.'));
    } else if (!ctx.choiceUi) {
      effects.push(fx.message('Tekrar kullan: eve dön. Çömelerek: başlangıç noktası.'));
    }
    return {
      state: 1, tmp: { until: ctx.time + ARM_SEC }, active: true, effects,
    };
  },
  tick(ctx, prop, st) {
    if (!st.tmp || ctx.time >= st.tmp.until) return { tmp: null, active: false };
    return null;
  },
  hint(st, prop, ctx) {
    const armed = !!(st.tmp && ctx && ctx.time < st.tmp.until);
    if (armed) return 'Eve dön (çömel: başlangıç noktası)';
    return st.state === 0 ? 'Terminali etkinleştir' : 'Boyut terminalini kullan';
  },
});
