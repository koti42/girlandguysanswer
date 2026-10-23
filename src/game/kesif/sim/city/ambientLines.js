/*
 * KEŞİF sim/city — genel ortam diyaloğu ("bark") satırları (saf veri + belirlenimci seçici).
 *
 * Yayalar, kahraman NPC'ler ve balonlar için tek satırlık, aile dostu, Türkçe replikler (≤60 kr; ≤2×34 kr'a
 * bölünebilir). Gruplar: genel, zaman dilimi (sabah/gündüz/akşam/gece), hava (yağmur/sis), bölge, yaya tipi.
 * Seçim `hash3` tabanlıdır (Math.random yok): `pickAmbient(seed, slot, ctx, recent)`; son 4 satır tekrarlanmaz.
 * Tipler (`ctx.type`) sözleşme §10: halk cocuk turist satici kapici kurye temizlik_robotu dost_dron.
 *
 * API: AMBIENT_LINES · AMBIENT_BY_TYPE · AMBIENT_BY_DISTRICT · PED_TYPES · PHASE_KEYS
 *      phaseKeyForHour(h) · ambientPool(ctx) -> [{id,text}] · pickAmbient(seed, slot, ctx, recent?) -> {id,text}
 */
import { hash3, stringSeedToInt } from '../rng.js';

export const PED_TYPES = Object.freeze([
  'halk', 'cocuk', 'turist', 'satici', 'kapici', 'kurye', 'temizlik_robotu', 'dost_dron',
]);
export const PHASE_KEYS = Object.freeze(['sabah', 'gunduz', 'aksam', 'gece']);
export const RECENT_NO_REPEAT = 4;

const f = (a) => Object.freeze(a.slice());

/** Koşul gruplarının genel satırları. */
export const AMBIENT_LINES = Object.freeze({
  genel: f([
    'Bugün şehir ne kadar parlak!',
    'Terminale giden yolu biliyor musun?',
    'Neon ışıkları hiç uyumuyor.',
    'Şu holo reklamı gördün mü?',
    'Burada her sokağın bir hikâyesi var.',
    'Çay içmeden olmaz bu şehirde.',
    'Kaybolursan haritaya bak.',
    'Metro bugün de zamanında.',
    'Şu dron bana el salladı sanki!',
    'Şehir yürüyünce daha güzel.',
    'Sokak lambaları ne güzel parlıyor.',
    'Yürüyüş için harika bir gün.',
    'Bir yerde veri çipi saklıymış, duydun mu?',
    'Yeni yerler keşfetmek bedava!',
    'Her köşede küçük bir sürpriz var.',
  ]),
  sabah: f([
    'Günaydın! Neonlar yavaş yavaş sönüyor.',
    'Sabah simidi kaçmaz, git al!',
    'Güneş gökdelenlerin arkasından çıkıyor.',
    'Sabahın serinliği çok güzel.',
    'Fırından taze koku geliyor.',
    'Erken kalkan yola çıkar.',
    'Kuşlar bile erkenden şarkıda.',
    'Bugün güzel bir gün olacak!',
  ]),
  gunduz: f([
    'Güneş tepede, camlar kamaşıyor.',
    'Öğle arası: sıcak bir şey yemeli.',
    'Gün ışığında şehir başka görünüyor.',
    'Gölgede biraz dinlen.',
    'Cam kulelerde güneş oynuyor.',
    'Çatıdaki bahçeler çok güzel.',
    'Gün boyu yürüsem yorulmam.',
    'Dondurma havası!',
  ]),
  aksam: f([
    'Akşam oldu, neonlar yanıyor!',
    'Gün batımı camlarda pembe.',
    'Akşam yürüyüşü en güzeli.',
    'Işıklar yanmaya başladı, bak.',
    'Pazar akşamları daha kalabalık.',
    'Gökyüzü pembeye döndü.',
    'Akşam çayı vakti geldi.',
    'Neonlar uyanıyor, şehir de.',
  ]),
  gece: f([
    'Gece şehir bir ışık denizi.',
    'Yıldızlar neonların arasında kayboldu.',
    'Geceleri holo reklamlar daha parlak.',
    'Gece yürüyüşü sakin ve güzel.',
    'Işıklı sokaklar güvenli sokaklardır.',
    'Şu pencerelerin hepsi yanıyor, bak.',
    'Gece de açık dükkânlar var.',
    'Şehir geceleri fısıldıyor.',
  ]),
  yagmur: f([
    'Bu yağmur neonları daha güzel yapıyor!',
    'Yağmurda yollar aynaya döndü, baksana!',
    'Şemsiyem yanımda, sen?',
    'Yağmurda ıslak yollar parlıyor.',
    'Sığınak yakında, koş!',
    'Damlalar neonda dans ediyor.',
    'Yağmur kokusu çok güzel.',
    'Su birikintilerine basma, ıslanırsın!',
    'Çay içmenin tam zamanı.',
    'Yağmur dinince gökkuşağı çıkar mı?',
  ]),
  sis: f([
    'Sis gelince şehir bir rüya gibi.',
    'Neonlar sisin içinde yüzüyor.',
    'Sisli havada yavaş yürü.',
    'Sis kalkınca manzara çok güzel.',
    'Sisin içinden bir dron geçti.',
  ]),
});

