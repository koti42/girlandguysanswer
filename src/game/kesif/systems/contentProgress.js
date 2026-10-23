/*
 * KEŞİF content sistemi — İLERLEME entegrasyonu: görev HUD'u, bağlamsal ipuçları, rehberlik, ödül kuyruğu, yetenek eşyaları, gözcü kuleleri.
 *
 * Çekirdek zaten: progression 'tick', olay çıktısının uygulanması (unlockZones/grantAbilities/giveItems/rewards→'reward' olayı),
 * zoneEnter/biomeEntered. Burada:
 *   - hud.quest ← progression.questHud() (≈1 Hz ve görev olaylarında),
 *   - hud.hint ← ileti kuyruğu (bulmaca/tabela/parkur iletileri) > acil bağlamsal ipucu (düşük can, açlık, gece, karanlık) > Mühür bariyeri
 *     yakınlığı ('Mühür açılmadan geçemezsin: N/M kristal') > yeni görev ipucu (14 sn). Beklemeyle tetiklenen ipucu yoktur; acil ipucu bir bölümde en çok 8 sn görünür. Başka sistemin
 *     (blocks: "[E] Sandığı aç") yazdığı etkileşim ipucunun üzerine YAZILMAZ,
 *   - ödül kuyruğu: bekleyen ödüller açılışta ve 90 sn'de bir 'reward' olayıyla yeniden bildirilir (sunucu 409 → markRewardClaimed; idempotent),
 *     api.markRewardClaimed(key), api.getPendingRewards(),
 *   - yetenek eşyaları: kazanılmış yeteneğin eşyası envanterde yoksa (ölüm) yeniden verilir,
 *   - gözcü kulesi güvertesi: haritayı açar ('reveal' {x,z,radius}),
 *   - api.getGuidance().
 *
 *   initProgress(S)  fixedProgress(S, dt)  frameProgress(S, dt)  onProgressEvent(S, evt)  progressApi(S)  hintContext(S)
 */
import { clockPhase, isNight } from '../sim/daynight.js';
import { ABILITY_INFO } from '../sim/progressionData.js';
import { getGuidance } from './contentGuide.js';
import { itemName } from './contentHelpers.js';
import { emit } from './contentState.js';
import { isTouchG, touchify } from './touchText.js';

const URGENT = { düşük_can: 1, aç: 1, gece_geliyor: 1, gece: 1, karanlık: 1 };
const REWARD_RETRY = 90;
/** Acil ipucu (düşük can, açlık, gece…) bir "bölüm" boyunca en çok bu kadar sn görünür; durum sürse de tekrar etmez, durum bitip yeniden başlayınca yeni bölüm açılır. */
const URGENT_SHOW_S = 8;

export function initProgress(S) {
  S.ready = false;
  S.readyT = 0;
  S.questId = null;
  S.questHintUntil = 0;
  S.hintText = null;
  S.hintKind = '';
  S.lastHintAt = 0;
  S.urgentKey = null;
  S.urgentUntil = 0;
  S.lookouts = new Set();
  S.lastQuestSig = '';
}

/* ---------------------------------------------------------------------------------------------
 * Görev HUD'u
 * ------------------------------------------------------------------------------------------- */
function refreshQuest(S) {
  const G = S.G;
  const p = G.progression;
  if (!p || !p.active) return;
  const q = p.questHud();
  if (!q) return;
  const sig = q.title + '|' + q.lines.join('|');
  if (sig !== S.lastQuestSig) {
    S.lastQuestSig = sig;
    G.hud.quest = q;
    if (G.markDirty) G.markDirty('all');
  }
}

/* ---------------------------------------------------------------------------------------------
 * Bağlamsal ipucu
 * ------------------------------------------------------------------------------------------- */
const _ctx = {
  hp: 20, maxHp: 20, hunger: 20, isNight: false, dusk: false, light: 15, underground: false, inventory: null, zone: 0, puzzleHint: null,
};

/** Gün batımı başlangıcından (faz 0,44) sonraki ilk DUSK_HINT_SECS sn; yalnızca ilk iki gün ('Gece geliyor' ipucu). */
const DUSK_HINT_SECS = 60;
export function isDuskHint(clock) {
  if (!clock || clock.day > 1) return false;
  const since = clock.time - 0.44 * clock.dayLengthSec;
  return since >= 0 && since < DUSK_HINT_SECS;
}

