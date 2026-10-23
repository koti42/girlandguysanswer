/*
 * KEŞİF sim — görev tanımları (saf veri). Sıra = önerilen oynanış sırası: ilk uygun (açık ve bitmemiş) görev "ana görev"dir.
 * Hedefler progressionMetrics.goalValue ile TOPLAM değerlerden hesaplanır (önceden yapılmış iş sayılır).
 *
 * Görev: {id, chain, title, desc, hint, goal:{type,...}, n, requires:[id], rewards:{items:[{item,count}], xp}}
 * Zincirler (journal sekmeleri): ana, bölge, savaş, parkur, keşif, inşa, yemek.
 */
import { B } from './blocks.js';
import { ZONES } from './constants.js';
import { TREE_QUESTS } from './treeData.js';

export const QUEST_CHAINS = Object.freeze([
  { key: 'ana', name: 'Başlangıç Rehberi' },
  { key: 'bölge', name: 'Bölge Yolculuğu' },
  { key: 'savaş', name: 'Savaş ve Hazırlık' },
  { key: 'parkur', name: 'Parkur Ustası' },
  { key: 'keşif', name: 'Kaşif' },
  { key: 'inşa', name: 'Yapı Ustası' },
  { key: 'yemek', name: 'Mutfak' },
  { key: 'büyü', name: 'Büyü ve Simya' },
  { key: 'teknoloji', name: 'Teknoloji' },
]);

const list = [];
const ids = new Set();

function Q(id, chain, title, desc, hint, goal, n, requires, xp, items) {
  if (ids.has(id)) throw new Error('Görev kimliği çakışması: ' + id);
  ids.add(id);
  const rewards = { xp, items: (items || []).map((p) => ({ item: p[0], count: p[1] })) };
  list.push(Object.freeze({
    id, chain, title, desc, hint, goal: Object.freeze(goal), n, requires: Object.freeze(requires || []),
    rewards: Object.freeze(rewards),
  }));
}

const LOGS = [B.LOG_OAK, B.LOG_BIRCH, B.LOG_PINE, B.LOG_ACACIA];
const PLANKS = ['blok:meşe_tahta', 'blok:huş_tahta', 'blok:çam_tahta', 'blok:akasya_tahta'];
const TIERS = ['ahşap', 'taş', 'bakır', 'demir', 'altın', 'elmas', 'kuantum'];
const SWORDS = TIERS.map((t) => 'item:kılıç_' + t);
const ARMOR_PARTS = ['miğfer', 'göğüslük', 'bacaklık', 'çizme'];
const ARMOR_SETS = ['deri', 'bakır', 'demir', 'altın', 'elmas', 'kuantum'];
const ARMOR_ALL = [];
const ARMOR_IRON = [];
ARMOR_SETS.forEach((s) => ARMOR_PARTS.forEach((p) => {
  ARMOR_ALL.push('item:' + p + '_' + s);
  if (s === 'demir') ARMOR_IRON.push('item:' + p + '_' + s);
}));
const COOKED = ['item:pişmiş_tavuk', 'item:pişmiş_koyun_eti', 'item:pişmiş_balık', 'item:pişmiş_patates'];

/* ---- A. Başlangıç rehberi ---- */
Q('ilk_odun', 'ana', 'İlk Odunlar', 'Bir ağaca yaklaş ve kütük topla.',
  'Bir ağaca yaklaş, kır düğmesini (sol tık) basılı tut: odun düşer.', // kısa: dokunmatikte tek satıra sığar
  { type: 'break', ids: LOGS }, 3, [], 10, [['item:elma', 2]]);
Q('tahta_yap', 'ana', 'Tahtaya Dönüştür', 'Kütüklerden tahta üret.',
  'R tuşuna bas (dokunmatikte Üret düğmesi); Envanter (E) içindeki Üret sekmesi de aynı menüdür. Meşe Kütüğü tarifini seç ve Üret\'e bas: bir kütük dört tahta eder.',
  { type: 'craft', items: PLANKS }, 8, ['ilk_odun'], 10);
Q('tezgah_yap', 'ana', 'Tezgah Kur', 'Dört meşe tahtayla bir tezgah yap.',
  'Üret menüsünde (R) Üretim Tezgahı tarifini seç: 4 meşe tahta yeter, istasyon gerekmez. Diğer tahta türlerini "Meşe Tahta"ya çevirebilirsin.',
  { type: 'craft', items: ['blok:tezgah'] }, 1, ['tahta_yap'], 10);
Q('tezgah_koy', 'ana', 'Tezgahı Yerleştir', 'Tezgahı yere koy; üretim için yanında durman gerekir.',
  'Tezgahı hızlı çubuktan seç, hedef bloğa sağ tıkla (ya da Yerleştir düğmesi). 4 blok yakınındayken tezgah tarifleri açılır; tezgaha sağ tıklayıp Üret\'i de açabilirsin.',
  { type: 'place', ids: [B.WORKBENCH] }, 1, ['tezgah_yap'], 10);
Q('sopa_yap', 'ana', 'Sopalar', 'Alet sapı için sopa üret.',
  'Üret menüsünde (R) Sopa tarifini seç: iki tahtadan dört sopa çıkar, tezgah gerekmez. Sopalar kazma, balta ve kılıçlarda sap olur.',
  { type: 'craft', items: ['item:sopa'] }, 4, ['tezgah_yap'], 10);