/** Bölge anahtarları `cityBrands.DISTRICT_KEYS` ile aynıdır. */
export const AMBIENT_BY_DISTRICT = Object.freeze({
  merkez: f([
    'Merkez\'de gökdelenler bulutlara değiyor.',
    'Kuleler öyle yüksek ki başım dönüyor.',
    'Helipadda ne var, merak ediyorum.',
    'Merkez Meydanı bugün de kalabalık.',
    'Şu cam köprüden bakmak lazım.',
    'Burada her şey parlak ve düzenli.',
    'Kulelerin tepesinden şehir minicik.',
  ]),
  gece_pazari: f([
    'Pazarın kokusu buraya kadar geliyor!',
    'Tezgâhlarda yeni lezzetler var.',
    'Pazarda her şey taze ve renkli.',
    'Şu tentelerin altı hep kalabalık.',
    'Simit mi alsam, pide mi?',
    'Fenerler sokakları ısıtıyor.',
    'Pazar sokağında sıcak çay içilir.',
  ]),
  konteyner: f([
    'Konteynerler gökkuşağı gibi dizilmiş.',
    'Çatılardan çatılara atlamak eğlenceli.',
    'Şu turuncu kutu en sevdiğim.',
    'Mahalle küçük ama çok renkli.',
    'Burada çatıda yarış yaparız.',
    'Kutuların arasında saklambaç oynanır.',
    'Burası şehrin en renkli köşesi.',
  ]),
  liman: f([
    'Vinçler dev kuşlar gibi duruyor.',
    'Liman akşamları kehribar renkte.',
    'Dalga sesi neonlarla karışıyor.',
    'Rıhtımda biraz yürüyelim.',
    'Gemiler sabaha doğru yanaşır.',
    'Burası işçilerin dostça mahallesi.',
    'Kanal suyu bugün çok sakin.',
  ]),
  teknoloji: f([
    'Teknoloji Parkı\'nda her şey otomatik.',
    'Şu laboratuvarda ne yapıyorlar acaba?',
    'Devreler burada çiçek açıyor.',
    'Bu parkta robotlar bile gülümsüyor.',
    'Sinyal çok güçlü, hissediyor musun?',
    'Kuantum bahçesi harika görünüyor.',
    'Teknoparkta yarının icatları var.',
  ]),
  tepe: f([
    'Tepede hava daha temiz.',
    'Bahçeler çok güzel bakılmış.',
    'Teraslardan şehir harika görünüyor.',
    'Burada her ev bir çiçek bahçesi.',
    'Tepeye çıkan yol dik ama değer.',
    'Rüzgâr burada daha tatlı eser.',
    'Gün batımını en iyi buradan izlenir.',
  ]),
});

/** Yaya tipine özgü satırlar. */
export const AMBIENT_BY_TYPE = Object.freeze({
  halk: f([
    'Merhaba, iyi yürüyüşler!',
    'Şu sokakta yeni bir dükkân açılmış.',
    'Bugün işler yolunda.',
    'Sana da iyi günler!',
    'Ah, bu şehir hiç durmuyor.',
    'Haritaya bakmayı unutma.',
    'Yaya geçidinden geç, güvenli.',
    'Etrafı keşfetmek güzel şey.',
  ]),
  cocuk: f([
    'Dron gördüm, dron gördüm!',
    'Neonlar kocaman bir oyuncak gibi!',
    'Şu robot bana el salladı!',
    'Seninle yarışalım mı?',
    'Ben büyüyünce kurye olacağım!',
    'Su birikintisine zıplamak çok eğlenceli!',
    'Şu holo balığı gördün mü?',
    'Sen de oyun oynar mısın?',
  ]),
  turist: f([
    'Burası inanılmaz, fotoğraf çekmeliyim!',
    'Terminal hangi tarafta, biliyor musun?',
    'Harita bir tuhaf, kaybolmuş gibiyim.',
    'Şu kuleler öyle yüksek ki!',
    'Bu şehre bayıldım!',
    'Yerel bir lezzet önerir misin?',
    'Neonlar çok etkileyici.',
    'Bir fotoğraf çeker misin?',
  ]),
  satici: f([
    'Taze, sıcak, hemen geldi!',
    'Bir bak, beğenirsin!',
    'Bugün fırsat günü, yaklaş!',
    'Neon boya, çiçek, simit, hepsi var!',
    'Gel gel, elin boş gitme!',
    'Güzel şeyler burada!',
    'Bir göz at, bakmak bedava.',
    'Kredi çipin varsa buyur!',
  ]),
  kapici: f([
    'Giriş serbest, hoş geldin.',
    'Kapıyı açık tutuyorum, geç.',
    'Bugün bina çok sessiz.',
    'Asansör her zaman çalışır.',
    'Yağmurda buraya sığın.',
    'Kayar kapı seni tanıyor, geç!',
  ]),
  kurye: f([
    'Teslimat var, kaçmam lazım!',
    'Süre daralıyor, koş koş koş!',
    'Bir paket de sana mı?',
    'Yağmur olsa da paket gider.',
    'Kurye hep koşar, hep kazanır.',
    'Şu adres nereydi? Aaa, buldum!',
    'Bugün on üç teslimat yaptım!',
    'Çatılardan kısa yol var.',
  ]),
  temizlik_robotu: f([
    'Bip! Sokak temizleniyor.',
    'Parlak sokaklar benim işim.',
    'Çöp kutusu yakında, kullanın.',
    'Bip bip, yol açın lütfen.',
    'Temizlik tamamlandı, teşekkürler.',
    'Su birikintisini siliyorum.',
  ]),
  dost_dron: f([
    'Bzzt! Yolu göstermemi ister misin?',
    'Merhaba! Ben dost dronum.',
    'Terminal şu yönde, bzzt!',
    'Etraf güvenli, devam et.',
    'Sana eşlik edebilirim.',
    'Bzzt! Güzel bir gün, değil mi?',
  ]),
});

