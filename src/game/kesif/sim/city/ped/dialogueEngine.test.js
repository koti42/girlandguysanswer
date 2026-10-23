import { describe, expect, it } from 'vitest';
import {
  createDialogueRunner, evalCond, needWhy, selectEntry,
} from './dialogueEngine.js';
import { makeTalkKit } from './npcTestKit.js';
import { ALL_NODE_IDS, DIALOGUES, getNode } from './dialogueData.js';
import { NPCS } from './npcData.js';
import { getFlag, setFlag, npcRel, npcVisits } from './npcSave.js';
import { mulberry32 } from '../../rng.js';

describe('evalCond: koşullar', () => {
  const ctx = {
    flag: (k) => ({ a: 1, b: 3 }[k] || 0), item: (k) => (k === 'item:elma' ? 4 : 0), kredi: 20, quest: (id) => (id === 'q1' ? 'active' : 'none'),
    phase: 'gece', rain: true, rel: 2, visits: 3, first: false, dist: 'merkez', hint: 'ipucu',
  };
  it('tek alanlar', () => {
    expect(evalCond(null, ctx)).toBe(true);
    expect(evalCond(undefined, ctx)).toBe(true);
    expect(evalCond({}, ctx)).toBe(true);
    expect(evalCond(true, ctx)).toBe(true);
    expect(evalCond(false, ctx)).toBe(false);
    expect(evalCond({ flag: 'a' }, ctx)).toBe(true);
    expect(evalCond({ flag: 'z' }, ctx)).toBe(false);
    expect(evalCond({ flag: ['b', 3] }, ctx)).toBe(true);
    expect(evalCond({ flag: ['b', 4] }, ctx)).toBe(false);
    expect(evalCond({ no: 'z' }, ctx)).toBe(true);
    expect(evalCond({ no: 'a' }, ctx)).toBe(false);
    expect(evalCond({ item: 'item:elma' }, ctx)).toBe(true);
    expect(evalCond({ item: 'item:elma', n: 4 }, ctx)).toBe(true);
    expect(evalCond({ item: 'item:elma', n: 5 }, ctx)).toBe(false);
    expect(evalCond({ kredi: 20 }, ctx)).toBe(true);
    expect(evalCond({ kredi: 21 }, ctx)).toBe(false);
    expect(evalCond({ quest: ['q1', 'active'] }, ctx)).toBe(true);
    expect(evalCond({ quest: ['q1', 'done'] }, ctx)).toBe(false);
    expect(evalCond({ quest: ['q2', 'none'] }, ctx)).toBe(true);
    expect(evalCond({ phase: ['gece', 'aksam'] }, ctx)).toBe(true);
    expect(evalCond({ phase: ['sabah'] }, ctx)).toBe(false);
    expect(evalCond({ rain: true }, ctx)).toBe(true);
    expect(evalCond({ rain: false }, ctx)).toBe(false);
    expect(evalCond({ rel: 2 }, ctx)).toBe(true);
    expect(evalCond({ rel: 3 }, ctx)).toBe(false);
    expect(evalCond({ visits: 3 }, ctx)).toBe(true);
    expect(evalCond({ first: true }, ctx)).toBe(false);
    expect(evalCond({ first: false }, ctx)).toBe(true);
    expect(evalCond({ dist: 'merkez' }, ctx)).toBe(true);
    expect(evalCond({ dist: 'tepe' }, ctx)).toBe(false);
    expect(evalCond({ hint: 'ipucu' }, ctx)).toBe(true);
    expect(evalCond({ hint: 'veda' }, ctx)).toBe(false);
  });
  it('and / or / not, alanlar VE\'lenir, derinlik sınırı, bozuk girdi güvenli', () => {
    expect(evalCond({ flag: 'a', rain: true }, ctx)).toBe(true);
    expect(evalCond({ flag: 'a', rain: false }, ctx)).toBe(false);
    expect(evalCond({ and: [{ flag: 'a' }, { rel: 2 }] }, ctx)).toBe(true);
    expect(evalCond({ and: [{ flag: 'a' }, { rel: 9 }] }, ctx)).toBe(false);
    expect(evalCond({ or: [{ flag: 'z' }, { rel: 2 }] }, ctx)).toBe(true);
    expect(evalCond({ or: [{ flag: 'z' }, { rel: 9 }] }, ctx)).toBe(false);
    expect(evalCond({ not: { flag: 'z' } }, ctx)).toBe(true);
    expect(evalCond({ not: { flag: 'a' } }, ctx)).toBe(false);
    let deep = { flag: 'a' };
    for (let i = 0; i < 12; i++) deep = { and: [deep] };
    expect(evalCond(deep, ctx)).toBe(false);
    expect(evalCond('x', ctx)).toBe(false);
    expect(evalCond({ quest: ['q1', 'bilinmez'] }, {})).toBe(false);
    expect(evalCond({ flag: 'a' }, {})).toBe(false);
    expect(evalCond({ item: 'x' }, null)).toBe(false);
    expect(evalCond({ kredi: 0 }, {})).toBe(true);
  });
  it('needWhy: pasif seçenek nedeni', () => {
    expect(needWhy({ kredi: 10 })).toContain('10');
    expect(needWhy({ item: 'x' })).toContain('eşya');
    expect(needWhy({ flag: 'x' })).toContain('Önce');
    expect(needWhy(null)).toBe('Şu an olmaz.');
  });
  it('selectEntry: ilk koşulu sağlayan; hiçbiri yoksa sonuncu', () => {
    const g = { entry: [{ cond: { hint: 'a' }, node: 'x.a' }, { cond: { rain: true }, node: 'x.r' }, { cond: null, node: 'x.root' }] };
    expect(selectEntry(g, { hint: 'a' })).toBe('x.a');
    expect(selectEntry(g, { rain: true })).toBe('x.r');
    expect(selectEntry(g, {})).toBe('x.root');
    expect(selectEntry({ entry: [] }, {})).toBe(null);
    expect(selectEntry(null, {})).toBe(null);
  });
});

