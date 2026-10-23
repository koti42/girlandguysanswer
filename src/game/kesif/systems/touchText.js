/*
 * KEŞİF — dokunmatik metin uyarlaması (saf): görev/ipucu metinlerindeki klavye-fare deyimlerini ("sol tık", "R tuşu", "Shift")
 * ekrandaki gerçek düğme adlarına çevirir (düğme adları: "Kır veya saldır", "Yerleştir veya kullan", "Üret", "Harita", "Çömel").
 * Yeni oyuncunun ilk ipucu "sol tık" diyorsa dokunmatik cihazda ne yapacağını bilemez.
 *
 *   touchify(text) → string            (klavye/fare dışı metne dokunmaz; idempotent)
 *   isTouchG(G) → bool                 G.input.isTouch ya da G.inputState.touch
 */
const USE = 'Yerleştir/Kullan düğmesine bas';

const RULES = [
  [/Sol tık mavi, sağ tık turuncu portal açar \(dokunmatik: portal düğmesi sırayla ikisini açar\)/g, 'Portal düğmesi sırayla mavi ve turuncu portal açar'],
  [/kır düğmesini \(sol tık\) basılı tut/g, 'Kır düğmesine basılı tut'],
  [/R tuşuna bas \(dokunmatikte Üret düğmesi\); Envanter \(E\) içindeki/g, 'Üret düğmesine bas; Envanter içindeki'],
  [/ \(ya da Yerleştir düğmesi\)/g, ''],
  [/tezgaha sağ tıklayıp/g, 'tezgaha bakıp Yerleştir/Kullan düğmesine basarak'],
  [/hedef bloğa sağ tıkla/g, 'hedef bloğa bakıp ' + USE],
  [/bir hedefe sağ tıkla/g, 'bir hedefe bakıp ' + USE],
  [/\bseç ve kullan \(sağ tık\)/g, 'seç ve ' + USE],
  [/\bseç ve sağ tıkla/g, 'seç ve ' + USE],
  [/Sağ tıkla aç ve kapat/g, 'Yerleştir/Kullan düğmesiyle aç ve kapat'],
  [/Sağ tıkla: büyü at/g, 'Yerleştir/Kullan düğmesiyle büyü at'],
  [/(\p{L}+) sağ tıkla\b/gu, '$1 bakıp ' + USE],
  [/\bdokun\/tıkla/g, 'dokun'],
  [/; Shift \+ tık hızlı taşır/g, ''],
  [/Koş \(Shift\)/g, 'Koş (joystick\'i sonuna kadar it)'],
  [/Haritanı \(Tab\) aç/g, 'Haritanı (Harita düğmesi) aç'],
  [/Çömelerek \(Shift\)/g, 'Çömelerek (Çömel düğmesi)'],
  [/sol tıkı basılı tut/g, 'Kır düğmesine basılı tut'],
];

export function touchify(text) {
  if (typeof text !== 'string' || text === '') return text;
  let out = text;
  for (let i = 0; i < RULES.length; i++) out = out.replace(RULES[i][0], RULES[i][1]);
  return out;
}

export function isTouchG(G) {
  return !!(G && ((G.input && G.input.isTouch === true) || (G.inputState && G.inputState.touch)));
}
