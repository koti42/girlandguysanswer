/*
 * KEŞİF — Neon Meridyen REHBERİ (veri). Duraklat > Nasıl Oynanır > "Neon Meridyen" sayfası ile lobideki "Neon Meridyen rehberi" aynı veriyi
 * kullanır (components/game/kesif/CityGuide.jsx). Bu dosya BİLEREK bağımsızdır (hiçbir içe aktarma yok): lobi paketine sim kodu sürüklenmesin.
 *
 * Doğruluk güvencesi: aşağıdaki her sayı `CITY_FACTS` içindedir ve metinler bu sayılardan şablonla üretilir. `__tests__/CityGuide.test.jsx`
 * CITY_FACTS'i GERÇEK oyun kaynaklarıyla (sim/dim/travel.js, vehicleData, missionData, fastTravel, locks, techData, vendorData, ...) karşılaştırır;
 * kural değişirse test kırılır ve rehber güncellenir. Tüm metinler Türkçe, aile dostu, gerçek marka içermez (citySafe taramasından geçer).
 *
 *   CITY_FACTS                      sayılar ve adlar (tek kaynak)
 *   CITY_GUIDE  [{id, title, lead, blocks[]}]   bölümler. blok türleri:
 *       {t:'p', text}                      paragraf
 *       {t:'ol'|'ul', items:[{b?, text}]}  adım / madde listesi (b = kalın başlık)
 *       {t:'table', label, head[], rows[][]}
 *       {t:'keys', label, rows:[{what, keys[], note?}]}   klavye satırları
 *       {t:'note', text}                   vurgulu not
 *   CITY_GUIDE_VERSION              sürüm (içerik değişince artırılır; testler sabitler)
 */

export const CITY_GUIDE_VERSION = 1;

