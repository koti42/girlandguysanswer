/*
 * KEŞİF sim/props — İÇ MEKÂN TANIM EKLERİ (saf veri). propCatalog.js (interior_kit) anahtar/boyut/çarpışma/etiket/ışık için YETKİLİ kaynaktır;
 * bu tablo her anahtar için catalog'da bulunmayan işlevsel alanları ekler (props_content):
 *
 *   seat    {pose:'sit'|'lie', h (oturak üst yüksekliği, taban çapasından), eye (oturan göz yüksekliği, ayaktan), fwd (ön ofset),
 *            spots:[x…] (yerel x konumları; oyuncuya en yakını seçilir), closes?:true (oturunca durum 1: kapsül kapağı)}
 *   amb     {sound, range, period, on?:durum}   prop başına ortam sesi (sistem en yakın ≤ N tanesini çalar)
 *   mode    davranış alt kipi:  open → door|secret|cabinet|fridge · toggle → fold|power|timed|cycle · read → kitap|vitrin|sunucu|bilgi|sign|sanat|posta|clue
 *           dialog → owner|pet · buy → counter|vending
 *   power   bit maskesi: hangi durumlarda "açık" (ekran/ışık yayar). timed: saniye. transient: durum KAYDA GİRMEZ, yüklemede sıfırlanır.
 *   openFree  durum ≥ 1 iken çarpışma kutuları kalkar (kapı açık / masa katlı).    cull  çizim uzaklığı (blok)
 *   say     metin tablosu anahtarı (varsayılan: prop anahtarı)
 *
 * Durum anlamları (render + davranış):  kapı 0 kapalı · 1 açık · 2 ayrılmış   ekran/holo: power maskesi   kapsül yatak 0 kapak açık · 1 kapalı
 * kod paneli/kart/çözme: 0 bekliyor (turuncu) · 1 çözüldü (yeşil) · 2 soğuma/hata (kırmızı)   asansör düğmesi 0 sönük · 1 çağrıldı
 */

const sit = (h, eye, o) => Object.assign({ pose: 'sit', h, eye: eye === undefined ? 0.74 : eye, fwd: 0.04, spots: [0] }, o || {});
const lie = (h, o) => Object.assign({ pose: 'lie', h, eye: 0.3, fwd: 0, spots: [0] }, o || {});

export const EXTRA = Object.freeze({
  // --- oturma / yatma
  kapsul_yatak: { seat: lie(0.5, { closes: true, eye: 0.34 }), openFree: false },
  yatak: { seat: lie(0.62) },
  kanepe: { seat: sit(0.5, 0.74, { spots: [-0.8, 0, 0.8] }) },
  koltuk: { seat: sit(0.5) },
  puf: { seat: sit(0.44, 0.7, { fwd: 0 }) },
  sandalye: { seat: sit(0.5, 0.74, { fwd: 0.05 }) },
  tabure: { seat: sit(0.7, 0.72, { fwd: 0 }) },
  oyuncu_koltugu: { seat: sit(0.54, 0.76) },
  sinema_koltugu: { seat: sit(0.5, 0.74) },
  bekleme_sirasi: { seat: sit(0.5, 0.74, { spots: [-0.85, 0, 0.85] }) },
  muayene_yatagi: { seat: lie(0.78) },
  // --- masalar
  katlanir_masa: { mode: 'fold', openFree: true },
  cok_ekranli_masa: { mode: 'power', power: 0b01 },
  // --- depolama / cihaz
  dolap: { mode: 'cabinet' },
  saglik_dolabi: { mode: 'cabinet' },
  dolap_sirali: { mode: 'cabinet' },
  takim_dolabi: { mode: 'cabinet' },
  buzdolabi: { mode: 'fridge', amb: { sound: 'prop:fridge_hum', range: 7, period: 3.9 } },
  market_buzluk: { amb: { sound: 'prop:fridge_hum', range: 9, period: 3.9 } },
  dus_kabini: { mode: 'timed', timed: 7, transient: true, power: 0b10, amb: { sound: 'prop:shower', range: 7, period: 2.6, on: 1 } },
  sarj_istasyonu: { mode: 'timed', timed: 6, transient: true, power: 0b10 },
  cay_ocagi: { mode: 'timed', timed: 6, transient: true, power: 0b10 },
  buhar_cikisi: { amb: { sound: 'prop:steam', range: 8, period: 3.1 } },
  // --- ticaret
  ramen_tezgahi: { mode: 'counter' },
  meyve_bari: { mode: 'counter' },
  kasa_masasi: { mode: 'counter' },
  odul_tezgahi: { mode: 'counter' },
  kurye_tezgahi: { mode: 'owner' },
  servo_tezgahi: { mode: 'owner' },
  otomat_atistirmalik: { mode: 'vending', amb: { sound: 'prop:vending', range: 6, period: 4.4 } },
  otomat_icecek: { mode: 'vending', amb: { sound: 'prop:vending', range: 6, period: 4.4 } },
  otomat_enerji: { mode: 'vending', amb: { sound: 'prop:vending', range: 6, period: 4.4 } },
  // --- ekran / teknoloji
  holo_ekran: { mode: 'power', power: 0b011 },
  dev_holo_ekran: { mode: 'power', power: 0b011 },
  televizyon: { mode: 'power', power: 0b10 },
  holo_perde: { power: 0b01 },
  oyun_bilgisayari: { mode: 'power', power: 0b10 },
  arcade_makinesi: { mode: 'timed', timed: 10, transient: true, amb: { sound: 'prop:arcade', range: 8, period: 3.3 } },
  sunucu_rafi: { mode: 'sunucu', amb: { sound: 'prop:server', range: 8, period: 4.0 } },
  bilgi_terminali: { mode: 'bilgi' },
  skor_tablosu: { mode: 'sign' },
  menu_tahtasi: { mode: 'sign' },
  ilan_panosu: { mode: 'sign' },
  // --- robot
  robot_kol: { mode: 'timed', timed: 3, transient: true },
  dron_istasyonu: { mode: 'timed', timed: 5, transient: true, power: 0b10 },
  robot_doktor_istasyonu: { mode: 'owner' },
  robot_kedi: { mode: 'pet' },
  mini_robot: { mode: 'pet' },
  tarayici_cihaz: { mode: 'timed', timed: 5, transient: true, power: 0b10 },
  // --- bitki / dekor
  akvaryum: { amb: { sound: 'prop:bubbles', range: 7, period: 3.0 } },
  dj_standi: { mode: 'cycle' },
  sovale: { mode: 'sanat' },
  tuval: { mode: 'sanat' },
  heykel: { mode: 'sanat' },
  kitaplik: { mode: 'kitap' },
  vitrin: { mode: 'vitrin' },
  kitap_yigini: { mode: 'kitap' },
  posta_kutusu: { mode: 'posta' },
  kod_notu: { mode: 'clue' },
  // --- kapılar / kilitler
  kapi: { mode: 'door', openFree: true },
  kapi_genis: { mode: 'door', openFree: true },
  gizli_kapi_raf: { mode: 'secret', openFree: true },
  kod_paneli: { mode: 'pad' },
  kart_okuyucu: { mode: 'pad' },
  hack_terminali: { mode: 'pad' },
  asansor_dugmesi: { mode: 'elevator' },
});

/** Çizim uzaklığı (blok) — iç mekân propları sokak yarıçapından çok daha yakında çizilir (propRendererInterior kademe tavanı). */
export const DEFAULT_CULL = 44;
