/*
 * KEŞİF — "Nasıl Oynanır / Kontroller" içeriği (veri). Tek kaynak: duraklatma menüsündeki panel (PauseHowTo) ve lobi kartı (HowTo) aynı
 * listeleri kullanır, böylece tuşlar iki yerde farklı yazılmaz. Gerçek tuş eşlemesi: game/kesif/inputMath.js (HELD_ACTION_CODES / PRESS_ACTION_CODES).
 *
 *   DESKTOP_CONTROLS  [{what, keys[], note?}]       klavye + fare
 *   TOUCH_CONTROLS    [{what, how}]                 dokunmatik özet
 *   TOUCH_BUTTON_HELP { buttonId: açıklama }        dokunmatik şemadaki düğmelerin açıklaması
 *   PLAY_TIPS         [{key, icon, title, text}]    üret / inşa / büyü / teknoloji ipuçları (icon: PauseHowTo'daki simge anahtarı)
 */

export const DESKTOP_CONTROLS = Object.freeze([
  { what: 'Hareket', keys: ['W', 'A', 'S', 'D'], note: 'Ok tuşları da çalışır' },
  { what: 'Etrafa bak', keys: ['Fare'] },
  { what: 'Zıpla / uç (inşa)', keys: ['Boşluk'], note: 'İnşa modunda iki kez bas' },
  { what: 'Koş / çömel', keys: ['Shift', 'C'] },
  { what: 'Kır / saldır', keys: ['Sol tık'], note: 'Basılı tut' },
  { what: 'Yerleştir / kullan', keys: ['Sağ tık'], note: 'Sandık, tezgah, kapı ve büyü asası' },
  { what: 'Envanter', keys: ['E'], note: 'Q: eşyayı bırak' },
  { what: 'Üret (tarifler)', keys: ['R'], note: 'Envanterdeki Üret sekmesiyle aynı; tezgaha sağ tıkla da açılır' },
  { what: 'Eşya seç', keys: ['1', '…', '9'], note: 'Fare tekerleği de çalışır' },
  { what: 'Yetenekler', keys: ['Z', 'X', 'G'], note: 'Kanca, planör, portal silahı (kazanınca)' },
  { what: 'Boyut kipi', keys: ['T'], note: 'Portal Tabancasında boyut kipi: ateş, Neon Meridyen\'e kapı açar' },
  { what: 'Kamera, harita', keys: ['F5', 'Tab'] },
  { what: 'Duraklat', keys: ['Esc'], note: 'P de olur' },
]);

export const TOUCH_CONTROLS = Object.freeze([
  { what: 'Hareket', how: 'Sol yarıda parmağını kaydır; ileri çekersen koşarsın' },
  { what: 'Etrafa bak', how: 'Sağ yarıda sürükle' },
  { what: 'Kır / saldır', how: 'Büyük düğmeye bas ve tut' },
  { what: 'Yerleştir, zıpla, çömel', how: 'Sağ alttaki yarı saydam düğmeler' },
  { what: 'Envanter, üretim', how: 'Üstteki çanta ve çekiç (Üret) düğmeleri; pencerede iki sekme olarak durur' },
]);

/** Dokunmatik şema legend'i: düğme kimliği → kısa açıklama (kxTouchLayout düğme kimlikleriyle aynı). */
export const TOUCH_BUTTON_HELP = Object.freeze({
  break: 'Kır / saldır: bas ve tut',
  jump: 'Zıpla (inşa modunda iki kez bas: uçuş)',
  place: 'Yerleştir / kullan: sandık, tezgah, büyü asası',
  crouch: 'Çömel (kenarda düşmeden yürümek için)',
  sprintToggle: 'Koşmayı kilitle',
  interact: 'Etkileş: bakılan şeyi kullan',
});

