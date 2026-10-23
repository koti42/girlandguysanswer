import { describe, expect, it } from 'vitest';
import {
  ALL_NODE_IDS, DIALOGUES, entryNode, getGraph, getNode, validateDialogues,
} from './dialogueData.js';
import { LIMITS } from './dialogueKit.js';
import {
  NPCS, NPC_HINTS, OWNER_NPCS, STREET_NPCS, getNpc,
} from './npcData.js';
import { evalCond } from './dialogueEngine.js';
import { validateEffect } from './npcEffects.js';
import { OWNERS, ownerLine, splitLine } from '../ownerData.js';
import { OWNER_TEXT } from './dialogueOwnerText.js';
import { ITEMS } from '../../items.js';
import { foldTr, scanText } from '../citySafeData.js';
import { mulberry32 } from '../../rng.js';

const MISSIONS = ['nm_ilk_surus', 'nm_ilk_teslimat', 'nm_yaris_bronz', 'nm_cip_10', 'nm_graffiti_5', 'nm_cati_parkur', 'nm_fotograf', 'nm_taksi_5', 'nm_robot_10',
  'nm_gizli_oda', 'nm_garaj_boya', 'nm_portal_yumurtasi'];

function allEffects() {
  const out = [];
  ALL_NODE_IDS.forEach((id) => {
    const n = getNode(id);
    (n.act || []).forEach((e) => out.push([id, e]));
    n.choices.forEach((c) => (c.act || []).forEach((e) => out.push([id, e])));
  });
  return out;
}

describe('diyalog verisi: yapı', () => {
  it('46 NPC (16 sahip + 30 sokak) için graf var; düğüm kimliği npc.yerel; root var', () => {
    expect(OWNER_NPCS).toHaveLength(16);
    expect(STREET_NPCS).toHaveLength(30);
    expect(Object.keys(DIALOGUES).sort()).toEqual(NPCS.map((n) => n.id).sort());
    NPCS.forEach((n) => {
      const g = getGraph(n.id);
      expect(g, n.id).toBeTruthy();
      expect(g.nodes[n.id + '.root'], n.id).toBeTruthy();
      Object.keys(g.nodes).forEach((id) => {
        expect(id.indexOf(n.id + '.')).toBe(0);
        expect(g.nodes[id].npc).toBe(n.id);
        expect(getNode(id)).toBe(g.nodes[id]);
      });
    });
    expect(ALL_NODE_IDS.length).toBeGreaterThanOrEqual(400);
    expect(getNode('yok.root')).toBe(null);
    expect(getNode(5)).toBe(null);
    expect(getGraph('__proto__')).toBe(null);
  });

  it('validateDialogues boş: her goto çözülür, çıkmaz yok, uzunluklar, erişilebilirlik, efekt/koşul biçimleri', () => {
    expect(validateDialogues()).toEqual([]);
  });

  it('her düğümde çıkış var; seçenek ≤6 bildirilmiş, GÖRÜNÜR ≤4 (rastgele bağlam fuzz); satır ≤34 (≤2 satır), tek satır ≤60', () => {
    const rnd = mulberry32(2024);
    const flagsPool = ['g_kerem', 'f_kerem', 'host_gift', 'k_alp', 'q_x'];
    ALL_NODE_IDS.forEach((id) => {
      const n = getNode(id);
      expect(n.choices.some((c) => c.goto === 'end'), id).toBe(true);
      expect(n.text.length, id).toBeLessThanOrEqual(LIMITS.row);
      expect(n.lines.length, id).toBeLessThanOrEqual(2);
      n.lines.forEach((l) => expect(l.length, id).toBeLessThanOrEqual(LIMITS.line));
      expect(n.lines.join(' ')).toBe(n.text);
      n.choices.forEach((c) => expect(c.t.length, id + ' ' + c.t).toBeLessThanOrEqual(LIMITS.choice));
      for (let k = 0; k < 40; k++) {
        const flags = {};
        flagsPool.forEach((f) => { if (rnd() < 0.5) flags[f] = 1; });
        const ctx = {
          flag: (key) => flags[key] || 0,
          item: () => (rnd() < 0.5 ? 5 : 0),
          kredi: Math.floor(rnd() * 100),
          quest: (qid) => ['none', 'active', 'done'][(qid.length + Math.floor(rnd() * 3)) % 3],
          rel: Math.floor(rnd() * 10),
          rain: rnd() < 0.3,
          phase: ['sabah', 'gunduz', 'aksam', 'gece'][Math.floor(rnd() * 4)],
        };
        // aynı görev için üç koşul birbirini dışlamalı: bağlamı sabitle
        const visible = n.choices.filter((c) => !c.cond || evalCond(c.cond, ctx));
        if (n.choices.length <= 4) expect(visible.length).toBeLessThanOrEqual(4);
      }
    });
    // görev üçlüsü: her kök için herhangi bir görev durumunda ≤4 görünür
    ['none', 'active', 'done'].forEach((state) => {
      ALL_NODE_IDS.forEach((id) => {
        const n = getNode(id);
        const ctx = { flag: () => 0, item: () => 5, kredi: 999, quest: () => state, rel: 9, rain: false, phase: 'gunduz' };
        const vis = n.choices.filter((c) => !c.cond || evalCond(c.cond, ctx));
        expect(vis.length, id + ' ' + state).toBeLessThanOrEqual(4);
        expect(vis.length, id + ' ' + state).toBeGreaterThanOrEqual(1);
      });
    });
  });

  it('sahip grafları ownerData satırlarını kullanır (selam kökte, sohbet/ipucu/yağmur/gece/veda düğümlerinde)', () => {
    OWNERS.forEach((o) => {
      const g = getGraph(o.id);
      expect(g.nodes[o.id + '.root'].text).toBe(ownerLine(o, 'selam'));
      expect(g.nodes[o.id + '.chat'].text).toBe(ownerLine(o, 'sohbet'));
      expect(g.nodes[o.id + '.tip'].text).toBe(ownerLine(o, 'ipucu'));
      expect(g.nodes[o.id + '.rainy'].text).toBe(ownerLine(o, 'yagmur'));
      expect(g.nodes[o.id + '.nighty'].text).toBe(ownerLine(o, 'gece'));
      expect(g.nodes[o.id + '.bye'].text).toBe(ownerLine(o, 'veda'));
      expect(g.nodes[o.id + '.root'].lines).toEqual(splitLine(ownerLine(o, 'selam'), 34));
    });
  });

  it('giriş düğümü: propDialog ipucuna göre (sohbet/ipucu/yağmur/gece/veda) ve varsayılan root', () => {
    expect(entryNode('kerem', {})).toBe('kerem.root');
    expect(entryNode('kerem', { hint: 'selam' })).toBe('kerem.root');
    expect(entryNode('kerem', { hint: 'sohbet' })).toBe('kerem.chat');
    expect(entryNode('kerem', { hint: 'ipucu' })).toBe('kerem.tip');
    expect(entryNode('kerem', { hint: 'yagmur' })).toBe('kerem.rainy');
    expect(entryNode('kerem', { hint: 'gece' })).toBe('kerem.nighty');
    expect(entryNode('kerem', { hint: 'veda' })).toBe('kerem.bye');
    expect(entryNode('rehber_zeynep', { hint: 'veda' })).toBe('rehber_zeynep.bye');
    expect(entryNode('yok', {})).toBe(null);
  });
});