Q('ahsap_kazma', 'ana', 'İlk Kazma', 'Tezgahta ahşap bir kazma yap.',
  'Tezgahın yanında Üret menüsünü (R) aç: Ahşap Kazma için 3 tahta ve 2 sopa yeter. Üretince hızlı çubuktan seç.',
  { type: 'craft', items: ['item:kazma_ahşap'] }, 1, ['sopa_yap'], 15);
Q('sandik_yap', 'ana', 'Sandık Yap', 'Tezgahta sekiz tahtayla bir sandık üret.',
  'Tezgahın yanında Üret menüsünü (R) aç, Sandık tarifini seç: 8 meşe tahta gerekir. Sandık eşyalarını güvenle saklar.',
  { type: 'craft', items: ['blok:sandık'] }, 1, ['tezgah_koy'], 15);
Q('sandik_koy', 'ana', 'Sandığı Kur', 'Sandığı yere yerleştir.',
  'Sandığı hızlı çubuktan seç ve hedef bloğa sağ tıkla. Evinin yanına ya da mağara girişine koyabilirsin.',
  { type: 'place', ids: [B.CHEST] }, 1, ['sandik_yap'], 10);
Q('sandik_doldur', 'ana', 'Eşyalarını Sakla', 'Sandığı aç ve içine bir eşya koy.',
  'Sandığa sağ tıkla. Envanterinden bir eşyaya dokun/tıkla, sonra sandık yuvasına koy; Shift + tık hızlı taşır.',
  { type: 'stat', name: 'chestStores' }, 1, ['sandik_koy'], 15);
Q('tas_kir', 'ana', 'Taşı Kır', 'Kazmanla taş kır ve kırıktaş topla.',
  'Taşa kazmayla vur. Kazma olmadan taş çok yavaş kırılır ve eşya düşmez.',
  { type: 'break', ids: [B.STONE, B.COBBLE] }, 10, ['ahsap_kazma'], 15);
Q('tas_kazma', 'ana', 'Taş Kazma', 'Kırıktaşla daha güçlü bir kazma yap.',
  'Taş kazma kömür ve bakır cevheri çıkarabilir. 3 kırıktaş + 2 sopa gerekir.',
  { type: 'craft', items: ['item:kazma_taş'] }, 1, ['tas_kir'], 15);
Q('komur_bul', 'ana', 'Kömür Bul', 'Kömür cevheri kır.',
  'Kömür cevheri koyu benekli taştır. Dağ yamaçlarında ve mağara duvarlarında bulunur.',
  { type: 'break', ids: [B.COAL_ORE] }, 3, ['tas_kazma'], 15);
Q('mesale_yap', 'ana', 'Meşale Yap', 'Kömür ve sopayla meşale üret.',
  'Bir kömür ve bir sopa dört meşale verir. Meşale yaratıkları uzak tutar.',
  { type: 'craft', items: ['blok:meşale'] }, 4, ['komur_bul'], 15);
Q('mesale_koy', 'ana', 'Işığı Yak', 'Karanlık bir yere meşale yerleştir.',
  'Gece ve mağaralarda gölgeler çıkar. Meşale ışığında yaratıklar güçsüzleşir ve kaçar.',
  { type: 'place', ids: [B.TORCH] }, 3, ['mesale_yap'], 15);
Q('ocak_yap', 'ana', 'Ocak İnşa Et', 'Sekiz kırıktaşla ocak yap.',
  'Ocak tezgahta üretilir. Cevherleri eritmek ve yemek pişirmek için gerekir.',
  { type: 'craft', items: ['blok:ocak'] }, 1, ['tas_kazma'], 15);
Q('ocak_koy', 'ana', 'Ocağı Yak', 'Ocağı yerleştir.',
  'Ocağın yanında dur; eritme tarifleri açılır. Yakıt olarak kömür ya da kütük kullan.',
  { type: 'place', ids: [B.FURNACE] }, 1, ['ocak_yap'], 10);
Q('demir_cevheri', 'ana', 'Demir Cevheri', 'Yeraltında demir cevheri kır.',
  'Demir cevheri turuncumsu benekli taştır. Mağaralarda ve derin kayalıklarda ara, taş kazma gerekir.',
  { type: 'break', ids: [B.IRON_ORE] }, 3, ['tas_kazma'], 20);
Q('demir_erit', 'ana', 'Demiri Erit', 'Ham demiri ocakta külçeye çevir.',
  'Ocağın yanında Üret menüsünü (R) aç, "Ocak" sekmesinde tarifi seç; yakıt olarak kömür ya da kütük kullan.',
  { type: 'smelt', items: ['item:demir_külçe'] }, 3, ['ocak_koy', 'demir_cevheri'], 20);
Q('demir_kazma', 'ana', 'Demir Kazma', 'Demir külçeyle kazma yap.',
  'Demir kazma elmasa kadar her cevheri kırar. 3 külçe + 2 sopa gerekir.',
  { type: 'craft', items: ['item:kazma_demir'] }, 1, ['demir_erit'], 30, [['item:şifa_iksiri', 1]]);