export function hintContext(S) {
  const G = S.G;
  const b = G.body;
  const sv = G.survival;
  _ctx.hp = sv ? sv.hp : 20;
  _ctx.maxHp = sv ? sv.maxHp : 20;
  _ctx.hunger = sv ? sv.hunger : 20;
  _ctx.isNight = G.clock ? isNight(clockPhase(G.clock)) : false;
  _ctx.dusk = G.clock ? isDuskHint(G.clock) : false;
  _ctx.inventory = G.inventory;
  _ctx.zone = G.hud.zone ? G.hud.zone.id : 0;
  const w = G.world;
  const bx = Math.floor(b.x);
  const bz = Math.floor(b.z);
  // yaprak/ağaç tacı "zemin" sayılmaz: büyük bir ağacın altı mağara değildir (gündüz sahte "çok karanlık" ipucu çıkmasın)
  const sy = w.surfaceY(bx, bz, { ignoreFoliage: true });
  _ctx.underground = sy > 0 && b.y + 2 < sy - 3;
  const l = w.getBlockLight(bx, Math.floor(b.y + 1), bz);
  _ctx.light = typeof l === 'number' ? l : 15;
  _ctx.puzzleHint = null;
  if (G.puzzles && G.puzzles.size > 0) {
    const id = G.puzzles.nearest(b.x, b.y, b.z, 1.5);
    if (id !== null) {
      const info = G.puzzles.get(id);
      if (info && !info.solved) _ctx.puzzleHint = G.puzzles.hintFor(id) || null;
    }
  }
  return _ctx;
}

function computeHint(S) {
  const G = S.G;
  const p = G.progression;
  const now = G.time.seconds;
  if (!p || !p.active || G.player.dead) {
    S.hintText = null;
    S.hintKind = '';
    return;
  }
  const info = p.hintInfo(hintContext(S));
  if (info && URGENT[info.key] === 1) {
    if (S.urgentKey !== info.key) {
      S.urgentKey = info.key;
      S.urgentUntil = now + URGENT_SHOW_S;
    }
    if (now < S.urgentUntil) {
      S.hintText = info.text;
      S.hintKind = info.key;
      return;
    }
  } else {
    S.urgentKey = null;
  }
  // mühür bariyeri yakın
  const cm = G.chunkManager;
  const sd = cm && typeof cm.getSealDistance === 'function' ? cm.getSealDistance() : Infinity;
  if (Number.isFinite(sd) && sd < 14) {
    const z = G.hud.zone ? G.hud.zone.id : 0;
    const sp = p.sealProgress(z);
    if (sp && !sp.done) {
      S.hintText = 'Mühür açılmadan geçemezsin: ' + sp.placed + '/' + sp.required + ' kristal yerleşti.';
      S.hintKind = 'mühür';
      return;
    }
  }
  if (info && info.key === 'bulmaca') {
    S.hintText = info.text;
    S.hintKind = 'bulmaca';
    return;
  }
  // yeni görev ipucu
  const q = p.activeQuest();
  const qid = q ? q.id : null;
  if (qid !== S.questId) {
    S.questId = qid;
    if (qid !== null && S.ready) S.questHintUntil = now + 14;
  }
  if (q && now < S.questHintUntil) {
    S.hintText = q.hint;
    S.hintKind = 'görev';
    S.lastHintAt = now;
    return;
  }
  // Not: "uzun süre ipucu yoksa hedef yönü" gibi BEKLEME ile tetiklenen ipucu YOK; yön bilgisi isteyene api.getGuidance() / görev izleyicide.
  S.hintText = null;
  S.hintKind = '';
}

/** Her çizim karesi: hud.hint yazımı (blocks'un etkileşim ipucunun üzerine yazılmaz). */
export function frameProgress(S, dt) {
  const G = S.G;
  S.fx.frame(dt);
  const msg = S.fx.current();
  const raw = msg || S.hintText || null;
  const want = raw && isTouchG(G) ? touchify(raw) : raw; // dokunmatikte 'sol tık' yerine gerçek düğme adları
  const cur = G.hud.hint;
  if (want) {
    if (!cur || cur === S.hintOwn) {
      if (cur !== want) G.hud.hint = want;
      S.hintOwn = want;
    }
  } else if (S.hintOwn !== null && cur === S.hintOwn) {
    G.hud.hint = null;
    S.hintOwn = null;
  } else if (cur !== S.hintOwn) {
    S.hintOwn = null;
  }
}

/* ---------------------------------------------------------------------------------------------
 * Sabit adım (≈2 Hz işler)
 * ------------------------------------------------------------------------------------------- */
export function fixedProgress(S, dt) {
  const G = S.G;
  const p = G.progression;
  if (!p) return;
  S.readyT += dt;
  S.hintT += dt;
  S.questT += dt;
  S.rewardT += dt;
  if (!S.ready && S.readyT > 2.5) {
    S.ready = true;
    S.questId = null; // ilk (açılış) görevin ipucu da 14 sn gösterilsin (hazır olmadan önceki ön hesap onu yutuyordu)
    restoreAbilityItems(S);
    pendingRewardsNotify(S);
    refreshQuest(S);
    computeHint(S);
  }
  if (S.hintT >= 0.5) {
    S.hintT = 0;
    computeHint(S);
    lookouts(S);
  }
  if (S.questT >= 1) {
    S.questT = 0;
    refreshQuest(S);
  }
  if (S.rewardT >= REWARD_RETRY) {
    S.rewardT = 0;
    pendingRewardsNotify(S);
  }
}

