/*
 * KEŞİF sim/city — 16 iç mekân SAHİBİ (Neon Meridyen NPC verisi, saf).
 *
 * Her sahip: ad, huy etiketleri, 6 kısa Türkçe satır (≤60 kr; ≤2×34 kr'a bölünebilir), imza eşya, mod.
 * Satır sırası sabittir (LINE_KINDS): selam, sohbet, yağmur, gece, ipucu, veda. Diyalog düğümü (npc_vendors)
 * `ownerLine(owner,kind)` / `splitLine(text)` ile okur; zamana/yağmura/ilerlemeye göre seçim yine orada yapılır.
 * İç mekân türü anahtarları (`interior`) `sim/city/interior/*` registerInterior kind'ları ile AYNIDIR.
 * Aile dostu, özgün adlar; gerçek kişi/marka yok. `citySafe.test.js` her satırı tarar.
 *
 * API:
 *  OWNERS (16, donmuş) · OWNER_BY_INTERIOR · OWNER_BY_ID · LINE_KINDS · INTERIOR_KINDS · MOOD_HUES · AMBIENT_KEYS
 *  getOwner(id) · ownerForInterior(kind) · ownerLine(owner, kind) · splitLine(text, max?) -> string[]
 *  ownerNodeLines(owner, kind) -> [≤34, ≤34?]
 */

export const LINE_KINDS = Object.freeze(['selam', 'sohbet', 'yagmur', 'gece', 'ipucu', 'veda']);
export const LINE_MAX = 60;
export const NODE_LINE_MAX = 34;

/** 16 iç mekân türü (sözleşme §8; sıra = tasarım tablosu §7.2). */
export const INTERIOR_KINDS = Object.freeze([
  'kapsul_daire', 'loft', 'hacker_odasi', 'oyuncu_odasi', 'ramen_bari', 'klinik', 'garaj_atolyesi', 'kulup',
  'market', 'cati_bahcesi', 'kitap_kafe', 'sanat_studyosu', 'robot_tamirhanesi', 'arcade', 'dron_kurye',
  'holo_sinema',
]);

/** Mood ışık tonları (prop ışık rengi) ve ortam sesi anahtarları (audioCity). */
export const MOOD_HUES = Object.freeze([
  'mor', 'camgobegi', 'mavi', 'yesil', 'pembe', 'kehribar', 'beyaz', 'mint', 'turuncu', 'renkli', 'sicak',
]);
export const AMBIENT_KEYS = Object.freeze([
  'vent', 'sehir_ugultu', 'fan', 'oyun_bip', 'buhar', 'bip', 'pnomatik', 'synthwave', 'market', 'kus_ruzgar',
  'sayfa', 'firca', 'servo', 'chiptune', 'pervane', 'film',
]);

/*
 * [id, ad, unvan, iç mekân, dükkân kimliği, tür, huy[], [renk, ışık 8..14, ortam], imza [anahtar, ad, eşyaAnahtarı,
 * mevcutMu], satırlar[6]]
 */
