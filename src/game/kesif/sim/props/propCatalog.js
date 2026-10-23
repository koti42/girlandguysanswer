/*
 * KEŞİF sim/props — İÇ MEKÂN PROP KATALOĞU (saf veri; sözleşme §6, §8; design_city §7.2). 16 iç mekânın TÜM mobilya/cihaz ihtiyacı.
 * Hem iç mekân yayıcıları (interior/*) hem props_content (propDefs genişletmesi, modeller, davranışlar) için YETKİLİ kaynaktır.
 *
 * Girdi biçimi propDefs.PROP_DEFS ile uyumludur (t, key, name, model:{meshKey}, size, colliders, trigger?, interact, states, emissive, light?, holo?,
 * sign?, tags) + katalog alanları: mount ('floor'|'wall'|'ceiling'|'surface'), uses (bu mobilyayı kullanan iç mekân türleri), variants (0..7 görsel).
 *   t = CATALOG_FIRST_T + dizin  (12 sokak tanımının ardından; dizin sırası DONUKTUR, yalnız sona eklenir)
 *   size   [w,h,d] blok, her bileşen ≤ 3, 1/8 katı;  colliders: yerel kutular (çapa = taban merkezi), ≤4, 1/16 katı, yaw 90° nicemli
 *   interact.kind ∈ CATALOG_INTERACT (none → null): sit open toggle read buy lockpad elevator dialog pickup
 *   tags ⊂ CATALOG_TAGS;  light.hue ∈ MOOD_HUES;  mount 'wall' propları duvara yaslanır (çapa duvar yüzüne yakın, derinlik ≤ 0.375)
 *
 * API: CATALOG · CATALOG_BY_KEY · getCatalogDef(key) · getCatalogDefByT(t) · catalogKeysFor(kind) · CATALOG_FIRST_T · CATALOG_TAGS · CATALOG_INTERACT · CATALOG_MOUNTS
 *      CATALOG_UNITS (blok üstü ofset notları yok; çapa her zaman taban merkezi, y = ayak seviyesi; duvar/tavan propları için y = alt kenar)
 */
import { INTERIOR_KINDS, MOOD_HUES } from '../city/ownerData.js';

export const CATALOG_FIRST_T = 13;
export const CATALOG_TAGS = Object.freeze([
  'sit', 'bed', 'table', 'shelf', 'screen', 'light', 'holo', 'plant', 'appliance', 'decor', 'vending', 'door', 'terminal', 'elevator_button',
  'locker', 'crate', 'art', 'instrument', 'tool', 'robot_prop', 'storage', 'counter', 'rug', 'sign', 'lockpad', 'pet', 'vehicle', 'medical', 'food',
  'music', 'server', 'desk', 'arcade', 'clue', 'zorunlu',
]);
export const CATALOG_INTERACT = Object.freeze(['none', 'sit', 'open', 'toggle', 'read', 'buy', 'lockpad', 'elevator', 'dialog', 'pickup']);
export const CATALOG_MOUNTS = Object.freeze(['floor', 'wall', 'ceiling', 'surface']);

const K = {
  KD: 'kapsul_daire', LF: 'loft', HK: 'hacker_odasi', OY: 'oyuncu_odasi', RM: 'ramen_bari', KL: 'klinik', GA: 'garaj_atolyesi', KU: 'kulup',
  MK: 'market', CB: 'cati_bahcesi', KK: 'kitap_kafe', SN: 'sanat_studyosu', RT: 'robot_tamirhanesi', AR: 'arcade', DR: 'dron_kurye', SI: 'holo_sinema',
};
const ALL_CODES = Object.keys(K).join(' ');

/*
 * [key, ad, [w,h,d], mount, etiketler, [etkileşim, istem] | null, ışıma 0..1, [ışık seviyesi, ton] | null, kullanan türler (kod), seçenekler]
 * seçenekler: col 'none' | 'full' | 'low' | kutu dizisi · holo · states · variants · sign
 */
