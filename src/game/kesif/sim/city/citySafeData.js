/*
 * KEŞİF sim/city — güvenli içerik verisi + saf metin tarayıcısı (Neon Meridyen, sözleşme §2).
 *
 * Aile dostu: şiddet / alkol / tütün / kumar / uyuşturucu / romantik içerik / küfür / hakaret ve GERÇEK marka-oyun-
 * karakter adları şehir metinlerinde (tabela, diyalog, görev, parça adı, kod yorumu) YASAK. Bu dosya:
 *  - BANNED_CATEGORIES / BANNED_WORDS : Türkçe + İngilizce yasak sözcükler (+ §2 gerçek oyun/marka adları)
 *  - REAL_BRANDS                      : ≥150 gerçek ad (cityRealBrands.js'ten)
 *  - scanText(str, opts) -> hits[]    : saf tarayıcı (Türkçe katlama, leet, boşluk/ayraç, tekrar, maske)
 *  - levenshtein / findBrandCollision : özgün dükkân adlarının gerçek adlara benzerlik denetimi
 *  - foldTr / trUpper                 : metin yardımcıları (sign atlası için doğru Türkçe büyük harf)
 *
 * Girdi sözdizimi (BANNED_CATEGORIES dizgeleri): düz = tam sözcük (+ İngilizce çekim ekleri s/es/ed/er/ers/ing);
 * `kök*` = önek (kök ≥ 4 harf); `^` önek = Türkçe harf duyarlı (ı/i, ş/s ayrımı korunur: "^katil" ≠ "katıl*");
 * boşluklu = ifade (boşluk/tire/kesme yok sayılır). Türkçe'de katlanınca çakışan İngilizce sözcükler (gün→gun,
 * göre→gore) `^` ile yazılır. Bu dosya taramada izinli listededir.
 * Saf: DOM/three yok, Math.random/Date.now yok, es2020.
 */
import { AMBIGUOUS_BRANDS, COMMON_WORD_BRANDS, REAL_BRANDS } from './cityRealBrands.js';
import { trUpper } from './cityText.js';

export { AMBIGUOUS_BRANDS, COMMON_WORD_BRANDS, REAL_BRANDS, trUpper };