export const CITY_FACTS = Object.freeze({
  gate: Object.freeze({
    cost: 12, ttl: 30, ttlAccessible: 60, w: 3, h: 4, openCooldown: 5, hopCooldown: 20, calibrateSecs: 3, transitionTimeout: 20, terminalConfirm: 6,
  }),
  gun: Object.freeze({ chargeMax: 24, cellCharges: 12 }),
  /* ad ← anahtar (tarif ve eşya adları); test: itemByKey(anahtar).name ile aynı */
  names: Object.freeze({
    'item:portal_tabancası': 'Kuantum Portal Tabancası',
    'item:kuantum_çekirdeği': 'Kuantum Çekirdeği',
    'item:lazer_merceği': 'Lazer Merceği',
    'item:çelik_levha': 'Çelik Levha',
    'item:enerji_çekirdeği': 'Enerji Çekirdeği',
    'item:enerji_hücresi': 'Enerji Hücresi',
    'item:kuantum_külçe': 'Kuantum Külçe',
    'item:kuantum_kıymığı': 'Kuantum Kıymığı',
    'item:kuantum_parçası': 'Kuantum Parçası',
    'item:devre_kartı': 'Devre Kartı',
    'item:pil_hücresi': 'Pil Hücresi',
    'item:kızıltaş_tozu': 'Kızıltaş Tozu',
    'item:altın_külçe': 'Altın Külçe',
    'item:elmas': 'Elmas',
    'item:bakır_tel': 'Bakır Tel',
    'item:kristal_tozu': 'Kristal Tozu',
    'item:demir_külçe': 'Demir Külçe',
    'blok:cam': 'Cam',
    'blok:teknoloji_laboratuvarı': 'Teknoloji Laboratuvarı',
  }),
  /* tarif: [çıktı anahtarı, çıktı adedi, istasyon, [[girdi anahtarı, adet]…]]; test: TECH_RECIPES / RECIPES ile aynı */
  recipes: Object.freeze({
    lab: Object.freeze(['blok:teknoloji_laboratuvarı', 1, 'tezgah', [['item:demir_külçe', 6], ['item:devre_kartı', 2], ['item:çelik_levha', 2], ['blok:cam', 2]]]),
    ecore: Object.freeze(['item:enerji_çekirdeği', 1, 'laboratuvar', [['item:pil_hücresi', 2], ['item:kızıltaş_tozu', 4], ['item:altın_külçe', 1], ['item:devre_kartı', 1]]]),
    lens: Object.freeze(['item:lazer_merceği', 1, 'laboratuvar', [['blok:cam', 2], ['item:elmas', 1], ['item:bakır_tel', 2], ['item:kristal_tozu', 2]]]),
    qcore: Object.freeze(['item:kuantum_çekirdeği', 1, 'laboratuvar', [['item:kuantum_külçe', 2], ['item:enerji_çekirdeği', 1], ['item:devre_kartı', 2], ['item:kuantum_kıymığı', 2]]]),
    gun: Object.freeze(['item:portal_tabancası', 1, 'laboratuvar', [['item:kuantum_çekirdeği', 1], ['item:lazer_merceği', 1], ['item:çelik_levha', 1], ['item:enerji_çekirdeği', 1]]]),
    cellLab: Object.freeze(['item:enerji_hücresi', 2, 'laboratuvar', [['item:pil_hücresi', 1], ['item:kızıltaş_tozu', 2], ['item:bakır_tel', 2]]]),
    cellAnvil: Object.freeze(['item:enerji_hücresi', 4, 'örs', [['item:kuantum_parçası', 1], ['item:kızıltaş_tozu', 1], ['item:demir_külçe', 1]]]),
  }),
  kredi: Object.freeze({
    start: 100, sellRate: 0.4, stockSize: 6, fastTravelCost: 5, fastTravelCooldown: 10, fastTravelBlackout: 3,
    chip: 5, chipStory: 25, graffiti: 15, room: 50, roof: 60, terminal: 10, set: 60, easter: 150, quest: 40, photoSubject: 8, photoAlbum: 30, photoAssignment: 15,
    race: Object.freeze({ bronze: 40, silver: 70, gold: 120 }),
  }),
  jeton: Object.freeze({ firstjob: 20, goldrace: 40, chips60: 60, easter: 30 }),
  /* sınıf: [anahtar, ad, satın alma Kredi, kiralama Kredi (10 dk), satın alma için gereken km, koltuk] */
  vehicles: Object.freeze([
    Object.freeze(['motor', 'Neon Moto', 400, 15, 0, 1]),
    Object.freeze(['taksi', 'Meridyen Taksi', 600, 20, 0, 4]),
    Object.freeze(['kamyonet', 'Yük Kaplanı', 800, 25, 3, 2]),
    Object.freeze(['spor', 'Şimşek GT', 1800, 40, 8, 2]),
    Object.freeze(['hoverbike', 'Rüzgâr Hoverı', 2400, 50, 15, 1]),
    Object.freeze(['suzulkay', 'Süzülkay', 0, 0, 0, 1]),
  ]),
  scan: Object.freeze({ plain: 14, scanner: 36 }),
  garage: Object.freeze({ maxOwned: 6, rentalMinutes: 10, rentalWarnSeconds: 60, summonRadius: 40, enterRadius: 2.8, maxExitSpeed: 6, radioPresets: 6 }),
  counts: Object.freeze({ chips: 240, graffiti: 90, rooms: 30, terminals: 16, races: 8, roofRoutes: 8, questChain: 12, interiors: 16 }),
  jobs: Object.freeze({ offers: 3, tiers: Object.freeze([['Çaylak', 150, 300], ['Usta', 300, 700], ['Efsane', 700, 1400]]) }),
  locks: Object.freeze({
    cooldown: 20, cards: Object.freeze(['Kimlik Kartı 1 (Gri)', 'Kimlik Kartı 2 (Turuncu)', 'Kimlik Kartı 3 (Mor)']),
    games: Object.freeze(['Rün Dizisi', 'Renk Kolları', 'Zar Mantığı']),
  }),
  photo: Object.freeze({
    fovMin: 20, fovMax: 90, distMax: 25, captureMax: 1920, filters: Object.freeze(['Neon', 'Gece Sepyası', 'Siyah Beyaz', 'Retro Bant', 'Pastel', 'Yağmur']),
    frames: Object.freeze(['Çerçevesiz', 'İnce Çerçeve', 'Anlık Kare', 'Sinema Bantları', 'Neon Çerçeve']), albumSubjects: 8,
  }),
  districts: Object.freeze(['Merkez', 'Gece Pazarı', 'Konteyner Mahallesi', 'Liman ve Sanayi', 'Teknoloji Parkı', 'Tepe Konutları']),
  races: Object.freeze(['Çevreyolu Turu', 'Merkez Halkası', 'Pazar Zigzag Turu', 'Konteyner Kupası', 'Liman Turu', 'Teknopark Halkası', 'Kanal Sprinti', 'Tepe Sprinti']),
  radio: Object.freeze(['Neon FM 88.8', 'Gece Taksisi', 'Hız Hattı', 'Pazar Sokağı', 'Yıldız Ambient', 'Sessiz']),
});

const F = CITY_FACTS;
const nm = (key) => F.names[key];
const ing = (list) => list.map(([k, n]) => (n > 1 ? n + ' ' : '1 ') + nm(k)).join(', ');
const rec = (id) => ing(F.recipes[id][3]);
const kredi = (n) => n + ' Kredi';

