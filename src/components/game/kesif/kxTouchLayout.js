/*
 * KEŞİF dokunmatik düğme yerleşimi (saf mantık).
 *
 * Sağ başparmağın doğal yayı: ana düğme (kır/saldır) çapanın üstünde; zıpla ve yerleştir/kullan ona yakın
 * yay üzerinde; çömel yukarıda; yetenekler ve bağlamsal "Etkileş" daha dış yayda. Konumlar çapa merkezine göre
 * piksel (bx: sağa +, by: yukarı +); CSS bunları `--kx-cs` ölçeği ve güvenli alanla birleştirir.
 * Sol elli modda tüm yerleşim aynalanır (CSS: sağ yerine sol kenar).
 */
import { ABILITY_META, ABILITY_ORDER } from './kxHudUtils.js';

/** Çapa merkezinin kenardan uzaklığı (px) ve alttan başlangıç yüksekliği (hotbar + can sırası üstü; dikeyde 44 px yuvalı çubuğun üstünde kalır). */
export const TOUCH_ANCHOR = Object.freeze({
  landscape: Object.freeze({ edge: 50, bottom: 104 }),
  portrait: Object.freeze({ edge: 50, bottom: 150 }),
});

const LAND = Object.freeze({
  break: { size: 76, bx: 0, by: 0 },
  jump: { size: 64, bx: -67, by: 80 },
  place: { size: 60, bx: -100, by: 7 },
  crouch: { size: 48, bx: 14, by: 103 },
  interact: { size: 56, bx: -148, by: 79 },
  sprintToggle: { size: 44, bx: -162, by: -2 },
  slots: [
    { size: 46, bx: -15, by: 160 },
    { size: 46, bx: -69, by: 162 },
    { size: 46, bx: -116, by: 133 },
  ],
  portalSlot: { size: 46, bx: -170, by: 132 },
});

const PORT = Object.freeze({
  break: { size: 84, bx: 0, by: 0 },
  jump: { size: 68, bx: -90, by: 22 },
  place: { size: 62, bx: 0, by: 102 },
  crouch: { size: 50, bx: -84, by: 104 },
  interact: { size: 56, bx: -172, by: 34 },
  sprintToggle: { size: 44, bx: -170, by: -24 },
  slots: [
    { size: 46, bx: -12, by: 170 },
    { size: 46, bx: -68, by: 170 },
    { size: 46, bx: -124, by: 170 },
  ],
  portalSlot: { size: 46, bx: -180, by: 170 },
});

/**
 * @param {{portrait?:boolean, flying?:boolean, mode?:string, canInteract?:boolean,
 *          abilities?:Object<string,boolean>, abilityButtons?:Object<string,string|null>}} o
 * @returns {{anchor:{edge:number,bottom:number}, buttons:Array}}
 *  buttons[i] = { id, name, label, icon, size, bx, by, kind:'hold'|'tap'|'toggle', ability? }
 */
export function buildTouchLayout(o = {}) {
  const T = o.portrait ? PORT : LAND;
  const anchor = o.portrait ? TOUCH_ANCHOR.portrait : TOUCH_ANCHOR.landscape;
  const flying = Boolean(o.flying);
  const buttons = [
    { id: 'break', name: 'break', label: 'Kır veya saldır', icon: 'break', kind: 'hold', ...T.break },
    { id: 'jump', name: 'jump', label: flying ? 'Yukarı uç' : 'Zıpla', icon: 'jump', kind: 'hold', ...T.jump },
    { id: 'place', name: 'place', label: 'Yerleştir veya kullan', icon: 'place', kind: 'hold', ...T.place },
    { id: 'crouch', name: 'crouch', label: flying ? 'Aşağı in' : 'Çömel', icon: 'crouch', kind: 'hold', ...T.crouch },
    { id: 'sprintToggle', name: 'sprintToggle', label: 'Koşmayı kilitle', icon: 'sprint', kind: 'toggle', ...T.sprintToggle },
  ];
  if (o.canInteract) buttons.push({ id: 'interact', name: 'interact', label: 'Etkileş', icon: 'interact', kind: 'tap', ...T.interact });

  const map = o.abilityButtons || {};
  const extra = [];
  if (o.mode === 'insa') extra.push({ id: 'fly', name: 'fly', label: flying ? 'Uçuşu kapat' : 'Uçuşu aç', icon: 'fly', kind: 'tap' });
  for (let i = 0; i < ABILITY_ORDER.length; i++) {
    const key = ABILITY_ORDER[i];
    if (!o.abilities || !o.abilities[key]) continue;
    const meta = ABILITY_META[key];
    const btn = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : meta.button;
    if (!btn) continue;
    extra.push({ id: btn, name: btn, label: meta.label, icon: meta.icon, kind: 'tap', ability: key });
  }
  // Neon Meridyen: Portal Tabancası düğmelerinin yanında "Boyut kipi" (yalnız o.portalMode; ek yuva en dış yayda)
  if (o.portalMode) extra.push({ id: 'portalMode', name: 'portalMode', label: 'Boyut kipi', icon: 'dimension', kind: 'toggle' });
  const slots = o.portalMode ? T.slots.concat([T.portalSlot]) : T.slots;
  for (let i = 0; i < extra.length && i < slots.length; i++) buttons.push({ ...extra[i], ...slots[i] });

  return { anchor, buttons };
}

/** Ölçek: alçak yatay ekranda küçültür, geniş ekranda biraz büyütür (0.78..1.15). */
export function touchScale(w, h, portrait) {
  const v = portrait ? w / 390 : h / 400;
  return Math.max(0.78, Math.min(1.15, Math.round(v * 100) / 100));
}