/** Kategori → girdiler. */
export const BANNED_CATEGORIES = Object.freeze({
  siddet: Object.freeze([
    'öldür*', 'katliam', '^katil', '^katiller', 'cinayet', 'ceset*', 'intihar*', 'kan', 'kanli', 'kanlar',
    'kanama', 'işkence*', 'tecavüz*', 'silah*', 'tabanca*', 'tüfek*', 'bomba*', 'terör*', 'bıçak*', 'kurşun*',
    'mermi', 'patlayıcı*', 'katlet*', 'vahşet*', 'kill', 'murder', 'blood', 'bloody', '^gore', 'gory', '^gun', '^guns',
    'pistol', 'rifle', 'shotgun', 'weapon', 'bullet', 'bomb', 'terror', 'terrorist', 'stab', 'slaughter',
    'massacre', 'suicide', 'torture', 'corpse', 'rape', 'violence', 'violent', 'genocide',
  ]),
  alkol: Object.freeze([
    'alkol*', 'içki*', 'bira', 'raki', 'şarap*', 'votka*', 'viski*', 'konyak*', 'likör*', 'şampanya*', 'meyhane*',
    'sarhoş*', 'tekila', 'alcohol*', 'alcoholic', 'beer', 'wine', 'vodka', 'whiskey', 'whisky', 'tequila',
    'champagne', 'liquor', 'brandy', 'bourbon', 'booze', 'drunk', 'rum', 'gin', 'pub', 'brewery', 'kokteyl*', 'kadeh*',
  ]),
  tutun: Object.freeze([
    'sigara*', '^tütün*', 'nargile*', 'puro', 'tiryaki*', 'nikotin*', 'cigarette*', 'cigar', 'tobacco', 'vape*',
    'vaping', 'nicotine', 'hookah', 'shisha', 'snus',
  ]),
  kumar: Object.freeze([
    'kumar*', 'bahis*', 'iddaa', 'kazino*', 'casino*', 'poker', 'blackjack', 'rulet*', 'slot makinesi',
    'slot machine', 'piyango*', 'loto', 'jackpot', 'gamble*', 'gambling', 'betting', 'wager*', 'roulette',
    'baccarat', 'lottery', 'şans oyunu', 'gacha', 'lootbox', 'loot box', 'çekiliş*', 'tombala*', 'bingo', 'şans kutusu', 'gizemli kutu',
    'mystery box', 'surprise box', 'sürpriz kutu',
  ]),
  uyusturucu: Object.freeze([
    'uyuşturucu*', 'marihuana', 'kokain*', 'eroin*', 'bonzai', 'narkotik*', 'drug', 'drugs', 'marijuana',
    'cannabis', 'weed', 'cocaine', 'heroin', 'meth', 'methamphetamine', 'lsd', 'ecstasy', 'opium', 'hashish',
    'narcotic*', 'stoned', 'overdose', '^esrar', 'hashiş*', 'haşhaş*', 'afyon*', 'morfin*', 'amfetamin*', 'steroid*', 'dealer',
  ]),
  romantik: Object.freeze([
    '^aşk', '^aşkım', '^aşkı', '^aşkın', '^aşka', 'sevgilim', '^öpüş*', '^öpücük*', '^öpmek', 'flört*', 'romantik*',
    'romantizm', '^seviş*', '^çıplak*', 'cinsel*', 'seks', 'seksi', 'seksüel', 'erotik*', 'porno*',
    'pornografi*', 'müstehcen*', 'romance', 'romantic', 'lover', 'lovers', 'girlfriend', 'boyfriend', 'kiss',
    'kisses', 'kissing', 'dating', 'sex', 'sexy', 'sexual', 'sexting', 'nude', 'nudes', 'naked', 'porn',
    'pornography', 'erotic', 'flirt', 'flirting', 'lust', 'nsfw', 'hentai', 'milf', 'boobs', 'boob', 'tits',
    'penis', 'vagina', 'fap',
  ]),
  kufur: Object.freeze([
    'amk', 'aq', 'amq', 'amına*', 'amcık*', 'aminak*', 'sikik*', 'siktir*', 'sikeyim*', 'sikerim*', 'sikim*',
    '^sik', '^sikmek', '^sikiş*', 'yarrak*', 'orospu*', 'oruspu*', '^piç', '^piçi', '^piçler', '^piçlik', '^göt', '^götü', '^götün',
    '^götünü', '^götveren*', 'ibne*', 'puşt*', 'pezevenk*', 'kahpe*', 'kaltak*', 'sürtük*', 'gavat*', 'taşak*',
    'taşşak*', 'bok', 'boktan', '^boku', '^oç', 'dalyarak*', 'fuck*', 'motherfuck*', 'fck', 'fuk', 'shit*',
    'bullshit*', 'bitch*', 'bastard*', 'asshole*', 'ass', 'arse', 'dick', 'cock', 'pussy', 'cunt', 'slut',
    'whore', 'fag', 'faggot*', 'nigger*', 'nigga*', 'twat', 'wank*', 'piss*', 'crap', 'damn', 'dammit',
    'goddamn*', 'wtf', 'stfu', 'omfg', 'douche*', 'prick', 'bollocks', 'bugger',
  ]),
  hakaret: Object.freeze([
    'aptal*', 'salak*', 'gerizekal*', 'geri zekalı', 'ahmak*', 'dangalak*', 'budala*', 'embesil*', 'şerefsiz*',
    'ezik*', 'lanet*', 'beyinsiz*', 'gerzek*', 'hödük*', 'dallama*', 'mankafa*', 'ucube*', 'çirkin*', 'sapık*',
    'psikopat*', 'geber*', 'defol*', 'kapa çeneni', 'kes sesini', 'stupid', 'idiot*', 'moron*', 'dumb',
    'dumbass', 'loser', 'ugly', 'shut up', 'imbecile', 'scum', 'retard*',
  ]),
  asiri: Object.freeze([
    'nazi', 'nazis', 'neonazi', 'hitler', 'faşist*', 'kkk', 'isis', 'al qaeda', 'jihadist', 'white power',
  ]),
  /* Faz 5 (safety_audit): suç / polis / savaş, korkutucu içerik, nefret, baskı (karanlık desen), kişisel bilgi isteme, siyaset */
  suc: Object.freeze([
    'polis', 'polisi', 'polise', 'polisler', 'polisin', 'polisten', 'polisle', 'polislik', 'polisiye', 'asker*', 'savaş*', 'hırsız*', 'soygun*', 'mafya*', '^çete', '^çeteler', '^çetesi', 'hapis*', 'tutuklu*', 'tutuklan*',
    'tutukla*', 'cezaevi*', 'suçlu*', 'kaçakçı*', 'rehine*', 'fidye*', 'sabotaj*', 'dolandır*', 'casus*',
    'dedektif*', 'komando*', 'militan*', 'cihat*', '^çatışma*', 'police*', 'thief', 'thieves', 'robber*', 'robbery',
    'heist*', 'burglar*', 'crime*', 'criminal*', 'arrest*', 'hostage*', 'ransom*', 'prison*', 'jail*', 'gang', 'gangs', 'gangster*',
    'mafia', 'soldier*', 'army', 'armies', 'military', 'warfare', 'war', 'wars', 'battlefield*', 'spy', 'spies', 'detective*',
    'smuggl*', 'outlaw*', 'bandit*', 'hijack*', 'extort*', 'assault*', 'kidnap*', 'abduct*',
  ]),
  korku: Object.freeze([
    '^hayalet*', 'canavar*', 'kabus*', 'korku evi', 'korku filmi', 'korku oyunu', 'korku hikayesi', '^korkunç*', '^korkut*', 'zombi*', 'vampir*', '^cadı', '^cadılar', 'şeytan*', 'dehşet*', 'ürper*',
    'ürkütücü*', 'mezar*', 'tabut*', 'cenaze*', 'hortlak*', 'karabasan*', 'kafatası*', '^cin', '^cinler', '^ölü', '^ölüler', '^ölüm*',
    'zehir*', 'ghost*', 'monster*', 'nightmare*', 'horror*', 'scary', 'creepy', 'haunted*', 'demon*', 'devil*',
    'vampire*', 'witch*', 'zombie*', 'undead', 'spooky', 'eerie', 'terrifying', 'skull*', 'coffin*', 'funeral*', 'poison*',
  ]),
  nefret: Object.freeze([
    'zenci*', 'çingene*', '^gavur*', 'yobaz*', 'şişko*', 'topal*', 'sakat*', 'cahil*', 'dilenci*', 'ukala*', 'rezil*',
    'pislik*', 'chink', 'kike', 'wetback*', 'tranny', 'negro*',
  ]),
  baski: Object.freeze([
    'son fırsat', 'sakın kaçırma', 'fırsatı kaçırma', 'sadece bugün', 'sınırlı süre', 'sınırlı sayıda', 'tükenmeden', 'hemen satın al',
    'şimdi satın al', 'satın almazsan', 'gerçek para', 'kredi kartı', 'kart bilgi', 'ödeme yap', 'premium', 'vip üye', 'abone ol',
    'davet kodu', 'arkadaşını davet', 'arkadaşlarını davet', 'paylaş ve kazan', 'bedava jeton', 'ücretsiz jeton', 'jeton satın',
    'jeton al', 'last chance', 'buy now', 'limited time',
  ]),
  kisisel: Object.freeze([
    'telefon numaran', 'cep numaran', 'ev adresin', 'adresin', 'okulun adı', 'okulunun adı', 'gerçek adın', 'soyadın',
    'e-posta adresin', 'eposta adresin', 'doğum tarihin', 'kaç yaşındasın', 'yaşın kaç', 'nerede oturuyorsun', 'konumunu paylaş',
    'fotoğrafını gönder', 'şifreni', 'parolanı', 'kimlik numaran', 'your address', 'phone number', 'home address',
    'your password', 'how old are you', 'where do you live',
  ]),
  siyaset: Object.freeze([
    'propaganda*', 'siyasi*', 'siyaset*', 'cumhurbaşkan*', 'başbakan*', 'milletvekil*', 'miting*',
  ]),
  /* §2 adı geçen gerçek oyun / marka / karakter adları ve evreni (aile + telif güvenliği) */
  oyun_marka: Object.freeze([
    'cyberpunk*', 'night city', 'nightcity', 'arasaka*', 'militech*', 'cd projekt', 'cdprojekt*', 'johnny',
    'silverhand*', 'delamain*', 'braindance*', 'ncpd', 'kiroshi*', 'afterlife', 'minecraft*', 'mine craft',
    'netrunner*', 'cyberpsycho*', 'edgerunner*', 'soulkiller', 'mikoshi', 'blackwall', 'kang tao', 'biotechnica',
    'trauma team', 'tyger claws', 'voodoo boys', 'dogtown', 'adam smasher', 'judy alvarez', 'panam palmer',
    'jackie welles', 'kerry eurodyne', 'takemura', 'yorinobu', 'saburo arasaka',
  ]),
});

