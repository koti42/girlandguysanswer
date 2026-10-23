/*
 * KEŞİF sim/city/ped — NPC KADROSU (npc_vendors, Neon Meridyen Faz 4). SAF, es2020, belirlenimci (Math.random/Date.now yok).
 *
 * 16 iç mekân SAHİBİ (ownerData; içerde kalır, prop olarak çizilir) + 30 SOKAK NPC'si (rehberler, satıcılar, kuryeler, taksi amiri, yarış hakemleri,
 * tamirci, DJ, ev sahibi, mentorlar, fotoğrafçı, robotlar, bank sakini, çocuklar). Aile dostu, özgün adlar (citySafe taramasından geçer).
 *
 *   NPCS (donmuş dizi) · NPC_BY_ID · getNpc(id) · NPC_KINDS · EMOTES · NPC_HINTS · STREET_NPCS · OWNER_NPCS
 *   npcLook(npc) → avatar yapılandırması (avatar/catalog şemasıyla aynı + scale/robot)  (belirlenimci: kimlikten türer)
 *   npcAvailable(npc, hour, rain) → bool        saat 0..24 (şehir saati; formatClockTime ile aynı ölçek); sahipler hep içeridedir
 *   hourOf(phase) → 0..24                        daynight fazı → saat
 *   npcHash(seed, id)                            tohum+kimlik karması (npcPlace.js yerleşim çözümü: anchor → konum)
 */
import { OWNERS } from '../ownerData.js';
import { stringSeedToInt } from '../../rng.js';

export const NPC_KINDS = Object.freeze([
  'owner', 'guide', 'vendor', 'courier', 'taxi', 'marshal', 'mechanic', 'dj', 'host', 'mentor', 'photographer', 'robot', 'elder', 'kid',
]);

/** Boşta oynatılan hareketler (render: cityNpcFigures). */
export const EMOTES = Object.freeze(['bekle', 'el_salla', 'dusun', 'kol_kavusturma', 'dans', 'okuma', 'tamir']);

const KIND_EMOTES = Object.freeze({
  owner: ['bekle', 'el_salla'],
  guide: ['el_salla', 'bekle', 'dusun'],
  vendor: ['el_salla', 'bekle', 'kol_kavusturma'],
  courier: ['bekle', 'kol_kavusturma'],
  taxi: ['el_salla', 'bekle'],
  marshal: ['kol_kavusturma', 'bekle'],
  mechanic: ['tamir', 'bekle'],
  dj: ['dans', 'bekle'],
  host: ['el_salla', 'bekle'],
  mentor: ['dusun', 'kol_kavusturma', 'bekle'],
  photographer: ['dusun', 'bekle'],
  robot: ['el_salla', 'bekle'],
  elder: ['okuma', 'dusun', 'bekle'],
  kid: ['dans', 'el_salla', 'bekle'],
});

/** Anchor: {t:'terminal'|'rental'|'courier'|'stall'|'race'|'garage'|'photo'|'shelter'|'near', ...}. Ayrıntı npcPlace.js. */
const A = {
  terminal: (k, dx, dz) => ({ t: 'terminal', k, off: [dx, dz] }),
  rental: (k, dx, dz) => ({ t: 'rental', k, off: [dx, dz] }),
  courier: (k, dx, dz) => ({ t: 'courier', k, off: [dx, dz] }),
  stall: (pick) => ({ t: 'stall', pick, near: 2, off: [0, 1.6] }),
  race: (id, dx, dz) => ({ t: 'race', id, off: [dx, dz] }),
  garage: (near, dx, dz) => ({ t: 'garage', near, off: [dx, dz] }),
  photo: (nth, dx, dz) => ({ t: 'photo', nth, off: [dx, dz] }),
  near: (npc, dx, dz) => ({ t: 'near', npc, off: [dx, dz] }),
};

