import { describe, expect, it } from 'vitest';
import {
  NPC_PROP_DEFS, NPC_T0, NPC_TALK_RANGE, installNpcDefs, npcOfT, npcPropId, propDefOfNpc, yawIndex,
} from './cityNpcProps.js';
import { NPCS } from '../sim/city/ped/npcData.js';
import { getPropBehavior, propHint } from '../sim/props/propBehaviors.js';
import { PROP_BY_T } from '../sim/props/propDefs.js';
import { VEHICLE_T0, GARAGE_T } from '../sim/city/vehicle/vehicleProps.js';
import { scanText } from '../sim/city/citySafeData.js';

describe('cityNpcProps: dinamik prop tanımları', () => {
  it('46 tanım (16 sahip + 30 sokak): t aralığı çakışmaz, donmuş, çarpışma kutusu 1/16 katı, menzil, ad güvenli', () => {
    expect(NPC_PROP_DEFS).toHaveLength(NPCS.length);
    expect(NPC_PROP_DEFS).toHaveLength(46);
    const ts = new Set();
    NPC_PROP_DEFS.forEach((d, i) => {
      expect(d.t).toBe(NPC_T0 + i);
      expect(ts.has(d.t)).toBe(false);
      ts.add(d.t);
      expect(Object.isFrozen(d)).toBe(true);
      expect(d.dyn).toBe(true);
      expect(d.interact.kind).toBe('npctalk');
      expect(d.interact.range).toBe(NPC_TALK_RANGE);
      expect(d.name).toBe(NPCS[i].name);
      d.colliders.forEach((b) => b.forEach((v) => expect(Math.abs((v * 16) % 1)).toBe(0)));
      expect(scanText(d.name + ' ' + d.interact.prompt)).toEqual([]);
      expect(PROP_BY_T[d.t], 'sabit tanımlarla çakışma').toBeUndefined();
      expect(propDefOfNpc(d.t)).toBe(d);
      expect(npcOfT(d.t)).toBe(NPCS[i]);
    });
    expect(NPC_T0).toBeGreaterThan(GARAGE_T);
    expect(NPC_T0).toBeGreaterThan(VEHICLE_T0 + 10);
    expect(npcOfT(NPC_T0 - 1)).toBe(null);
    expect(npcOfT(NPC_T0 + 46)).toBe(null);
    expect(npcOfT(NaN)).toBe(null);
    expect(propDefOfNpc(5)).toBe(null);
  });

  it('çocuk kutusu alçak; yetişkin 1,8 m', () => {
    const kid = NPC_PROP_DEFS[NPCS.findIndex((n) => n.id === 'cocuk_alp')];
    const adult = NPC_PROP_DEFS[NPCS.findIndex((n) => n.id === 'rehber_zeynep')];
    expect(kid.colliders[0][4]).toBeLessThan(1.4);
    expect(adult.colliders[0][4]).toBe(1.8125);
  });

  it('installNpcDefs: PropWorld.getDef sarmalanır (bir kez); bilinmeyen t eski davranışa düşer', () => {
    const calls = [];
    const pw = { getDef: (t) => { calls.push(t); return t === 1 ? { t: 1 } : null; } };
    expect(installNpcDefs(pw)).toBe(true);
    expect(installNpcDefs(pw)).toBe(false);
    expect(pw.getDef(NPC_T0).key).toBe('npc_' + NPCS[0].id);
    expect(pw.getDef(1)).toEqual({ t: 1 });
    expect(pw.getDef(999999)).toBe(null);
    expect(calls).toEqual([1, 999999]);
    expect(installNpcDefs(null)).toBe(false);
  });

  it('npcPropId: belirlenimci, tohum+kimlik ayırır, yüksek bit (dinamik küme), benzersiz', () => {
    const a = npcPropId(123, 'kerem');
    expect(a).toBe(npcPropId(123, 'kerem'));
    expect(a).not.toBe(npcPropId(124, 'kerem'));
    expect(a).not.toBe(npcPropId(123, 'tuna'));
    expect(a >>> 31).toBe(1);
    const set = new Set(NPCS.map((n) => npcPropId(99, n.id)));
    expect(set.size).toBe(46);
    expect(yawIndex(0)).toBe(0);
    expect(yawIndex(Math.PI / 2)).toBe(1);
    expect(yawIndex(Math.PI)).toBe(2);
    expect(yawIndex(-Math.PI / 2)).toBe(3);
    expect(yawIndex(7.1)).toBeGreaterThanOrEqual(0);
  });

  it('npctalk davranışı kayıtlı: kullanınca {kind:dialog} efekti; ipucu "Konuş: Ad (Unvan)"', () => {
    const b = getPropBehavior('npctalk');
    expect(b).toBeTruthy();
    const prop = { t: NPC_T0 + 16, id: 5 };
    const r = b.onUse({}, prop, { state: 0 });
    expect(r.effects).toEqual([{ kind: 'dialog', npc: NPCS[16].id, node: 'selam' }]);
    // sahip: yağmurlu/gece konuşması dönüşümlü (çift kullanımda rainy/nighty, tekte selam); sokak NPC'si her zaman selam
    const owner = { t: NPC_T0, id: 9 };
    expect(b.onUse({}, owner, { extra: 0 }, { rain: true }).effects[0].node).toBe('yagmur');
    expect(b.onUse({}, owner, { extra: 1 }, { rain: true }).effects[0].node).toBe('selam');
    expect(b.onUse({}, owner, { extra: 2 }, { night: true }).effects[0].node).toBe('gece');
    expect(b.onUse({}, owner, { extra: 0 }, {}).effects[0].node).toBe('selam');
    expect(b.onUse({}, owner, { extra: 0 }, { rain: true, night: true }).effects[0].node).toBe('yagmur');
    expect(b.onUse({}, prop, { extra: 0 }, { rain: true }).effects[0].node).toBe('selam');
    expect(b.onUse({}, owner, { extra: 0 }, null).effects[0].node).toBe('selam');
    expect(b.onUse({}, owner, { extra: 0 }, { rain: true }).extra).toBe(1);
    expect(b.onUse({}, { t: 5, id: 1 }, {}).effects).toEqual([]);
    const def = NPC_PROP_DEFS[16];
    expect(propHint(def, { state: 0 }, prop, {})).toBe('Konuş: ' + NPCS[16].name + ' (' + NPCS[16].title + ')');
    expect(b.hint({}, { t: 3 })).toBe('Konuş');
  });
});