const VEHICLE_ROWS = F.vehicles.map(([, name, price, rent, km, seats]) => [
  name,
  price > 0 ? kredi(price) : 'Ücretsiz',
  rent > 0 ? kredi(rent) : 'Ücretsiz',
  km > 0 ? km + ' km sür' : 'Hemen',
  String(seats),
]);

/** Tek kaynaktan bölümler. Başlıklar benzersizdir; `id` bölüm bağlantısı ve test anahtarıdır. */
export const CITY_GUIDE = Object.freeze([
  {
    id: 'portal',
    title: 'Portal Tabancasını üret',
    lead: 'Neon Meridyen\'e Portal Tabancasıyla gidilir. Ya Teknoloji Laboratuvarında kendin üretirsin ya da 4. bölgenin koruyucusunu yenince yetenek ve eşya birlikte verilir. Boyut kapısı yalnızca macera modunda açılır.',
    blocks: [
      {
        t: 'ol',
        items: [
          { b: 'Laboratuvarı kur', text: 'Tezgahta ' + nm('blok:teknoloji_laboratuvarı') + ' yap (' + rec('lab') + '). Yere koy, sağ tıkla. Devre Kartı tezgahta, Çelik Levha örste yapılır.' },
          { b: 'Enerji Çekirdeği', text: 'Laboratuvarda 1 ' + nm('item:enerji_çekirdeği') + ': ' + rec('ecore') + '.' },
          { b: 'Lazer Merceği', text: 'Laboratuvarda 1 ' + nm('item:lazer_merceği') + ': ' + rec('lens') + '.' },
          {
            b: 'Kuantum Çekirdeği',
            text: 'Laboratuvarda 1 ' + nm('item:kuantum_çekirdeği') + ': ' + rec('qcore') + '. Kuantum Külçe ocakta 2 Kuantum Parçasından çıkar; Parça ve Kıymık en derindeki Kuantum Kristalinden düşer (Kıymık Kristal Kayadan da seyrek düşer).',
          },
          { b: 'Portal Tabancasını yap', text: 'Laboratuvarda 1 ' + nm('item:portal_tabancası') + ': ' + rec('gun') + '.' },
        ],
      },
      {
        t: 'note',
        text: 'İlk boyut kapısında Portal Tabancası bir Kuantum Çekirdeği daha harcar ("Kalibrasyon", ' + F.gate.calibrateSecs + ' sn). Yani toplamda iki Kuantum Çekirdeği gerekir; kalibrasyon bir kez yapılır.',
      },
    ],
  },
  {
    id: 'kapi',
    title: 'Boyut kipi ve kapı açma',
    lead: 'Portal Tabancası elindeyken (çubukta seçili) boyut kipine geçersin; kipteyken ateş etmek mavi ve turuncu portal yerine bir boyut kapısı açar.',
    blocks: [
      {
        t: 'ol',
        items: [
          { b: 'Portal Tabancasını seç', text: 'Çubukta Portal Tabancasını elinde tut.' },
          { b: 'Boyut kipine geç', text: 'Bilgisayarda T tuşu; telefonda Portal düğmelerinin yanındaki Boyut kipi düğmesi. Kip açıkken düğme parlar.' },
          { b: 'Ateş et', text: 'Önünde ' + F.gate.w + '×' + F.gate.h + ' blokluk boş bir alan olsun. Kapı ' + F.gate.ttl + ' saniye açık kalır; içinden geç.' },
          { b: 'Geçişi bekle', text: 'Birkaç saniyelik bir geçiş ve yükleme çubuğu görürsün. Şehir ' + F.gate.transitionTimeout + ' saniyede hazır olmazsa evine dönersin ve şarjın iade edilir.' },
        ],
      },
      {
        t: 'table',
        label: 'Boyut kapısı kuralları',
        head: ['Kural', 'Değer'],
        rows: [
          ['Her kapı açılışı', F.gate.cost + ' portal şarjı'],
          ['Portal Tabancasının şarj kapasitesi', F.gun.chargeMax + ' şarj (yeni üretilen Portal Tabancası dolu gelir)'],
          ['Şarj bitince', 'Çantandaki 1 Enerji Hücresi ' + F.gun.cellCharges + ' şarj yükler'],
          ['İlk açılış', '+1 Kuantum Çekirdeği (kalibrasyon, bir kez)'],
          ['Kapı açma arası', F.gate.openCooldown + ' sn'],
          ['İki boyut atlaması arası', F.gate.hopCooldown + ' sn (Boyut Terminaliyle dönüş hariç)'],
          ['Kapı ömrü', F.gate.ttl + ' sn; boyut başına en çok 1 kapı'],
          ['Açılamazsa', 'Maliyet alınmaz; ekranda nedeni yazar'],
        ],
      },
      {
        t: 'note',
        text: 'Kapı şu yerlerde açılmaz: parkur sırasında, bulmaca odalarında, boss arenasında, mühür sunağının yanında, su altında ve henüz açmadığın (mühürlü) bölgelerde.',
      },
    ],
  },
  {
    id: 'maliyet',
    title: 'Maliyetler bir bakışta',
    lead: 'Şehirde iki ayrı para vardır: Portal Tabancasının şarjı ve şehir içi para birimi Kredi. Kredi hiçbir oranda jetona çevrilmez.',
    blocks: [
      {
        t: 'table',
        label: 'Maliyet özeti',
        head: ['Ne için', 'Bedel'],
        rows: [
          ['Şehre kapı açmak', F.gate.cost + ' şarj (+ ilk seferde 1 Kuantum Çekirdeği)'],
          ['Eve dönmek (Boyut Terminali)', 'Ücretsiz'],
          ['Enerji Hücresi (laboratuvar)', F.recipes.cellLab[1] + ' hücre: ' + rec('cellLab')],
          ['Enerji Hücresi (örs)', F.recipes.cellAnvil[1] + ' hücre: ' + rec('cellAnvil')],
          ['Hızlı seyahat', kredi(F.kredi.fastTravelCost)],
          ['Araç kiralama', kredi(Math.min.apply(null, F.vehicles.filter((v) => v[3] > 0).map((v) => v[3]))) + ' ile ' + kredi(Math.max.apply(null, F.vehicles.map((v) => v[3]))) + ' arası, ' + F.garage.rentalMinutes + ' dakika'],
          ['Araç satın alma', kredi(F.vehicles[0][2]) + ' ile ' + kredi(Math.max.apply(null, F.vehicles.map((v) => v[2]))) + ' arası'],
        ],
      },
      { t: 'p', text: 'Şehre ilk girdiğinde ' + kredi(F.kredi.start) + ' ile başlarsın. Eve dönünce şehirde kazandığın eşyalar ana diyara taşınır. Yalnızca üç Kimlik Kartı şehre özeldir: şehirden çıkarken saklanır, sonraki girişinde geri verilir.' },
    ],
  },
  {
    id: 'terminal',
    title: 'Dönüş terminalleri',
    lead: 'Şehirde ' + F.counts.terminals + ' Boyut Terminali var. Kapı Meydanı\'ndaki terminalin önüne varırsın; diğerlerini ilk kez kullandığında bulursun: o terminal yeniden doğuş noktan olur ve haritaya işlenir.',
    blocks: [
      {
        t: 'ol',
        items: [
          { b: 'Eve dön', text: 'Terminale bak ve kullan (sağ tık ya da F). Ekranda "tekrar kullan" uyarısı çıkar; ' + F.gate.terminalConfirm + ' saniye içinde bir daha kullan: ana diyara dönersin. Terminal ücretsizdir.' },
          { b: 'Başlangıç noktasına dön', text: 'Çömelerek (C) kullanırsan dünyanın başlangıç noktasına dönersin.' },
          { b: 'Yenilirsen', text: 'Şehirde eşyaların düşmez; en yakın bulunmuş terminalde tam canla yeniden başlarsın.' },
        ],
      },
      { t: 'note', text: 'Terminaller keşif için de önemlidir: her yeni terminal +' + kredi(F.kredi.terminal) + ' kazandırır ve hızlı seyahat noktası olur.' },
    ],
  },
  {
    id: 'arac',
    title: 'Araçlar, garaj ve kiralama',
    lead: 'Araçlara F ile bin (' + F.garage.enterRadius + ' m içinde), yine F ile in. Araçların canı yoktur; çarpmak yalnızca sarsıntı verir, yayalara asla zarar vermez.',
    blocks: [
      {
        t: 'table',
        label: 'Araç sınıfları',
        head: ['Araç', 'Satın alma', 'Kiralama (10 dk)', 'Açılış şartı', 'Koltuk'],
        rows: VEHICLE_ROWS,
      },
      {
        t: 'ul',
        items: [
          { b: 'Kiralama', text: 'Kiralık araç noktalarında iki sergi aracı durur: biri taksi, motor, kamyonet ya da spor, diğeri ücretsiz Süzülkay. Araca binmeyi dene (F): kira ödenir ve araç kira süresince senindir. Garaj panelindeki Kirala sekmesi (kiralık araç noktasının yakınında) her sınıfı kiralar. Kira ' + F.garage.rentalMinutes + ' dakikadır; bitmesine ' + F.garage.rentalWarnSeconds + ' saniye kala uyarı gelir; aynı anda tek kiralık araç tutarsın.' },
          { b: 'Garaj', text: 'Garaj terminalinde Garajım, Satın al ve Kirala sekmeleri vardır. En çok ' + F.garage.maxOwned + ' araç tutarsın (sınıf başına bir). Satın almak için bazı sınıflar yeterince sürmeni ister (tabloda km).' },
          { b: 'Çağırma', text: 'Garaj panelinde etkin aracını seçip Çağır: araç ' + F.garage.summonRadius + ' metre içindeki boş bir park yerine ya da yol kenarına gelir.' },
          { b: 'Boya', text: 'Garajım sekmesinde renk, neon ve zemin ışığı seçeneklerinden seç. Renkler adı ve şekliyle ayrılır.' },
          { b: 'İnme', text: 'Araçtan ancak ' + F.garage.maxExitSpeed + ' m/sn altında inebilirsin; yavaşla ve F\'ye bas.' },
          { b: 'Radyo', text: F.radio.length - 1 + ' istasyon ve Sessiz: ' + F.radio.join(', ') + '. Sürerken 1-' + F.garage.radioPresets + ' tuşlarıyla değiştirirsin.' },
        ],
      },
    ],
  },
  {
    id: 'ic',
    title: 'İç mekânlar, kilitler ve hack',
    lead: 'Binaların çoğuna girilir: ' + F.counts.interiors + ' tür iç mekân (ramen barı, klinik, kulüp, arcade, holo sinema, kitap-kafe ve daha fazlası) vardır. Cephe kapıları sana 2 blok kala kendiliğinden açılır (erişilebilirlik modunda iki kat uzaktan).',
    blocks: [
      {
        t: 'ul',
        items: [
          { b: 'Kapalı kalma yok', text: 'İçerideysen dışarı çıkış her zaman serbesttir; kilitler yalnızca içeri girişte engel olur.' },
          { b: 'Kod kilidi', text: 'Panele 3-4 haneli bir kod girersin. Kod notları, ilan panoları ve sahiplerin ipuçları koda götürür; yanlış denemede hangi hanelerin doğru yerde olduğu gösterilir.' },
          { b: 'Mini oyun kilidi', text: 'Üç tür vardır: ' + F.locks.games.join(', ') + '. Her biri ekranda nasıl oynanacağını yazar.' },
          { b: 'Kart kilidi', text: 'Kimlik kartını okutursun: ' + F.locks.cards.join(', ') + '. Üst seviye kart alt seviye kapıyı da açar. Kartlar bazı kilitleri çözünce verilir.' },
          { b: 'Yanlış deneme', text: 'Kilit ' + F.locks.cooldown + ' saniye dinlenir; kalıcı kilitlenme yoktur. Çözdüğün kilit sonsuza dek açık kalır.' },
          { b: 'Asansör', text: 'Kulelerin çekirdeğinde asansör vardır; durak düğmesine bas, kabine bin. Güç gerekmez.' },
        ],
      },
    ],
  },
  {
    id: 'gorev',
    title: 'Görevler, işler ve yarışlar',
    lead: 'İşler ve yarışlar şehir sakinleriyle konuşarak başlar (bakışını sakine çevir, F ya da sağ tık). Görev sürerken hızlı seyahat ve foto modu kapalıdır; görevi istediğin an bırakabilirsin.',
    blocks: [
      {
        t: 'ul',
        items: [
          { b: 'Kurye işi', text: 'Kuryelere "İş var mı?" de. ' + F.jobs.offers + ' teklif görürsün; süre bitmeden paketi teslim et. Kademeler: ' + F.jobs.tiers.map((t) => t[0] + ' (' + t[1] + '-' + t[2] + ' m)').join(', ') + '. Aynı işleri art arda yapınca ödül azalır.' },
          { b: 'Taksi işi', text: 'Taksi durağındaki sakinden al. En az 2 koltuklu bir araç gerekir; yolcuyu rahat taşıyıp ani fren yapmazsan bahşiş alırsın.' },
          { b: 'Yarışlar', text: F.counts.races + ' yarış var: ' + F.races.join(', ') + '. Hakemle konuş, başlangıç kapısında dur, 3 saniyelik geri sayımı bekle. Kapıları sırayla ve sürerek geç; ışınlanmak ya da araç değiştirmek yarışı iptal eder.' },
          { b: 'Madalya', text: 'Altın, gümüş ve bronz araç sınıfına göre süre eşikleriyle verilir. Madalyanı yükseltince ' + kredi(F.kredi.race.bronze) + ' / ' + kredi(F.kredi.race.silver) + ' / ' + kredi(F.kredi.race.gold) + ' kazanırsın; aynı madalyayı tekrarlarsan ödülün çeyreği verilir.' },
          { b: 'Hikâye ve başarımlar', text: F.counts.questChain + ' adımlık Meridyen görev zinciri ve başarımlar Günlük\'te izlenir; her görev adımı ' + kredi(F.kredi.quest) + ' verir.' },
        ],
      },
    ],
  },
  {
    id: 'kesif',
    title: 'Keşif: çipler, grafiti, gizli odalar',
    lead: 'Şehir keşfetmeye değer: her şey sokaktan, çatıdan ya da yeraltından yürüyerek ulaşılabilir.',
    blocks: [
      {
        t: 'table',
        label: 'Keşif ödülleri',
        head: ['Ne', 'Kaç tane', 'Ödül'],
        rows: [
          ['Veri çipi', String(F.counts.chips), '+' + kredi(F.kredi.chip) + '; her 10 çipte bir Meridyen Günlüğü parçası (+' + kredi(F.kredi.chipStory) + ')'],
          ['Grafiti noktası', String(F.counts.graffiti), '+' + kredi(F.kredi.graffiti) + ' (bir kez; etkileşime geç, kalıp ve renk seç, duvarın yanında 3 sn bekle)'],
          ['Gizli oda', String(F.counts.rooms), '+' + kredi(F.kredi.room) + ' (bulununca)'],
          ['Boyut Terminali', String(F.counts.terminals), '+' + kredi(F.kredi.terminal)],
          ['Çatı parkuru', String(F.counts.roofRoutes), '+' + kredi(F.kredi.roof)],
          ['Koleksiyon seti', 'Setler', '+' + kredi(F.kredi.set) + ' her tamamlanan sete'],
        ],
      },
      { t: 'p', text: 'Veri çipleri yaklaşınca toplanır; parlayan işaretini normalde ' + F.scan.plain + ' metreden, çantanda Tarayıcı varsa ' + F.scan.scanner + ' metreden görürsün. Tarayıcı yakındaki gizli odaları da ipucuyla söyler. Gizli odalar yeraltındadır ve tarayıcıyla, bir düğmeyle ya da kodla açılır. Teknoloji Parkı\'nın altındaki Kasa en gizli yerdir; Mor Kimlik Kartı ister ve içindeki "Diyar Işığı" +' + kredi(F.kredi.easter) + ' verir.' },
    ],
  },
  {
    id: 'foto',
    title: 'Foto modu',
    lead: 'V tuşuyla (telefonda üst çubuktaki Foto düğmesi) açılır ve yalnızca şehirde çalışır. HUD gizlenir, kamera seni (ya da aracını) yörüngede izler.',
    blocks: [
      {
        t: 'ul',
        items: [
          { b: 'Kamera', text: 'Sürükle ya da ok tuşlarıyla bak; en çok ' + F.photo.distMax + ' metre uzaklaşır, duvarların içine girmez. Görüş açısı ' + F.photo.fovMin + '-' + F.photo.fovMax + '°.' },
          { b: 'Görünüm', text: F.photo.filters.length + ' filtre (' + F.photo.filters.join(', ') + '), ' + (F.photo.frames.length - 1) + ' çerçeve (' + F.photo.frames.slice(1).join(', ') + '), pozlama, parlama, vinyet ve film greni, saat ve yağmur ön ayarları. Saat ve yağmur yalnızca görüntüyü değiştirir, dünyanın saatini değiştirmez.' },
          { b: 'Çekim', text: 'Çek ile kare yakalanır (en uzun kenar en çok ' + F.photo.captureMax + ' piksel, JPEG). Kaydet: tarayıcıda dosya olarak iner; mobil uygulamada cihazın kaydetme ekranı açılır (paylaşım menüsü ya da ilk seferde seçeceğin bir klasör). Paylaş: cihaz destekliyorsa paylaşım menüsü. Fotoğraf hiçbir yere yüklenmez.' },
          { b: 'Albüm', text: 'Kadraja ilk kez giren her konu (' + F.photo.albumSubjects + ' konu: terminal, tepe terası, yarış kapısı, kurye masası, şehir sakini, dost robot, araç, kalabalık) +' + kredi(F.kredi.photoSubject) + '; ' + F.photo.albumSubjects + '/' + F.photo.albumSubjects + ' olunca +' + kredi(F.kredi.photoAlbum) + '.' },
        ],
      },
    ],
  },
  {
    id: 'harita',
    title: 'Harita ve hızlı seyahat',
    lead: 'M ya da Tab ile harita açılır (telefonda üst çubuktaki Harita düğmesi). Şehir sisle kaplıdır; yalnızca gezdiğin bölgeler ve bulduğun yerler görünür.',
    blocks: [
      {
        t: 'ul',
        items: [
          { b: 'Bölgeler', text: F.districts.join(', ') + ' ve yeraltındaki Alt Şehir (kanalizasyon, metro, laboratuvarlar).' },
          { b: 'Hızlı seyahat', text: 'Bulunmuş bir Boyut Terminaline ya da bulunmuş metro durağına haritadaki Işınlan düğmesiyle gidersin: ' + kredi(F.kredi.fastTravelCost) + ', ' + F.kredi.fastTravelBlackout + ' saniyelik karartma, ardından ' + F.kredi.fastTravelCooldown + ' saniye dinlenme.' },
          { b: 'Kapalı olduğu durumlar', text: 'Görevdeyken, araçtayken, yakında tehlike varken, kilitli bir odadayken, panel açıkken ve Kredin yetmiyorsa seyahat edilemez; ekranda nedeni yazar.' },
        ],
      },
    ],
  },
  {
    id: 'kredi',
    title: 'Kredi ve jeton',
    lead: 'Kredi şehrin kendi parasıdır; jeton ise siteye ait oyun parasıdır. İkisi ayrıdır ve birbirine çevrilmez.',
    blocks: [
      {
        t: 'ul',
        items: [
          { b: 'Kredi', text: 'İş, yarış, keşif, foto ve görevlerden kazanılır; araç, eşya ve hızlı seyahatte harcanır. Satıcılar tezgâh başına günde ' + F.kredi.stockSize + ' ürün sunar; eşyayı geri satarsan en çok fiyatın %' + Math.round(F.kredi.sellRate * 100) + '\'ı ödenir, bu yüzden al-sat ile Kredi kazanılmaz.' },
          { b: 'Jeton', text: 'Şehirden jeton yalnızca üyeler için dört tek seferlik ödülle gelir: ilk iş +' + F.jeton.firstjob + ', herhangi bir yarışta ilk altın madalya +' + F.jeton.goldrace + ', ' + 60 + '. veri çipi +' + F.jeton.chips60 + ', gizli Diyar Işığı +' + F.jeton.easter + ' (toplam ' + (F.jeton.firstjob + F.jeton.goldrace + F.jeton.chips60 + F.jeton.easter) + '). Her ödül hesap başına bir kez verilir; sunucu yeterince oynadığını da kontrol eder, bu yüzden bazen bir süre beklemen gerekir.' },
          { b: 'Misafir ya da çevrimdışı', text: 'Oturum açmamışsan jeton ödülleri gösterilmez ve istek gönderilmez; Kredi oyunu aynen çalışır.' },
        ],
      },
    ],
  },
  {
    id: 'kontrol',
    title: 'Şehir kontrolleri',
    lead: 'Bilgisayar ve dokunmatik kontroller. Oyun kolu sürüşte de desteklenir.',
    blocks: [
      {
        t: 'keys',
        label: 'Şehirde yürürken (klavye ve fare)',
        rows: [
          { what: 'Hareket', keys: ['W', 'A', 'S', 'D'], note: 'Ok tuşları da çalışır' },
          { what: 'Koş / çömel / zıpla', keys: ['Shift', 'C', 'Boşluk'] },
          { what: 'Etkileş (konuş, kapı, panel, bin/in)', keys: ['F'], note: 'Sağ tık da aynı işi görür' },
          { what: 'Boyut kipi', keys: ['T'], note: 'Portal Tabancası elinde olmalı' },
          { what: 'Envanter, üret', keys: ['E', 'R'] },
          { what: 'Harita', keys: ['M', 'Tab'] },
          { what: 'Foto modu', keys: ['V'] },
          { what: 'Duraklat', keys: ['Esc', 'P'] },
        ],
      },
      {
        t: 'keys',
        label: 'Araçtayken',
        rows: [
          { what: 'Gaz / fren ve geri', keys: ['W', 'S'] },
          { what: 'Direksiyon', keys: ['A', 'D'] },
          { what: 'El freni / nitro', keys: ['Boşluk', 'Shift'] },
          { what: 'Kamera / korna', keys: ['C', 'H'] },
          { what: 'Aracı yola yerleştir', keys: ['R'], note: 'Takılırsan' },
          { what: 'Radyo istasyonu', keys: ['1', '…', '6'], note: '6 = Sessiz' },
          { what: 'Araçtan in', keys: ['F'], note: F.garage.maxExitSpeed + ' m/sn altında' },
        ],
      },
      {
        t: 'ul',
        items: [
          { b: 'Dokunmatik yürüme', text: 'Sol yarıda kaydır: yürü; ileri çekersen koş. Sağ yarıda sürükle: bak. Etkileş düğmesi bakılan şeyi kullanır; üst çubukta Harita, Foto, Günlük ve Duraklat düğmeleri vardır.' },
          { b: 'Dokunmatik sürüş', text: 'Direksiyon (tekerlek ya da kaydırıcı), Gaz, Fren / Geri, El freni, Nitro; üstte İn, Yola, Korna, Kamera, Harita, Duraklat ve Ayar düğmeleri. Ayar\'dan Otomatik gaz, Şerit yardımı ve Sol elli yerleşimi açabilirsin.' },
          { b: 'Oyun kolu (sürüş)', text: 'Sol çubuk direksiyon, sağ tetik gaz, sol tetik fren, A nitro, B el freni.' },
        ],
      },
    ],
  },
  {
    id: 'erisim',
    title: 'Erişilebilirlik seçenekleri',
    lead: 'Ayarlar\'daki Erişilebilirlik modu ve cihazının "hareketi azalt" tercihi şehirde şunları yapar.',
    blocks: [
      {
        t: 'ul',
        items: [
          { b: 'Erişilebilirlik modu', text: 'Daha büyük yazı ve yüksek karşıtlık gelir. Boyut kapısı ' + F.gate.ttlAccessible + ' saniye açık kalır (iki katı); kapılar, iç kapılar ve görev halkaları iki kat geniş algılanır; iş süreleri iki kat uzar (yarış süre sınırı ve madalya eşikleri değişmez).' },
          { b: 'Hareketi azalt', text: 'Cihazının "hareketi azalt" tercihi ya da Erişilebilirlik modu açıkken boyut geçişinde ışık süpürmesi yerine kısa bir karartma kullanılır, hızlı seyahat karartması kısalır, sürüş kamerasında yuvarlanma olmaz.' },
          { b: 'Ekran okuyucu', text: 'Kapı, geçiş, kilit paneli, görev ve hızlı seyahat duyuruları ekran okuyucuya iletilir; durum mesajları canlı bölge olarak bildirilir.' },
          { b: 'Görsel ayrım', text: 'Işık ipuçları ve renk örnekleri renkle birlikte şekil ve yazıyla gösterilir. Yanıp sönen ışık saniyede 3 kezi aşmaz.' },
          { b: 'Dokunma hedefleri', text: 'Şehir panellerinde düğmeler en az 44 piksel boyundadır. Sürüşte Otomatik gaz, Şerit yardımı ve Sol elli yerleşim seçenekleri vardır.' },
        ],
      },
    ],
  },
  {
    id: 'guvenlik',
    title: 'Güvenlik ve ipuçları',
    lead: 'Neon Meridyen aile dostudur: şiddet çizgi film düzeyindedir, sohbet yoktur.',
    blocks: [
      {
        t: 'ul',
        items: [
          { b: 'Robotlar', text: 'Yalnızca Liman ve Sanayi, Konteyner Mahallesi, metro, kanalizasyon ve laboratuvarlarda dolaşan robotlar ve dronlar vardır; Merkez, Gece Pazarı, Teknoloji Parkı, Tepe Konutları ve terminal çevresi güvenlidir. Robotlar hızlıca dağılır; Kolay modda hiç çıkmaz.' },
          { b: 'Yayalar', text: 'Yayalar asla zarar görmez; araçlar yaya yakınında yavaşlar.' },
          { b: 'Kayıt', text: 'Şehirde de oyun kaydedilir; şehirde kaydedip şehirde devam edebilirsin. Üye isen kayıt bulutta tutulur.' },
          { b: 'Takılırsan', text: 'Aracı Yola düğmesiyle (R) yerleştir, en yakın terminale git ya da Boyut Terminaliyle eve dön. Hiçbir kilit seni içeride tutmaz.' },
        ],
      },
    ],
  },
]);

/** Başlık listesi (içerik tablosu ve testler). */
export const CITY_GUIDE_IDS = Object.freeze(CITY_GUIDE.map((s) => s.id));