describe('diyalog akışı (gerçek veri)', () => {
  it('başlat → görünüm düz JSON; seçenekler 1..n; sohbet; geri dön; çıkış; olaylar', () => {
    const k = makeTalkKit();
    const v = k.talk.start('kerem');
    expect(v).toMatchObject({ type: 'dialogue', node: 'kerem.root', npc: { id: 'kerem', name: 'Kerem' } });
    expect(v.lines.length).toBeGreaterThanOrEqual(1);
    expect(v.choices.map((c) => c.n)).toEqual([1, 2, 3, 4]);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    expect(k.talk.runner.isOpen()).toBe(true);
    expect(k.events.map((e) => e.type)).toEqual(expect.arrayContaining(['npcTalk', 'dialogueNode']));
    expect(k.events.find((e) => e.type === 'npcTalk')).toMatchObject({ npc: 'kerem', first: true });
    let r = k.talk.choose(1); // sohbet
    expect(r.ok).toBe(true);
    expect(r.view.node).toBe('kerem.chat');
    r = k.talk.choose(1); // hakkında
    expect(r.view.node).toBe('kerem.about');
    r = k.talk.choose(2); // geri dön
    expect(r.view.node).toBe('kerem.root');
    r = k.talk.choose(4); // hoşça kal
    expect(r).toMatchObject({ ok: true, ended: true });
    expect(r.say.length).toBeGreaterThan(0);
    expect(k.talk.runner.isOpen()).toBe(false);
    expect(k.talk.view()).toBe(null);
    expect(k.events.find((e) => e.type === 'dialogueEnd')).toMatchObject({ npc: 'kerem', reason: 'end' });
    expect(npcVisits(k.city, 'kerem')).toBe(1);
    expect(npcRel(k.city, 'kerem')).toBe(1);
  });

  it('geçersiz seçim (0, 9, NaN, kesirli) görünümü bozmaz; kapalıyken reddedilir', () => {
    const k = makeTalkKit();
    expect(k.talk.choose(1)).toMatchObject({ ok: false, ended: true, reason: 'kapali' });
    k.talk.start('kerem');
    [0, 5, 99, -1, NaN, Infinity, '1', null, undefined, {}].forEach((n) => {
      const r = k.talk.choose(n);
      expect(r.ok, String(n)).toBe(false);
      expect(r.reason).toBe('gecersiz');
      expect(r.view.node).toBe('kerem.root');
    });
    expect(k.talk.choose(1.9).view.node).toBe('kerem.chat'); // tabana yuvarlanır
    expect(k.talk.runner.stats.invalid).toBeGreaterThanOrEqual(10);
  });

  it('bilinmeyen NPC / geçersiz tür → null; ikinci başlatma ilkini "replaced" ile kapatır', () => {
    const k = makeTalkKit();
    expect(k.talk.start('yok')).toBe(null);
    expect(k.talk.start(5)).toBe(null);
    expect(k.talk.start('__proto__')).toBe(null);
    k.talk.start('kerem');
    k.talk.start('tuna');
    expect(k.talk.runner.npcId()).toBe('tuna');
    expect(k.events.filter((e) => e.type === 'dialogueEnd')).toEqual([{ type: 'dialogueEnd', npc: 'kerem', reason: 'replaced' }]);
  });

  it('propDialog ipucu girişi: yağmur/gece/ipucu/sohbet/veda düğümleri', () => {
    const k = makeTalkKit();
    [['yagmur', 'rainy'], ['gece', 'nighty'], ['ipucu', 'tip'], ['sohbet', 'chat'], ['veda', 'bye'], ['selam', 'root']].forEach(([hint, node]) => {
      const v = k.talk.start('tuna', hint);
      expect(v.node).toBe('tuna.' + node);
      k.talk.close('test');
    });
  });

  it('sokak NPC kadrosu: yağmurda/gece ve ilk konuşma DEĞİLSE tür satırıyla başlar; ilk konuşma her zaman normal selam; veda ipucu önce gelir', () => {
    const k = makeTalkKit();
    k.env.rain = true;
    expect(k.talk.start('rehber_arda').node).toBe('rehber_arda.root'); // ilk konuşma
    k.talk.close('x');
    const v = k.talk.start('rehber_arda');
    expect(v.node).toBe('rehber_arda.rainy');
    expect(v.lines.join(' ')).toContain('Yağmur');
    expect(v.choices.map((c) => c.t)).toEqual(['Merhaba!', 'Hoşça kal']);
    expect(k.talk.choose(1).view.node).toBe('rehber_arda.root');
    k.talk.close('x');
    k.env.rain = false;
    k.env.phase = 'gece';
    expect(k.talk.start('rehber_arda').node).toBe('rehber_arda.nighty');
    k.talk.close('x');
    k.env.phase = 'gunduz';
    expect(k.talk.start('rehber_arda').node).toBe('rehber_arda.root');
    k.talk.close('x');
    k.env.rain = true;
    k.env.phase = 'gece';
    expect(k.talk.start('rehber_arda').node).toBe('rehber_arda.rainy'); // yağmur önce
    k.talk.close('x');
    expect(k.talk.start('rehber_arda', 'veda').node).toBe('rehber_arda.bye'); // veda ipucu önce
    k.talk.close('x');
    // her sokak NPC'sinde iki düğüm var; sahiplerin kendi (ownerData) rainy/nighty düğümleri değişmedi
    NPCS.forEach((n) => {
      expect(getNode(n.id + '.rainy'), n.id).toBeTruthy();
      expect(getNode(n.id + '.nighty'), n.id).toBeTruthy();
    });
  });

  it('hediye: bir kez; bayrak + once; çanta doluysa yere düşer; hediyesiz tekrar görünmez', () => {
    const k = makeTalkKit();
    k.talk.start('tuna');
    k.talk.choose(1); // chat
    let r = k.talk.choose(3); // work
    expect(r.view.node).toBe('tuna.work');
    expect(r.view.choices.map((c) => c.t)).toContain('Devre kartını al');
    r = k.talk.choose(r.view.choices.findIndex((c) => c.t === 'Devre kartını al') + 1);
    expect(r.view.node).toBe('tuna.gift');
    expect(k.inv.count('item:devre_kartı')).toBe(1);
    expect(r.view.msg).toContain('Devre Kartı');
    expect(getFlag(k.city, 'g_tuna')).toBe(1);
    k.talk.choose(1); // root
    k.talk.choose(1); // chat
    r = k.talk.choose(3); // work
    expect(r.view.choices.map((c) => c.t)).not.toContain('Devre kartını al');
    k.talk.close('x');
    // çanta dolu: yere düşer
    const k2 = makeTalkKit();
    for (let i = 0; i < k2.inv.size; i++) k2.inv.slots[i] = { item: 'item:kağıt', count: 64 };
    k2.talk.start('tuna');
    k2.talk.choose(1);
    k2.talk.choose(3);
    k2.talk.choose(1);
    expect(k2.drops.length).toBe(1);
    expect(k2.drops[0][0]).toBe('item:devre_kartı');
  });

  it('hizmet: Dr. Bolt tam bakım Kredi harcar ve iyileştirir; yetersiz Kredide seçenek pasif', () => {
    const k = makeTalkKit({ kredi: 50 });
    k.talk.start('dr_bolt');
    k.talk.choose(1); // chat
    let r = k.talk.choose(3); // work
    const idx = r.view.choices.findIndex((c) => c.t.indexOf('Tam bakım') === 0) + 1;
    expect(r.view.choices[idx - 1].enabled).toBe(true);
    r = k.talk.choose(idx);
    expect(r.ok).toBe(true);
    expect(k.city.kredi).toBe(40);
    expect(k.healed).toEqual([[20, 6]]);
    expect(r.view.node).toBe('dr_bolt.service');
    k.talk.close('x');
    const poor = makeTalkKit({ kredi: 5 });
    poor.talk.start('dr_bolt');
    poor.talk.choose(1);
    const w = poor.talk.choose(3);
    const i2 = w.view.choices.findIndex((c) => c.t.indexOf('Tam bakım') === 0) + 1;
    expect(w.view.choices[i2 - 1]).toMatchObject({ enabled: false });
    expect(w.view.choices[i2 - 1].why).toContain('Kredi');
    const bad = poor.talk.choose(i2);
    expect(bad).toMatchObject({ ok: false, reason: 'pasif' });
    expect(poor.city.kredi).toBe(5);
    expect(poor.healed).toEqual([]);
  });

  it('başarısız take/kredi gezinmeyi İPTAL eder; dış efekt hatası gezinmeyi bozmaz (sentetik graf)', () => {
    const mk = (id, text, choices, extra) => Object.assign({
      id, npc: 'x', text, lines: [text], choices, act: null, cond: null, once: false, mood: 'sakin',
    }, extra || {});
    const ch = (t, goto, act, cond, need) => ({
      t, goto, act: act || null, cond: cond || null, need: need || null, say: null,
    });
    const nodes = {
      'x.root': mk('x.root', 'Merhaba', [
        ch('Öde', 'x.paid', [{ k: 'kredi', n: -20 }]),
        ch('Görev', 'x.job', [{ k: 'mission', id: 'a' }]),
        ch('Al', 'x.taken', [{ k: 'take', item: 'item:elma', n: 1 }]),
        ch('Çık', 'end'),
      ]),
      'x.paid': mk('x.paid', 'Ödendi', [ch('Çık', 'end')]),
      'x.job': mk('x.job', 'Görev', [ch('Çık', 'end')]),
      'x.taken': mk('x.taken', 'Alındı', [ch('Çık', 'end')]),
    };
    const k = makeTalkKit({ kredi: 5 });
    const emitted = [];
    const runner = createDialogueRunner({
      getGraph: () => ({ npc: 'x', entry: [{ cond: null, node: 'x.root' }], nodes }),
      getNode: (id) => nodes[id] || null,
      npcInfo: (id) => ({ id, name: 'X', title: '' }),
      ctx: () => k.talk.ctxFor('x'),
      effects: k.talk.bus,
      fxCtx: (npc, node) => ({ npc: { id: npc }, node }),
      emit: (e) => emitted.push(e),
      note: () => ({ first: true }),
      onceSeen: () => false,
      markOnce: () => true,
    });
    runner.start('x');
    let r = runner.choose(1);
    expect(r).toMatchObject({ ok: false, reason: 'efekt' });
    expect(r.view.node).toBe('x.root');
    expect(r.view.msg).toBe('Yeterli Kredin yok.');
    expect(k.city.kredi).toBe(5);
    r = runner.choose(3);
    expect(r).toMatchObject({ ok: false, reason: 'efekt' });
    expect(r.view.msg).toBe('Yeterli eşyan yok.');
    r = runner.choose(2); // dış efekt: işleyici yok, gezinme sürer
    expect(r.ok).toBe(true);
    expect(r.view.node).toBe('x.job');
    expect(r.view.msg).toBe('Bu iş şimdilik kapalı.');
    expect(runner.stats.aborted).toBe(2);
    k.city.kredi = 30;
    runner.close('x');
    runner.start('x');
    r = runner.choose(1);
    expect(r.ok).toBe(true);
    expect(r.view.node).toBe('x.paid');
    expect(k.city.kredi).toBe(10);
  });

  it('görev efektleri: işleyici yok → "Bu iş şimdilik kapalı."; işleyici var → ileti ve diyalog sürer', () => {
    const k = makeTalkKit();
    k.talk.start('rehber_zeynep');
    let r = k.talk.choose(3); // ilk sürüş (quest none)
    expect(r.view.node).toBe('rehber_zeynep.offer');
    r = k.talk.choose(1);
    expect(r.view.node).toBe('rehber_zeynep.accepted');
    expect(r.view.msg).toBe('Bu iş şimdilik kapalı.');
    k.talk.close('x');
    const seen = [];
    k.talk.bus.on('mission', (e, ctx) => { seen.push([e.id, ctx.npc.id]); return { ok: true, msg: 'Görev başladı: İlk sürüş' }; });
    k.talk.start('rehber_zeynep');
    k.talk.choose(3);
    r = k.talk.choose(1);
    expect(seen).toEqual([['nm_ilk_surus', 'rehber_zeynep']]);
    expect(r.view.msg).toBe('Görev başladı: İlk sürüş');
    // görev etkin bayrağı: teklif yerine durum
    setFlag(k.city, 'q_nm_ilk_surus', 1);
    k.talk.close('x');
    const v = k.talk.start('rehber_zeynep');
    expect(v.choices.map((c) => c.t)).toContain('Görevim nasıl gidiyor?');
    expect(v.choices.map((c) => c.t)).not.toContain('İlk sürüşümü yapayım');
    setFlag(k.city, 'q_nm_ilk_surus', 2);
    k.talk.close('x');
    const v2 = k.talk.start('rehber_zeynep');
    expect(v2.choices.map((c) => c.t)).not.toContain('Görevim nasıl gidiyor?');
    expect(v2.choices.map((c) => c.t)).not.toContain('İlk sürüşümü yapayım');
  });

  it('sağlayıcı: quest() bayrağı ezer', () => {
    const k = makeTalkKit();
    k.talk.setProvider({ quest: (id) => (id === 'nm_ilk_surus' ? 'done' : 'none') });
    const v = k.talk.start('rehber_zeynep');
    expect(v.choices.map((c) => c.t)).not.toContain('İlk sürüşümü yapayım');
    k.talk.setProvider(null);
    k.talk.close('x');
    expect(k.talk.start('rehber_zeynep').choices.map((c) => c.t)).toContain('İlk sürüşümü yapayım');
  });

  it('satıcı efekti: diyalog kapanır, arayüz isteği kuyruğa alınır (vendor/garage); iş panosu dış efekt', () => {
    const k = makeTalkKit();
    k.talk.start('usta_selvi');
    const r = k.talk.choose(3);
    expect(r).toMatchObject({ ok: true, ended: true });
    expect(k.talk.pending).toEqual({ ui: 'vendor', id: 'usta_selvi' });
    k.talk.start('usta_cengiz');
    k.talk.choose(1);
    const w = k.talk.choose(3);
    const idx = w.view.choices.findIndex((c) => c.t === 'Garajı aç') + 1;
    const e = k.talk.choose(idx);
    expect(e.ended).toBe(true);
    expect(k.talk.pending).toEqual({ ui: 'garage' });
    k.talk.start('sule');
    k.talk.choose(1);
    const w2 = k.talk.choose(3);
    const j = w2.view.choices.findIndex((c) => c.t === 'Bir iş istiyorum') + 1;
    const calls = [];
    k.talk.bus.on('job', (ef) => { calls.push(ef.board); return { ok: true }; });
    const jr = k.talk.choose(j);
    expect(jr.ended).toBe(true);
    expect(calls).toEqual(['kurye']);
  });

  it('dostluk: ilişki ≥3 olunca sır açılır, bir kez +10 Kredi; hediye Kredi günlük tavanı', () => {
    const k = makeTalkKit({ kredi: 0 });
    for (let d = 0; d < 3; d++) { k.clock.n = d; k.talk.start('kerem'); k.talk.close('x'); }
    expect(npcRel(k.city, 'kerem')).toBe(3);
    k.talk.start('kerem');
    k.talk.choose(1);
    k.talk.choose(1); // about
    let r = k.talk.choose(1); // about2
    expect(r.view.node).toBe('kerem.about2');
    const idx = r.view.choices.findIndex((c) => c.t === 'Bir sır söyler misin?') + 1;
    expect(idx).toBeGreaterThan(0);
    r = k.talk.choose(idx);
    expect(r.view.node).toBe('kerem.friend');
    expect(k.city.kredi).toBe(10);
    expect(r.view.msg).toContain('Kredi');
    // tekrar girilirse ödül yok (once)
    k.talk.choose(1); // root
    k.talk.choose(1); // chat
    k.talk.choose(1); // about
    k.talk.choose(1); // about2
    k.talk.choose(1); // friend yeniden
    expect(k.city.kredi).toBe(10);
  });

  it('çocuk bilmecesi: doğru cevap +5 Kredi bir kez; yanlış cevapta dönüş', () => {
    const k = makeTalkKit({ kredi: 0 });
    k.talk.start('cocuk_alp');
    let r = k.talk.choose(2); // bilmece
    expect(r.view.choices).toHaveLength(4);
    r = k.talk.choose(2); // yanlış (Yağmur)
    expect(r.view.node).toBe('cocuk_alp.wrong');
    expect(k.city.kredi).toBe(0);
    r = k.talk.choose(1); // tekrar dene
    r = k.talk.choose(1); // doğru (Saat)
    expect(r.view.node).toBe('cocuk_alp.right');
    expect(k.city.kredi).toBe(5);
    expect(getFlag(k.city, 'k_alp')).toBe(1);
    k.talk.choose(1); // root
    k.talk.choose(2); // bilmece
    k.talk.choose(1); // doğru yine
    expect(k.city.kredi).toBe(5);
  });

  it('günlük Kredi hediyesi tavanı (150) ve gün değişince sıfırlanır', () => {
    const k = makeTalkKit({ kredi: 0 });
    const run = (e) => k.talk.bus.runOne(e, { npc: { id: 'kerem' } });
    expect(run({ k: 'kredi', n: 999 }).msg).toContain('+150');
    expect(k.city.kredi).toBe(150);
    expect(run({ k: 'kredi', n: 10 }).msg).toContain('Bugünlük');
    expect(k.city.kredi).toBe(150);
    k.clock.n = 1;
    expect(run({ k: 'kredi', n: 10 }).msg).toBe('+10 Kredi.');
    expect(k.city.kredi).toBe(160);
    expect(run({ k: 'kredi', n: -161 }).ok).toBe(false);
    expect(run({ k: 'kredi', n: -60 }).ok).toBe(true);
    expect(k.city.kredi).toBe(100);
  });

  it('yerleşik işleyiciler: give/take/flag/rel/hint/heal/end', () => {
    const k = makeTalkKit({ items: [['item:elma', 2]] });
    const ctx = { npc: { id: 'kerem' } };
    expect(k.talk.bus.runOne({ k: 'take', item: 'item:elma', n: 3 }, ctx)).toMatchObject({ ok: false, reason: 'yetersiz' });
    expect(k.inv.count('item:elma')).toBe(2);
    expect(k.talk.bus.runOne({ k: 'take', item: 'item:elma', n: 2 }, ctx).ok).toBe(true);
    expect(k.inv.count('item:elma')).toBe(0);
    expect(k.talk.bus.runOne({ k: 'give', item: 'item:yok_eşya', n: 1 }, ctx).ok).toBe(false);
    expect(k.talk.bus.runOne({ k: 'flag', key: 'abc', v: 5 }, ctx).ok).toBe(true);
    expect(k.events.find((e) => e.type === 'npcFlag')).toMatchObject({ key: 'abc', v: 5 });
    expect(k.talk.bus.runOne({ k: 'rel', d: 2 }, ctx).ok).toBe(true);
    expect(npcRel(k.city, 'kerem')).toBe(2);
    expect(k.talk.bus.runOne({ k: 'rel', d: 1 }, {}).ok).toBe(false);
    expect(k.talk.bus.runOne({ k: 'hint', id: 'portal' }, ctx).ok).toBe(true);
    expect(k.hints[0]).toContain('Portal');
    expect(k.talk.bus.runOne({ k: 'hint', id: 'yokbu' }, ctx).ok).toBe(false);
    expect(k.talk.bus.runOne({ k: 'heal', hp: 4 }, ctx).ok).toBe(true);
    expect(k.talk.bus.runOne({ k: 'end' }, ctx).ok).toBe(true);
    expect(k.talk.bus.runOne({ k: 'vendor' }, {}).ok).toBe(false);
    expect(k.talk.bus.runOne({ k: 'vendor', id: 'kerem' }, {}).ok).toBe(true);
    expect(k.talk.pending).toEqual({ ui: 'vendor', id: 'kerem' });
  });
});

