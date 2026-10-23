/*
 * KEŞİF sim/props — İÇ MEKÂN DAVRANIŞLARI (props_content; sözleşme §6, §8, §19). propBehaviors.js kayıt defterine 9 etkileşim türü ekler:
 *
 *   sit      oturma/yatma: ses + `propSeat` olayı (sistem: gövdeyi koltuğa kilitler, kamerayı alçaltır; zıpla/F ile kalkış). Kapsül kapağı kapanır.
 *   open     kapı · gizli kapı · dolap · buzdolabı: durum 0 kapalı / 1 açık. Kapılar kilit sistemi (cityLocks, propIndoor köprüsü) varken OTOMATİKTİR:
 *            durumu yaklaşma/kilit belirler, kullanım yalnız ileti verir (kilitliyse "kilitli"); köprü yoksa elle aç/kapa (kilitli odanın İÇİNDEN HER ZAMAN açılır).
 *   toggle   ekran/holo/masa/DJ (kalıcı döngü) ve zamanlı cihazlar (duş, şarj, çay, robot kol, dron, tarayıcı, oyun makinesi: durum 1 → süre dolunca 0)
 *   read     kitaplık, sanat, sunucu, vitrin, posta, bilgi terminali, menü/ilan/skor panoları, kod notu (rakamlar + {lock,'clue'})
 *   buy      tezgâh / otomat: sahibin selamı + {kind:'openUi', ui:'vendor'} (Faz 4 satıcı arayüzü)
 *   lockpad  kod paneli / kart okuyucu / çözme terminali: ileti + ses; panel/çözüm cityLocks'ta (`propUsed` olayı → panel). Köprü yoksa durum ışığını kendisi yönetir.
 *   elevator asansör düğmesi: olay `elevatorCall` + ses; cityLocks `propUsed` ile kabini çağırır ve düğme durumunu yönetir (köprü yoksa kendisi 3 sn yakar)
 *   dialog   sahip/NPC propları: sahibin ownerData satırı konuşma balonu + {kind:'dialog'} (Faz 4 DialogueSheet)
 *   pickup   toplanabilir (flags = PICKUP_ITEMS indeksi; durum 1 = alındı)
 *
 * Efektler yalnız propBehaviors sözlüğündendir (yeni efekt türü yok): koltuk/asansör `emit` olaylarıyla taşınır (`propSeat`, `elevatorCall`).
 * Ses adları audioRecipesDim `prop:*` anahtarlarıdır. Metinler propTexts.js; hepsi aile dostu Türkçe. Math.random/Date.now yok.
 */
import { registerPropBehavior, fx } from './propBehaviors.js';
import { PROP_BY_T, rotateBox } from './propDefs.js';
import {
  BILGI, OPEN_TEXTS, TEXTS, TOGGLE_TEXTS, pickList, pickText,
} from './propTexts.js';
import { seatPlacement } from './propSeat.js';
import {
  clueDigitsOf, doorLockOf, getLockBridge, indoorAtProp, isLockOpen, ownerAtProp, padLockOf,
} from './propIndoor.js';
import { boardText, pickBoardForProp } from './propSignsIndoor.js';
import { ownerLine } from '../city/ownerData.js';
import { hash32 } from '../rng.js';

export const PICKUP_ITEMS = Object.freeze(['item:enerji_hücresi']);

const defOf = (ctx, prop) => (ctx && ctx.def) || PROP_BY_T[prop.t] || null;
const pn = (prop, n) => hash32((prop.id ^ Math.imul((n | 0) + 1, 0x9e3779b1)) | 0);
const tn = (ctx, prop) => pn(prop, Math.floor((ctx && ctx.time ? ctx.time : 0) * 4));
const at = (prop, dy) => [prop.x, prop.y + (dy === undefined ? 1 : dy), prop.z];
const snd = (name, prop, dy) => {
  const p = at(prop, dy);
  return fx.sound(name, p[0], p[1], p[2]);
};
const finite = (a) => !!a && Number.isFinite(a.x) && Number.isFinite(a.z);