Q('ilk_zirh', 'ana', 'İlk Zırh', 'Bir parça zırh üret.',
  'Deri (hayvanlardan), bakır ya da demirle tezgahta zırh yapılır. Çizme en ucuzudur; üretince Envanter\'den Kuşan.',
  { type: 'craft', items: ARMOR_ALL }, 1, ['tas_kazma'], 20);
Q('yatak_yap', 'ana', 'Yatak Yap', 'Yünden ve tahtadan yatak üret.',
  'Koyunlardan yün al; 3 yün ve 3 tahta bir yatak yapar. Yatak doğuş noktanı belirler.',
  { type: 'craft', items: ['blok:yatak'] }, 1, ['tezgah_koy'], 15);
Q('yatak_koy', 'ana', 'Evin Olsun', 'Yatağı yerleştir.',
  'Güvenli bir yer seç ve yatağı koy. Ölürsen son kullandığın yatakta doğarsın.',
  { type: 'place', ids: [B.BED] }, 1, ['yatak_yap'], 10);
Q('yatak_kullan', 'ana', 'İyi Geceler', 'Yatağı kullanarak geceyi geçir.',
  'Yatağa sağ tıkla. Gece uyuyunca sabah olur ve doğuş noktan kaydedilir.',
  { type: 'stat', name: 'bedUses' }, 1, ['yatak_koy'], 15);
Q('ilk_bulmaca', 'ana', 'İlk Bulmaca', 'Bir bulmacayı çöz.',
  'Işık sütunlarına ve küçük türbelere yürü. Plakalara bas, kolları çek, rünleri dene; bulmaca sıkışırsa sıfırlanabilir.',
  { type: 'puzzle' }, 1, ['ahsap_kazma'], 30, [['item:küçük_anahtar', 1]]);
Q('ilk_tapinak', 'ana', 'Anahtar Tapınağı', 'Bir Anahtar Tapınağı bul.',
  'Tapınaklar uzaktan görünen ışık hüzmeleriyle işaretlidir. İçindeki bulmacalar sonunda bir Anahtar Kristali bekler.',
  { type: 'discover', types: ['anahtartapinagi'] }, 1, ['ilk_bulmaca'], 30);

/* ---- B. Bölge yolculuğu ---- */
const zname = (i) => ZONES[i].name;
Q('z0_bulmaca', 'bölge', 'Vadinin Sırları', 'Başlangıç Vadisi\'nde üç bulmaca çöz.',
  'Vadideki türbeleri ve tapınakları gez; bazı bulmacalar yalnızca bakışına ve zamanlamana bağlıdır.',
  { type: 'puzzle', zone: 0 }, 3, ['ilk_bulmaca'], 40);
Q('z0_kristal', 'bölge', 'Vadinin Kristalleri', 'Başlangıç Vadisi\'nin iki tapınağından Anahtar Kristali topla.',
  'Her tapınağın sonundaki sunakta bir Anahtar Kristali bulunur. İkisini de topla.',
  { type: 'crystal', zone: 0 }, ZONES[0].temples, ['ilk_tapinak'], 60);
Q('z0_muhur', 'bölge', 'Mührü Aç', 'Kristalleri Mühür Sunağı\'na yerleştir.',
  'Mühür Sunağı bölgenin kenarındaki kuledir. Kristalleri sunağa koyunca bariyer açılır.',
  { type: 'sealPlace', zone: 0 }, ZONES[0].temples, ['z0_kristal'], 80, [['item:pusula', 1]]);
for (let i = 1; i < ZONES.length; i++) {
  const prev = i === 1 ? 'z0_muhur' : 'z' + (i - 1) + '_muhur';
  const z = ZONES[i];
  Q('z' + i + '_gec', 'bölge', zname(i) + '\'na Geç', zname(i) + ' bölgesine adım at.',
    'Açılan mühür bariyerinden geç. Yeni bölgede yaratıklar ve manzara farklıdır; hazırlıklı gir.',
    { type: 'zone', zone: i }, 1, [prev], 40 + i * 10);
  Q('z' + i + '_bulmaca', 'bölge', zname(i) + ' Bulmacaları', zname(i) + ' içinde üç bulmaca çöz.',
    'Tapınaklar ve türbeler bu bölgede daha zor. Çözemediğin bulmacayı sıfırlayıp yeniden dene.',
    { type: 'puzzle', zone: i }, 3, ['z' + i + '_gec'], 50 + i * 10);
  Q('z' + i + '_kristal', 'bölge', zname(i) + ' Kristalleri', z.temples + ' Anahtar Tapınağından kristal topla.',
    'Her tapınak bir Anahtar Kristali verir. Gözcü kuleleri haritayı açar ve tapınakları bulmana yardım eder.',
    { type: 'crystal', zone: i }, z.temples, ['z' + i + '_gec'], 80 + i * 20);
  Q('z' + i + '_muhur', 'bölge', zname(i) + ' Mührü', 'Kristalleri bu bölgenin Mühür Sunağı\'na yerleştir.',
    'Sunak bölgenin dış sınırındaki kuledir. Kristaller yerleşince ' + (i < ZONES.length - 1 ? 'sonraki bölge açılır ve ' : '')
    + 'boss kapısı çözülür.',
    { type: 'sealPlace', zone: i }, z.temples, ['z' + i + '_kristal'], 100 + i * 30);
  Q('z' + i + '_boss', 'bölge', z.name + ' Boss\'u', 'Bölgenin boss\'unu yen.',
    'Boss arenasına hazırlıklı gir: zırh, iyi bir silah ve şifa iksiri al. Saldırı desenlerini ezberle, her aşamada değişir.',
    { type: 'boss', zone: i }, 1, ['z' + i + '_muhur'], 200 + i * 60);
}
Q('z4_fetih', 'bölge', 'Dünyayı Fethet', 'Gölge Hükümdar\'ı yenerek dünyayı fethet.',
  'Gölge Hükümdar ışınlanır ve minyonlar çağırır. Portal Tabancası ve zırhınla kararlı dur.',
  { type: 'stat', name: 'conquered' }, 1, ['z4_boss'], 500);

