/*
 * KEŞİF sim/city/ped — DİYALOG MOTORU (npc_vendors). SAF (DOM/three yok), es2020, belirlenimci. Oyun bağları (envanter, cüzdan, olay) `deps` ile gelir.
 *
 *   evalCond(cond, ctx) → bool                           koşul nesnesi (alanlar VE'lenir; and/or/not özyinelemeli, derinlik ≤6)
 *   needWhy(cond) → string                               pasif seçeneğin nedeni ("Yetersiz Kredi." …)
 *   selectEntry(graph, ctx) → düğüm kimliği              ilk koşulu sağlayan giriş
 *   createDialogueRunner(deps) → runner
 *     deps: {getGraph(npcId), getNode(id), npcInfo(npcId), ctx(npcId, hint), effects (EffectBus), fxCtx(npcId, nodeId), emit(e),
 *            note(npcId, nodeId) → {first}, onceSeen(npcId, nodeId) → bool, markOnce(npcId, nodeId)}
 *     runner.start(npcId, hint?) → view | null       runner.choose(n 1..4) → {ok, ended, reason?, view, say?}
 *     runner.close(reason?) → bool                   runner.view() → view | null     runner.isOpen() · npcId() · nodeId() · stats
 *   View: {type:'dialogue', npc:{id,name,title,kind,species}, node, lines[], choices:[{n,t,enabled,why?}], msg, mood, version}
 * Seçenek efektlerinde `take`/`kredi` başarısız olursa gezinme İPTAL edilir (düğümde kalınır, msg yazılır); dış efektler (görev…) başarısız olsa da gezinme sürer.
 */

export const COND_DEPTH = 6;
const PHASES = Object.freeze(['sabah', 'gunduz', 'aksam', 'gece']);

const QUEST_STATES = Object.freeze(['none', 'active', 'done']);

function questState(ctx, id) {
  let s = typeof ctx.quest === 'function' ? ctx.quest(id) : 'none';
  if (QUEST_STATES.indexOf(s) < 0) s = 'none';
  return s;
}

function evalDepth(c, ctx, depth) {
  if (c === null || c === undefined || c === true) return true;
  if (c === false || typeof c !== 'object' || depth > COND_DEPTH) return false;
  if (c.flag !== undefined) {
    const f = Array.isArray(c.flag) ? c.flag : [c.flag, 1];
    const v = typeof ctx.flag === 'function' ? ctx.flag(f[0]) : 0;
    if (!(v >= (f[1] === undefined ? 1 : f[1]))) return false;
  }
  if (c.no !== undefined) {
    const v = typeof ctx.flag === 'function' ? ctx.flag(c.no) : 0;
    if (v > 0) return false;
  }
  if (c.item !== undefined) {
    const have = typeof ctx.item === 'function' ? ctx.item(c.item) : 0;
    if (!(have >= (c.n === undefined ? 1 : c.n))) return false;
  }
  if (c.kredi !== undefined && !((ctx.kredi | 0) >= c.kredi)) return false;
  if (c.quest !== undefined && questState(ctx, c.quest[0]) !== c.quest[1]) return false;
  if (c.phase !== undefined && c.phase.indexOf(ctx.phase) < 0) return false;
  if (c.rain !== undefined && !!ctx.rain !== !!c.rain) return false;
  if (c.rel !== undefined && !((ctx.rel | 0) >= c.rel)) return false;
  if (c.visits !== undefined && !((ctx.visits | 0) >= c.visits)) return false;
  if (c.first !== undefined && !!ctx.first !== !!c.first) return false;
  if (c.dist !== undefined && ctx.dist !== c.dist) return false;
  if (c.hint !== undefined && ctx.hint !== c.hint) return false;
  if (c.and !== undefined) {
    for (let i = 0; i < c.and.length; i++) if (!evalDepth(c.and[i], ctx, depth + 1)) return false;
  }
  if (c.or !== undefined) {
    let any = false;
    for (let i = 0; i < c.or.length && !any; i++) any = evalDepth(c.or[i], ctx, depth + 1);
    if (!any) return false;
  }
  if (c.not !== undefined && evalDepth(c.not, ctx, depth + 1)) return false;
  return true;
}