/* küçük bellek: ipucu/kilit sorguları (hint her karede çağrılır). Anahtar: tohum:id. */
const MEMO_CAP = 600;
function memo(map, key, fn) {
  if (map.has(key)) return map.get(key);
  if (map.size >= MEMO_CAP) map.clear();
  const v = fn();
  map.set(key, v);
  return v;
}
const DOOR_MEMO = new Map();
const PAD_MEMO = new Map();
const CLUE_MEMO = new Map();
const BOARD_MEMO = new Map();
export function clearBehaviorMemo() {
  DOOR_MEMO.clear();
  PAD_MEMO.clear();
  CLUE_MEMO.clear();
  BOARD_MEMO.clear();
}
const doorInfo = (ctx, prop) => memo(DOOR_MEMO, ctx.seed + ':' + prop.id, () => doorLockOf(ctx.seed, prop));
const padInfo = (ctx, prop, key) => memo(PAD_MEMO, ctx.seed + ':' + prop.id, () => padLockOf(ctx.seed, prop, key));
const clueInfo = (ctx, prop) => memo(CLUE_MEMO, ctx.seed + ':' + prop.id, () => clueDigitsOf(ctx.seed, prop));
function boardInfo(ctx, prop, def) {
  return memo(BOARD_MEMO, ctx.seed + ':' + prop.id, () => {
    const c = indoorAtProp(ctx.seed, prop);
    return pickBoardForProp(def, prop, c ? c.kind : null);
  });
}

/* ------------------------------------------------------------------------------------------------ sit */
registerPropBehavior('sit', {
  volatile: true,
  onUse(ctx, prop, st, actor) {
    const def = defOf(ctx, prop);
    const pl = def ? seatPlacement(def, prop, actor) : null;
    if (!pl) return { effects: [] };
    const lie = pl.pose === 'lie';
    const effects = [
      snd('prop:sit', prop, 0.6),
      fx.message(pickText(lie ? 'uzanma' : 'oturma', pn(prop, st.extra | 0))),
      fx.emit({
        type: 'propSeat', id: prop.id, key: def.key, x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw, pitch: pl.pitch, eye: pl.eye, pose: pl.pose, spot: pl.spot, closes: !!def.seat.closes,
      }),
    ];
    const res = { extra: ((st.extra | 0) + 1) % 1000, effects };
    if (def.seat.closes) {
      res.state = 1;
      effects.push(fx.message(pickText('kapsul', 0)));
    }
    return res;
  },
});

/* ------------------------------------------------------------------------------------------------ open */
function inDoorway(def, prop, actor) {
  const b = def.colliders.length ? def.colliders[0] : [-0.5, 0, -0.125, 0.5, 3, 0.125];
  const r = rotateBox(b, prop.yaw, [0, 0, 0, 0, 0, 0]);
  const m = 0.55;
  return actor.x > prop.x + r[0] - m && actor.x < prop.x + r[3] + m && actor.z > prop.z + r[2] - m && actor.z < prop.z + r[5] + m
    && (!Number.isFinite(actor.y) || (actor.y > prop.y - 2 && actor.y < prop.y + 3));
}

function fromBack(info, actor) {
  const b = info && info.back;
  if (!b || !finite(actor)) return false;
  const y = Number.isFinite(actor.y) ? actor.y : b.y0;
  return actor.x >= b.x0 && actor.x < b.x1 && actor.z >= b.z0 && actor.z < b.z1 && y >= b.y0 - 1 && y < b.y1 + 1;
}

