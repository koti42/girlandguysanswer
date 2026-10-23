/*
 * KEŞİF sim/city/hack — üç saf mini oyun makinesinin ortak girişi (sözleşme §1.9: Spike YOK; doğrudan simon / levers / dice).
 *
 *   HACK_GAMES                 ['simon','levers','dice']
 *   HACK_INFO[game]            {name, short, how[]}  Türkçe ad ve nasıl oynanır satırları (arayüz + ekran okuyucu)
 *   createHack({game, seed, tier, accessibility?}) → makine | null
 *   restoreHack(saved) → makine | null          (saved = makine.serialize() çıktısı; güvensiz girdi null döner)
 *   hackSpec(game, seed, tier) → spec | null    (makine kurmadan saf spec)
 * Ortak makine yüzeyi: kind · tier · spec · status ('running'|'won'|'lost') · phase · tick(dt) · view() · serialize()
 * (oyun başına girdi yöntemleri: simon press/replay · levers press/reset · dice set/step/submit).
 */
import { createSimon, restoreSimon, simonSpec } from './simon.js';
import { createLevers, leversSpec, restoreLevers } from './levers.js';
import { createDice, diceSpec, restoreDice } from './dice.js';

export const HACK_GAMES = Object.freeze(['simon', 'levers', 'dice']);

export const HACK_INFO = Object.freeze({
  simon: Object.freeze({
    name: 'Rün Dizisi',
    short: 'Gösterilen rünleri aynı sırayla tekrarla.',
    how: Object.freeze([
      'Rünler sırayla yanar: her rünün rengi, şekli ve sesi farklıdır.',
      'Dizi bitince aynı sırayla bas. Her turda dizi bir rün uzar.',
      'Yanlış basarsan kilit 20 saniye dinlenir; sonra yeniden denersin.',
    ]),
  }),
  levers: Object.freeze({
    name: 'Renk Kolları',
    short: 'Kolları hedef desene ulaştır.',
    how: Object.freeze([
      'Bir kolu çekmek o kolu ve ona bağlı kolları bir adım ilerletir.',
      'Bağlantılar her kolun altında yazılıdır; hedef desen yanında görünür.',
      'Takılırsan Sıfırla düğmesi kolları başa alır.',
    ]),
  }),
  dice: Object.freeze({
    name: 'Zar Mantığı',
    short: 'İpuçlarına uyan tek zar dizisini bul.',
    how: Object.freeze([
      'Zar atılmaz: ipuçlarından zarların değerini çıkar.',
      'Bir zarın yüzünü değiştirmek için ona dokun, sonra Doğrula de.',
      'Yanlış doğrulamada hangi ipuçlarının tutmadığı gösterilir.',
    ]),
  }),
});

export function createHack(opts) {
  const o = opts || {};
  switch (o.game) {
    case 'simon': return createSimon(o);
    case 'levers': return createLevers(o);
    case 'dice': return createDice(o);
    default: return null;
  }
}

export function restoreHack(saved) {
  if (!saved || typeof saved !== 'object') return null;
  switch (saved.kind) {
    case 'simon': return restoreSimon(saved);
    case 'levers': return restoreLevers(saved);
    case 'dice': return restoreDice(saved);
    default: return null;
  }
}

export function hackSpec(game, seed, tier) {
  switch (game) {
    case 'simon': return simonSpec(seed, tier);
    case 'levers': return leversSpec(seed, tier);
    case 'dice': return diceSpec(seed, tier);
    default: return null;
  }
}