/** Düz yasak sözcük listesi (kategoriler birleşik, yinelenmeyen; işaretler korunur). */
export const BANNED_WORDS = Object.freeze(Array.from(new Set(
  Object.keys(BANNED_CATEGORIES).reduce((all, k) => all.concat(BANNED_CATEGORIES[k]), []),
)));

/**
 * İzinli ifadeler: oyunun mevcut, aile dostu adları ("Kuantum Portal Tabancası" eşyası). Tarama öncesi
 * metinden çıkarılır; kök olarak yazılır, devamındaki ekler de dahildir. Katlanmış (ASCII) biçim.
 */
export const SAFE_ALLOWED_PHRASES = Object.freeze(['portal tabanca', 'portal gun']);

/** Tarama çekim ekleri (yalnızca İngilizce; Türkçe kökler `*` ile yazılır). */
const SUFFIXES = ['s', 'es', 'ed', 'er', 'ers', 'ing'];
const DEEP_MIN = 7;
const DEEP_MAX_TEXT = 200;
const MAX_TEXT = 400000;
const HARD_SEP = /[/\\|;:,()[\]{}=<>"\n\r\t]+/;
/* görünmez biçim karakterleri (sıfır genişlik, yumuşak tire, yön işaretleri): sözcüğü gizlemek için kullanılır */
const INVISIBLE = /[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '+': 't' };
const FOLD_EXTRA = {
  ı: 'i', ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', ð: 'd', þ: 'th', ħ: 'h',
};
/* Kiril/Yunanca benzer harfler (homoglif) → Latin */
const HOMO = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', к: 'k', м: 'm', т: 't', і: 'i', ј: 'j', ѕ: 's',
  ԁ: 'd', ɡ: 'g', α: 'a', ο: 'o', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ρ: 'p', τ: 't', υ: 'u', η: 'n',
  һ: 'h', ӏ: 'l', ԛ: 'q', ԝ: 'w', в: 'b', н: 'h', п: 'n', ѵ: 'v', ь: 'b', β: 'b', γ: 'y', ω: 'w', μ: 'm', χ: 'x', ζ: 'z',
  ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ꜰ: 'f', ɢ: 'g', ʜ: 'h', ɪ: 'i', ᴊ: 'j', ᴋ: 'k', ʟ: 'l', ᴍ: 'm', ɴ: 'n', ᴏ: 'o',
  ᴘ: 'p', ʀ: 'r', ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w', ʏ: 'y', ᴢ: 'z', ɑ: 'a', ɩ: 'i', ꞓ: 'c', ꓲ: 'l', ꓰ: 'e', ꓳ: 'o',
};
/* Şiddet / gece hayatı / uyuşturucu / müstehcen / nefret emojileri ve simgeleri (metin değil, simge olarak yasak) */
const SYMBOLS = /[\u{1F52B}\u{1F5E1}\u{2694}\u{1F4A3}\u{1F52A}\u{1FA93}\u{1F480}\u{2620}\u{1F47B}\u{1F9DF}\u{1F9DB}\u{1F608}\u{1F47F}\u{1FA78}\u{1F37A}\u{1F37B}\u{1F377}\u{1F378}\u{1F379}\u{1F943}\u{1F37E}\u{1F6AC}\u{1F48A}\u{1F489}\u{1F3B0}\u{1F0CF}\u{1F51E}\u{1F346}\u{1F48B}\u{1F48F}\u{1F491}\u{5350}\u{534D}\u{262D}]/u;
/** Katlanmış biçim: küçük harf, aksan/Türkçe harf → ASCII, homoglif → Latin (kesme işareti korunur). */
export function foldTr(str) {
  let t = String(str).normalize('NFKD').replace(INVISIBLE, '').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  t = t.replace(/[^\u0020-\u007e]/g, (ch) => FOLD_EXTRA[ch] || HOMO[ch] || ch);
  return t;
}