describe('diyalog durumu: fuzz ve belirlenimcilik', () => {
  it('rastgele seçim dizileri (geçersiz sayılar dahil) 46 NPC üzerinde asla fırlatmaz; her zaman çıkışla biter', () => {
    const rnd = mulberry32(31337);
    const k = makeTalkKit({ kredi: 500, items: [['item:elma', 10]] });
    let steps = 0;
    let ended = 0;
    for (let round = 0; round < 400; round++) {
      const npc = NPCS[Math.floor(rnd() * NPCS.length)].id;
      k.clock.n = Math.floor(round / 20);
      k.env.rain = rnd() < 0.3;
      k.env.phase = ['sabah', 'gunduz', 'aksam', 'gece'][Math.floor(rnd() * 4)];
      const hints = [undefined, 'selam', 'sohbet', 'ipucu', 'yagmur', 'gece', 'veda', 'x'];
      const v = k.talk.start(npc, hints[Math.floor(rnd() * hints.length)]);
      expect(v).toBeTruthy();
      let guard = 0;
      while (k.talk.runner.isOpen() && guard++ < 60) {
        const view = k.talk.view();
        expect(ALL_NODE_IDS).toContain(view.node);
        expect(view.choices.length).toBeGreaterThanOrEqual(1);
        expect(view.choices.length).toBeLessThanOrEqual(4);
        view.choices.forEach((c, i) => expect(c.n).toBe(i + 1));
        const pick = rnd() < 0.15 ? [0, 9, NaN, -3, 2.5][Math.floor(rnd() * 5)] : 1 + Math.floor(rnd() * view.choices.length);
        const r = k.talk.choose(pick);
        steps++;
        if (r.ended) ended++;
        expect(typeof r.ok).toBe('boolean');
      }
      if (k.talk.runner.isOpen()) {
        // üst sınır aşıldı: çıkış seçeneğini zorla
        const view = k.talk.view();
        const t = getNode(view.node);
        const visible = t.choices.filter(() => true);
        expect(visible.some((c) => c.goto === 'end')).toBe(true);
        k.talk.close('fuzz');
      }
      expect(k.city.kredi).toBeGreaterThanOrEqual(0);
    }
    expect(steps).toBeGreaterThan(400);
    expect(ended).toBeGreaterThan(50);
    expect(Object.keys(k.city.flags || {}).length).toBeLessThanOrEqual(200);
    expect(Object.keys(k.city.npcs).length).toBeLessThanOrEqual(46);
    Object.keys(k.city.npcs).forEach((id) => expect(Object.keys(k.city.npcs[id].s).length).toBeLessThanOrEqual(24));
  });

  it('belirlenimci: aynı seçim dizisi → aynı görünüm dizisi', () => {
    const run = () => {
      const k = makeTalkKit({ kredi: 100 });
      const rnd = mulberry32(5);
      const log = [];
      for (let r = 0; r < 30; r++) {
        const id = NPCS[r % NPCS.length].id;
        log.push(JSON.stringify(k.talk.start(id)));
        let g = 0;
        while (k.talk.runner.isOpen() && g++ < 20) {
          const v = k.talk.view();
          const res = k.talk.choose(1 + Math.floor(rnd() * v.choices.length));
          log.push(JSON.stringify(res.view));
        }
        k.talk.close('x');
      }
      return log.join('\n');
    };
    expect(run()).toBe(run());
  });

  it('her NPC: kökten en çok 4 adımda çıkılabilir (son seçenek çıkışa gider)', () => {
    NPCS.forEach((n) => {
      const g = DIALOGUES[n.id];
      const root = g.nodes[n.id + '.root'];
      expect(root.choices.some((c) => c.goto === 'end'), n.id).toBe(true);
    });
  });
});