function doorUse(ctx, prop, st, actor, def) {
  const n = tn(ctx, prop);
  const auto = getLockBridge() !== null; // cityLocks kapıyı kendisi sürer (yaklaşınca açılır)
  if (def.mode === 'secret') {
    if (auto) return { effects: [snd('prop:beep', prop, 1.2)] }; // bulma/çözüm cityLocks'ta (propUsed)
    if (st.state === 1) return { state: 0, effects: [snd('prop:door_shut', prop, 1.2)] };
    return { state: 1, effects: [snd('prop:door', prop, 1.2), fx.message(pickText('gizli_kapi', n))] };
  }
  const info = doorInfo(ctx, prop);
  const lock = info ? info.lock : null;
  const blocked = !!lock && !isLockOpen(lock) && !fromBack(info, actor);
  if (auto) {
    if (blocked) return { effects: [snd('prop:locked', prop, 1.2), fx.message(pickText('kapi_kilitli', n))] };
    return { effects: [fx.message(pickText('kapi_otomatik', n))] };
  }
  if (st.state === 1) {
    if (finite(actor) && inDoorway(def, prop, actor)) return { effects: [fx.message('Kapı aralığında kapanamaz; bir adım geri çekil.')] };
    return { state: 0, effects: [snd('prop:door_shut', prop, 1.2)] };
  }
  if (blocked) return { effects: [snd('prop:locked', prop, 1.2), fx.message(pickText('kapi_kilitli', n))] };
  if (lock && !isLockOpen(lock)) return { state: 1, effects: [snd('prop:door', prop, 1.2), fx.message(pickText('kapi_cikis', n))] };
  return { state: 1, effects: [snd('prop:door', prop, 1.2)] };
}

function cabinetUse(ctx, prop, st, def) {
  if (st.state === 1) return { state: 0, effects: [snd('prop:drawer', prop, 1)] };
  const list = OPEN_TEXTS[def.key] || OPEN_TEXTS.dolap;
  return { state: 1, effects: [snd('prop:drawer', prop, 1), fx.message(pickList(list, tn(ctx, prop)))] };
}

registerPropBehavior('open', {
  onUse(ctx, prop, st, actor) {
    const def = defOf(ctx, prop);
    if (!def) return { effects: [] };
    if (def.mode === 'door' || def.mode === 'secret') return doorUse(ctx, prop, st, actor, def);
    return cabinetUse(ctx, prop, st, def);
  },
  hint(st, prop, ctx) {
    const def = PROP_BY_T[prop.t];
    if (!def) return '';
    const auto = getLockBridge() !== null;
    if (def.mode === 'door' && ctx && ctx.seed !== undefined) {
      const info = doorInfo(ctx, prop);
      if (info && info.lock && !isLockOpen(info.lock)) return 'Kapı kilitli';
      if (auto) return 'Otomatik kapı';
    }
    if (def.mode === 'secret' && auto) return 'İncele: ' + def.name;
    if (st.state === 1) return 'Kapat: ' + def.name;
    return def.interact.prompt;
  },
});

/* ------------------------------------------------------------------------------------------------ toggle */
const isOn = (def, state) => (def.power === undefined ? state !== 0 : ((def.power >> state) & 1) === 1);

function toggleTexts(def) {
  return TOGGLE_TEXTS[def.key] || { on: [def.name + ' çalıştı.'], off: [def.name + ' durdu.'] };
}

registerPropBehavior('toggle', {
  onUse(ctx, prop, st) {
    const def = defOf(ctx, prop);
    if (!def) return { effects: [] };
    const tx = toggleTexts(def);
    const n = tn(ctx, prop);
    if (def.mode === 'timed') {
      if (st.state === 1) return { effects: [fx.message(def.name + ' çalışıyor…')] };
      return {
        state: 1,
        tmp: { until: ctx.time + (def.timed || 5) },
        active: true,
        effects: [snd('prop:power_on', prop, 1), fx.message(pickList(tx.on, n))],
      };
    }
    const next = (st.state + 1) % def.states;
    const on = isOn(def, next);
    const list = def.mode === 'fold' ? (next === 1 ? tx.off : tx.on) : (on ? tx.on : tx.off);
    return {
      state: next,
      effects: [snd(def.mode === 'fold' ? 'prop:drawer' : on ? 'prop:power_on' : 'prop:power_off', prop, 1), fx.message(pickList(list, n))],
    };
  },
  tick(ctx, prop, st) {
    if (!st.tmp || ctx.time < st.tmp.until) return st.tmp ? null : { state: 0, active: false };
    const def = defOf(ctx, prop);
    const tx = def ? toggleTexts(def) : { off: [] };
    return {
      state: 0,
      tmp: null,
      active: false,
      effects: [snd('prop:power_off', prop, 1)].concat(tx.off.length ? [fx.message(pickList(tx.off, tn(ctx, prop)))] : []),
    };
  },
  hint(st, prop) {
    const def = PROP_BY_T[prop.t];
    if (!def) return '';
    if (def.mode === 'timed') return st.state === 1 ? def.name + ' çalışıyor…' : def.interact.prompt;
    if (def.mode === 'fold') return st.state === 1 ? 'Masayı aç' : 'Masayı katla';
    if (def.mode === 'power' && isOn(def, st.state)) return def.states > 2 ? def.interact.prompt : 'Kapat: ' + def.name;
    return def.interact.prompt;
  },
});