/* ---- C. Savaş ve hazırlık ---- */
Q('sv_golge', 'savaş', 'Gölgelerle Yüzleş', 'Üç düşman yaratığı yen.',
  'Gölgeler gece ve karanlıkta çıkar. Işıkta güçsüzleşirler; kılıçla vur, geri tepmeden yararlan.',
  { type: 'kill', kind: 'hostile' }, 3, ['ahsap_kazma'], 25);
Q('sv_kilic', 'savaş', 'Kılıç Çek', 'Bir kılıç üret.',
  'Kılıç, kazma ve baltadan daha hızlı vurur. Tezgahta tahta, taş ya da demirle yapılır.',
  { type: 'craft', items: SWORDS }, 1, ['sopa_yap'], 20);
Q('sv_zirh', 'savaş', 'Zırh Kuşan', 'İki parça zırh üret.',
  'Zırh parçaları hasarı azaltır. Deri koruması hafif, demir güçlüdür; çizme ve miğferle başla.',
  { type: 'craft', items: ARMOR_ALL }, 2, ['demir_erit'], 40);
Q('sv_demir_zirh', 'savaş', 'Boss\'a Hazırlan', 'Dört parça demir zırh üret.',
  'Demir miğfer, göğüslük, bacaklık ve çizme için ocakta yeterince külçe erit.',
  { type: 'craft', items: ARMOR_IRON }, 4, ['sv_zirh'], 60);
Q('sv_yay', 'savaş', 'Okçu', 'Bir yay üret.',
  'Yay için 3 sopa ve 3 ip gerekir. İpi yünden yapabilirsin. Basılı tutarak ger, bırakınca ok atar.',
  { type: 'craft', items: ['item:yay'] }, 1, ['tezgah_koy'], 25);
Q('sv_ok', 'savaş', 'Ok Cephanesi', 'Sekiz ok üret.',
  'Ok için çakmaktaşı, sopa ve tüy gerekir. Kemikçilerden ve tavuklardan malzeme düşer.',
  { type: 'craft', items: ['item:ok'] }, 8, ['sv_yay'], 25);
Q('sv_on', 'savaş', 'Avcı', 'Onbeş yaratık yen.',
  'Yaratıklar parıldayarak dağılır. Zırh ve şifa iksiri her zaman yanında olsun.',
  { type: 'stat', name: 'mobsKilled' }, 15, ['sv_golge'], 50);
Q('sv_elli', 'savaş', 'Usta Avcı', 'Elli yaratık yen.',
  'Her bölgenin kendine özgü yaratıkları var; zayıflıklarını öğren.',
  { type: 'stat', name: 'mobsKilled' }, 50, ['sv_on'], 100);
Q('sv_kalkan', 'savaş', 'Kalkan Ustası', 'Bir kalkan üret.',
  'Kalkan önden gelen hasarı azaltır. 6 tahta ve 1 demir külçe yeter.',
  { type: 'craft', items: ['item:kalkan'] }, 1, ['demir_erit'], 40);
Q('sv_elmas', 'savaş', 'Elmas Avı', 'Üç elmas topla.',
  'Elmas derin mağaralarda bulunur; demir kazma gerekir. Lav ve düşmelere dikkat et.',
  { type: 'pickup', items: ['item:elmas'] }, 3, ['demir_kazma'], 80);
Q('sv_kuantum', 'savaş', 'Kuantum Parçası', 'İki kuantum parçası topla.',
  'Kuantum kristali yalnızca çok derin ve gizli kristal mağaralarında bulunur; elmas kazma ister.',
  { type: 'pickup', items: ['item:kuantum_parçası'] }, 2, ['sv_elmas'], 120);
Q('sv_tufek', 'savaş', 'Işın Tüfeği', 'Örste bir ışın tüfeği üret.',
  'Örs için demir blok yerleştir. Tüfek için demir, kuantum, kızıltaş tozu ve cam gerekir.',
  { type: 'craft', items: ['item:ışın_tüfeği'] }, 1, ['sv_kuantum'], 150);

/* ---- D. Parkur ---- */
Q('pk_1', 'parkur', 'Bronz Parkur', 'Bir Bronz parkuru bitir.',
  'Başlangıç plakasına bas ve kontrol noktalarından geç. Düşersen son kontrol noktasına dönersin.',
  { type: 'parkour', tier: 1 }, 1, ['ahsap_kazma'], 40);
Q('pk_2', 'parkur', 'Gümüş Parkur', 'Bir Gümüş parkuru bitir.',
  'Hareketli ve kaybolan platformlar var; zamanlamana güven.',
  { type: 'parkour', tier: 2 }, 1, ['pk_1'], 60);