export function evalCond(cond, ctx) {
  return evalDepth(cond, ctx || {}, 0);
}

export function needWhy(c) {
  if (!c || typeof c !== 'object') return 'Şu an olmaz.';
  if (c.kredi !== undefined) return 'Yetersiz Kredi: ' + c.kredi + ' gerekli.';
  if (c.item !== undefined) return 'Gereken eşya yok.';
  if (c.flag !== undefined || c.quest !== undefined) return 'Önce başka bir şey yapmalısın.';
  return 'Şu an olmaz.';
}

export function selectEntry(g, ctx) {
  const list = g && g.entry ? g.entry : [];
  for (let i = 0; i < list.length; i++) if (evalCond(list[i].cond, ctx)) return list[i].node;
  return list.length > 0 ? list[list.length - 1].node : null;
}

const FAIL_MSG = Object.freeze({ take: 'Yeterli eşyan yok.', kredi: 'Yeterli Kredin yok.' });
const ABORT_KINDS = Object.freeze(['take', 'kredi']);

export function createDialogueRunner(deps) {
  const st = {
    open: false, npc: '', node: '', msg: '', version: 0, busy: false, say: '',
  };
  const stats = {
    starts: 0, chosen: 0, ends: 0, aborted: 0, invalid: 0,
  };
  function bump() {
    st.version++;
  }

  function baseCtx(npcId, hint) {
    const c = deps.ctx(npcId, hint) || {};
    if (hint !== undefined) c.hint = hint;
    return c;
  }

  function runEffects(effects, npcId, nodeId) {
    if (!effects || effects.length === 0) return [];
    return deps.effects.run(effects, deps.fxCtx(npcId, nodeId));
  }

  /** Efekt sonuçlarından ileti ve (varsa) iptal nedeni. */
  function digest(results, effects) {
    let msg = '';
    let abort = '';
    let end = false;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const kind = effects[i] ? effects[i].k : '';
      if (r.ok && kind === 'end') end = true;
      if (r.msg && !msg) msg = r.msg;
      if (!r.ok) {
        if (ABORT_KINDS.indexOf(kind) >= 0 && !abort) abort = r.msg || FAIL_MSG[kind];
        else if (r.reason === 'nohandler' && !msg) msg = 'Bu iş şimdilik kapalı.';
      }
    }
    return { msg, abort, end };
  }

  function enter(npcId, nodeId) {
    const node = deps.getNode(nodeId);
    if (!node) return null;
    st.node = nodeId;
    st.msg = '';
    const seen = node.once ? !!deps.onceSeen(npcId, nodeId) : false;
    deps.note(npcId, nodeId);
    deps.emit({ type: 'dialogueNode', npc: npcId, node: nodeId });
    if (node.act) {
      if (node.once && !seen) deps.markOnce(npcId, nodeId);
      if (!seen) {
        const res = runEffects(node.act, npcId, nodeId);
        const d = digest(res, node.act);
        if (d.msg) st.msg = d.msg;
        if (d.end) st.say = 'end';
      }
    }
    bump();
    return node;
  }

  function visibleChoices(node, ctx) {
    const out = [];
    for (let i = 0; i < node.choices.length; i++) {
      const c = node.choices[i];
      if (c.cond && !evalCond(c.cond, ctx)) continue;
      const enabled = c.need ? evalCond(c.need, ctx) : true;
      out.push({ c, enabled });
    }
    return out;
  }

  function close(reason) {
    if (!st.open) return false;
    const npc = st.npc;
    st.open = false;
    st.node = '';
    st.npc = '';
    st.busy = false;
    stats.ends++;
    bump();
    deps.emit({ type: 'dialogueEnd', npc, reason: reason || 'end' });
    return true;
  }

  function start(npcId, hint) {
    if (typeof npcId !== 'string') return null;
    const g = deps.getGraph(npcId);
    const info = deps.npcInfo(npcId);
    if (!g || !info) return null;
    if (st.open) close('replaced');
    const t = baseCtx(npcId, hint);
    const nodeId = selectEntry(g, t);
    if (!nodeId) return null;
    const meta = deps.note(npcId, null, true) || {};
    st.open = true;
    st.npc = npcId;
    st.say = '';
    stats.starts++;
    deps.emit({
      type: 'npcTalk', npc: npcId, node: nodeId, first: !!meta.first,
    });
    if (!enter(npcId, nodeId)) {
      close('hata');
      return null;
    }
    if (st.say === 'end') close('end');
    return view();
  }

  function view() {
    if (!st.open) return null;
    const node = deps.getNode(st.node);
    if (!node) return null;
    const info = deps.npcInfo(st.npc) || { id: st.npc, name: st.npc };
    const ctx = baseCtx(st.npc);
    const vis = visibleChoices(node, ctx);
    const choices = vis.map((v, i) => {
      const o = { n: i + 1, t: v.c.t, enabled: v.enabled };
      if (!v.enabled) o.why = needWhy(v.c.need);
      return o;
    });
    return {
      type: 'dialogue',
      npc: {
        id: info.id, name: info.name, title: info.title || '', kind: info.kind || '', species: info.species || 'insan',
      },
      node: node.id,
      lines: node.lines.slice(),
      choices,
      msg: st.msg,
      mood: node.mood,
      version: st.version,
    };
  }

  function choose(n) {
    if (!st.open || st.busy) return { ok: false, ended: !st.open, reason: 'kapali', view: view() };
    const node = deps.getNode(st.node);
    if (!node) {
      close('hata');
      return { ok: false, ended: true, reason: 'hata', view: null };
    }
    const ctx = baseCtx(st.npc);
    const vis = visibleChoices(node, ctx);
    const k = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0;
    if (k < 1 || k > vis.length) {
      stats.invalid++;
      return { ok: false, ended: false, reason: 'gecersiz', view: view() };
    }
    const pick = vis[k - 1];
    if (!pick.enabled) {
      stats.invalid++;
      st.msg = needWhy(pick.c.need);
      bump();
      return { ok: false, ended: false, reason: 'pasif', view: view() };
    }
    const c = pick.c;
    st.busy = true;
    let d = { msg: '', abort: '', end: false };
    if (c.act) {
      const res = runEffects(c.act, st.npc, st.node);
      d = digest(res, c.act);
    }
    if (d.abort) {
      st.busy = false;
      st.msg = d.abort;
      stats.aborted++;
      bump();
      return { ok: false, ended: false, reason: 'efekt', view: view() };
    }
    stats.chosen++;
    if (c.goto === 'end' || d.end) {
      const say = c.say || '';
      const npc = st.npc;
      st.msg = d.msg;
      close('end');
      return {
        ok: true, ended: true, say, msg: d.msg, npc, view: null,
      };
    }
    const nextNode = enter(st.npc, c.goto);
    st.busy = false;
    if (!nextNode) {
      close('hata');
      return { ok: false, ended: true, reason: 'hata', view: null };
    }
    if (d.msg && !st.msg) {
      st.msg = d.msg;
      bump();
    }
    if (st.say === 'end') {
      close('end');
      return { ok: true, ended: true, view: null };
    }
    return { ok: true, ended: false, view: view() };
  }

  return {
    start,
    choose,
    close,
    view,
    isOpen: () => st.open,
    npcId: () => st.npc,
    nodeId: () => st.node,
    stats,
    state: st,
  };
}

export { PHASES as DIALOGUE_PHASES };
