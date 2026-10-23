/*
 * KEŞİF sim/city/ped — SOKAK NPC'LERİNİN YAĞMUR / GECE SELAM SATIRLARI (npc_vendors). Saf veri; tür başına iki satır (≤60 kr), aile dostu, özgün.
 * dialogueKit.graph sokak NPC'leri için `rainy` ve `nighty` düğümlerini ve giriş koşullarını (yağmur + ilk konuşma değil / gece + ilk konuşma değil) buradan ekler;
 * sahipler zaten ownerData satırlarıyla (yagmur/gece) bu düğümlere sahiptir.
 */
export const WEATHER_LINES = Object.freeze({
  guide: Object.freeze({ rain: 'Yağmurda yollar ıslak ama şehir daha da parlak!', night: 'Gece neonlar şehri yıldızlara çevirir, bak!' }),
  vendor: Object.freeze({ rain: 'Yağmur yağsa da tezgâh açık; gel, ıslanma!', night: 'Gece de buradayım; Pazar hiç uyumaz.' }),
  courier: Object.freeze({ rain: 'Yağmurda paket ıslanmasın; koş, koş!', night: 'Gece teslimatı da var; fenerini unutma.' }),
  taxi: Object.freeze({ rain: 'Yağmurda taksi çok aranır; hazırım canım!', night: 'Gece taksisi hep açık; yolun neresi?' }),
  marshal: Object.freeze({ rain: 'Yağmurda yol kayar; ölçülü sür, adil yarış.', night: 'Gece yarışı güzel olur; ışıklar rehberin.' }),
  mechanic: Object.freeze({ rain: 'Yağmur araçlara iyi gelmez; sileceği kontrol et.', night: 'Gece mesaisi var; farlarını denedin mi?' }),
  dj: Object.freeze({ rain: 'Yağmur damlaları benim davulum, dinle!', night: 'Gece benim saatim; sesi aç, ışıkları izle!' }),
  host: Object.freeze({ rain: 'Yağmurda şehir şiir gibi; şemsiyen var mı?', night: 'Gece Neon Meridyen\'in en güzel hâli.' }),
  mentor: Object.freeze({ rain: 'Yağmurda yavaş sür, dikkatli yürü; ders bu.', night: 'Gece ışığı takip et; keşif böyle olur.' }),
  photographer: Object.freeze({ rain: 'Yağmur en güzel yansımaları yapar; kamerada!', night: 'Gece neon en iyi model; kadraja al.' }),
  robot: Object.freeze({ rain: 'Bip! Yağmurda suyla dans ederim, izle!', night: 'Bip bop! Gece şarjım dolu, şehir parlıyor.' }),
  elder: Object.freeze({ rain: 'Yağmurda bankta oturmak huzurdur evladım.', night: 'Gece ışıklar yıldızı geçer; otur biraz.' }),
  kid: Object.freeze({ rain: 'Yağmurda su birikintilerine atlamak serbest!', night: 'Gece uyumam; neonları sayıyorum!' }),
});
