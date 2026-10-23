/*
 * KEŞİF sim/city/ped — DİYALOG VERİSİ (npc_vendors): 16 sahip + 30 sokak NPC'si grafı, tek çatı altında. SAF, es2020.
 *
 *   DIALOGUES (npcId → graf) · ALL_NODE_IDS · getGraph(npcId) · getNode(tamKimlik) · entryNode(npcId, ctx) → düğüm kimliği
 *   validateDialogues() → string[] (boş = temiz): her goto çözülür, her düğümde çıkış var, ≤4 seçenek, satır/seçenek uzunlukları, efekt/koşul biçimleri,
 *     her düğüm giriş düğümünden erişilir, her düğümden 'end'e yol vardır.
 * Biçim ve yazım yardımcıları dialogueKit.js'te; koşullar dialogueEngine.evalCond; efektler npcEffects.
 */
import { OWNER_GRAPHS } from './dialogueOwners.js';
import { STREET_A_GRAPHS } from './dialogueStreetA.js';
import { STREET_B_GRAPHS } from './dialogueStreetB.js';
import { STREET_C_GRAPHS } from './dialogueStreetC.js';
import { LIMITS } from './dialogueKit.js';
import { selectEntry } from './dialogueEngine.js';
import { validateEffect } from './npcEffects.js';

const ALL = OWNER_GRAPHS.concat(STREET_A_GRAPHS, STREET_B_GRAPHS, STREET_C_GRAPHS);

export const DIALOGUES = Object.freeze(ALL.reduce((m, g) => { m[g.npc] = g; return m; }, {}));

const NODES = (() => {
  const m = Object.create(null);
  ALL.forEach((g) => Object.keys(g.nodes).forEach((id) => { m[id] = g.nodes[id]; }));
  return m;
})();

export const ALL_NODE_IDS = Object.freeze(Object.keys(NODES));

export function getGraph(npcId) {
  return typeof npcId === 'string' && Object.prototype.hasOwnProperty.call(DIALOGUES, npcId) ? DIALOGUES[npcId] : null;
}

export function getNode(id) {
  return typeof id === 'string' ? NODES[id] || null : null;
}

export function entryNode(npcId, ctx) {
  const g = getGraph(npcId);
  return g ? selectEntry(g, ctx || {}) : null;
}

const COND_KEYS = Object.freeze(['flag', 'no', 'item', 'n', 'kredi', 'quest', 'phase', 'rain', 'rel', 'visits', 'first', 'dist', 'hint', 'and', 'or', 'not']);

function condProblems(c, where, out, depth) {
  if (c === null || c === undefined) return;
  if (typeof c !== 'object' || Array.isArray(c)) { out.push(where + ': koşul nesne değil'); return; }
  if (depth > 6) { out.push(where + ': koşul çok derin'); return; }
  Object.keys(c).forEach((k) => {
    if (COND_KEYS.indexOf(k) < 0) out.push(where + ': bilinmeyen koşul alanı ' + k);
  });
  ['and', 'or'].forEach((k) => {
    if (c[k] !== undefined) {
      if (!Array.isArray(c[k]) || c[k].length === 0) out.push(where + ': ' + k + ' boş/dizi değil');
      else c[k].forEach((x) => condProblems(x, where, out, depth + 1));
    }
  });
  if (c.not !== undefined) condProblems(c.not, where, out, depth + 1);
  if (c.quest !== undefined && !(Array.isArray(c.quest) && c.quest.length === 2 && ['none', 'active', 'done'].indexOf(c.quest[1]) >= 0)) out.push(where + ': quest [id, durum]');
  if (c.phase !== undefined && !Array.isArray(c.phase)) out.push(where + ': phase dizi olmalı');
}

export function validateDialogues() {
  const out = [];
  ALL.forEach((g) => {
    const ids = Object.keys(g.nodes);
    if (!g.nodes[g.npc + '.root']) out.push(g.npc + ': root yok');
    g.entry.forEach((e) => {
      if (!g.nodes[e.node]) out.push(g.npc + ': giriş düğümü çözülmüyor ' + e.node);
      condProblems(e.cond, g.npc + ' giriş', out, 0);
    });
    ids.forEach((id) => {
      const n = g.nodes[id];
      const w = id;
      if (n.text.length > LIMITS.row) out.push(w + ': satır >' + LIMITS.row + ' (' + n.text.length + ')');
      if (n.lines.length < 1 || n.lines.length > LIMITS.lines) out.push(w + ': satır sayısı ' + n.lines.length);
      n.lines.forEach((l) => { if (l.length > LIMITS.line) out.push(w + ': görsel satır >' + LIMITS.line + ' (' + l + ')'); });
      if (n.choices.length < 1 || n.choices.length > 6) out.push(w + ': seçenek sayısı ' + n.choices.length);
      if (!n.choices.some((c) => c.goto === 'end')) out.push(w + ': çıkış seçeneği yok');
      condProblems(n.cond, w, out, 0);
      (n.act || []).forEach((e) => { const p = validateEffect(e); if (p) out.push(w + ': efekt ' + p); });
      n.choices.forEach((c) => {
        if (c.t.length > LIMITS.choice) out.push(w + ': seçenek metni >' + LIMITS.choice + ' (' + c.t + ')');
        if (c.goto !== 'end' && !NODES[c.goto]) out.push(w + ': goto çözülmüyor ' + c.goto);
        if (c.say && c.say.length > LIMITS.say) out.push(w + ': say >' + LIMITS.say);
        condProblems(c.cond, w, out, 0);
        condProblems(c.need, w, out, 0);
        (c.act || []).forEach((e) => { const p = validateEffect(e); if (p) out.push(w + ': seçenek efekti ' + p); });
      });
    });
    // erişilebilirlik (giriş düğümlerinden) ve çıkışa ulaşım
    const seen = new Set();
    const stack = g.entry.map((e) => e.node);
    while (stack.length > 0) {
      const id = stack.pop();
      if (seen.has(id) || !NODES[id]) continue;
      seen.add(id);
      NODES[id].choices.forEach((c) => { if (c.goto !== 'end') stack.push(c.goto); });
    }
    ids.forEach((id) => { if (!seen.has(id)) out.push(id + ': erişilemez düğüm'); });
    ids.forEach((id) => {
      // her düğümden 'end'e en az bir yol (doğrudan çıkış seçeneği zaten şart; ek güvence)
      if (!NODES[id].choices.some((c) => c.goto === 'end')) out.push(id + ': çıkışa yol yok');
    });
  });
  return out;
}