/*
 * [id, ad, unvan, tür, cins ('k'|'e'|'r'), huy[], anchor, saat [başla,bitir] | null (=hep), satıcı {pool, markup} | null, ölçek]
 * robot cinsi 'r' (tür 'robot' ya da insansı robot); ölçek 1 (çocuklar 0,72).
 */
const STREET_RAW = [
  ['rehber_zeynep', 'Zeynep', 'Meridyen Rehberi', 'guide', 'k', ['sıcak', 'yardımsever'], A.terminal(0, 3, -2), null, null, 1],
  ['rehber_arda', 'Arda', 'Merkez Rehberi', 'guide', 'e', ['hevesli', 'esprili'], A.terminal(1, 3, -2), null, null, 1],
  ['rehber_lale', 'Lale', 'Pazar Rehberi', 'guide', 'k', ['neşeli', 'meraklı'], A.terminal(2, 3, -2), null, null, 1],
  ['rehber_baran', 'Baran', 'Konteyner Rehberi', 'guide', 'e', ['maceracı', 'rahat'], A.terminal(3, 3, -2), [6, 24], null, 1],
  ['rehber_deniz', 'Deniz', 'Liman Rehberi', 'guide', 'k', ['sakin', 'denizci ruhlu'], A.terminal(4, 3, -2), [6, 24], null, 1],
  ['rehber_selin', 'Selin', 'Teknopark Rehberi', 'guide', 'k', ['meraklı', 'titiz'], A.terminal(5, 3, -2), [6, 24], null, 1],
  ['rehber_yesim', 'Yeşim', 'Tepe Rehberi', 'guide', 'k', ['dingin', 'doğa sever'], A.terminal(6, 3, -2), [6, 24], null, 1],
  ['satici_orhan', 'Orhan', 'Simitçi', 'vendor', 'e', ['güler yüzlü', 'çalışkan'], A.stall(0), [4, 1], { pool: 'yemek', markup: 1.0 }, 1],
  ['satici_gulsum', 'Gülsüm Teyze', 'Çaycı', 'vendor', 'k', ['anaç', 'tatlı dilli'], A.stall(1), [12, 8], { pool: 'market', markup: 1.0 }, 1],
  ['satici_pelin', 'Pelin', 'Çiçekçi', 'vendor', 'k', ['nazik', 'hayalci'], A.stall(2), [7, 22], { pool: 'bahce', markup: 1.0 }, 1],
  ['satici_yusuf', 'Yusuf', 'Parça Tezgâhçısı', 'vendor', 'e', ['meraklı', 'dikkatli'], A.stall(3), [10, 5], { pool: 'teknoloji', markup: 1.05 }, 1],
  ['satici_mehtap', 'Mehtap', 'Boya Tezgâhı', 'vendor', 'k', ['renkli', 'sabırlı'], A.stall(4), [8, 23], { pool: 'sanat', markup: 1.0 }, 1],
  ['satici_nadir', 'Nadir', 'Giyim Tezgâhı', 'vendor', 'e', ['şakacı', 'kibar'], A.stall(5), [11, 7], { pool: 'giyim', markup: 1.0 }, 1],
  ['kurye_ela', 'Kurye Ela', 'Kurye Masası', 'courier', 'k', ['hızlı', 'neşeli'], A.courier(2, 1.5, 0), [7, 23], null, 1],
  ['kurye_emir', 'Kurye Emir', 'Kurye Masası', 'courier', 'e', ['düzenli', 'dakik'], A.courier(3, 1.5, 0), [7, 23], null, 1],
  ['taksi_sevgi', 'Sevgi Abla', 'Taksi Amiri', 'taxi', 'k', ['konuşkan', 'cömert'], A.rental(0, 2.4, 0), null, null, 1],
  ['hakem_kaan', 'Kaan', 'Yarış Hakemi', 'marshal', 'e', ['ciddi', 'adil'], A.race(0, 3, 0), [8, 23], null, 1],
  ['hakem_derya', 'Derya', 'Sprint Hakemi', 'marshal', 'k', ['enerjik', 'adil'], A.race(6, 3, 0), [8, 23], null, 1],
  ['tamirci_yilmaz', 'Tamirci Yılmaz', 'Sokak Tamircisi', 'mechanic', 'e', ['mahcup', 'yetenekli'], A.garage(4, 2, 0), [7, 21], null, 1],
  ['dj_piksel', 'DJ Piksel', 'Sokak DJ\'i', 'dj', 'e', ['rahat', 'ritimli'], A.terminal(2, -3, 3), [18, 4], null, 1],
  ['ev_sahibi_nilufer', 'Nilüfer Hanım', 'Şehir Ev Sahibi', 'host', 'k', ['zarif', 'konuksever'], A.terminal(0, -4, -3), null, null, 1],
  ['mentor_poyraz', 'Poyraz Usta', 'Hız Mentoru', 'mentor', 'e', ['sabırlı', 'tecrübeli'], A.race(1, 3, 0), [8, 22], null, 1],
  ['mentor_ayca', 'Ayça', 'Keşif Mentoru', 'mentor', 'k', ['meraklı', 'cesur'], A.terminal(6, -3, 3), [8, 22], null, 1],
  ['mentor_selim', 'Tekno Selim', 'Teknoloji Mentoru', 'mentor', 'e', ['bilgili', 'şakacı'], A.terminal(5, -3, 3), [8, 22], null, 1],
  ['fotografci_irmak', 'Irmak', 'Fotoğrafçı', 'photographer', 'k', ['hayalperest', 'sabırlı'], A.photo(0, 1.5, 0), [8, 22], null, 1],
  ['robot_pili', 'Pili', 'Temizlik Robotu', 'robot', 'r', ['çalışkan', 'tatlı'], A.terminal(1, -4, 2), null, null, 1],
  ['robot_bip', 'Bip', 'Dost Robot', 'robot', 'r', ['meraklı', 'oyuncu'], A.terminal(4, -3, 2), null, null, 1],
  ['buyukbaba_riza', 'Rıza Dede', 'Bank Sakini', 'elder', 'e', ['bilge', 'esprili'], A.terminal(6, 4, 3), [6, 22], null, 1],
  ['cocuk_alp', 'Alp', 'Minik Gezgin', 'kid', 'e', ['atılgan', 'meraklı'], A.near('buyukbaba_riza', 1.8, 1.0), [8, 20], null, 0.72],
  ['cocuk_elif', 'Elif', 'Minik Gezgin', 'kid', 'k', ['neşeli', 'konuşkan'], A.near('rehber_zeynep', 1.8, 2.0), [8, 20], null, 0.72],
];