/* ------------------------------------------------------------------------------------------------ read */
function digitsText(d) {
  return d.join(' - ');
}

function readText(ctx, prop, st, def) {
  const n = pn(prop, st.extra | 0);
  let t;
  switch (def.mode) {
    case 'kitap': t = pickText('kitap', n); break;
    case 'sanat': t = pickText('sanat', n); break;
    case 'sunucu': t = pickText('sunucu', n); break;
    case 'vitrin': t = pickText('vitrin', n); break;
    case 'posta': t = pickText('posta', n); break;
    case 'bilgi': {
      const c = indoorAtProp(ctx.seed, prop);
      t = pickList((c && BILGI[c.kind]) || BILGI.genel, n);
      break;
    }
    case 'sign': {
      const b = boardInfo(ctx, prop, def);
      t = b ? boardText(b) : def.name;
      break;
    }
    case 'clue': {
      const d = clueInfo(ctx, prop);
      return d ? 'Notta zar yüzleri çizilmiş: ' + digitsText(d) : pickText('kod_notu', n);
    }
    default: return def.name;
  }
  // ipucu taşıyan bilgi/posta/pano propları (data = kod): rakamlar iletiye eklenir
  if (def.mode === 'sign' ? def.key === 'ilan_panosu' : (def.mode === 'bilgi' || def.mode === 'posta')) {
    const d = clueInfo(ctx, prop);
    if (d) t += ' Kenarda zar yüzleri: ' + digitsText(d);
  }
  return t;
}

registerPropBehavior('read', {
  volatile: true,
  onUse(ctx, prop, st) {
    const def = defOf(ctx, prop);
    if (!def) return { effects: [] };
    return {
      extra: ((st.extra | 0) + 1) % 1000,
      effects: [snd('prop:beep', prop, 1), fx.message(readText(ctx, prop, st, def))],
    };
  },
});

/* ------------------------------------------------------------------------------------------------ buy */
registerPropBehavior('buy', {
  volatile: true,
  onUse(ctx, prop, st) {
    const def = defOf(ctx, prop);
    if (!def) return { effects: [] };
    const owner = def.mode === 'vending' ? null : ownerAtProp(ctx.seed, prop);
    const n = pn(prop, st.extra | 0);
    const greet = owner ? owner.name + ': "' + ownerLine(owner, 'selam') + '"' : pickText('otomat_bip', n);
    return {
      extra: ((st.extra | 0) + 1) % 1000,
      effects: [
        snd('prop:beep', prop, 1),
        fx.message(greet),
        fx.openUi('vendor', {
          vendor: owner ? owner.id : 'otomat', counter: def.key, brand: owner ? owner.brand : null, id: prop.id,
        }),
      ],
    };
  },
});

/* ------------------------------------------------------------------------------------------------ lockpad */
const PAD_TEXT = Object.freeze({ kod_paneli: 'pad_kod', kart_okuyucu: 'pad_kart', hack_terminali: 'pad_hack' });