const RAW = [
  ['nehir_abla', 'Nehir Abla', 'Kapsül sakini', 'kapsul_daire', 'huzur_kapsul', 'insan', ['sakin', 'huzurlu'],
    ['mor', 9, 'vent'], ['calar_saat_robot', 'Çalar Saat Robot', 'item:calar_saat_robot', false], [
      'Hoş geldin, ayakkabıları kapıya bırak.',
      'Raf dar ama huzur geniş.',
      'Yağmurun sesi kapsülde en güzel uyutur.',
      'Gece uzun, çay demli. Otur biraz.',
      'Çalar saat robotum yolu bilir, ona sor.',
      'Yolun açık olsun, kapıyı çekmeyi unutma.',
    ]],
  ['kerem', 'Kerem', 'Loft sahibi', 'loft', 'manzara_loft', 'insan', ['hevesli', 'konuşkan'],
    ['camgobegi', 11, 'sehir_ugultu'], ['cam_durbun', 'Cam Dürbün', 'item:cam_durbun', false], [
      'Vay, misafir! Gel, gel, manzaraya bak!',
      'Manzaraya bak, bedava!',
      'Yağmurda cam başka güzel, bir izle!',
      'Gece şehir bir devre kartı gibi parlıyor.',
      'Dürbünle çatılara bak, bir şeyler saklı.',
      'Yine gel, daha çok manzaram var!',
    ]],
  ['tuna', 'Tuna', 'Kodcu', 'hacker_odasi', 'sifir_bir', 'insan', ['alaycı', 'yardımsever'],
    ['mavi', 8, 'fan'], ['devre_karti', 'Devre Kartı', 'item:devre_kartı', true], [
      'Kapıyı çaldın mı? Neyse, gir, gir.',
      'Kod çözmek kahveden iyi.',
      'Yağmur yağıyor, sunucular mutlu.',
      'Gece mesaisi mi? Ben buna sabah derim.',
      'Zar, kol, rün: hepsi bir bulmaca. İpucu al.',
      'Git bakalım, ama kablolara basma.',
    ]],
  ['defne', 'Defne', 'Oyuncu', 'oyuncu_odasi', 'bir_tur_daha', 'insan', ['rekabetçi', 'enerjik'],
    ['pembe', 12, 'oyun_bip'], ['oyun_kolu', 'Oyun Kolu', 'item:oyun_kolu', false], [
      'Hazır mısın? Bir maç çeker miyiz?',
      'Bir tur daha!',
      'Yağmur yağsın, biz maçımıza bakalım.',
      'Gece vardiyası skor vardiyası.',
      'Rekoru kırmak için önce rakibini tanı.',
      'Bir dahaki sefere seni geçeceğim!',
    ]],
  ['usta_selvi', 'Usta Selvi', 'Ramen ustası', 'ramen_bari', 'bulut_ramen', 'insan', ['cana yakın', 'şefkatli'],
    ['kehribar', 12, 'buhar'], ['ramen_kasesi', 'Ramen Kasesi', 'item:ramen_kasesi', false], [
      'Hoş geldin evladım, oturuver.',
      'Çorba sıcakken konuşulur.',
      'Bu yağmura bir kase sıcak ramen yakışır.',
      'Gece açığız, karnın aç kalmasın.',
      'Kaseyi sıcakken ye, enerjin yerine gelir.',
      'Doyduysan git, acıktıysan yine gel.',
    ]],
  ['dr_bolt', 'Dr. Bolt', 'Robot doktor', 'klinik', 'nabiz_saglik', 'robot', ['nazik', 'özenli'],
    ['mint', 14, 'bip'], ['iyilestirme_paketi', 'İyileştirme Paketi', 'item:iyilestirme_paketi', false], [
      'Merhaba! Nasıl hissediyorsunuz?',
      'Nabzın harika.',
      'Islanan kullanıcı önce kurulansın, sonra devam.',
      'Gece sistemleri yavaşlar, siz de dinlenin.',
      'İyileştirme paketi çantada hep durmalı.',
      'Sağlıkla kalın, düzenli kontrole bekleriz.',
    ]],
  ['usta_cengiz', 'Usta Cengiz', 'Garaj ustası', 'garaj_atolyesi', 'vida_garaj', 'insan', ['esprili', 'işine düşkün'],
    ['turuncu', 12, 'pnomatik'], ['arac_boyasi', 'Araç Boyası', 'item:arac_boyasi', false], [
      'Hoş geldin! Aracın yoksa hayalin vardır.',
      'Her cıvata bir hikâye.',
      'Yağmur paslandırmaz, ben boyarım.',
      'Gece mesaisi var, cıvatalar uyumuyor.',
      'Boya fırça ister, araç sabır. İkisi bende.',
      'Yolun açık, lastiklerin dolu olsun!',
    ]],
  ['dj_mira', 'DJ Mira', 'Disk jokey', 'kulup', 'ritim_kulubu', 'insan', ['neşeli', 'canlı'],
    ['renkli', 11, 'synthwave'], ['ses_plagi', 'Ses Plağı', 'item:ses_plagi', false], [
      'Hey hey! Ritme hoş geldin!',
      'Ritim şehrin kalbi.',
      'Yağmur damlası da bir davul, dinle!',
      'Gece başlıyor, ışıklar yavaş yanıyor.',
      'Plak çalmadan önce parlak yüzünü sil.',
      'Sesi aç, gülümse, yürü!',
    ]],
  ['hasan_amca', 'Hasan Amca', 'Market sahibi', 'market', 'luminar_market', 'insan', ['cömert', 'babacan'],
    ['beyaz', 13, 'market'], ['enerji_hucresi', 'Enerji Hücresi', 'item:enerji_hücresi', true], [
      'Buyur evlat, sepet burada.',
      'Sepet dolsun!',
      'Islanma, içeri gir, hava serin.',
      'Gece de açığız, gündüz de, hep açığız.',
      'Enerji hücresi bitti mi? Rafın en altında.',
      'Elin boş gitme, bir ikramım olsun.',
    ]],
  ['bahar_hanim', 'Bahar Hanım', 'Bahçıvan', 'cati_bahcesi', 'bahar_cati', 'insan', ['şiirsel', 'dingin'],
    ['yesil', 13, 'kus_ruzgar'], ['tohum_paketi', 'Tohum Paketi', 'item:tohum_paketi', false], [
      'Hoş geldin, çiçekler seni bekliyordu.',
      'Bitkiler de şehirli.',
      'Yağmur yaprağa şiir yazar, okudun mu?',
      'Gece bahçesinde yıldızlar çiçek açar.',
      'Tohum paketi sabır ister; ek, bekle.',
      'Rüzgâr seni geri getirsin.',
    ]],
  ['ece', 'Ece', 'Kitapçı', 'kitap_kafe', 'kozmik_kitap', 'insan', ['meraklı', 'sıcakkanlı'],
    ['sicak', 10, 'sayfa'], ['gizemli_kitap', 'Gizemli Kitap', 'item:gizemli_kitap', false], [
      'Merhaba! Hangi kitabı arıyorsun?',
      'Bu kitap sana göre.',
      'Yağmurlu gün, sıcak çay, iyi kitap.',
      'Gece kitapları daha gizemli oluyor.',
      'Gizemli kitabın son sayfası bir şey söylüyor.',
      'Bitirince anlat, merak ediyorum!',
    ]],
  ['piraye', 'Piraye', 'Ressam', 'sanat_studyosu', 'duvar_tuval', 'insan', ['hayalperest', 'yaratıcı'],
    ['renkli', 12, 'firca'], ['boya_spreyi', 'Boya Spreyi', 'item:boya_spreyi', false], [
      'Hoş geldin, tuvale bir renk de sen ekle.',
      'Duvar tuvaldir.',
      'Yağmur gökyüzünün fırçasıdır.',
      'Gece renkleri başka, neonlar boya gibi.',
      'Boya spreyiyle boş duvara bir şekil bırak.',
      'Gittiğin yere renk bırak.',
    ]],
  ['cikrik', 'Çıkrık', 'Robot tamirci', 'robot_tamirhanesi', 'cirak_robot', 'robot', ['nazik', 'titiz'],
    ['mavi', 11, 'servo'], ['servo_motor', 'Servo Motor', 'item:servo_motor', false], [
      'Bip bip! Hoş geldiniz, ne tamir edelim?',
      'Vida lazım mı?',
      'Yağmurda yağlama zamanı, servolar sevinir.',
      'Gece tamir, gece şarj, her şey hazır.',
      'Servo motor küçük ama güçlü, dikkatli tutun.',
      'İyi günler, ayarlarınızı bozmayın.',
    ]],
  ['bulent', 'Bülent', 'Salon sahibi', 'arcade', 'skor_arcade', 'insan', ['nostaljik', 'sevecen'],
    ['renkli', 12, 'chiptune'], ['rekor_karti', 'Rekor Kartı', 'item:rekor_karti', false], [
      'Eskiden bunlar tek renkliydi. Hoş geldin!',
      'Kredi yok, skor var.',
      'Yağmurda makineler daha tatlı vızıldar.',
      'Gece skor tablosu parlıyor, bak.',
      'Rekor kartını skor tablosundan alabilirsin.',
      'Skoru unutma, yine gel.',
    ]],
  ['sule', 'Şule', 'Kurye şefi', 'dron_kurye', 'tuy_dron', 'insan', ['telaşlı', 'çalışkan'],
    ['turuncu', 11, 'pervane'], ['teslimat_gorevi', 'Teslimat Görevi', 'item:teslimat_gorevi', false], [
      'Hoş geldin! Hemen bir paket var!',
      'Paketler beklemez!',
      'Yağmur yağıyor, dronlar şemsiye ister!',
      'Gece teslimatı hep acil, hemen çık!',
      'Teslimat görevi panoda, süreni iyi kullan.',
      'Koş, koş! Paket bekliyor!',
    ]],
  ['kemal', 'Kemal', 'Sinema işletmecisi', 'holo_sinema', 'perde_holo', 'insan', ['sinefil', 'ağırbaşlı'],
    ['mor', 8, 'film'], ['film_bileti', 'Film Bileti', 'item:film_bileti', false], [
      'Hoş geldin, film az sonra başlıyor.',
      'Sessizlik, perde açılıyor.',
      'Yağmurlu gün, loş salon. Film için ideal.',
      'Gece seansı başlıyor, koltuğunu seç.',
      'Film biletin cebinde mi? Son sıra en iyisi.',
      'Işıklar yanıyor, iyi geceler.',
    ]],
];