Q('pk_3', 'parkur', 'Altın Parkur', 'Bir Altın parkuru bitir.',
  'Buz kayması ve itme alanları; hızını koşuyla ve çömelerek kontrol et.',
  { type: 'parkour', tier: 3 }, 1, ['pk_2'], 90);
Q('pk_4', 'parkur', 'Elmas Parkur', 'Bir Elmas parkuru bitir.',
  'Dönen engeller ve kanca noktaları. Çift zıplama botları ve kanca çok işine yarar.',
  { type: 'parkour', tier: 4 }, 1, ['pk_3'], 150);
Q('pk_5', 'parkur', 'Kuantum Parkur', 'Bir Kuantum parkuru bitir.',
  'En zor parkur: planör halkaları ve kusursuz sıçrayışlar. Sabırlı ol.',
  { type: 'parkour', tier: 5 }, 1, ['pk_4'], 300, [['item:yıldız', 3]]);
Q('pk_hizli', 'parkur', 'Yıldırım', 'Bir parkuru 90 saniyenin altında bitir.',
  'Rotayı ezberle: koşarak ve kısa yoldan ilerle. Zamanın parkur başlangıcında görünür.',
  { type: 'stat', name: 'fastParkour' }, 1, ['pk_1'], 80);

/* ---- E. Keşif ---- */
Q('ks_biyom3', 'keşif', 'Üç Biyom', 'Üç farklı biyom keşfet.',
  'Çayır, orman, çöl, tundra, bataklık... Yürüdükçe yeni biyomlar günlüğüne eklenir.',
  { type: 'stat', name: 'biomesDiscovered' }, 3, [], 30);
Q('ks_mesafe1', 'keşif', 'İlk Kilometre', 'Toplam bin blok yol yürü.',
  'Koş (Shift) ve ufka doğru yürü; yeni yerler görürsün.',
  { type: 'stat', name: 'distance' }, 1000, [], 30);
Q('ks_kule', 'keşif', 'Gözcü', 'Bir gözcü kulesi bul.',
  'Kulenin tepesine çıkınca çevredeki harita açılır. Uzakta yükselen ince kuleleri ara.',
  { type: 'discover', types: ['gozcukulesi'] }, 1, [], 40);
Q('ks_kamp', 'keşif', 'Sıcak Bir Kamp', 'Bir kamp ya da köy bul.',
  'Kamplarda sandık ve ateş bulunur. Dumana ve ışığa doğru yürü.',
  { type: 'discover', types: ['kamp', 'koy'] }, 1, [], 30);
Q('ks_turbe', 'keşif', 'Türbe Avcısı', 'Bir bulmaca türbesi bul.',
  'Türbeler küçüktür ama ödül sandığı ve yeni tarifler verir.',
  { type: 'discover', types: ['turbe'] }, 1, [], 30);
Q('ks_harabe', 'keşif', 'Eski Harabeler', 'Bir harabe keşfet.',
  'Harabelerde eski sandıklar ve gizli geçitler olabilir.',
  { type: 'discover', types: ['harabe'] }, 1, [], 30);
Q('ks_hazine', 'keşif', 'Hazine Avı', 'Bir hazine sandığı bul.',
  'Hazineler genelde saklı köşelerde ve mağara uçlarındadır.',
  { type: 'discover', types: ['hazine'] }, 1, [], 40);
Q('ks_magara', 'keşif', 'Gizli Oda', 'Gizli bir mağara odası bul.',
  'Mağara duvarlarındaki çatlaklara ve ışıldayan mantarlara dikkat et.',
  { type: 'discover', types: ['gizlimagara'] }, 1, [], 40);
Q('ks_yuzen', 'keşif', 'Gökteki Ada', 'Bir yüzen adaya ulaş.',
  'Yüzen adalara çift zıplama, kanca ya da planörle ulaşılır.',
  { type: 'discover', types: ['yuzenada'] }, 1, [], 60);
Q('ks_harita5', 'keşif', 'Harita Çizici', 'Dünyanın yüzde 5\'ini keşfet.',
  'Haritanı (Tab) aç; bilinmeyen kısımları yürüyerek ve kulelerden açabilirsin.',
  { type: 'stat', name: 'exploredPct' }, 5, [], 60);
Q('ks_biyom6', 'keşif', 'Biyom Koleksiyoncusu', 'Altı farklı biyom keşfet.',
  'Her bölge farklı biyomlar barındırır. Kristal vadileri en nadir olanlardır.',
  { type: 'stat', name: 'biomesDiscovered' }, 6, ['ks_biyom3'], 60);
Q('ks_biyom12', 'keşif', 'Biyom Ustası', 'On iki farklı biyom keşfet.',
  'Sonbahar ormanı, kiraz bahçesi, yağmur ormanı, buzul, yanardağ… Dünya geniş: yürüdükçe yeni yerler çıkar.',
  { type: 'stat', name: 'biomesDiscovered' }, 12, ['ks_biyom6'], 90);
Q('ks_mesafe2', 'keşif', 'Uzun Yürüyüş', 'Toplam beş bin blok yol yürü.',
  'Hızlı gitmek için koş; yol boyunca mühürlü sınırları ve işaret kulelerini izle.',
  { type: 'stat', name: 'distance' }, 5000, ['ks_mesafe1'], 80);
