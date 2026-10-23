/*
 * KEŞİF sim/city/ped — npc_vendors testleri için ORTAK DÜZENEK (yalnız test dosyaları içe aktarır).
 *   makeTalkKit(opts?) → {talk, city, inv, wallet, events, drops, hints, healed, env, clock}
 *      GERÇEK Inventory + createWallet + createNpcTalk (gerçek diyalog verisi). opts: {kredi, city, phase, rain, items:[[key,n]]}
 */
import { Inventory } from '../../inventory.js';
import { createNpcTalk } from './npcTalk.js';
import { createWallet } from './npcSave.js';

export function makeTalkKit(o) {
  const opts = o || {};
  const city = opts.city || {};
  if (opts.kredi !== undefined) city.kredi = opts.kredi;
  const events = [];
  const drops = [];
  const hints = [];
  const healed = [];
  const inv = new Inventory();
  (opts.items || []).forEach((p) => inv.add(p[0], p[1]));
  const wallet = createWallet(() => city, (e) => events.push(e));
  const env = { phase: opts.phase || 'gunduz', rain: !!opts.rain, dist: opts.dist || 'merkez' };
  const clock = { n: 0 };
  const talk = createNpcTalk({
    city: () => city,
    inv,
    wallet,
    emit: (e) => events.push(e),
    env: () => env,
    day: () => clock.n,
    drop: (item, n) => drops.push([item, n]),
    hintText: (t) => hints.push(t),
    heal: (hp, food) => { healed.push([hp, food]); return true; },
  });
  return {
    talk, city, inv, wallet, events, drops, hints, healed, env, clock,
  };
}
