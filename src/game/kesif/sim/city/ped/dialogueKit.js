/*
 * KEŞİF sim/city/ped — DİYALOG BİÇİMİ ve KISA YAZIM YARDIMCILARI (npc_vendors). SAF, es2020.
 *
 * Düğüm (tam kimlik `npcId.yerel`):
 *   {id, npc, text (≤60 kr tek satır), lines[≤2 × ≤34 kr] (splitLine), choices[1..4]: {t (≤34), goto ('end' | tam kimlik), act?, c?, need?, say?},
 *    act? (düğüme girince), c? (giriş koşulu), once? (act yalnız ilk kez), mood?}
 * Her düğümde ≥1 ÇIKIŞ seçeneği (goto:'end'): çıkmaz yok. `c` doluysa seçenek koşul sağlanmazsa GİZLENİR; `need` doluysa görünür ama pasif ("why").
 * `say` (≤60 kr): seçenek diyaloğu kapatırsa balon/okunur veda satırı.
 *
 * Yazım: graph(npcId, {entry:[[cond,'yerel'],…], nodes:{yerel: nd('metin', [ch('Seçenek','hedef',{act,c,need,say}), …], {act,c,once,mood})}})
 *   hedef: 'yerel' (aynı NPC), 'başkaNpc.yerel' (nokta içerir), 'end'.
 */
import { splitLine } from '../ownerData.js';
import { getNpc } from './npcData.js';
import { WEATHER_LINES } from './weatherLines.js';

export const END = 'end';
export const LIMITS = Object.freeze({
  line: 34, row: 60, choice: 34, choices: 4, lines: 2, say: 60,
});

/** Seçenek. */
export function ch(t, to, o) {
  const x = o || {};
  const c = { t, to };
  if (x.act) c.act = x.act;
  if (x.c) c.c = x.c;
  if (x.need) c.need = x.need;
  if (x.say) c.say = x.say;
  return c;
}

/** Düğüm tanımı. */
export function nd(text, choices, o) {
  const x = o || {};
  const n = { text, choices };
  if (x.act) n.act = x.act;
  if (x.c) n.c = x.c;
  if (x.once) n.once = true;
  if (x.mood) n.mood = x.mood;
  return n;
}

/** Çıkış seçeneği kısayolu. */
export const bye = (t, say, act) => ch(t || 'Hoşça kal', END, { say, act });

function freezeNode(id, npc, spec) {
  const gotoFull = (to) => (to === END ? END : to.indexOf('.') >= 0 ? to : npc + '.' + to);
  const choices = spec.choices.map((c) => Object.freeze({
    t: c.t,
    goto: gotoFull(c.to),
    act: c.act ? Object.freeze(c.act.map((e) => Object.freeze(e))) : null,
    cond: c.c || null,
    need: c.need || null,
    say: c.say || null,
  }));
  return Object.freeze({
    id,
    npc,
    text: spec.text,
    lines: Object.freeze(splitLine(spec.text, LIMITS.line)),
    choices: Object.freeze(choices),
    act: spec.act ? Object.freeze(spec.act.map((e) => Object.freeze(e))) : null,
    cond: spec.c || null,
    once: !!spec.once,
    mood: spec.mood || 'sakin',
  });
}

/** Bir NPC'nin diyalog grafı: {npc, entry:[{cond, node}], nodes:{tamKimlik: düğüm}}.
 * Sokak NPC'lerine (rainy/nighty düğümü tanımlamayanlara) tür satırı eklenir: yağmurda/gece ve ilk konuşma DEĞİLSE selam o satırla başlar. */
export function graph(npcId, o) {
  const npc = getNpc(npcId);
  const wl = npc && npc.kind !== 'owner' ? WEATHER_LINES[npc.kind] : null;
  const specNodes = Object.assign({}, o.nodes);
  const specEntry = (o.entry || []).slice();
  if (wl && !specNodes.rainy && !specNodes.nighty) {
    specNodes.rainy = nd(wl.rain, [ch('Merhaba!', 'root'), bye()], { mood: 'yagmur' });
    specNodes.nighty = nd(wl.night, [ch('Merhaba!', 'root'), bye()], { mood: 'gece' });
    specEntry.push([{ and: [{ rain: true }, { first: false }] }, 'rainy']);
    specEntry.push([{ and: [{ phase: ['gece'] }, { first: false }] }, 'nighty']);
  }
  const nodes = {};
  Object.keys(specNodes).forEach((local) => {
    const id = npcId + '.' + local;
    nodes[id] = freezeNode(id, npcId, specNodes[local]);
  });
  const entry = specEntry.map((e) => Object.freeze({ cond: e[0] || null, node: npcId + '.' + e[1] }));
  entry.push(Object.freeze({ cond: null, node: npcId + '.root' }));
  return Object.freeze({ npc: npcId, entry: Object.freeze(entry), nodes: Object.freeze(nodes) });
}