/** Sahip → satıcı havuzu (vendorData OFFER_POOLS anahtarları). */
const OWNER_POOL = Object.freeze({
  nehir_abla: 'giyim', kerem: 'gadget', tuna: 'teknoloji', defne: 'neon_dekor', usta_selvi: 'yemek', dr_bolt: 'saglik',
  usta_cengiz: 'yol_boya', dj_mira: 'neon_dekor', hasan_amca: 'market', bahar_hanim: 'bahce', ece: 'kirtasiye', piraye: 'sanat',
  cikrik: 'robot_parca', bulent: 'arcade', sule: 'kurye', kemal: 'kirtasiye',
});
const OWNER_GENDER = Object.freeze({
  nehir_abla: 'k', kerem: 'e', tuna: 'e', defne: 'k', usta_selvi: 'k', dr_bolt: 'r', usta_cengiz: 'e', dj_mira: 'k',
  hasan_amca: 'e', bahar_hanim: 'k', ece: 'k', piraye: 'k', cikrik: 'r', bulent: 'e', sule: 'k', kemal: 'e',
});

/* ---------------------------------------------------------------------------------------------- görünüm (belirlenimci) */
const TOP_BY_KIND = Object.freeze({
  guide: ['hoodie', 'ceket'], vendor: ['tisort', 'kazak'], courier: ['forma', 'hoodie'], taxi: ['ceket', 'kazak'], marshal: ['forma', 'ceket'],
  mechanic: ['tisort', 'hoodie'], dj: ['ceket', 'hoodie'], host: ['kazak', 'ceket'], mentor: ['kazak', 'hoodie'], photographer: ['ceket', 'tisort'],
  robot: ['forma', 'ceket'], elder: ['kazak', 'tisort'], kid: ['hoodie', 'tisort'], owner: ['kazak', 'tisort', 'hoodie', 'ceket'],
});
const ACC_BY_KIND = Object.freeze({
  guide: 'kulaklik', vendor: 'none', courier: 'sapka', taxi: 'sapka', marshal: 'sapka', mechanic: 'bere', dj: 'kulaklik', host: 'none',
  mentor: 'gozluk', photographer: 'gozluk', robot: 'kulaklik', elder: 'bere', kid: 'kedi', owner: 'none',
});
const HAIR_K = Object.freeze(['dalgali', 'atkuyrugu', 'uzun', 'topuz', 'orgu', 'kivircik', 'kisa']);
const HAIR_E = Object.freeze(['kisa', 'kivircik', 'mohawk', 'kisa', 'dalgali']);
const BOT_STYLES = Object.freeze(['esofman', 'jean', 'sort', 'etek']);
const SHOES = Object.freeze(['spor', 'bot', 'neon']);