export const PLAY_TIPS = Object.freeze([
  {
    key: 'craft',
    icon: 'hammer',
    title: 'Üret',
    text: 'Ağaç kes, R ile Üret menüsünü aç: kütük → tahta → tezgah → sandık, ocak, kazma. E ve R aynı pencerenin iki sekmesidir; tezgaha sağ tıklarsan büyük tarifler açılır.',
  },
  {
    key: 'build',
    icon: 'blocks',
    title: 'İnşa',
    text: 'Elindeki blok eşyasına sağ tıkla: yere koyarsın. İnşa modunda zıplamaya iki kez basınca uçarsın, E ile blok paleti açılır.',
  },
  {
    key: 'magic',
    icon: 'wand',
    title: 'Büyü',
    text: 'Büyü Masası ve Simya Kazanı sağ tıkla açılır. Asayı elinde tutup sağ tıkla büyü yap; mana çubuğunu izle.',
  },
  {
    key: 'tech',
    icon: 'chip',
    title: 'Teknoloji',
    text: 'Tezgahta Teknoloji Laboratuvarı yap, yere koy ve sağ tıkla: kablo, jeneratör, lamba, madenci, jetpack, tarayıcı ve Portal Tabancası orada üretilir. Jeneratöre yakıt koy, makineleri kabloyla bağla; makineye sağ tıklayınca açma/kapama anahtarı, lambada ışık rengi çıkar. Portal Tabancasında sol tık mavi, sağ tık turuncu portal açar. T tuşuyla boyut kipine geçersen ateş, Neon Meridyen şehrine boyut kapısı açar (12 şarj; ilk seferde Kuantum Çekirdeği); kapıdan girip şehirdeki Boyut Terminalinden eve dönebilirsin.',
  },
  {
    key: 'puzzle',
    icon: 'puzzle',
    title: 'Bulmacalar',
    text: 'Tapınaklardaki bulmacaları çöz, Anahtar Kristallerini topla. Hepsi tamamsa Mühür Sunağı bir sonraki bölgeyi açar.',
  },
  {
    key: 'night',
    icon: 'moon',
    title: 'Gece',
    text: 'Geceleri ve mağaralarda gölgeler çıkar; meşale yakarsan kaçarlar. Yatak koyarsan yenilince orada doğarsın.',
  },
]);

/* ------------------------------------------------------------------------------------------------
 * Neon Meridyen sayfası (cityhud): boyut kapısı, geçiş, Boyut Terminali. Duraklat > Nasıl Oynanır > "Neon Meridyen".
 *   CITY_LEAD      kısa tanıtım          CITY_STEPS [{key,title,text}]  yolculuk adımları
 *   CITY_CONTROLS  [{what, keys[], note?}]  klavye + fare          CITY_TOUCH [{what, how}]  dokunmatik
 * ---------------------------------------------------------------------------------------------- */
export const CITY_LEAD = 'Neon Meridyen, ışıkların hiç sönmediği, yağmurda yolların parladığı bir şehir. Portal Tabancasıyla boyut kapısı açıp gidersin; Boyut Terminalinden dönersin.';

export const CITY_STEPS = Object.freeze([
  { key: 'gun', title: 'Hazırlan', text: 'Macera modunda Portal Tabancası yeteneği gerekir. İlk kapı için bir Kuantum Çekirdeği, her kapı için 12 şarj harcanır; yedek Enerji Hücresi taşı.' },
  { key: 'mode', title: 'Boyut kipine geç', text: 'Masaüstünde T tuşu, telefonda Portal düğmelerinin yanındaki Boyut kipi düğmesi. Kip açıkken ateş, mavi ve turuncu portal yerine bir boyut kapısı açar.' },
  { key: 'open', title: 'Kapıyı aç', text: 'Önünde 3×4 blokluk boş bir alan olsun ve ateş et. Kapı 30 saniye açık kalır; içinden geç. Kapıyı bozmadan önce kısa bir yükleme çubuğu görebilirsin.' },
  { key: 'city', title: 'Şehri gez', text: 'Bölge adı ekranın üstünde belirir; yağmur yağınca yollar parlar. Işıklı Boyut Terminalleri her bölgede durur; yakınlaşınca ekranda şekil ve yazıyla gösterilir.' },
  { key: 'home', title: 'Eve dön', text: 'Boyut Terminaline bak ve kullan, 6 saniye içinde tekrar kullan: ana diyara dönersin. Çömelerek kullanırsan başlangıç noktasına dönersin. Terminal ücretsizdir.' },
]);

export const CITY_CONTROLS = Object.freeze([
  { what: 'Boyut kipi aç / kapat', keys: ['T'], note: 'Portal Tabancası yeteneği gerekir' },
  { what: 'Boyut kapısı aç', keys: ['Sol tık'], note: 'Boyut kipindeyken; sağ tık da olur' },
  { what: 'Boyut Terminalini kullan', keys: ['Sağ tık'], note: 'Terminale bak; 6 sn içinde tekrar: eve dön' },
  { what: 'Başlangıç noktasına dön', keys: ['C', 'Sağ tık'], note: 'Çömelerek terminali kullan' },
]);

export const CITY_TOUCH = Object.freeze([
  { what: 'Boyut kipi', how: 'Portal düğmelerinin yanındaki Boyut kipi düğmesine dokun; açıkken parlar' },
  { what: 'Boyut kapısı aç', how: 'Boyut kipi açıkken Portal düğmesine bas' },
  { what: 'Boyut Terminali', how: 'Terminale bak ve Etkileş düğmesine bas; 6 saniye içinde tekrar bas: eve dön' },
]);