/* ---------------------------------------------------------------------------------------------
 * Ödül kuyruğu / yetenek eşyaları
 * ------------------------------------------------------------------------------------------- */
function pendingRewardsNotify(S) {
  const p = S.G.progression;
  if (!p || !p.active) return 0;
  const list = p.pendingRewards();
  for (let i = 0; i < list.length; i++) emit(S, { type: 'reward', key: list[i].key, retry: true });
  return list.length;
}

export function restoreAbilityItems(S) {
  const G = S.G;
  const p = G.progression;
  if (!p || !p.active || !G.inventory || typeof p.missingAbilityItems !== 'function') return 0;
  const miss = p.missingAbilityItems(G.inventory);
  for (let i = 0; i < miss.length; i++) {
    const left = G.inventory.add(miss[i].item, miss[i].count);
    if (left > 0 && G.em && typeof G.em.spawnItem === 'function') G.em.spawnItem(miss[i].item, left, G.body.x, G.body.y + 0.6, G.body.z);
    S.fx.message(itemName(miss[i].item) + ' yeniden envanterine eklendi.');
  }
  return miss.length;
}

/* ---------------------------------------------------------------------------------------------
 * Gözcü kulesi
 * ------------------------------------------------------------------------------------------- */
function lookouts(S) {
  const G = S.G;
  const b = G.body;
  S.structs.forEach((rec) => {
    const lk = rec.def.lookout;
    if (!lk || S.lookouts.has(rec.id)) return;
    const dx = b.x - lk.deck.x;
    const dz = b.z - lk.deck.z;
    if (dx * dx + dz * dz > 25 || b.y < lk.deck.y - 1.5) return;
    S.lookouts.add(rec.id);
    emit(S, { type: 'reveal', x: rec.def.x, z: rec.def.z, radius: lk.revealRadius });
    S.version++;
    S.fx.sound('quest', b.x, b.y + 1, b.z);
    S.fx.particles('levelUp', lk.deck.x + 0.5, lk.deck.y + 1.5, lk.deck.z + 0.5, 0x9be7ff);
    S.fx.message('Gözcü kulesinin tepesindesin: çevredeki yapılar haritanda belirdi (Tab).');
  });
}

/* ---------------------------------------------------------------------------------------------
 * Olaylar
 * ------------------------------------------------------------------------------------------- */
export function onProgressEvent(S, evt) {
  const G = S.G;
  switch (evt.type) {
    case 'respawn':
      restoreAbilityItems(S);
      break;
    case 'questUpdate':
    case 'puzzleSolved':
    case 'zoneUnlocked':
    case 'crystal':
    case 'sealProgress':
    case 'bossDefeated':
      S.questT = 1; // bir sonraki adımda tazele
      S.guideCache.t = -10;
      break;
    case 'ability': {
      const info = ABILITY_INFO[evt.key];
      if (info) S.fx.message('Yeni yetenek: ' + info.name + '. ' + info.desc, { speak: true });
      break;
    }
    case 'zoneEnter':
      // (sesli okuma yalnız erişilebilirlik açıksa oturum katmanında çalar; burada her zaman iletilir)
      if (evt.name) G.speak(evt.name + ' bölgesine girdin');
      break;
    case 'achievement':
      S.questT = 1;
      if (evt.title) G.speak('Başarım kazandın: ' + evt.title);
      break;
    default:
      break;
  }
}

/* ---------------------------------------------------------------------------------------------
 * api
 * ------------------------------------------------------------------------------------------- */
export function progressApi(S) {
  const G = S.G;
  return {
    /** Sıradaki hedef + pusula yönü (HUD ipucu satırı ve harita için). */
    getGuidance() {
      return getGuidance(S);
    },
    /** Sunucu ödülü işledi (başarı ya da 409 already_claimed): bekleyenden düşer. */
    markRewardClaimed(key) {
      // Neon Meridyen jetonları (neon:*) şehir durumunda izlenir (systems/cityApi)
      if (typeof key === 'string' && key.indexOf('neon:') === 0) return G.cityApi ? G.cityApi.markClaimed(key) : false;
      const p = G.progression;
      if (!p || typeof p.markClaimed !== 'function') return false;
      const was = p.rewards.pending.indexOf(key) >= 0 || p.rewards.claimed.indexOf(key) >= 0;
      p.markClaimed(key);
      return was;
    },
    /** Sunucuya henüz bildirilmemiş ödül anahtarları: [{key}]. */
    getPendingRewards() {
      const p = G.progression;
      return p && typeof p.pendingRewards === 'function' ? p.pendingRewards() : [];
    },
  };
}