/** 16 sahip. `mood.light` blok ışık seviyesi (8–14); `signature.existing` oyunda hâlihazırda tanımlı eşya mı. */
export const OWNERS = Object.freeze(RAW.map((r) => Object.freeze({
  id: r[0],
  name: r[1],
  title: r[2],
  interior: r[3],
  brand: r[4],
  species: r[5],
  personality: Object.freeze(r[6].slice()),
  mood: Object.freeze({ hue: r[7][0], light: r[7][1], ambient: r[7][2] }),
  signature: Object.freeze({ key: r[8][0], name: r[8][1], itemKey: r[8][2], existing: r[8][3] }),
  lines: Object.freeze(r[9].slice()),
})));

export const OWNER_BY_ID = Object.freeze(OWNERS.reduce((m, o) => { m[o.id] = o; return m; }, {}));
export const OWNER_BY_INTERIOR = Object.freeze(OWNERS.reduce((m, o) => { m[o.interior] = o; return m; }, {}));

export function getOwner(id) {
  return Object.prototype.hasOwnProperty.call(OWNER_BY_ID, id) ? OWNER_BY_ID[id] : null;
}

export function ownerForInterior(kind) {
  return Object.prototype.hasOwnProperty.call(OWNER_BY_INTERIOR, kind) ? OWNER_BY_INTERIOR[kind] : null;
}