const T = [
  // --- yatak ve oturma
  ['kapsul_yatak', 'Kapsül Yatak', [1.5, 1.5, 2.5], 'floor', ['bed', 'light'], ['sit', 'Kapsüle uzan'], 0.4, [7, 'mor'], 'KD', { states: 2, variants: 3 }],
  ['yatak', 'Yatak', [1.5, 0.75, 2.25], 'floor', ['bed'], ['sit', 'Uzan'], 0.1, null, 'LF OY SN', { variants: 4 }],
  ['kanepe', 'Kanepe', [2.5, 1, 1], 'floor', ['sit'], ['sit', 'Otur'], 0.1, null, 'LF OY KU KK', { variants: 4 }],
  ['koltuk', 'Koltuk', [1, 1, 1], 'floor', ['sit'], ['sit', 'Otur'], 0.1, null, 'LF KK OY SI', { variants: 4 }],
  ['puf', 'Puf', [0.75, 0.5, 0.75], 'floor', ['sit', 'decor'], ['sit', 'Otur'], 0.1, null, 'OY KU AR LF', { variants: 4 }],
  ['sandalye', 'Sandalye', [0.625, 1, 0.625], 'floor', ['sit'], ['sit', 'Otur'], 0.05, null, 'HK RM KL KK CB MK', { variants: 3 }],
  ['tabure', 'Tabure', [0.5, 0.75, 0.5], 'floor', ['sit'], ['sit', 'Otur'], 0.05, null, 'KD RM KU LF AR SN', { variants: 3 }],
  ['oyuncu_koltugu', 'Oyuncu Koltuğu', [0.875, 1.25, 0.875], 'floor', ['sit'], ['sit', 'Otur'], 0.2, null, 'OY HK', { variants: 3 }],
  ['sinema_koltugu', 'Sinema Koltuğu', [1, 1, 1], 'floor', ['sit'], ['sit', 'Otur'], 0.05, null, 'SI', { variants: 3 }],
  ['bekleme_sirasi', 'Bekleme Sırası', [2.5, 0.875, 0.75], 'floor', ['sit'], ['sit', 'Otur'], 0.05, null, 'KL SI DR', { variants: 2 }],
  // --- masalar
  ['masa', 'Masa', [2, 0.875, 1], 'floor', ['table'], null, 0.05, null, 'LF RM KK CB SN', { variants: 3 }],
  ['alcak_masa', 'Alçak Masa', [1.5, 0.5, 1], 'floor', ['table'], null, 0.05, null, 'LF KU OY KK', { variants: 3 }],
  ['kafe_masasi', 'Kafe Masası', [1, 0.875, 1], 'floor', ['table'], null, 0.05, null, 'KK CB RM KU', { variants: 3 }],
  ['katlanir_masa', 'Katlanır Masa', [1.5, 0.875, 0.75], 'floor', ['table'], ['toggle', 'Masayı aç/kapa'], 0.05, null, 'KD', { states: 2 }],
  ['calisma_masasi', 'Çalışma Masası', [2, 0.875, 1], 'floor', ['table', 'desk'], null, 0.05, null, 'HK OY LF KL DR', { variants: 3 }],
  ['cok_ekranli_masa', 'Çok Ekranlı Masa', [2.5, 1.5, 1], 'floor', ['table', 'desk', 'screen'], ['toggle', 'Ekranları aç'], 0.7, [8, 'mavi'], 'HK OY', { states: 2, variants: 3 }],
  ['is_tezgahi', 'İş Tezgâhı', [2, 0.875, 1], 'floor', ['table', 'tool'], null, 0.05, null, 'GA RT SN HK DR', { variants: 3 }],
  ['servo_tezgahi', 'Onarım Tezgâhı', [2.5, 1, 1.25], 'floor', ['table', 'tool', 'robot_prop'], ['dialog', 'Tamirciyle konuş'], 0.2, null, 'RT GA', { variants: 2 }],
  // --- depolama, raflar
  ['raf_unitesi', 'Raf Ünitesi', [2, 2, 0.5], 'floor', ['shelf'], null, 0.05, null, 'KD LF HK OY KK SN RT DR MK', { variants: 4 }],
  ['kitaplik', 'Kitaplık', [2, 2.5, 0.5], 'floor', ['shelf', 'decor'], ['read', 'Kitaplara bak'], 0.05, null, 'LF KK', { variants: 4 }],
  ['dolap', 'Dolap', [1, 2, 0.75], 'floor', ['storage'], ['open', 'Dolabı aç'], 0.05, null, 'KD KL OY LF', { states: 2, variants: 3 }],
  ['saglik_dolabi', 'Sağlık Dolabı', [1, 2, 0.5], 'floor', ['storage', 'medical'], ['open', 'Dolabı aç'], 0.1, null, 'KL', { states: 2 }],
  ['dolap_sirali', 'Dolap Sırası', [2, 2, 0.625], 'floor', ['locker', 'storage'], ['open', 'Dolabı aç'], 0.05, null, 'GA RT DR AR', { states: 2, variants: 3 }],
  ['takim_dolabi', 'Takım Dolabı', [1, 1.5, 0.75], 'floor', ['tool', 'storage'], ['open', 'Takımları gör'], 0.05, null, 'GA RT', { states: 2 }],
  ['alet_duvari', 'Alet Duvarı', [2, 2, 0.25], 'wall', ['tool', 'decor'], null, 0.05, null, 'GA RT', {}],
  ['parca_rafi', 'Parça Rafı', [2, 2, 0.625], 'floor', ['shelf', 'robot_prop'], null, 0.15, null, 'RT GA', { variants: 3 }],
  ['dron_rafi', 'Dron Rafı', [2, 2.5, 0.875], 'floor', ['shelf', 'robot_prop'], null, 0.3, null, 'DR', { variants: 3 }],
  ['market_rafi', 'Market Rafı', [2, 1.75, 0.75], 'floor', ['shelf', 'food'], null, 0.1, null, 'MK', { variants: 6 }],
  ['vitrin', 'Vitrin', [2, 1.75, 0.75], 'floor', ['shelf', 'decor'], ['read', 'Vitrine bak'], 0.3, null, 'MK AR SN', { variants: 3 }],
  ['koli', 'Koli', [1, 1, 1], 'floor', ['crate'], null, 0.02, null, 'MK GA RT DR HK', { variants: 3 }],
  ['koli_yigini', 'Koli Yığını', [1.5, 2, 1.5], 'floor', ['crate'], null, 0.02, null, 'MK GA DR RT', { variants: 3 }],
  // --- cihazlar
  ['buzdolabi', 'Buzdolabı', [1, 2, 0.875], 'floor', ['appliance'], ['open', 'Buzdolabını aç'], 0.1, null, 'KD LF RM', { states: 2 }],
  ['mutfak_tezgahi', 'Mutfak Tezgâhı', [2, 1, 1], 'floor', ['appliance', 'counter', 'food'], null, 0.1, null, 'KD LF RM KK', { variants: 2 }],
  ['dus_kabini', 'Duş Kabini', [1, 2.25, 1], 'floor', ['appliance'], ['toggle', 'Duşu aç'], 0.3, [6, 'mavi'], 'KD', { states: 2 }],
  ['market_buzluk', 'Soğutucu Reyon', [2, 1.25, 1], 'floor', ['appliance', 'shelf', 'food'], null, 0.5, [8, 'beyaz'], 'MK', { variants: 2 }],
  ['sarj_istasyonu', 'Şarj İstasyonu', [1, 1.625, 0.75], 'floor', ['appliance', 'robot_prop', 'light'], ['toggle', 'Şarj et'], 0.7, [8, 'yesil'], 'RT DR GA', { states: 2 }],
  ['cay_ocagi', 'Çay Ocağı', [1, 1.25, 0.75], 'floor', ['appliance', 'food'], ['toggle', 'Çay demle'], 0.2, null, 'KK RM CB', { states: 2 }],
  // --- tezgâh, ticaret
  ['ramen_tezgahi', 'Ramen Tezgâhı', [3, 1.125, 1], 'floor', ['counter', 'food'], ['buy', 'Ramen al'], 0.4, [8, 'kehribar'], 'RM', { variants: 2 }],
  ['meyve_bari', 'Meyve Barı', [3, 1.125, 1], 'floor', ['counter', 'food'], ['buy', 'Meyve suyu al'], 0.4, [9, 'renkli'], 'KU CB', { variants: 2 }],
  ['kasa_masasi', 'Kasa Masası', [2, 1.125, 1], 'floor', ['counter'], ['buy', 'Alışveriş yap'], 0.3, null, 'MK KK KL SI AR', { variants: 3 }],
  ['odul_tezgahi', 'Ödül Tezgâhı', [2, 1.125, 1], 'floor', ['counter', 'arcade'], ['buy', 'Ödül seç'], 0.4, [8, 'renkli'], 'AR', {}],
  ['kurye_tezgahi', 'Kurye Tezgâhı', [2, 1.125, 1], 'floor', ['counter'], ['dialog', 'Teslimat görevi al'], 0.3, [8, 'turuncu'], 'DR', {}],
  ['otomat_atistirmalik', 'Atıştırmalık Otomatı', [1, 2, 0.875], 'floor', ['vending', 'food'], ['buy', 'Atıştırmalık al'], 0.8, [9, 'turuncu'], 'MK AR SI GA', {}],
  ['otomat_icecek', 'İçecek Otomatı', [1, 2, 0.875], 'floor', ['vending', 'food'], ['buy', 'Meyve suyu al'], 0.8, [9, 'camgobegi'], 'MK RM AR KU CB', {}],
  ['otomat_enerji', 'Enerji Otomatı', [1, 2, 0.875], 'floor', ['vending'], ['buy', 'Enerji hücresi al'], 0.8, [9, 'yesil'], 'MK GA RT', {}],
  ['kase_seti', 'Kase Seti', [0.625, 0.25, 0.625], 'surface', ['food', 'decor'], null, 0.1, null, 'RM KK', { variants: 3 }],
  // --- ekran, teknoloji
  ['holo_ekran', 'Holo Ekran', [2, 1.25, 0.25], 'wall', ['screen', 'holo'], ['toggle', 'Ekranı değiştir'], 0.9, [7, 'camgobegi'], 'KD LF HK KL SN DR', { holo: true, states: 3, variants: 3 }],
  ['dev_holo_ekran', 'Dev Holo Ekran', [3, 2, 0.25], 'wall', ['screen', 'holo'], ['toggle', 'Ekranı değiştir'], 1, [9, 'camgobegi'], 'LF OY KU', { holo: true, states: 3, variants: 3 }],
  ['televizyon', 'Ekran', [1.5, 1, 0.25], 'wall', ['screen'], ['toggle', 'Ekranı aç'], 0.6, [8, 'beyaz'], 'OY LF KL', { states: 2, variants: 3 }],
  ['holo_perde', 'Holo Perde', [3, 3, 0.25], 'wall', ['screen', 'holo'], null, 1, [10, 'mor'], 'SI', { holo: true, states: 2 }],
  ['projektor', 'Projektör', [0.625, 0.5, 0.625], 'ceiling', ['screen', 'light'], null, 0.6, [8, 'mor'], 'SI', {}],
  ['arcade_makinesi', 'Oyun Makinesi', [1, 2, 0.875], 'floor', ['arcade', 'screen'], ['toggle', 'Oyna'], 0.9, [9, 'renkli'], 'AR OY', { states: 2, variants: 6 }],
  ['oyun_bilgisayari', 'Oyun Bilgisayarı', [0.75, 0.875, 0.625], 'surface', ['screen', 'light'], ['toggle', 'Bilgisayarı aç'], 0.9, [7, 'pembe'], 'OY HK', { states: 2, variants: 3 }],
  ['sunucu_rafi', 'Sunucu Rafı', [1, 2.5, 1], 'floor', ['server', 'appliance', 'screen'], ['read', 'Kayıtları oku'], 0.8, [8, 'yesil'], 'HK', { variants: 2 }],
  ['bilgi_terminali', 'Bilgi Terminali', [0.875, 1.75, 0.625], 'floor', ['terminal', 'screen'], ['read', 'Bilgiyi oku'], 0.8, [8, 'camgobegi'], 'KL DR MK AR SI', { states: 2 }],
  ['skor_tablosu', 'Skor Tablosu', [3, 1.5, 0.25], 'wall', ['screen', 'sign', 'arcade'], ['read', 'Skorlara bak'], 1, [9, 'renkli'], 'AR', { sign: true }],
  ['menu_tahtasi', 'Menü Tahtası', [1.5, 1.25, 0.125], 'wall', ['sign', 'food'], ['read', 'Menüyü oku'], 0.5, [8, 'kehribar'], 'RM CB KK', { sign: true }],
  ['ilan_panosu', 'İlan Panosu', [1.5, 1.125, 0.125], 'wall', ['sign', 'clue'], ['read', 'İlanları oku'], 0.15, null, 'DR KK GA', { sign: true }],
  ['neon_tabela_ic', 'İç Neon Tabela', [2.5, 0.875, 0.25], 'wall', ['sign', 'light'], null, 1, [9, 'pembe'], 'RM KU AR MK OY SI', { sign: true, variants: 4 }],
  ['neon_raf', 'Neon Raf', [2, 0.375, 0.375], 'wall', ['light', 'shelf', 'decor'], null, 1, [8, 'pembe'], 'OY KU', { variants: 3 }],
  ['kablo_demeti', 'Kablo Yığını', [1, 0.375, 1], 'floor', ['decor', 'tool'], null, 0.05, null, 'HK RT GA OY', { col: 'none' }],
  // --- robot, araç
  ['robot_kol', 'Robot Kol', [1, 2.25, 1], 'floor', ['robot_prop', 'tool'], ['toggle', 'Kolu çalıştır'], 0.4, null, 'RT GA', { states: 2 }],
  ['dron_istasyonu', 'Dron İstasyonu', [1, 1.25, 1], 'floor', ['robot_prop', 'appliance', 'light'], ['toggle', 'Dronu çağır'], 0.7, [8, 'turuncu'], 'DR', { states: 2, variants: 3 }],
  ['robot_doktor_istasyonu', 'Robot Doktor', [1, 2, 1], 'floor', ['robot_prop', 'medical'], ['dialog', 'Doktorla konuş'], 0.5, [8, 'mint'], 'KL', {}],
  ['robot_kedi', 'Robot Kedi', [0.625, 0.625, 0.875], 'floor', ['pet', 'robot_prop', 'decor'], ['dialog', 'Sevgiyle dürt'], 0.3, null, 'RT LF KK', { variants: 3 }],
  ['mini_robot', 'Mini Robot', [0.625, 0.875, 0.625], 'floor', ['pet', 'robot_prop'], ['dialog', 'Mini robotla konuş'], 0.4, null, 'KD RT KL', { variants: 3 }],
  ['arac_lifti', 'Araç Lifti', [3, 2.5, 3], 'floor', ['vehicle', 'tool'], null, 0.2, null, 'GA', {
    col: [[-1.4375, 0, -1.4375, -1.1875, 2.5, -1.1875], [1.1875, 0, -1.4375, 1.4375, 2.5, -1.1875], [-1.4375, 0, 1.1875, -1.1875, 2.5, 1.4375], [1.1875, 0, 1.1875, 1.4375, 2.5, 1.4375]],
  }],
  ['arac_govdesi', 'Araç Gövdesi', [3, 1.375, 1.5], 'floor', ['vehicle', 'decor'], null, 0.2, null, 'GA', { variants: 4 }],
  // --- sağlık
  ['muayene_yatagi', 'Muayene Yatağı', [1.25, 0.875, 2.25], 'floor', ['bed', 'medical'], ['sit', 'Uzan'], 0.2, null, 'KL', {}],
  ['tarayici_cihaz', 'Tarama Cihazı', [1.5, 2, 1.5], 'floor', ['medical', 'appliance', 'screen'], ['toggle', 'Taramayı başlat'], 0.7, [9, 'mint'], 'KL', { states: 2 }],
  // --- bitki, dekor
  ['saksi_buyuk', 'Büyük Saksı', [1, 1.5, 1], 'floor', ['plant', 'decor'], null, 0.2, null, 'LF KD KL KK CB SN MK OY RM SI', { variants: 4 }],
  ['bitki_duvar', 'Dikey Bahçe', [2, 2, 0.375], 'wall', ['plant', 'decor'], null, 0.3, null, 'LF CB KK KU', { variants: 3 }],
  ['sarkik_bitki', 'Sarkık Bitki', [0.75, 1.25, 0.75], 'ceiling', ['plant', 'decor'], null, 0.2, null, 'KK CB LF', { variants: 3 }],
  ['sera_rafi', 'Sera Rafı', [2, 1.25, 1], 'floor', ['plant', 'shelf'], null, 0.3, null, 'CB', { variants: 3 }],
  ['havuz_dekor', 'Dekoratif Havuz', [3, 0.5, 2], 'floor', ['decor'], null, 0.5, [7, 'mavi'], 'CB', {}],
  ['akvaryum', 'Akvaryum', [2, 1.5, 1], 'floor', ['decor', 'light'], null, 0.8, [8, 'mavi'], 'LF OY KL RM', { variants: 3 }],
  // --- aydınlatma
  ['asili_lamba', 'Asılı Lamba', [0.625, 1, 0.625], 'ceiling', ['light'], null, 0.9, [12, 'sicak'], 'KD LF RM KK SN', { variants: 4 }],
  ['ayakli_lamba', 'Ayaklı Lamba', [0.5, 1.75, 0.5], 'floor', ['light'], null, 0.9, [11, 'sicak'], 'LF KK OY KD SN', { variants: 3 }],
  ['masa_lambasi', 'Masa Lambası', [0.375, 0.5, 0.375], 'surface', ['light'], null, 0.9, [9, 'sicak'], 'HK KD OY KK', { variants: 3 }],
  ['isik_demeti', 'Işık Demeti', [0.5, 0.5, 0.5], 'ceiling', ['light'], null, 1, [10, 'renkli'], 'KU', { variants: 4 }],
  // --- zemin, müzik
  ['hali', 'Halı', [3, 0.125, 2], 'floor', ['rug', 'decor'], null, 0.05, null, 'KD LF OY KK SN KL SI', { variants: 6 }],
  ['dans_zemini', 'Işıklı Dans Zemini', [3, 0.125, 3], 'floor', ['light', 'rug'], null, 1, [9, 'renkli'], 'KU', { variants: 3 }],
  ['hoparlor', 'Hoparlör', [0.75, 1.5, 0.75], 'floor', ['music'], null, 0.4, [6, 'mor'], 'KU OY SI AR', { variants: 2 }],
  ['dj_standi', 'DJ Standı', [2.5, 1.125, 1], 'floor', ['music', 'instrument', 'table'], ['toggle', 'Müziği değiştir'], 0.8, [9, 'renkli'], 'KU', { states: 3 }],
  // --- sanat
  ['sovale', 'Şövale', [1.25, 2, 1], 'floor', ['art'], ['read', 'Resme bak'], 0.05, null, 'SN', { variants: 4 }],
  ['tuval', 'Tuval', [1.25, 1.5, 0.125], 'wall', ['art', 'decor'], ['read', 'Resme bak'], 0.1, null, 'SN LF KK', { variants: 8 }],
  ['heykel', 'Heykel', [1, 2, 1], 'floor', ['art', 'decor'], ['read', 'Heykele bak'], 0.1, null, 'SN LF', { variants: 4 }],
  ['boya_rafi', 'Boya Rafı', [1, 1.5, 0.5], 'floor', ['art', 'shelf'], null, 0.1, null, 'SN', { variants: 3 }],
  ['manken', 'Manken', [0.75, 2, 0.75], 'floor', ['decor'], null, 0.05, null, 'SN MK', { variants: 4 }],
  ['cerceve', 'Çerçeve', [1, 1.25, 0.125], 'wall', ['art', 'decor'], null, 0.05, null, 'KD LF KK OY KL SI DR', { variants: 8 }],
  ['kitap_yigini', 'Kitap Yığını', [0.625, 0.5, 0.625], 'surface', ['decor', 'clue'], ['read', 'Kitaplara bak'], 0.05, null, 'KK LF', { variants: 4 }],
  ['buhar_cikisi', 'Buhar Çıkışı', [0.625, 1, 0.625], 'floor', ['appliance', 'decor'], null, 0.3, null, 'RM', {}],
  // --- kapılar, kilitler, ipuçları
  ['kapi', 'İç Kapı', [1, 3, 0.25], 'floor', ['door', 'zorunlu'], ['open', 'Kapıyı aç'], 0.4, null, ALL_CODES, { states: 3, variants: 3, col: [[-0.5, 0, -0.125, 0.5, 3, 0.125]] }],
  ['kapi_genis', 'Geniş İç Kapı', [3, 3, 0.25], 'floor', ['door', 'zorunlu'], ['open', 'Kapıyı aç'], 0.4, null, ALL_CODES, { states: 3, variants: 3, col: [[-1.5, 0, -0.125, 1.5, 3, 0.125]] }],
  ['gizli_kapi_raf', 'Gizli Kapı (Raf)', [3, 3, 0.5], 'floor', ['door', 'shelf', 'zorunlu'], ['open', 'Rafı it'], 0.05, null, 'KK HK SN', { states: 2, col: [[-1.5, 0, -0.25, 1.5, 3, 0.25]] }],
  ['kod_paneli', 'Kod Paneli', [0.375, 0.5, 0.125], 'wall', ['lockpad', 'zorunlu'], ['lockpad', 'Kodu gir'], 0.8, [6, 'kehribar'], ALL_CODES, { states: 3 }],
  ['kart_okuyucu', 'Kart Okuyucu', [0.375, 0.5, 0.125], 'wall', ['lockpad', 'zorunlu'], ['lockpad', 'Kartı okut'], 0.8, [6, 'camgobegi'], ALL_CODES, { states: 3, variants: 3 }],
  ['hack_terminali', 'Çözme Terminali', [0.5, 0.75, 0.25], 'wall', ['lockpad', 'terminal', 'zorunlu'], ['lockpad', 'Kilidi çöz'], 0.9, [8, 'yesil'], ALL_CODES, { states: 3 }],
  ['asansor_dugmesi', 'Asansör Düğmesi', [0.375, 0.625, 0.125], 'wall', ['elevator_button', 'zorunlu'], ['elevator', 'Asansörü çağır'], 0.8, [6, 'beyaz'], 'LF KU MK KL OY', { states: 2 }],
  ['posta_kutusu', 'Posta Kutusu', [0.5, 0.75, 0.25], 'wall', ['storage', 'clue'], ['read', 'Postaya bak'], 0.1, null, 'KD LF DR', { variants: 3 }],
  ['kod_notu', 'Kod Notu', [0.5, 0.5, 0.125], 'wall', ['clue', 'decor'], ['read', 'Notu oku'], 0.2, null, 'HK KK OY KD LF RT AR', { variants: 3 }],
];