Q('ks_yapi10', 'keşif', 'Gezgin', 'On farklı yapı keşfet.',
  'Tapınaklar, türbeler, kamplar, kuleler... Keşif günlüğünü doldur.',
  { type: 'stat', name: 'structuresDiscovered' }, 10, ['ks_kule'], 80);
Q('ks_harita15', 'keşif', 'Usta Kaşif', 'Dünyanın yüzde 15\'ini keşfet.',
  'Gözcü kuleleri bir seferde geniş alan açar; onları atlama.',
  { type: 'stat', name: 'exploredPct' }, 15, ['ks_harita5'], 120);

/* ---- F. İnşa ---- */
Q('yp_otuz', 'inşa', 'İlk Duvarlar', 'Otuz blok yerleştir.',
  'Bloğu seç ve bir hedefe sağ tıkla. Çömelerek (Shift) kenardan düşmeden inşa et.',
  { type: 'stat', name: 'blocksPlaced' }, 30, ['tezgah_koy'], 20);
Q('yp_cam', 'inşa', 'Pencere', 'Dört cam yerleştir.',
  'Camı kumu ocakta eriterek yaparsın. Renkli cam için boya kullan.',
  { type: 'place', ids: [B.GLASS] }, 4, ['yp_otuz', 'ocak_koy'], 25);
Q('yp_kapi', 'inşa', 'Kapı Aç', 'Bir kapı yerleştir.',
  'Kapı 6 tahtadan yapılır. Sağ tıkla aç ve kapat.',
  { type: 'place', ids: [B.DOOR] }, 1, ['yp_otuz'], 25);
Q('yp_sandik', 'inşa', 'Depo', 'Bir sandık yerleştir.',
  'Sandık 8 tahtayla yapılır ve eşyalarını saklar. Sandığın içi ölünce de güvende kalır.',
  { type: 'place', ids: [B.CHEST] }, 1, ['yp_otuz'], 25);
Q('yp_merdiven', 'inşa', 'Yukarı Çık', 'Bir merdiven yerleştir.',
  'Merdiven 7 sopadan üç adet verir (tezgah). Duvara ya da havaya dizip bakarak ileri git; tırmanırsın.',
  { type: 'place', ids: [B.LADDER] }, 1, ['yp_otuz'], 25);
Q('yp_kesici', 'inşa', 'Taş Kesici', 'Bir taş kesici üret.',
  'Tezgahta 3 taş (kırıktaşı ocakta pişir) ve 1 bakır külçe yeter. Taş kesicinin yanında basamak, plaka ve sütun ucuza kesilir.',
  { type: 'craft', items: ['blok:taş_kesici'] }, 1, ['ocak_koy'], 30);
Q('yp_dokuma', 'inşa', 'Dokuma Tezgahı', 'Bir dokuma tezgahı üret.',
  'Tezgahta 2 ip ve 2 meşe tahta yeter. Yanında kumaşı ucuza dokur ve boyarsın; boyalar çiçek, mantar ve kristallerden çıkar.',
  { type: 'craft', items: ['blok:dokuma_tezgahı'] }, 1, ['tezgah_koy'], 30);
Q('yp_fener', 'inşa', 'Fener Yak', 'İki fener yerleştir.',
  'Fener için meşale ve demir külçe gerekir. Işık seviyesi yüksekken yaratıklar doğmaz.',
  { type: 'place', ids: [B.LANTERN] }, 2, ['mesale_koy'], 30);
Q('yp_yuz', 'inşa', 'Küçük Ev', 'Yüz blok yerleştir.',
  'Duvar, çatı ve kapıyla güvenli bir barınak kur.',
  { type: 'stat', name: 'blocksPlaced' }, 100, ['yp_otuz'], 40);
Q('yp_renk', 'inşa', 'Renk Ustası', 'Onbeş farklı blok türü yerleştir.',
  'Tuğla, beton, kumaş, cam... Boyalarla renkli yapılar kur.',
  { type: 'stat', name: 'distinctBlocksPlaced' }, 15, ['yp_yuz'], 60);
Q('yp_bin', 'inşa', 'Mimar', 'Beş yüz blok yerleştir.',
  'Büyük bir yapı kur: kule, köprü ya da bir köy.',
  { type: 'stat', name: 'blocksPlaced' }, 500, ['yp_yuz'], 100);

/* ---- G. Yemek ---- */
Q('yk_ye', 'yemek', 'Karnını Doyur', 'Beş kez yemek ye.',
  'Yiyeceği seç ve kullan (sağ tık). Açlık dolu değilse can yenilenmez.',
  { type: 'eat' }, 5, [], 15);
Q('yk_pisir', 'yemek', 'Ocak Başı', 'Üç yemek pişir.',
  'Çiğ et, balık ve patatesi ocakta pişir; daha çok doyurur ve can yeniler.',
  { type: 'smelt', items: COOKED }, 3, ['ocak_koy'], 25);
Q('yk_corba', 'yemek', 'Sıcak Çorba', 'Bir mantar çorbası yap.',
  'Işıklı mantar mağaralarda yetişir. İki mantar ve bir kase çorba olur.',
  { type: 'craft', items: ['item:mantar_çorbası'] }, 1, ['yk_pisir'], 30);