/** Saat (0–24, ondalık olabilir) → zaman dilimi anahtarı: sabah 5–10, gündüz 10–17, akşam 17–21, gece 21–5. */
export function phaseKeyForHour(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  if (!(h === h)) return 'gunduz';
  if (h >= 5 && h < 10) return 'sabah';
  if (h >= 10 && h < 17) return 'gunduz';
  if (h >= 17 && h < 21) return 'aksam';
  return 'gece';
}

/**
 * Bağlama uyan tüm satırlar: ctx = {type?, phase?, rain?, fog?, district?}. Sıra sabittir (tip, bölge, zaman, hava,
 * genel). Kimlik "<grup>.<alt>.<i>" biçimindedir ve tekrar engeli için kullanılır.
 */
export function ambientPool(ctx) {
  const c = ctx || {};
  const out = [];
  const add = (group, sub, list) => {
    if (!list) return;
    for (let i = 0; i < list.length; i++) out.push({ id: group + '.' + sub + '.' + i, text: list[i] });
  };
  if (c.type && Object.prototype.hasOwnProperty.call(AMBIENT_BY_TYPE, c.type)) add('tip', c.type, AMBIENT_BY_TYPE[c.type]);
  if (c.district && Object.prototype.hasOwnProperty.call(AMBIENT_BY_DISTRICT, c.district)) {
    add('bolge', c.district, AMBIENT_BY_DISTRICT[c.district]);
  }
  if (c.phase && Object.prototype.hasOwnProperty.call(AMBIENT_LINES, c.phase) && PHASE_KEYS.indexOf(c.phase) >= 0) {
    add('zaman', c.phase, AMBIENT_LINES[c.phase]);
  }
  if (c.rain) add('hava', 'yagmur', AMBIENT_LINES.yagmur);
  else if (c.fog) add('hava', 'sis', AMBIENT_LINES.sis);
  add('genel', 'genel', AMBIENT_LINES.genel);
  return out;
}

const SEED_CACHE = {};
function strSeed(s) {
  const k = String(s || '');
  if (!Object.prototype.hasOwnProperty.call(SEED_CACHE, k)) SEED_CACHE[k] = stringSeedToInt(k) | 0;
  return SEED_CACHE[k];
}

/**
 * Belirlenimci tek satır: aynı (seed, slot, ctx, recent) → aynı sonuç. `recent` = son söylenen kimlikler;
 * son 4'ü dışlanır (havuz tükenirse tümü kullanılır). Tip satırları iki kat ağırlıklıdır (kimlik kopyası).
 */
export function pickAmbient(seed, slot, ctx, recent) {
  const pool = ambientPool(ctx);
  const rec = Array.isArray(recent) ? recent.slice(-RECENT_NO_REPEAT) : [];
  let cand = pool.filter((p) => rec.indexOf(p.id) < 0);
  if (!cand.length) cand = pool;
  const c = ctx || {};
  const weighted = [];
  for (let i = 0; i < cand.length; i++) {
    weighted.push(cand[i]);
    if (cand[i].id.lastIndexOf('tip.', 0) === 0) weighted.push(cand[i]);
  }
  const h = hash3(slot | 0, strSeed(c.type) ^ strSeed(c.district), strSeed(c.phase) + (c.rain ? 7 : 0), seed | 0);
  return weighted[h % weighted.length];
}