/** Sahibin belirli türdeki satırı (bilinmeyen tür → 'sohbet'). */
export function ownerLine(owner, kind) {
  const i = LINE_KINDS.indexOf(kind);
  return owner.lines[i < 0 ? 1 : i];
}

/**
 * Satırı sözcük sınırında ≤`max` (varsayılan 34) kr'lık en çok 2 parçaya böler (diyalog düğümü `lines[≤2×34]`).
 * Tek sözcük `max`'ı aşıyorsa o parça aşar (veri testi bunu yasaklar). Kısa metin tek parça döner.
 */
export function splitLine(text, max) {
  const lim = max > 0 ? max : NODE_LINE_MAX;
  const s = String(text);
  if (s.length <= lim) return [s];
  const words = s.split(' ');
  let best = null;
  for (let cut = 1; cut < words.length; cut++) {
    const a = words.slice(0, cut).join(' ');
    const b = words.slice(cut).join(' ');
    if (a.length <= lim && b.length <= lim) {
      const score = Math.abs(a.length - b.length);
      if (!best || score < best.score) best = { a, b, score };
    }
  }
  if (best) return [best.a, best.b];
  /* sığdırılamadı: ilk satır olabildiğince dolu */
  let a = words[0];
  let i = 1;
  while (i < words.length && (a + ' ' + words[i]).length <= lim) { a += ' ' + words[i]; i++; }
  return i < words.length ? [a, words.slice(i).join(' ')] : [a];
}

export function ownerNodeLines(owner, kind) {
  return splitLine(ownerLine(owner, kind), NODE_LINE_MAX);
}