/** Kimlik+tür → avatar yapılandırması. Robotlar: açık ten, turkuaz/antrasit giysi, kulaklık (render robot parıltısını ekler). */
export function npcLook(npc) {
  const id = typeof npc === 'string' ? npc : npc.id;
  const rec = typeof npc === 'string' ? NPC_BY_ID[npc] : npc;
  const h = stringSeedToInt('look:' + id);
  const kind = rec ? rec.kind : 'guide';
  const g = rec ? rec.gender : 'e';
  const robot = g === 'r';
  const girl = g === 'k';
  const tops = TOP_BY_KIND[kind] || TOP_BY_KIND.guide;
  const hairList = girl ? HAIR_K : HAIR_E;
  const pick = (arr, n) => arr[(h >>> n) % arr.length];
  const look = {
    v: 1,
    body: girl ? 'kiz' : 'erkek',
    skin: robot ? 0 : (h >>> 3) % 6,
    hair: { style: pick(hairList, 7), color: robot ? 9 : (h >>> 11) % 10 },
    top: { style: pick(tops, 5), color: robot ? 5 : (h >>> 13) % 12 },
    bottom: { style: girl ? pick(BOT_STYLES, 17) : (h >>> 17) % 2 ? 'jean' : 'esofman', color: robot ? 10 : [3, 10, 4, 3, 10, 5][(h >>> 19) % 6] },
    shoes: { style: kind === 'dj' ? 'neon' : pick(SHOES, 21), color: robot ? 11 : (h >>> 23) % 12 },
    acc: ACC_BY_KIND[kind] || 'none',
    trail: 'none',
    scale: rec && rec.scale ? rec.scale : 1,
    robot,
  };
  if (robot) look.hair = { style: 'mohawk', color: 9 };
  if (kind === 'elder') look.hair = { style: 'kisa', color: 5 };
  if (kind === 'host') look.top = { style: 'ceket', color: 2 };
  return look;
}

/* ---------------------------------------------------------------------------------------------- kadro */
function ownerNpc(o) {
  return {
    id: o.id,
    name: o.name,
    title: o.title,
    kind: 'owner',
    species: o.species,
    gender: OWNER_GENDER[o.id] || 'e',
    personality: o.personality,
    interior: o.interior,
    brand: o.brand,
    hue: o.mood.hue,
    anchor: null,
    hours: null,
    shop: { pool: OWNER_POOL[o.id], markup: 1.1 },
    scale: 1,
    emotes: KIND_EMOTES.owner,
  };
}