describe('diyalog verisi: içerik kuralları', () => {
  it('hediye eşyaları ITEMS\'te var, dimBound değil; sahip başına en çok bir hediye; hediye bayrağı koşulu', () => {
    OWNERS.forEach((o) => {
      const t = OWNER_TEXT[o.id];
      expect(ITEMS[t.gift[2]], o.id).toBeTruthy();
      expect(ITEMS[t.gift[2]].dimBound).toBeUndefined();
      expect(t.gift[3]).toBeGreaterThanOrEqual(1);
      expect(t.gift[3]).toBeLessThanOrEqual(4);
      const work = getNode(o.id + '.work');
      const giftChoice = work.choices.find((c) => c.goto === o.id + '.gift');
      expect(giftChoice.cond).toEqual({ no: 'g_' + o.id });
      expect(getNode(o.id + '.gift').once).toBe(true);
    });
  });

  it('tüm efektler geçerli; give/take eşyaları gerçek; görev kimlikleri bilinen küme; ipucu kimlikleri tablo içinde; kredi hediyeleri küçük', () => {
    let kredi = 0;
    allEffects().forEach(([id, e]) => {
      expect(validateEffect(e), id).toBe(null);
      if (e.k === 'give' || e.k === 'take') expect(ITEMS[e.item], id + ' ' + e.item).toBeTruthy();
      if (e.k === 'mission') expect(MISSIONS, id).toContain(e.id);
      if (e.k === 'hint') expect(NPC_HINTS[e.id], id + ' ' + e.id).toBeTruthy();
      if (e.k === 'kredi' && e.n > 0) { expect(e.n, id).toBeLessThanOrEqual(15); kredi += e.n; }
      if (e.k === 'vendor' && e.id) expect(getNpc(e.id), id).toBeTruthy();
    });
    expect(kredi).toBeGreaterThan(0);
  });

  it('efekt dağılımı: her dış efekt türü (mission job race taxi photo) en az bir yerde; rehberler görev; her satıcı vendor efekti', () => {
    const kinds = new Set(allEffects().map(([, e]) => e.k));
    ['mission', 'job', 'race', 'taxi', 'photo', 'vendor', 'garage', 'give', 'kredi', 'flag', 'rel', 'hint', 'heal'].forEach((k) => expect(kinds.has(k), k).toBe(true));
    NPCS.filter((n) => n.shop).forEach((n) => {
      const g = getGraph(n.id);
      const has = Object.keys(g.nodes).some((id) => g.nodes[id].choices.some((c) => (c.act || []).some((e) => e.k === 'vendor')));
      expect(has, n.id).toBe(true);
    });
    [0, 6].forEach((raceId) => {
      expect(allEffects().some(([, e]) => e.k === 'race' && e.id === raceId)).toBe(true);
    });
  });

  it('görev kapıları: görev başlatan her seçenek `quest none` koşuluyla ya da tek seferlik düğüm arkasındadır', () => {
    ALL_NODE_IDS.forEach((id) => {
      const n = getNode(id);
      n.choices.forEach((c) => {
        if ((c.act || []).some((e) => e.k === 'mission')) {
          // seçenek `accepted`e gider; teklif düğümüne `quest none` koşullu seçenekten girilir
          const entries = ALL_NODE_IDS.map(getNode).filter((m) => m.choices.some((cc) => cc.goto === id));
          expect(entries.length, id).toBeGreaterThan(0);
          const gate = entries.some((m) => m.choices.some((cc) => cc.goto === id && cc.cond && cc.cond.quest && cc.cond.quest[1] === 'none'));
          expect(gate, id).toBe(true);
        }
      });
    });
  });

  it('güvenli içerik: tüm metin, seçenek, veda satırı, ad, unvan, huy ve ipucu tablosu aile dostu (yasak sözcük/gerçek marka yok)', () => {
    const texts = [];
    ALL_NODE_IDS.forEach((id) => {
      const n = getNode(id);
      texts.push(n.text);
      n.choices.forEach((c) => { texts.push(c.t); if (c.say) texts.push(c.say); });
    });
    NPCS.forEach((n) => {
      texts.push(n.name, n.title);
      n.personality.forEach((p) => texts.push(p));
    });
    Object.keys(NPC_HINTS).forEach((k) => texts.push(NPC_HINTS[k]));
    Object.keys(OWNER_TEXT).forEach((k) => {
      const t = OWNER_TEXT[k];
      t.about.concat(t.joke, [t.tip2, t.work, t.friend], t.gift.slice(0, 2)).forEach((s) => texts.push(s));
      if (t.service) texts.push(t.service.label, t.service.line);
    });
    const bad = [];
    texts.forEach((s) => {
      const hits = scanText(s);
      if (hits.length) bad.push(s + ' → ' + hits.map((h) => h.term).join(','));
    });
    expect(bad).toEqual([]);
    expect(texts.length).toBeGreaterThan(800);
  });

  it('aile teması: suç/polis/şiddet/korku çağrışımlı sözcükler (yasak listesi dışında) hiçbir metinde geçmez', () => {
    const theme = /(^|[^a-z])(suc|polis|hirsiz|savas|dusman|kavga|korku|olum|yarali|tehlike|saldir|vur[a-z]*|karanlik sokak|silah)([^a-z]|$)/;
    const bad = [];
    ALL_NODE_IDS.forEach((id) => {
      const n = getNode(id);
      [n.text].concat(n.choices.map((c) => c.t), n.choices.map((c) => c.say || '')).forEach((t) => {
        if (theme.test(foldTr(t))) bad.push(id + ': ' + t);
      });
    });
    Object.keys(OWNER_TEXT).forEach((k) => {
      const t = OWNER_TEXT[k];
      t.about.concat(t.joke, [t.tip2, t.work, t.friend], [t.gift[0]]).forEach((x) => { if (theme.test(foldTr(x))) bad.push(k + ': ' + x); });
    });
    expect(bad).toEqual([]);
  });

  it('ad ve metin tekrarı: NPC adları benzersiz; aynı NPC içinde iki düğüm aynı metni taşımaz (yönlendirme düğümleri hariç)', () => {
    const names = NPCS.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
    NPCS.forEach((n) => {
      const g = getGraph(n.id);
      const seen = new Map();
      Object.keys(g.nodes).forEach((id) => {
        const t = g.nodes[id].text;
        if (seen.has(t)) {
          // yalnız veda/bye düğümleri ortak sözcük kullanabilir
          expect(['bye'].some((w) => id.endsWith('.' + w) || seen.get(t).endsWith('.' + w)), id + ' = ' + seen.get(t)).toBe(true);
        }
        seen.set(t, id);
      });
    });
  });

  it('çocuk bilmeceleri: tam bir doğru cevap, doğru cevap bir kez ödül (once + bayrak), yanlış cevap dönüşlü', () => {
    ['cocuk_alp', 'cocuk_elif'].forEach((id) => {
      const r = getNode(id + '.riddle');
      expect(r.choices).toHaveLength(4);
      expect(r.choices.filter((c) => c.goto === id + '.right')).toHaveLength(1);
      expect(r.choices.filter((c) => c.goto === id + '.wrong')).toHaveLength(2);
      expect(getNode(id + '.right').once).toBe(true);
      expect(getNode(id + '.wrong').choices.some((c) => c.goto === id + '.riddle')).toBe(true);
    });
  });
});