Q('yk_iksir', 'yemek', 'Şifacı', 'Bir şifa iksiri yap.',
  'Cam şişe, iki çilek ve kızıltaş tozu gerekir. Boss savaşları öncesi ihtiyacın olacak.',
  { type: 'craft', items: ['item:şifa_iksiri'] }, 1, ['yk_pisir', 'tas_kazma'], 40);

/* ---- H. Büyü ve Simya (magicData.js; Büyü Masası, Simya Kazanı, asalar, iksirler) ---- */
const STAFFS = ['item:asa_ates', 'item:asa_buz', 'item:asa_sifa', 'item:asa_kuantum'];
Q('by_toz', 'büyü', 'Büyü Tozu', 'Beş Büyü Tozu topla.',
  'Ametist kümeleri, kuantum kristali, kristal böcekleri ve sandıklar toz verir. Ametist parçası ile kristal tozunu birleştirerek de yapabilirsin.',
  { type: 'pickup', items: ['item:büyü_tozu'] }, 5, ['tas_kazma'], 25);
Q('by_kitaplik', 'büyü', 'Kitaplık Çemberi', 'Üç kitaplık üret.',
  'Büyü Masası\'nın çevresindeki kitaplıklar büyü kademesini belirler. Kitaplık için 6 tahta ve 3 kitap gerekir.',
  { type: 'craft', items: ['blok:kitaplık'] }, 3, ['by_toz', 'tezgah_koy'], 30);
Q('by_masa_yap', 'büyü', 'Büyü Masası', 'Bir Büyü Masası üret.',
  'Tezgahta: bir kitap, dört bazalt, iki Kuantum Kıymığı ve iki kristal tozu. Kıymıklar sandıklardan ve kristal böceklerinden çıkar.',
  { type: 'craft', items: ['blok:büyü_masası'] }, 1, ['by_kitaplik'], 40);
Q('by_masa_koy', 'büyü', 'Masayı Kur', 'Büyü Masası\'nı yerleştir.',
  'Masanın dört blok çevresine kitaplık diz: her kitaplık bir üst kademeyi açar (en çok beş).',
  { type: 'place', ids: [B.MAGIC_TABLE] }, 1, ['by_masa_yap'], 20, [['item:büyü_tozu', 6]]);
Q('by_ilk_buyu', 'büyü', 'İlk Büyü', 'Bir eşyayı büyüle.',
  'Masaya sağ tıkla, büyülemek istediğin aleti ya da zırhı seç ve üç tekliften birini al. Bedeli Büyü Tozudur.',
  { type: 'stat', name: 'enchants' }, 1, ['by_masa_koy'], 50);
Q('by_usta_buyu', 'büyü', 'Büyü Ustası', 'On büyü yap.',
  'Keskinlik, Verimlilik, Koruma... Eşyalarına birden çok büyü eklenebilir. Daha yüksek kademe için kitaplık say.',
  { type: 'stat', name: 'enchants' }, 10, ['by_ilk_buyu'], 100, [['item:mana_kristali', 1]]);
Q('by_kazan', 'büyü', 'Simya Kazanı', 'Bir Simya Kazanı üret ve yerleştir.',
  'Beş demir külçe ve üç taş yeter. Kazan iksirleri otuz saniyede demler; yanında boş cam şişeler lazım.',
  { type: 'place', ids: [B.ALCHEMY_CAULDRON] }, 1, ['tezgah_koy', 'demir_erit'], 40);
Q('by_iksir', 'büyü', 'İlk İksir', 'Kazanda bir iksir demle.',
  'Kazana sağ tıkla, tarifi seç, boş şişeleri koy ve otuz saniye bekle. Hazır olunca iksirleri al.',
  { type: 'stat', name: 'potionsBrewed' }, 1, ['by_kazan'], 50);
Q('by_iksir_ic', 'büyü', 'Bir Yudum', 'Bir iksir iç.',
  'İksiri seç ve kullan. Hız, Zıplama, Güç gibi etkiler süre dolana dek sürer; rozetleri ekranın köşesinde görürsün.',
  { type: 'stat', name: 'potionsDrunk' }, 1, ['by_iksir'], 30);
Q('by_asa', 'büyü', 'Büyü Asası', 'Bir büyü asası üret.',
  'Ateş Topu, Buz, Şifa ya da Kuantum Sıçrayışı asası; hepsi Büyü Tozu ister. Sağ tıkla: büyü at (mana harcar).',
  { type: 'craft', items: STAFFS }, 1, ['by_masa_koy'], 60);
Q('by_ilk_atis', 'büyü', 'İlk Büyü Atışı', 'Asanla bir büyü at.',
  'Mana çubuğu can kalplerinin hemen üstünde durur ve büyü yapmadığında dolar. Mana Kristali azami manayı artırır.',
  { type: 'stat', name: 'spellsCast' }, 1, ['by_asa'], 40);

/* ---- Ağaç devirme (treeData.js) ---- */
TREE_QUESTS.forEach((q) => {
  Q(q.id, 'keşif', q.title, q.desc, q.hint, { type: 'stat', name: q.id === 'ks_agac_dik' ? 'treesGrown' : 'treesFelled' }, q.n, q.requires.slice(), q.xp);
});

