/*
 * KEŞİF props sistemi — EFEKT yürütücüsü. PropWorld.use()/tick() çıktısı efektleri oyuna uygular (sim/props/propBehaviors.js sözlüğü):
 *   sound → G.sound        particles → G.fx          message → say() (HUD ipucu + onSpeak)    giveItem → envanter (taşan yere düşer)
 *   spawn → G.em.spawn     setBlock → G.world.setBlock (kayıtlı)       dialog → olay 'propDialog' {npc,node}
 *   openUi → olay 'propUi' {ui,…yük}   lock → olay 'propLock' {lockId,op}   setProp → G.props.setState(id,state)   emit → G.emit(evt)
 *   dimension → G.dimensionOp(op) varsa onu çağırır, yoksa olay 'dimensionOp' {op:'back'|'home'} yayar (dimrt dinler/yürütür)
 * Yürütücü hata fırlatmaz: bozuk efekt atlanır. Bilinmeyen tür yok sayılır.
 */
import { ITEMS } from '../sim/items.js';

const _pos = { x: 0, y: 0, z: 0 };

function posOf(e) {
  if (Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.z)) {
    _pos.x = e.x; _pos.y = e.y; _pos.z = e.z;
    return _pos;
  }
  return undefined;
}

/**
 * @param {object} G   oyun bağlamı
 * @param {Array} effects  efekt dizisi
 * @param {{say?:(text:string)=>void}} [ctx]  say: ileti gösterici (blocks sistemi kendi ipucunu verir); yoksa G.hud.hint + G.speak
 * @returns {number} uygulanan efekt sayısı
 */
export function runPropEffects(G, effects, ctx) {
  if (!effects || effects.length === 0) return 0;
  const say = ctx && typeof ctx.say === 'function' ? ctx.say : (t) => {
    if (G.hud) G.hud.hint = t;
    if (typeof G.speak === 'function') G.speak(t);
  };
  let n = 0;
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (!e || typeof e.kind !== 'string') continue;
    try {
      switch (e.kind) {
        case 'sound':
          if (typeof G.sound === 'function' && typeof e.name === 'string') G.sound(e.name, posOf(e), { vol: 0.8 });
          break;
        case 'particles':
          if (typeof G.fx === 'function') G.fx(e.fx, e.x, e.y, e.z, e.color);
          break;
        case 'message':
          if (typeof e.text === 'string' && e.text) say(e.text);
          break;
        case 'giveItem': {
          const cnt = Math.floor(e.count === undefined ? 1 : e.count);
          if (G.inventory && typeof e.item === 'string' && ITEMS[e.item] && cnt > 0) {
            const left = G.inventory.add(e.item, cnt);
            if (left > 0 && G.em && typeof G.em.spawnItem === 'function' && G.body) G.em.spawnItem(e.item, left, G.body.x, G.body.y + 0.6, G.body.z);
            G.emit({ type: 'itemPickedUp', item: e.item, count: cnt - (left > 0 ? left : 0), source: 'prop' });
          }
          break;
        }
        case 'spawn':
          if (G.em && typeof G.em.spawn === 'function') G.em.spawn(e.type, e.x, e.y, e.z, e.opts);
          break;
        case 'setBlock':
          if (G.world && Number.isInteger(e.x) && Number.isInteger(e.y) && Number.isInteger(e.z) && Number.isInteger(e.id)) {
            G.world.setBlock(e.x, e.y, e.z, e.id);
          }
          break;
        case 'dialog':
          G.emit({ type: 'propDialog', npc: e.npc, node: e.node });
          break;
        case 'openUi': {
          const evt = { type: 'propUi' };
          Object.keys(e).forEach((k) => { if (k !== 'kind') evt[k] = e[k]; });
          G.emit(evt);
          break;
        }
        case 'lock':
          G.emit({ type: 'propLock', lockId: e.lockId, op: e.op });
          break;
        case 'setProp':
          if (G.props && typeof G.props.setState === 'function') G.props.setState(e.id, e.state);
          break;
        case 'emit':
          if (e.evt && typeof e.evt.type === 'string') G.emit(e.evt);
          break;
        case 'dimension':
          if (e.op === 'back' || e.op === 'home') {
            if (typeof G.dimensionOp === 'function') G.dimensionOp(e.op);
            else G.emit({ type: 'dimensionOp', op: e.op });
          }
          break;
        default:
          continue;
      }
      n++;
    } catch (err) {
      if (G.opts && G.opts.strictSystems) throw err;
    }
  }
  return n;
}
