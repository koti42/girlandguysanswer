/*
 * KEŞİF sim/city/ped — KONUŞMA YÖNETİCİSİ (npc_vendors): diyalog motoru + efekt yolu + yerleşik işleyiciler + kayıt, tek fabrikada. SAF (oyun bağları `host`ta).
 *
 *   createNpcTalk(host) → talk
 *     host: {city() → dims.neon.city | null, inv, wallet, emit(e), env() → {phase, rain, dist}, day() → gün, drop?, queue(uiReq), hintText?, heal?}
 *     talk.bus (EffectBus) · talk.runner (DiyalogMotoru) · talk.start(npcId, hint?) → view|null · talk.choose(n) · talk.close(reason?) · talk.view()
 *     talk.setProvider({quest?(id), stat?(name), mission?()}) · talk.ctxFor(npcId, hint?) · talk.pending (kuyruğa alınan arayüz isteği | null; diyalog kapanınca sistem açar)
 *   questState(city, id, provider) → 'none'|'active'|'done'    (sağlayıcı yoksa bayrak `q_<id>`: 1 etkin, 2 bitti)
 */
import { getGraph, getNode } from './dialogueData.js';
import { createDialogueRunner } from './dialogueEngine.js';
import { createEffectBus } from './npcEffects.js';
import { installBuiltins } from './npcBuiltins.js';
import { getNpc } from './npcData.js';
import {
  getFlag, nodeCount, noteNode, noteTalk, markOnce, npcRel, npcVisits,
} from './npcSave.js';

export function questState(city, id, provider) {
  if (provider && typeof provider.quest === 'function') {
    const s = provider.quest(id);
    if (s === 'none' || s === 'active' || s === 'done') return s;
  }
  const v = getFlag(city, 'q_' + id);
  return v >= 2 ? 'done' : v === 1 ? 'active' : 'none';
}

export function createNpcTalk(host) {
  let provider = null;
  const bus = createEffectBus();
  const talk = {
    bus, provider: null, pending: null, stats: { starts: 0 },
  };

  const city = () => host.city() || {};
  const dayN = () => (host.day ? host.day() | 0 : 0);

  function ctxFor(npcId, hint) {
    const c = city();
    const env = host.env ? host.env() : {};
    return {
      flag: (k) => getFlag(c, k),
      item: (k) => host.inv.count(k),
      kredi: host.wallet.get(),
      quest: (id) => questState(c, id, provider),
      phase: env.phase || 'gunduz',
      rain: !!env.rain,
      dist: env.dist || '',
      rel: npcRel(c, npcId),
      visits: npcVisits(c, npcId),
      first: npcVisits(c, npcId) === 0,
      hint,
    };
  }

  installBuiltins(bus, {
    city,
    inv: host.inv,
    wallet: host.wallet,
    emit: host.emit,
    drop: host.drop,
    day: dayN,
    queue(req) {
      talk.pending = req;
    },
    hintText: host.hintText,
    heal: host.heal,
  });

  const runner = createDialogueRunner({
    getGraph,
    getNode,
    npcInfo: (id) => getNpc(id),
    ctx: (npcId, hint) => ctxFor(npcId, hint),
    effects: bus,
    fxCtx: (npcId, nodeId) => ({
      npc: getNpc(npcId), node: nodeId, now: host.day ? host.day() : 0,
    }),
    emit: (e) => host.emit(e),
    note(npcId, nodeId, visit) {
      const c = host.city();
      if (!c) return { first: false };
      if (visit) return noteTalk(c, npcId, dayN(), null);
      noteNode(c, npcId, nodeId);
      return { first: false };
    },
    onceSeen: (npcId, nodeId) => nodeCount(city(), npcId, nodeId) >= 1,
    markOnce: (npcId, nodeId) => markOnce(host.city() || {}, npcId, nodeId),
  });

  talk.runner = runner;
  talk.ctxFor = ctxFor;
  talk.setProvider = (p) => { provider = p && typeof p === 'object' ? p : null; talk.provider = provider; };
  talk.start = (npcId, hint) => {
    talk.pending = null;
    talk.stats.starts++;
    return runner.start(npcId, hint);
  };
  talk.choose = (n) => runner.choose(n);
  talk.close = (reason) => runner.close(reason);
  talk.view = () => runner.view();
  return talk;
}