function streetNpc(r) {
  return {
    id: r[0],
    name: r[1],
    title: r[2],
    kind: r[3],
    species: r[4] === 'r' ? 'robot' : 'insan',
    gender: r[4],
    personality: Object.freeze(r[5].slice()),
    interior: null,
    brand: null,
    hue: null,
    anchor: Object.freeze(r[6]),
    hours: r[7] ? Object.freeze(r[7].slice()) : null,
    shop: r[8] ? Object.freeze(Object.assign({}, r[8])) : null,
    scale: r[9],
    emotes: KIND_EMOTES[r[3]] || KIND_EMOTES.guide,
  };
}

export const OWNER_NPCS = Object.freeze(OWNERS.map((o) => Object.freeze(ownerNpc(o))));
export const STREET_NPCS = Object.freeze(STREET_RAW.map((r) => Object.freeze(streetNpc(r))));
export const NPCS = Object.freeze(OWNER_NPCS.concat(STREET_NPCS));
export const NPC_BY_ID = Object.freeze(NPCS.reduce((m, n) => { m[n.id] = n; return m; }, {}));

export function getNpc(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(NPC_BY_ID, id) ? NPC_BY_ID[id] : null;
}

/** daynight fazı (0..1; 0 = 06:00) → şehir saati 0..24. */
export function hourOf(phase) {
  const p = ((phase % 1) + 1) % 1;
  return (p * 24 + 6) % 24;
}

/** Sahipler her zaman içeridedir (prop). Sokak NPC'leri `hours` aralığında (gece yarısını aşabilir) görünür. */
export function npcAvailable(npc, hour, rain) {
  if (!npc) return false;
  if (npc.kind === 'owner' || !npc.hours) return true;
  const h = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 12;
  const a = npc.hours[0];
  const b = npc.hours[1];
  let open = a <= b ? h >= a && h < b : h >= a || h < b;
  if (open && rain && (npc.kind === 'photographer' || npc.kind === 'kid' || npc.kind === 'elder')) open = false; // yağmurda sığınırlar
  return open;
}

/* ---------------------------------------------------------------------------------------------- ipuçları (efekt hint{id}) */
export const NPC_HINTS = Object.freeze({
  portal: 'Portal Tabancasının boyut kipi (T) ateşi kapıya çevirir.',
  terminal: 'Bulduğun terminaller eve dönüş noktan olur; ışıklı direğe dokun.',
  harita: 'Haritayı aç: bulduğun yerler orada görünür.',
  radyo: 'Araçta R tuşu radyoyu açar; beş istasyon ve sessiz var.',
  foto: 'Fotoğraf modu arayüzü gizler; serbest kamerayla kare çek.',
  cipler: 'Veri çipleri sokaklarda, çatılarda ve kanallarda saklı.',
  grafiti: 'Boş duvarlara sprey ile renk bırakabilirsin; basılı tut.',
  odalar: 'Kitaplık ya da pano arkasında gizli odalar olabilir.',
  yarislar: 'Yarış kapılarından geç; altın madalya hızlı ister.',
  kredi: 'Kredi yalnız bu şehirde geçer; eşya almak için harca.',
  tarayici: 'Tarayıcı yakındaki saklı şeyleri bulmana yardım eder.',
  garaj: 'Garaj terminali araçlarına boya ve ışık seçtirir.',
  taksi: 'Taksi görevi: yolcuyu rahat taşı, bahşiş kazan.',
  isler: 'Kurye masası üç iş teklif eder; süreye dikkat et.',
  yagmur: 'Yağmurda yollar kayganlaşır; yavaş sür, neona bak.',
  cati: 'Çatı parkurları merdivenle başlar; sıçramadan önce ölç.',
  satici: 'Satıcıdan aldığın eşyalar ana diyara da taşınır.',
  esya: 'Şehirden çıkarken özel eşyalar kasada bekler.',
});

/* ---------------------------------------------------------------------------------------------- tohumdan yerleşim (anchor çözümü npcPlace.js) */
export function npcHash(seed, id) {
  return (stringSeedToInt('npc:' + id) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
}