function quant(v) {
  return Math.round(v * 16) / 16;
}

function defaultCollider(size) {
  const hw = Math.max(quant(size[0] / 2 - 0.0625), 0.0625);
  const hd = Math.max(quant(size[2] / 2 - 0.0625), 0.0625);
  const top = Math.max(quant(size[1] - 0.0625), 0.125);
  return [[-hw, 0, -hd, hw, top, hd]];
}

function kindsOf(codes) {
  const out = [];
  String(codes).split(' ').forEach((c) => {
    if (c && K[c] && out.indexOf(K[c]) < 0) out.push(K[c]);
  });
  // ownerData sırası
  return INTERIOR_KINDS.filter((k) => out.indexOf(k) >= 0);
}

function build(row, i) {
  const [key, name, size, mount, tags, act, em, light, uses, o] = row;
  const opt = o || {};
  let colliders;
  if (Array.isArray(opt.col)) colliders = opt.col;
  else if (opt.col === 'none') colliders = [];
  else if (mount === 'floor' && tags.indexOf('rug') < 0 && !(tags.indexOf('light') >= 0 && size[1] < 0.2)) colliders = defaultCollider(size);
  else colliders = [];
  const d = {
    t: CATALOG_FIRST_T + i,
    key,
    name,
    model: Object.freeze({ meshKey: key }),
    size: Object.freeze(size.slice()),
    colliders: Object.freeze(colliders.map((b) => Object.freeze(b.slice()))),
    trigger: undefined,
    interact: act ? Object.freeze({ kind: act[0], prompt: act[1], range: 2.6 }) : null,
    states: opt.states || 1,
    emissive: em,
    light: light ? Object.freeze({ level: light[0], hue: light[1] }) : undefined,
    holo: !!opt.holo,
    sign: opt.sign ? Object.freeze({ w: size[0] - 0.2, h: size[1] - 0.15, font: 'neon' }) : undefined,
    tags: Object.freeze(tags.slice()),
    mount,
    uses: Object.freeze(kindsOf(uses)),
    variants: opt.variants || 1,
    catalog: true,
  };
  return Object.freeze(d);
}

export const CATALOG = Object.freeze(T.map(build));
export const CATALOG_BY_KEY = Object.freeze(CATALOG.reduce((m, d) => { m[d.key] = d; return m; }, Object.create(null)));
export const CATALOG_HUES = MOOD_HUES;

/** t → katalog tanımı | null. */
export function getCatalogDefByT(t) {
  const i = t - CATALOG_FIRST_T;
  return Number.isInteger(i) && i >= 0 && i < CATALOG.length ? CATALOG[i] : null;
}

/** Anahtar → katalog tanımı | null (prototip anahtarlarına karşı güvenli). */
export function getCatalogDef(key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(CATALOG_BY_KEY, key) ? CATALOG_BY_KEY[key] : null;
}

/** Bu iç mekân türünün kullandığı katalog anahtarları (katalog sırası). */
export function catalogKeysFor(kind) {
  return CATALOG.filter((d) => d.uses.indexOf(kind) >= 0).map((d) => d.key);
}
