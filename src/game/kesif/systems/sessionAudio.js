/*
 * KEŞİF — oturum sesleri: ilerleme olaylarının kısa melodileri (stinger) ve API ile açılan panellerin arayüz sesleri.
 *
 *   STINGERS                       olay türü → {name, vol}
 *   soundForEvent(evt) → {name, vol} | null       (saf; test edilir)
 *   createSessionAudio(G) → { onEvent(G, evt), onAction(G, a), frame(G) }
 *
 * Ortam sesi (bölge/biyom/yeraltı/su altı/gece/hava/savaş → audio.setAmbient), adım/iniş/zıplama sesleri ve çekirdeğin eylem kaynaklı
 * panel sesleri (E / Tab / Esc) çekirdekte (gameAudio, gamePlayer, gameUi) yapılır; burada ÇİFT SES oluşmaması için yalnızca
 * (1) çekirdeğin çalmadığı olay melodileri, (2) api çağrısıyla (React düğmeleri) açılan/kapanan paneller için ui_open/ui_close çalınır.
 * Bulmaca çözüldü melodisi çalınmaz: bulmaca efektleri (`{kind:'sound'}`) kendi sesini taşır.
 */

export const STINGERS = Object.freeze({
  achievement: { name: 'achievement', vol: 0.7 },
  zoneUnlocked: { name: 'zone_unlock', vol: 0.85 },
  sealComplete: { name: 'zone_unlock', vol: 0.7 },
  ability: { name: 'achievement', vol: 0.85 },
  bossDefeated: { name: 'zone_unlock', vol: 0.9 },
  victory: { name: 'zone_unlock', vol: 1 },
  parkourDone: { name: 'parkour_done', vol: 0.8 },
  checkpoint: { name: 'checkpoint', vol: 0.6 },
  bossDoor: { name: 'door_open', vol: 0.8 },
  crystal: { name: 'quest', vol: 0.7 },
  sealProgress: { name: 'quest', vol: 0.7 },
  levelUp: { name: 'quest', vol: 0.55 },
});

const UI_SOUNDED = Object.freeze({
  inventory: 1, crafting: 1, build: 1, map: 1, journal: 1, chest: 1,
});

/** Olay → ses (null: sessiz). questUpdate yalnızca tamamlanınca; parkourRecord yalnızca ilk bitirme/rekor için. */
export function soundForEvent(evt) {
  if (!evt || typeof evt.type !== 'string') return null;
  if (evt.type === 'questUpdate') return evt.state === 'done' ? { name: 'quest', vol: 0.65 } : null;
  if (evt.type === 'parkourRecord') return evt.first === true ? STINGERS.parkourDone : null;
  return STINGERS[evt.type] || null;
}

export function createSessionAudio(G) {
  let actionFrame = -1;
  let pendingUi = null;
  return {
    onEvent(_G, evt) {
      if (!evt) return;
      if (evt.type === 'uiChanged') {
        // karar sonraya bırakılır: aynı karede bir eylem (E/Tab/Esc) varsa çekirdek sesi zaten çaldı
        const opened = UI_SOUNDED[evt.ui] === 1;
        const closed = UI_SOUNDED[evt.prev] === 1 && evt.ui === 'none';
        if (opened || closed) pendingUi = { open: opened, frame: G.time.frame };
        return;
      }
      const s = soundForEvent(evt);
      if (s) G.sound(s.name, undefined, { vol: s.vol });
    },
    onAction() {
      actionFrame = G.time.frame;
    },
    frame() {
      if (!pendingUi) return;
      const p = pendingUi;
      pendingUi = null;
      if (p.frame === actionFrame) return;
      G.sound(p.open ? 'ui_open' : 'ui_close', undefined, { vol: 0.5 });
    },
  };
}