/* ---- Teknoloji (techData.js; Laboratuvar, enerji ağı, makineler, cihazlar, portal) ---- */
Q('tk_devre', 'teknoloji', 'Devre Kartı', 'İki Devre Kartı üret.',
  'Tezgahta önce Bakır Tel (2 bakır külçeden 6 tel), sonra Devre Kartı: 4 tel, 2 kızıltaş tozu ve 1 kristal tozu gerekir.',
  { type: 'craft', items: ['item:devre_kartı'] }, 2, ['demir_erit'], 40);
Q('tk_lab_yap', 'teknoloji', 'Teknoloji Laboratuvarı', 'Teknoloji Laboratuvarını üret.',
  'Tezgahta: 6 demir külçe, 2 Devre Kartı, 2 Çelik Levha (örste 2 demir külçe + 2 kömür) ve 2 cam.',
  { type: 'craft', items: ['blok:teknoloji_laboratuvarı'] }, 1, ['tk_devre'], 50);
Q('tk_lab_koy', 'teknoloji', 'Laboratuvarı Kur', 'Laboratuvarı yerleştir.',
  'Laboratuvarın yanında dur: Üret menüsünde Teknoloji tarifleri açılır. Kablo, güneş paneli, jeneratör, pil ve daha fazlası orada.',
  { type: 'place', ids: [B.TECH_LAB] }, 1, ['tk_lab_yap'], 30, [['item:bakır_tel', 12]]);
Q('tk_enerji', 'teknoloji', 'Enerji Üret', 'Bir güneş paneli ve bir yakıt jeneratörü yerleştir.',
  'Güneş paneli gündüz enerji verir, üstü açık olmalı. Jeneratörle etkileşime geç ve kömür ya da odun koy. Kablolarla ya da yan yana dizerek bağla.',
  { type: 'place', ids: [B.TECH_SOLAR, B.TECH_GENERATOR] }, 2, ['tk_lab_koy'], 60);
Q('tk_lamba', 'teknoloji', 'Işığı Aç', 'İki lamba paneli yerleştir.',
  'Lamba paneli enerji gelince parlak yanar. Bir kablo hattıyla enerji kaynağına bağla; araya düğme koyarsan anahtar olur.',
  { type: 'place', ids: [B.TECH_LAMP] }, 2, ['tk_enerji'], 40);
Q('tk_madenci', 'teknoloji', 'Otomatik Madenci', 'Madencilerinle toplam 25 blok kaz.',
  'Madenciyi yere koy, enerji bağla: 20 EU/sn ister, yani iki jeneratör ya da jeneratör + pil gerekir. Sütun ya da 5x5 alanı aşağı doğru kazar; yanına sandık koyarsan eşyaları oraya boşaltır. Ana kayada durur.',
  { type: 'stat', name: 'drillBlocks' }, 25, ['tk_lamba'], 80);
Q('tk_ucus', 'teknoloji', 'Jetpack', 'Bir jetpack üret.',
  'Çubukta taşırken havada zıplama düğmesini basılı tut. Yakıt biterse Enerji Hücresi harcanır; yakıtı Şarj İstasyonunda da doldurabilirsin.',
  { type: 'craft', items: ['item:jetpack'] }, 1, ['tk_lab_koy'], 80);
Q('tk_tarayici', 'teknoloji', 'Tarayıcı', 'Tarayıcıyla üç tarama yap.',
  'Tarayıcıyı çubukta taşı: belli aralıkla cevher, yapı ve canlıları işaretler. Her tarama şarj harcar.',
  { type: 'stat', name: 'scans' }, 3, ['tk_lab_koy'], 60);
Q('tk_isinla', 'teknoloji', 'Işınlanma', 'Bir ışınlanma platformuyla ışınlan.',
  'İki platformu aynı frekansa ayarla (4 sembol), enerji ver, birinin üstünde dur ve platformla etkileşime geç. Her ışınlanma enerji harcar ve bekleme süresi vardır.',
  { type: 'stat', name: 'teleports' }, 1, ['tk_enerji'], 80);
Q('tk_portal', 'teknoloji', 'Portal Silahı', 'Bir Kuantum Portal Tabancası üret.',
  'Laboratuvarda: Kuantum Çekirdeği, Lazer Merceği, Çelik Levha ve Enerji Çekirdeği. Kuantum Çekirdeği için kuantum külçe ve kıymık gerekir.',
  { type: 'craft', items: ['item:portal_tabancası'] }, 1, ['tk_lab_koy'], 150);
Q('tk_portal_gez', 'teknoloji', 'Portal Yolcusu', 'Portallardan beş kez geç.',
  'Sol tık mavi, sağ tık turuncu portal açar (dokunmatik: portal düğmesi sırayla ikisini açar). Düz, sağlam duvar, zemin ve tavan yüzlerine açılır; aynı renk yeni portal eskisini taşır. Her atış 1 şarj harcar; şarj bitince Enerji Hücresi yüklenir. Bulmaca odalarında ve mühür çevresinde çalışmaz.',
  { type: 'stat', name: 'portalsUsed' }, 5, ['tk_portal'], 120);

export const QUESTS = Object.freeze(list);
export const QUEST_BY_ID = Object.freeze(list.reduce((m, q) => { m[q.id] = q; return m; }, {}));
export const QUEST_ORDER = Object.freeze(list.reduce((m, q, i) => { m[q.id] = i; return m; }, {}));
