/*
 * KEŞİF sim/city/ped — 16 SAHİP DİYALOG GRAFI (npc_vendors). ownerData satırları (selam/sohbet/yağmur/gece/ipucu/veda) + dialogueOwnerText kişisel satırları.
 *
 * Her sahip aynı iskeleti taşır (düğüm kimliği `<sahip>.<yerel>`):
 *   root (selam) ─ chat (sohbet) ─ about → about2 ─ friend (ilişki ≥3, bir kez +10 Kredi) · joke → punch · work (hizmet + hediye)
 *            └ tip (ipucu) → tip2 · rainy (yağmur) · nighty (gece) · bye (veda)
 * Giriş (propDialog `node` ipucu): sohbet→chat · ipucu→tip · yağmur→rainy · gece→nighty · veda→bye · selam/yok→root.
 * Her düğümde çıkış seçeneği var; seçenek ≤4, ≤34 kr. Hediye: bir kez (bayrak `g_<sahip>`), çanta doluysa yere düşer. Satıcı: {k:'vendor'} efekti.
 */
import { OWNERS, ownerLine } from '../ownerData.js';
import {
  bye, ch, graph, nd,
} from './dialogueKit.js';
import { OWNER_TEXT } from './dialogueOwnerText.js';

const back = ch('Geri dön', 'root');

function ownerGraph(o) {
  const t = OWNER_TEXT[o.id];
  const line = (k) => ownerLine(o, k);
  const farewell = ch('Hoşça kal', 'end', { say: line('veda') });
  const giftFlag = 'g_' + o.id;
  const friendFlag = 'f_' + o.id;
  const workChoices = [];
  if (t.service) {
    workChoices.push(t.service.end
      ? ch(t.service.label, 'end', { act: t.service.act, need: t.service.need, say: t.service.line })
      : ch(t.service.label, 'service', { act: t.service.act, need: t.service.need }));
  }
  workChoices.push(ch(t.gift[1], 'gift', { c: { no: giftFlag } }));
  workChoices.push(back);
  workChoices.push(bye());
  const nodes = {
    root: nd(line('selam'), [
      ch('Biraz sohbet edelim', 'chat'),
      ch('Ne önerirsin?', 'tip'),
      ch('Alışverişe bakayım', 'end', { act: [{ k: 'vendor', id: o.id }], say: 'İyi alışverişler!' }),
      farewell,
    ], { mood: 'selam' }),
    chat: nd(line('sohbet'), [
      ch('Burası hakkında anlat', 'about'),
      ch('Bir şaka yap', 'joke'),
      ch('Ne iş yaparsın?', 'work'),
      bye(),
    ]),
    about: nd(t.about[0], [ch('Devam et', 'about2'), back, bye()]),
    about2: nd(t.about[1], [ch('Bir sır söyler misin?', 'friend', { c: { rel: 3 } }), ch('Ne iş yaparsın?', 'work'), back, bye()]),
    friend: nd(t.friend, [ch('Teşekkürler', 'root'), bye()], {
      act: [{ k: 'kredi', n: 10 }, { k: 'flag', key: friendFlag, v: true }], once: true, mood: 'dost',
    }),
    joke: nd(t.joke[0], [ch('Devam et', 'punch'), back, bye()], { mood: 'neşe' }),
    punch: nd(t.joke[1], [ch('Ha ha, güzeldi!', 'root', { act: [{ k: 'rel', d: 1 }] }), bye()], { mood: 'neşe' }),
    work: nd(t.work, workChoices),
    gift: nd(t.gift[0], [ch('Çok teşekkürler!', 'root'), bye()], {
      act: [{ k: 'give', item: t.gift[2], n: t.gift[3] }, { k: 'flag', key: giftFlag, v: true }], once: true, mood: 'dost',
    }),
    tip: nd(line('ipucu'), [ch('Başka ipucu var mı?', 'tip2'), ch('Teşekkürler', 'root'), bye()]),
    tip2: nd(t.tip2, [back, bye()], { act: [{ k: 'hint', id: 'kredi' }] }),
    rainy: nd(line('yagmur'), [ch('Merhaba!', 'root'), ch('Biraz sohbet edelim', 'chat'), bye()], { mood: 'yagmur' }),
    nighty: nd(line('gece'), [ch('Merhaba!', 'root'), ch('Biraz sohbet edelim', 'chat'), bye()], { mood: 'gece' }),
    bye: nd(line('veda'), [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  };
  if (t.service && !t.service.end) nodes.service = nd(t.service.line, [back, bye()], { mood: 'dost' });
  return graph(o.id, {
    entry: [
      [{ hint: 'sohbet' }, 'chat'], [{ hint: 'ipucu' }, 'tip'], [{ hint: 'yagmur' }, 'rainy'], [{ hint: 'gece' }, 'nighty'], [{ hint: 'veda' }, 'bye'],
    ],
    nodes,
  });
}

export const OWNER_GRAPHS = Object.freeze(OWNERS.map(ownerGraph));