registerPropBehavior('lockpad', {
  onUse(ctx, prop, st) {
    const def = defOf(ctx, prop);
    if (!def) return { effects: [] };
    const info = padInfo(ctx, prop, def.key);
    const lock = info ? info.lock : null;
    const effects = [snd('prop:beep', prop, 0.5)];
    const res = { effects };
    if (lock && isLockOpen(lock)) {
      res.state = 1;
      effects.push(fx.message('Bu kilit zaten çözüldü; kapı açılabilir.'));
      return res;
    }
    // kilit sistemi soğuma ışığını (durum 2) kendisi sürer; yoksa bayat ışık sıfırlanır
    if (st.state === 2 && getLockBridge() === null) res.state = 0;
    effects.push(fx.message(pickText(PAD_TEXT[def.key] || 'pad_kod', tn(ctx, prop))));
    return res;
  },
  hint(st, prop, ctx) {
    const def = PROP_BY_T[prop.t];
    if (!def) return '';
    if (ctx && ctx.seed !== undefined) {
      const info = padInfo(ctx, prop, def.key);
      if (info && info.lock && isLockOpen(info.lock)) return def.name + ': çözüldü';
    }
    return st.state === 2 ? def.name + ': soğuyor' : def.interact.prompt;
  },
});

/* ------------------------------------------------------------------------------------------------ elevator */
registerPropBehavior('elevator', {
  volatile: true,
  onUse(ctx, prop, st) {
    if (st.state === 1) return { effects: [] };
    const ev = fx.emit({
      type: 'elevatorCall', id: prop.id, x: prop.x, y: prop.y, z: prop.z,
    });
    // kilit sistemi (köprü) düğme durumunu/iletisini kabin benzetiminden yönetir
    if (getLockBridge() !== null) return { effects: [snd('prop:beep', prop, 0.6), ev] };
    return {
      state: 1,
      tmp: { until: ctx.time + 3 },
      active: true,
      effects: [snd('prop:beep', prop, 0.6), fx.message(pickText('asansor', tn(ctx, prop))), ev],
    };
  },
  tick(ctx, prop, st) {
    if (!st.tmp || ctx.time >= st.tmp.until) return { state: 0, tmp: null, active: false };
    return null;
  },
  hint(st) {
    return st.state === 1 ? 'Asansör yolda…' : 'Asansörü çağır';
  },
});

/* ------------------------------------------------------------------------------------------------ dialog */
const OWNER_LINES = ['selam', 'sohbet', 'ipucu', 'veda'];

registerPropBehavior('dialog', {
  volatile: true,
  onUse(ctx, prop, st, actor) {
    const def = defOf(ctx, prop);
    if (!def) return { effects: [] };
    const k = st.extra | 0;
    const next = (k + 1) % 1000;
    if (def.mode === 'pet') {
      return { extra: next, effects: [snd('prop:beep', prop, 0.5), fx.message(pickText(def.key, pn(prop, k)))] };
    }
    const owner = ownerAtProp(ctx.seed, prop);
    if (!owner) return { extra: next, effects: [fx.message(pickText('sahip_yok', pn(prop, k)))] };
    let kind = OWNER_LINES[k % 4];
    if (kind === 'ipucu' && actor && actor.rain) kind = 'yagmur';
    if (kind === 'veda' && actor && actor.night) kind = 'gece';
    return {
      extra: next,
      effects: [
        snd('prop:beep', prop, 1),
        fx.message(owner.name + ': "' + ownerLine(owner, kind) + '"'),
        fx.dialog(owner.id, kind),
      ],
    };
  },
});

/* ------------------------------------------------------------------------------------------------ pickup */
registerPropBehavior('pickup', {
  onUse(ctx, prop, st) {
    if (st.state === 1) return { effects: [fx.message(pickText('pickup_bos', pn(prop, 0)))] };
    const item = PICKUP_ITEMS[(prop.flags & 0xffff) % PICKUP_ITEMS.length];
    return {
      state: 1,
      effects: [snd('prop:beep', prop, 0.6), fx.giveItem(item, 1), fx.message(pickText('pickup', pn(prop, 1)))],
    };
  },
});
