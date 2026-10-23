/*
 * KEŞİF — sokak NPC'lerinin PROP katmanı (npc_vendors). Her etkin sokak NPC'si PropWorld'e DİNAMİK prop olarak eklenir (araçlarla aynı örüntü:
 * sim/city/vehicle/vehicleProps.js): hedef nişanı ("Konuş: Zeynep"), kullan yolu (propUse → davranış `npctalk` → efekt {kind:'dialog'}), çarpışma kutusu
 * (ColliderIndex: oyuncu ve araçlar içinden geçemez). Çizimi render/city/npcFigures.js yapar (prop çizicisi bu türler için mesh üretmez).
 *
 *   NPC_T0 (60301; NPCS sırası: 16 sahip + 30 sokak NPC'si) · NPC_PROP_DEFS · npcOfT(t) → NPC | null · propDefOfNpc(t) · installNpcDefs(pw) → bool · npcPropId(seed, id) → u32 · yawIndex(yaw)
 */
import { hash3, stringSeedToInt } from '../sim/rng.js';
import { fx, getPropBehavior, registerPropBehavior } from '../sim/props/propBehaviors.js';
import { NPCS } from '../sim/city/ped/npcData.js';

export const NPC_T0 = 60301;
export const NPC_TALK_RANGE = 3.2;
const HALF_PI = Math.PI / 2;

const q16 = (x) => Math.round(x * 16) / 16;

function freezeDef(d) {
  return Object.freeze(Object.assign(d, {
    size: Object.freeze(d.size),
    colliders: Object.freeze(d.colliders.map((b) => Object.freeze(b))),
    tags: Object.freeze(d.tags),
    model: Object.freeze(d.model),
    interact: Object.freeze(d.interact),
    trigger: Object.freeze(d.trigger),
  }));
}

export const NPC_PROP_DEFS = Object.freeze(NPCS.map((n, i) => {
  const h = q16(1.8 * n.scale);
  const r = 0.3125;
  return freezeDef({
    t: NPC_T0 + i,
    key: 'npc_' + n.id,
    name: n.name,
    model: { meshKey: 'npc_' + n.id },
    size: [0.625, h, 0.625],
    colliders: [[-r, 0, -r, r, h, r]],
    trigger: [-r - 0.4, 0, -r - 0.4, r + 0.4, h + 0.3, r + 0.4],
    interact: { kind: 'npctalk', prompt: 'Konuş: ' + n.name, range: NPC_TALK_RANGE },
    states: 1,
    emissive: 0,
    light: undefined,
    holo: false,
    sign: undefined,
    tags: ['npc', 'dinamik'],
    dimBound: undefined,
    dyn: true,
  });
}));

const DEF_BY_T = Object.create(null);
NPC_PROP_DEFS.forEach((d) => { DEF_BY_T[d.t] = d; });

export function propDefOfNpc(t) {
  return DEF_BY_T[t] || null;
}

export function npcOfT(t) {
  const i = t - NPC_T0;
  return Number.isInteger(i) && i >= 0 && i < NPCS.length ? NPCS[i] : null;
}

export function installNpcDefs(pw) {
  if (!pw || pw.npcDefsInstalled) return false;
  const orig = pw.getDef;
  pw.getDef = (t) => DEF_BY_T[t] || orig.call(pw, t);
  pw.npcDefsInstalled = true;
  return true;
}

export function yawIndex(yaw) {
  return Math.round(yaw / HALF_PI) & 3;
}

/** 32 bit kimlik: tohum + NPC; PropWorld çakışırsa +1 (yüksek bit: dinamik küme). */
export function npcPropId(seed, id) {
  return (hash3(stringSeedToInt('npcprop:' + id) | 0, 0x4e50, 0x43, seed | 0) | 0x80000000) >>> 0;
}

if (!getPropBehavior('npctalk')) {
  registerPropBehavior('npctalk', {
    volatile: true,
    onUse(ctx, prop, st, actor) {
      const n = npcOfT(prop.t);
      if (!n) return { effects: [] };
      // sahipler: yağmurlu/gece konuşmalarında (ikinci kullanımda bir) ilgili selam satırı (rainy/nighty düğümleri); diğer NPC'ler her zaman 'selam'
      const k = (st && st.extra | 0) % 1000;
      let hint = 'selam';
      if (n.kind === 'owner' && k % 2 === 0 && actor) hint = actor.rain ? 'yagmur' : actor.night ? 'gece' : 'selam';
      return { extra: (k + 1) % 1000, effects: [fx.dialog(n.id, hint)] };
    },
    hint(st, prop) {
      const n = npcOfT(prop.t);
      return n ? 'Konuş: ' + n.name + ' (' + n.title + ')' : 'Konuş';
    },
  });
}