/** Türkçe kurallı küçük harf, harf ayrımı korunur (I→ı, İ→i); `^` girdileri için. */
function trLowerKeep(str) {
  return String(str).normalize('NFC').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

const collapse2 = (s) => s.replace(/(.)\1{2,}/g, '$1$1');
const collapse1 = (s) => s.replace(/(.)\1+/g, '$1');
const squash = (s) => s.replace(/[^a-z0-9]/g, '');

/* ------------------------------------------------------------------------------------------------
 * Derleme (tembel; ilk taramada)
 * ---------------------------------------------------------------------------------------------- */
let compiled = null;

function makeEntry(raw, cat) {
  const strict = raw.charAt(0) === '^';
  let body = strict ? raw.slice(1) : raw;
  const prefix = body.charAt(body.length - 1) === '*';
  if (prefix) body = body.slice(0, -1);
  const folded = foldTr(body);
  const parts = folded.split(/[^a-z0-9]+/).filter(Boolean);
  const sq = parts.join('');
  const multi = parts.length > 1;
  return { raw, term: body, cat, strict, prefix, sq, multi, tr: strict ? trLowerKeep(body) : '', ambiguous: false };
}

function compile() {
  if (compiled) return compiled;
  const amb = new Set(AMBIGUOUS_BRANDS.map((b) => squash(foldTr(b))));
  const common = new Set(COMMON_WORD_BRANDS.map((b) => squash(foldTr(b))));
  const c = {
    exact: new Map(), c1: new Map(), prefix: new Map(), prefixC1: new Map(), strictExact: new Map(), strictPrefix: [],
    wild: new Map(), deep: [], allow: SAFE_ALLOWED_PHRASES.map((p) => new RegExp(p.split(' ').join('[^a-z0-9]+') + '[a-z]*', 'g')),
  };
  const addExact = (e) => {
    if (!e.sq || c.exact.has(e.sq)) return;
    c.exact.set(e.sq, e);
    const k = collapse1(e.sq);
    if (k.length >= 4 && !e.ambiguous && !c.c1.has(k)) c.c1.set(k, e);
    if (e.sq.length >= 4 && !e.multi) {
      const arr = c.wild.get(e.sq.length) || [];
      arr.push(e);
      c.wild.set(e.sq.length, arr);
    }
    if (e.sq.length >= DEEP_MIN && !e.ambiguous) c.deep.push(e);
  };
  const addEntry = (e) => {
    if (e.strict) {
      if (e.prefix) c.strictPrefix.push(e);
      else c.strictExact.set(e.tr, e);
      return;
    }
    if (e.prefix) {
      const ch = e.sq.charAt(0);
      const arr = c.prefix.get(ch) || [];
      arr.push(e);
      c.prefix.set(ch, arr);
      const k = collapse1(e.sq);
      if (k.length >= 4) {
        const arr1 = c.prefixC1.get(k.charAt(0)) || [];
        arr1.push({ k, e });
        c.prefixC1.set(k.charAt(0), arr1);
      }
      if (e.sq.length >= 4) {
        const w = c.wild.get(e.sq.length) || [];
        w.push(e);
        c.wild.set(e.sq.length, w);
      }
      if (e.sq.length >= DEEP_MIN) c.deep.push(e);
      return;
    }
    addExact(e);
  };
  Object.keys(BANNED_CATEGORIES).forEach((cat) => {
    BANNED_CATEGORIES[cat].forEach((raw) => addEntry(makeEntry(raw, cat)));
  });
  REAL_BRANDS.forEach((raw) => {
    const e = makeEntry(raw, 'marka');
    if (!e.multi && common.has(e.sq)) return; /* yalnızca benzerlik denetiminde (findBrandCollision) */
    e.ambiguous = !e.multi && amb.has(e.sq);
    addEntry(e);
    /* McDonald's → "mcdonald" (Türkçe ek: McDonald'ın); yaygın sözcük olmasın diye taban ≥7 harf */
    const ap = raw.search(/['’]s?$/);
    if (ap >= 7) {
      const e2 = makeEntry(raw.slice(0, ap), 'marka');
      e2.term = raw;
      e2.ambiguous = false;
      addEntry(e2);
    }
  });
  compiled = c;
  return c;
}

/* ------------------------------------------------------------------------------------------------
 * Tarayıcı
 * ---------------------------------------------------------------------------------------------- */
function removeAllowed(c, f) {
  let t = f;
  for (let i = 0; i < c.allow.length; i++) t = t.replace(c.allow[i], ' ');
  return t;
}

function joinLetterRuns(f) {
  return f.replace(/(^|[^a-z0-9])((?:[a-z0-9][ ._\-*]){2,}[a-z0-9])(?![a-z0-9])/g,
    (m, a, b) => a + b.replace(/[ ._\-*]/g, ''));
}

function tokenize(f) {
  const raw = f.replace(/['’]/g, ' ').split(/[^a-z0-9@$!+*#]+/);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i].replace(/^[@$!+*#]+|[@$!+*#]+$/g, '');
    if (t) out.push(t);
  }
  return out;
}

/** Çarpık yazım türevleri: leet çözümü (0→o, 1→i/l, 3→e …) ve sesteş "ph"→"f" ("phuck", "ph0rn"). */
function leetVariants(tok) {
  const digits = /[0-9@$!+]/.test(tok);
  if (!/[a-z][^a-z]*[a-z]/.test(tok) || (!digits && tok.indexOf('ph') < 0)) return null;
  const out = [];
  const push = (v) => { if (v !== tok && out.indexOf(v) < 0) out.push(v); };
  const bases = [];
  if (digits) {
    const re = /[0-9@$!+]/g;
    bases.push(tok.replace(re, (ch) => LEET[ch]));
    if (tok.indexOf('1') >= 0 || tok.indexOf('!') >= 0) bases.push(tok.replace(re, (ch) => (ch === '1' || ch === '!' ? 'l' : LEET[ch])));
  }
  bases.forEach(push);
  bases.concat([tok]).forEach((b) => { if (b.indexOf('ph') >= 0) push(b.replace(/ph/g, 'f')); });
  return out.length ? out : null;
}

function capitalisedIn(text, sq) {
  const re = /[\p{L}\p{N}]+/gu;
  let m = re.exec(text);
  while (m) {
    const w = m[0];
    const c = w.charAt(0);
    if (c !== c.toLowerCase()) {
      const fw = squash(foldTr(w));
      if (fw === sq) return true;
      for (let i = 0; i < SUFFIXES.length; i++) {
        const s = SUFFIXES[i];
        if (fw.length > s.length + 2 && fw.endsWith(s) && fw.slice(0, -s.length) === sq) return true;
      }
    }
    m = re.exec(text);
  }
  return false;
}

function lookupToken(c, tok) {
  const out = [];
  const e = c.exact.get(tok);
  if (e) out.push(e);
  if (tok.length >= 5) {
    for (let i = 0; i < SUFFIXES.length; i++) {
      const s = SUFFIXES[i];
      if (tok.length - s.length >= 3 && tok.endsWith(s)) {
        const e2 = c.exact.get(tok.slice(0, tok.length - s.length));
        if (e2 && e2 !== e) out.push(e2);
      }
    }
  }
  const t2 = collapse2(tok);
  if (t2 !== tok) {
    const e3 = c.exact.get(t2);
    if (e3 && out.indexOf(e3) < 0) out.push(e3);
  }
  const t1 = collapse1(tok);
  if (t1 !== tok && t1.length >= 4) {
    const e4 = c.c1.get(t1);
    if (e4 && out.indexOf(e4) < 0) out.push(e4);
  }
  /* c1 eşlemesi yalnız tekrarlı (çarpık) yazımı yakalar; tekrar yoksa exact zaten baktı */
  return out;
}

function lookupPrefix(c, tok) {
  const out = [];
  const arr = c.prefix.get(tok.charAt(0));
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      if (tok.length >= arr[i].sq.length && tok.lastIndexOf(arr[i].sq, 0) === 0) out.push(arr[i]);
    }
  }
  /* çarpık tekrar ("fuuuck", "shiiit"): tekrarlar tek harfe indirilip kök de öyle karşılaştırılır */
  const t1 = collapse1(tok);
  if (t1 !== tok) {
    const arr1 = c.prefixC1.get(t1.charAt(0));
    if (arr1) {
      for (let i = 0; i < arr1.length; i++) {
        if (t1.lastIndexOf(arr1[i].k, 0) === 0 && out.indexOf(arr1[i].e) < 0) out.push(arr1[i].e);
      }
    }
  }
  return out;
}

function wildMatch(c, tok) {
  const arr = c.wild.get(tok.length);
  if (!arr) return [];
  let fixed = 0;
  for (let i = 0; i < tok.length; i++) if (tok.charAt(i) !== '*' && tok.charAt(i) !== '#') fixed++;
  if (fixed < 2) return [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const sq = arr[i].sq;
    let ok = true;
    for (let j = 0; j < sq.length; j++) {
      const ch = tok.charAt(j);
      if (ch !== '*' && ch !== '#' && ch !== sq.charAt(j)) { ok = false; break; }
    }
    if (ok) out.push(arr[i]);
  }
  return out;
}

/**
 * Metni yasak sözcük / gerçek ad için tara. Dönüş: `[{term, cat, via, match}]` (boş = temiz).
 *  via: token | stem | phrase | leet | mask | strict | deep | deep-leet
 * opts: `loose` (yaygın sözcük olan adları yok say; kod yorumları için), `brands:false`, `content:false`.
 * Büyük metinlerde (>200 kr) boşluklu/ayraçlı harf dizileri ("k i l l") birleştirilir; kısa metinlerde ayrıca
 * tüm harfler bitiştirilip uzun girdiler aranır ("ara saka").
 */
export function scanText(str, opts) {
  let text = typeof str === 'string' ? str : (str === null || str === undefined ? '' : String(str));
  if (!text) return [];
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);
  const o = opts || {};
  const c = compile();
  const hits = [];
  const seen = new Set();
  if (o.content !== false) {
    const sym = SYMBOLS.exec(text);
    if (sym) hits.push({ term: 'sembol', cat: 'sembol', via: 'symbol', match: sym[0] });
  }
  const report = (e, via, match) => {
    if (e.cat === 'marka') {
      if (o.brands === false) return;
      if ((via === 'leet' || via === 'deep-leet') && e.sq.length < 4) return;
      if (e.ambiguous && (o.loose === true || !capitalisedIn(text, e.sq))) return;
    } else if (o.content === false) return;
    const key = e.term + '|' + e.cat;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ term: e.term, cat: e.cat, via, match });
  };
  /* Sert ayraçlar (/ , ; : ( ) vb.) sözcük pencerelerini böler: "sim/city" bir ifade değildir */
  const segments = removeAllowed(c, foldTr(text)).split(HARD_SEP);
  for (let si = 0; si < segments.length; si++) {
    const f = segments[si];
    if (!f) continue;
    const variants = [{ t: f, light: false }];
    const noApos = f.replace(/['’]/g, '');
    if (noApos !== f) variants.push({ t: noApos, light: true });
    const joined = joinLetterRuns(f);
    if (joined !== f) variants.push({ t: joined, light: false });
    for (let vi = 0; vi < variants.length; vi++) {
      const light = variants[vi].light;
      const toks = tokenize(variants[vi].t);
      for (let i = 0; i < toks.length; i++) {
        const tok = toks[i];
        if (!light && tok.search(/[*#]/) > 0) {
          wildMatch(c, tok).forEach((e) => report(e, 'mask', tok));
          continue;
        }
        lookupToken(c, tok).forEach((e) => report(e, 'token', tok));
        if (!light) {
          lookupPrefix(c, tok).forEach((e) => report(e, 'stem', tok));
          const lv = leetVariants(tok);
          if (lv) {
            for (let k = 0; k < lv.length; k++) {
              lookupToken(c, lv[k]).forEach((e) => report(e, 'leet', tok));
              lookupPrefix(c, lv[k]).forEach((e) => report(e, 'leet', tok));
            }
          }
        }
        let sq = tok;
        for (let k = 2; k <= 5 && i + k <= toks.length; k++) {
          sq += toks[i + k - 1];
          const e = c.exact.get(sq);
          if (e && (e.multi || e.sq.length >= 6)) report(e, 'phrase', toks.slice(i, i + k).join(' '));
        }
      }
    }
    /* kısa parça: tüm harfler bitişik ("ara saka", "k1ll3r") */
    if (f.length <= DEEP_MAX_TEXT) {
      const s1 = squash(f);
      const s2 = f.replace(/[0-9@$!+]/g, (ch) => LEET[ch]).replace(/[^a-z]/g, '');
      for (let i = 0; i < c.deep.length; i++) {
        const e = c.deep[i];
        if (s1.indexOf(e.sq) >= 0) report(e, 'deep', e.sq);
        else if (s2 !== s1 && s2.indexOf(e.sq) >= 0) report(e, 'deep-leet', e.sq);
      }
    }
  }
  /* Türkçe harf duyarlı girdiler */
  if (c.strictExact.size || c.strictPrefix.length) {
    const stoks = removeAllowed(c, trLowerKeep(text)).split(/[^\p{L}\p{N}]+/u);
    for (let i = 0; i < stoks.length; i++) {
      const t = stoks[i];
      if (!t) continue;
      const e = c.strictExact.get(t);
      if (e) report(e, 'strict', t);
      for (let k = 0; k < c.strictPrefix.length; k++) {
        const p = c.strictPrefix[k];
        if (t.length >= p.tr.length && t.lastIndexOf(p.tr, 0) === 0) report(p, 'strict', t);
      }
    }
  }
  if (o.fuzzy === true && o.brands !== false) fuzzyBrands(text, report);
  return hits;
}

/** Temiz mi (isabet yok)? */
export function isSafeText(str, opts) {
  return scanText(str, opts).length === 0;
}

/* ------------------------------------------------------------------------------------------------
 * Marka benzerlik denetimi
 * ---------------------------------------------------------------------------------------------- */
/** Düzenleme uzaklığı (Levenshtein); `max` aşılırsa max+1 döner (erken çıkış). */
export function levenshtein(a, b, max) {
  const lim = max === undefined ? Infinity : max;
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > lim) return lim + 1;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > lim) return lim + 1;
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[b.length];
}

let brandKeys = null;
function brandIndex() {
  if (brandKeys) return brandKeys;
  brandKeys = REAL_BRANDS.map((raw) => ({ raw, sq: squash(foldTr(raw).replace(/['’]/g, '')) }))
    .filter((b) => b.sq.length >= 3);
  return brandKeys;
}

/**
 * Bir gerçek ad için izin verilen en çok uzaklık: ≤5 harf eşitlik (kısa adlar sıradan sözcüklere çok yakın düşer:
 * vida/visa, lazer/razer), 6–9 → 1, ≥10 → 2. Kısa adlarda çarpık tekrar ayrıca denetlenir (nikee, adidass).
 */
function brandTolerance(len) {
  if (len <= 5) return 0;
  return len >= 10 ? 2 : 1;
}

/**
 * Metin (dükkân adı vb.) bir gerçek adın aynısı ya da çok yakını mı? Tüm ad, kelime pencereleri (1–3)
 * ve bitişik gömülü ad (≥5 harf) karşılaştırılır. Dönüş: `{brand, distance, part}` ya da null.
 */
export function findBrandCollision(text) {
  const f = foldTr(text).replace(/['’]/g, '');
  const toks = f.split(/[^a-z0-9]+/).filter(Boolean);
  const whole = toks.join('');
  const keys = brandIndex();
  for (let i = 0; i < keys.length; i++) {
    const b = keys[i];
    const tol = brandTolerance(b.sq.length);
    const c1b = collapse1(b.sq);
    const d0 = levenshtein(whole, b.sq, tol);
    if (d0 <= tol || (b.sq.length >= 4 && collapse1(whole) === c1b)) return { brand: b.raw, distance: d0, part: whole };
    if (b.sq.length >= 5 && whole.indexOf(b.sq) >= 0) return { brand: b.raw, distance: 0, part: b.sq };
    for (let s = 0; s < toks.length; s++) {
      let w = '';
      for (let k = 0; k < 3 && s + k < toks.length; k++) {
        w += toks[s + k];
        const d = levenshtein(w, b.sq, tol);
        if (d <= tol || (b.sq.length >= 4 && collapse1(w) === c1b)) return { brand: b.raw, distance: d, part: w };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Bulanık marka taraması (opts.fuzzy): "Minekraft", "Starbuks", "MekDonalds" gibi yazım bozuklukları.
 * Yalnız ≥7 harfli, belirsiz olmayan, BÜYÜK harfle başlayan yazımlar; 7–8 harfte 1, ≥9 harfte 2 düzenleme. Üçlü harf (trigram) dizini ile aday seçilir.
 * ---------------------------------------------------------------------------------------------- */
/* Sıradan Türkçe sözcük/ifadelere bir harf uzaklıkta düşen adlar: bulanık taramada yok sayılır (tam eşleşme yine yakalanır). */
const FUZZ_SKIP = new Set(['portal2', 'damlasu', 'hepsiburada', 'simitsarayi', 'kahvedunyasi']);
let fuzzIdx = null;
function fuzzIndex() {
  if (fuzzIdx) return fuzzIdx;
  const c = compile();
  const all = [];
  const seenSq = new Set();
  const add = (e) => {
    if (e.ambiguous || e.sq.length < 7 || e.strict || seenSq.has(e.sq) || FUZZ_SKIP.has(e.sq)) return;
    if (e.cat !== 'marka' && e.cat !== 'oyun_marka') return;
    seenSq.add(e.sq);
    all.push(e);
  };
  c.exact.forEach(add);
  c.prefix.forEach((arr) => arr.forEach(add));
  const tri = new Map();
  all.forEach((e) => {
    for (let i = 0; i + 3 <= e.sq.length; i++) {
      const g = e.sq.substr(i, 3);
      const arr = tri.get(g) || [];
      if (arr.indexOf(e) < 0) arr.push(e);
      tri.set(g, arr);
    }
  });
  fuzzIdx = { tri };
  return fuzzIdx;
}

function fuzzyBrands(text, report) {
  const { tri } = fuzzIndex();
  const segs = String(text).replace(/['’]/g, '').split(HARD_SEP);
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si];
    if (!seg || seg.length > DEEP_MAX_TEXT * 2) continue;
    const orig = seg.match(/[\p{L}\p{N}]+/gu) || [];
    const toks = orig.map((o) => {
      const f = squash(foldTr(o));
      return /[a-z]{3}/.test(f) && /[0-9]/.test(f) ? f.replace(/[0-9]/g, (ch) => LEET[ch]) : f;
    });
    for (let i = 0; i < toks.length; i++) {
      /* Özel adlar büyük harfle başlar: küçük harfli tek parça dizgeler (kod anahtarı, CSS sınıfı) bulanık eşleşmeye girmez */
      const c0 = orig[i].charAt(0);
      if (c0 === c0.toLowerCase()) continue;
      let w = '';
      for (let k = 0; k < 3 && i + k < toks.length; k++) {
        w += toks[i + k];
        if (w.length < 6 || w.length > 28) continue;
        const cand = new Set();
        for (let g = 0; g + 3 <= w.length; g++) {
          const arr = tri.get(w.substr(g, 3));
          if (arr) arr.forEach((e) => cand.add(e));
        }
        cand.forEach((e) => {
          const tol = e.sq.length >= 9 ? 2 : 1;
          if (Math.abs(w.length - e.sq.length) > tol) return;
          if (tol === 2 && w.length < 8) return;
          if (w.charAt(0) !== e.sq.charAt(0) && w.charAt(w.length - 1) !== e.sq.charAt(e.sq.length - 1)) return;
          if (levenshtein(w, e.sq, tol) <= tol) report(e, 'fuzzy', w);
        });
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Bağlantı / kişisel bilgi tarayıcısı: şehir metninde dış bağlantı, e-posta, telefon, kullanıcı adı (@) YASAK.
 * scanLinks(str) -> [{kind, match}]  kind: url | domain | email | phone | handle
 * ---------------------------------------------------------------------------------------------- */
const RE_URL = /(?:\b(?:https?|ftp|wss?|mailto|tel|sms|data|javascript|file)\s*:\s*\/{0,2}[^\s"'<>]*)/i;
const RE_WWW = /\bwww\s*\.\s*[a-z0-9-]+/i;
/* ".": bitişik yazım ("ornek.com"); sözlü/ayraçlı ("ornek (dot) com", "ornek nokta com") boşluklu olabilir. "Gel. De bakalım" gibi cümle sonları yakalanmaz. */
const RE_DOMAIN = /\b[a-z0-9-]{2,}(?:\.|\s*\(\s*dot\s*\)\s*|\s*\[\s*dot\s*\]\s*|\s+nokta\s+)(?:com|net|org|io|app|gg|tv|xyz|info|biz|dev|link|ly|me|edu|gov|tk|ru|cn|de|uk|fr|nl|co|tr|us|ws|cc)\b(?![\w-])/i;
const RE_PHONE = /(?:\+?\s*9\s*0[\s.-]?)?\(?\b0?\s?5\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b|\b(?:\d[\s.-]?){10,}\d\b/;
const RE_HANDLE = /(^|[\s(])@[a-z0-9_.]{3,}/i;
const RE_AT = /@|\(\s*at\s*\)|\[\s*at\s*\]/g;
const RE_MAIL_BEFORE = /[\w.+-]{2,}\s*$/;
const RE_MAIL_AFTER = /^\s*[\w-]+\s*(?:\.|\bnokta\b)\s*[a-z]{2,}/;
const LINK_MAX = 20000;
const LINK_CHUNK = 2000;

/** E-posta: "@" / "(at)" çevresindeki küçük pencereler (iki kat döngüsüz; "@@@@…" ya da "aaaa…" metinlerinde doğrusal). */
function findEmail(t) {
  RE_AT.lastIndex = 0;
  let m = RE_AT.exec(t);
  let n = 0;
  while (m && n < 200) {
    n++;
    const before = t.slice(Math.max(0, m.index - 64), m.index);
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const b = RE_MAIL_BEFORE.exec(before);
    const a = RE_MAIL_AFTER.exec(after);
    if (b && a) return b[0] + m[0] + a[0];
    m = RE_AT.exec(t);
  }
  return null;
}

export function scanLinks(str) {
  const text = typeof str === 'string' ? str : (str === null || str === undefined ? '' : String(str));
  if (!text) return [];
  const t0 = foldTr(text.length > LINK_MAX ? text.slice(0, LINK_MAX) : text).replace(/[․。．]/g, '.');
  const out = [];
  const seen = new Set();
  const add = (kind, match) => {
    if (seen.has(kind)) return;
    seen.add(kind);
    out.push({ kind, match: String(match).trim().slice(0, 80) });
  };
  /* uzun metin: örtüşmeli parçalar (her regex parça başına sınırlı) */
  for (let s = 0; s < t0.length; s += LINK_CHUNK - 100) {
    const t = t0.slice(s, s + LINK_CHUNK);
    let m = RE_URL.exec(t);
    if (m) add('url', m[0]);
    m = RE_WWW.exec(t);
    if (m) add('domain', m[0]);
    else if (!seen.has('domain')) {
      m = RE_DOMAIN.exec(t);
      if (m) add('domain', m[0]);
    }
    const em = findEmail(t);
    if (em) add('email', em);
    m = RE_PHONE.exec(t);
    if (m) add('phone', m[0]);
    m = RE_HANDLE.exec(t);
    if (m) add('handle', m[0]);
    if (t.length < LINK_CHUNK) break;
  }
  return out;
}
