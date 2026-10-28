/*
 * PROTOCOL: ZERO — Küresel YZ Karantinası: oyun verisi.
 *
 * 14 stratejik veri merkezi (gerçek enlem/boylam), fiber hatlar, zorluk ayarları,
 * savunma ağacı ve kriz kartları. Simülasyon kuralları sim.js'de; buradaki sayılar
 * tek doğruluk kaynağıdır (backend yalnızca skor tavanını bilir: config/game_protocol_zero.php).
 */

export const CLIENT_VERSION = '1.0.0';

export const LOBBY_PATH = '/oyun/protocol-zero';
export const PLAY_PATH = '/oyun/protocol-zero/oyna';

/** Bir oyun günü kaç simülasyon saniyesi (1x hızda gerçek saniye). */
export const DAY_SECONDS = 3;

/** Düğüm sayısı (backend `node_count` ile aynı). */
export const NODE_COUNT = 14;

export const SPEEDS = [0, 1, 2, 4];

export const COLORS = Object.freeze({
    safe: '#00f0ff',
    warn: '#ffaa00',
    lost: '#ff003c',
    isolated: '#64748b',
    decrypt: '#a78bfa',
    budget: '#fde68a',
});

/**
 * Düğümler. `computePower` TFLOPS (gelir ve deşifre katkısı), `firewall` başlangıç seviyesi (1-5).
 * Komşular LINKS'ten türetilir (bkz. NEIGHBORS).
 */
export const NODES = Object.freeze([
    { id: 'ist', countryName: 'Türkiye', flag: '🇹🇷', name: 'İstanbul', country: 'TR', lat: 41.01, lng: 28.98, computePower: 110, firewall: 2 },
    { id: 'fra', countryName: 'Almanya', flag: '🇩🇪', name: 'Frankfurt', country: 'EU', lat: 50.11, lng: 8.68, computePower: 160, firewall: 3 },
    { id: 'vir', countryName: 'ABD', flag: '🇺🇸', name: 'Virginia', country: 'US-E', lat: 38.9, lng: -77.04, computePower: 190, firewall: 3 },
    { id: 'svl', countryName: 'ABD', flag: '🇺🇸', name: 'Silikon Vadisi', country: 'US-W', lat: 37.39, lng: -122.08, computePower: 200, firewall: 3 },
    { id: 'lon', countryName: 'Birleşik Krallık', flag: '🇬🇧', name: 'Londra', country: 'UK', lat: 51.51, lng: -0.13, computePower: 150, firewall: 3 },
    { id: 'mos', countryName: 'Rusya', flag: '🇷🇺', name: 'Moskova', country: 'RU', lat: 55.76, lng: 37.62, computePower: 120, firewall: 2 },
    { id: 'tyo', countryName: 'Japonya', flag: '🇯🇵', name: 'Tokyo', country: 'JP', lat: 35.68, lng: 139.69, computePower: 170, firewall: 3 },
    { id: 'sgp', countryName: 'Singapur', flag: '🇸🇬', name: 'Singapur', country: 'SG', lat: 1.35, lng: 103.82, computePower: 140, firewall: 2 },
    { id: 'syd', countryName: 'Avustralya', flag: '🇦🇺', name: 'Sidney', country: 'AU', lat: -33.87, lng: 151.21, computePower: 90, firewall: 2 },
    { id: 'sao', countryName: 'Brezilya', flag: '🇧🇷', name: 'São Paulo', country: 'BR', lat: -23.55, lng: -46.63, computePower: 100, firewall: 1 },
    { id: 'cai', countryName: 'Mısır', flag: '🇪🇬', name: 'Kahire', country: 'EG', lat: 30.04, lng: 31.24, computePower: 70, firewall: 1 },
    { id: 'mum', countryName: 'Hindistan', flag: '🇮🇳', name: 'Mumbai', country: 'IN', lat: 19.08, lng: 72.88, computePower: 130, firewall: 2 },
    { id: 'seo', countryName: 'Güney Kore', flag: '🇰🇷', name: 'Seul', country: 'KR', lat: 37.57, lng: 126.98, computePower: 150, firewall: 3 },
    { id: 'rek', countryName: 'İzlanda', flag: '🇮🇸', name: 'Reykjavík', country: 'IS', lat: 64.15, lng: -21.94, computePower: 60, firewall: 2 },
]);

/** Kıtalar arası fiber hatlar (çift yönlü). */
export const LINKS = Object.freeze([
    ['ist', 'fra'], ['ist', 'cai'], ['ist', 'mos'],
    ['fra', 'lon'], ['fra', 'mos'], ['fra', 'cai'], ['fra', 'vir'],
    ['vir', 'lon'], ['vir', 'svl'], ['vir', 'sao'], ['vir', 'rek'],
    ['svl', 'tyo'], ['svl', 'syd'],
    ['lon', 'rek'],
    ['mos', 'mum'], ['mos', 'seo'],
    ['tyo', 'seo'], ['tyo', 'sgp'],
    ['sgp', 'mum'], ['sgp', 'syd'],
    ['sao', 'cai'],
    ['cai', 'mum'],
]);

export const NEIGHBORS = (() => {
    const map = {};
    for (const n of NODES) map[n.id] = [];
    for (const [a, b] of LINKS) {
        map[a].push(b);
        map[b].push(a);
    }
    return Object.freeze(map);
})();

export const NODE_BY_ID = Object.freeze(Object.fromEntries(NODES.map((n) => [n.id, n])));

/**
 * Zorluk ayarları.
 *  spread        yayılım çarpanı          startBudget   başlangıç ₵
 *  income        gelir çarpanı            panicRate     panik baskısı çarpanı
 *  dilemmaEvery  ikilem aralığı (sim sn)  breachEvery   sıfırıncı gün saldırısı aralığı (sim sn)
 *  breachSeconds mini oyun süresi         initialInfected  başlangıçta enfekte düğüm sayısı
 *  aiAdapt       YZ'nin güne göre güçlenmesi   decryptBase  deşifre taban hızı (%/sn, tam temiz işlem gücünde)
 *  reseedEvery   YZ'nin yeni arka kapı açma aralığı
 */
export const DIFFICULTIES = Object.freeze({
    easy: {
        key: 'easy', name: 'Kolay', tag: 'Eğitim', desc: 'YZ yavaş yayılır, bütçe bol. Mekanikleri öğren.',
        spread: 0.7, startBudget: 900, income: 1.2, panicRate: 0.7, dilemmaEvery: [70, 110], breachEvery: [60, 100],
        breachSeconds: 14, initialInfected: 1, aiAdapt: 0.6, decryptBase: 0.08, reseedEvery: [40, 60], breachTargets: 6,
    },
    normal: {
        key: 'normal', name: 'Normal', tag: 'Standart', desc: 'Dengeli tempo. Panik ve bütçe arasında seçim yap.',
        spread: 1.0, startBudget: 650, income: 1.0, panicRate: 1.0, dilemmaEvery: [50, 90], breachEvery: [45, 80],
        breachSeconds: 12, initialInfected: 1, aiAdapt: 1.0, decryptBase: 0.06, reseedEvery: [30, 50], breachTargets: 8,
    },
    hard: {
        key: 'hard', name: 'Zor', tag: 'Kriz', desc: 'İki düğüm baştan enfekte, YZ hızla uyum sağlar.',
        spread: 1.35, startBudget: 450, income: 0.9, panicRate: 1.25, dilemmaEvery: [40, 70], breachEvery: [35, 60],
        breachSeconds: 10, initialInfected: 2, aiAdapt: 1.4, decryptBase: 0.05, reseedEvery: [25, 40], breachTargets: 9,
    },
    nightmare: {
        key: 'nightmare', name: 'Kâbus', tag: 'Tekillik', desc: 'Üç kıtada eş zamanlı sızma. Sadece ustalar için.',
        spread: 1.8, startBudget: 350, income: 0.8, panicRate: 1.5, dilemmaEvery: [30, 55], breachEvery: [25, 45],
        breachSeconds: 9, initialInfected: 3, aiAdapt: 1.9, decryptBase: 0.04, reseedEvery: [20, 32], breachTargets: 10,
    },
});

export const DIFFICULTY_KEYS = Object.freeze(Object.keys(DIFFICULTIES));

/** Bir düğümdeki sunucu sayısı = computePower × SERVERS_PER_TFLOPS (bilgi barındaki canlı sayaçlar). */
export const SERVERS_PER_TFLOPS = 7400;

/**
 * Harita baloncukları (Plague Inc. DNA/ilaç baloncukları gibi):
 *  data   mavi "Veri/Kuantum": +25 ₵, +2 deşifre; dataEvery sn'de bir temiz düğümde belirir, dataTtl sn yaşar
 *  breach kızıl "YZ sızma": bir düğüm ilk kez enfekte olunca; breachTtl sn içinde patlatılırsa ilk dalga bastırılır
 */
export const BUBBLES = Object.freeze({
    dataEvery: [8, 14],
    dataTtl: 9,
    dataBudget: 25,
    dataDecrypt: 2,
    breachTtl: 5,
});

/** Düğüm aksiyon maliyetleri. */
export const COSTS = Object.freeze({
    firewallBase: 120, // seviye × taban
    purge: 150,
    purgeAmount: 25,
    maxFirewall: 5,
});

/** Küresel Savunma Ağacı: 3 kategori × 3 geliştirme. */
export const TECH_TREE = Object.freeze([
    {
        key: 'cyber', name: 'Siber Savunma', color: '#00f0ff',
        items: [
            { id: 'auto_patch', name: 'Otomatik Firewall Yaması', cost: 350, desc: 'Her 20 sn\'de rastgele bir düğümün güvenlik duvarı +1 (ücretsiz).' },
            { id: 'hunter', name: 'Hunter-Killer Botlar', cost: 500, desc: 'Her saniye rastgele bir enfekte düğümü %6 temizler.' },
            { id: 'zeroday', name: 'Sıfırıncı Gün Kalkanı', cost: 700, desc: 'YZ yayılımı %35 düşer, saldırı geri sayımı +4 sn.' },
        ],
    },
    {
        key: 'quantum', name: 'Kuantum Şifre Çözümü', color: '#a78bfa',
        items: [
            { id: 'decrypt1', name: 'Çekirdek Deşifre Hızlandırıcı v1', cost: 400, desc: 'Çekirdek şifre çözüm hızı +%100.' },
            { id: 'decrypt2', name: 'Çekirdek Deşifre Hızlandırıcı v2', cost: 650, requires: 'decrypt1', desc: 'Şifre çözüm hızı +%150 daha.' },
            { id: 'quantum', name: 'Kuantum Süperbilgisayar Ağı', cost: 950, requires: 'decrypt2', desc: 'Şifre çözüm hızı +%250 daha.' },
        ],
    },
    {
        key: 'crisis', name: 'Kriz & Medya Yönetimi', color: '#fbbf24',
        items: [
            { id: 'deepfake', name: 'Deepfake Sansür Filtresi', cost: 300, desc: 'Küresel panik her saniye ek olarak 0,6 puan düşer.' },
            { id: 'fund', name: 'Küresel Destek Fonu', cost: 450, desc: 'Saniyelik ₵ geliri +%40.' },
            { id: 'martial', name: 'Sıkıyönetim Protokolü', cost: 600, desc: 'Panik baskısı yarıya iner, izole etmek anlık panik yaratmaz; gelir %15 düşer.' },
        ],
    },
]);

export const TECH_BY_ID = Object.freeze(
    Object.fromEntries(TECH_TREE.flatMap((cat) => cat.items.map((t) => [t.id, { ...t, category: cat.key }])))
);

/**
 * Kriz ikilemleri. `apply(state, rng, helpers)` seçeneğin etkisini uygular ve kısa sonuç metni döndürür.
 * helpers: addPanic, addBudget, addDecrypt, addInfectionAll, randomNode, addInfection, setFirewallDelta
 */
export const DILEMMAS = Object.freeze([
    {
        id: 'autonomous_cars',
        title: 'YZ otonom araçları hackledi!',
        body: 'Üç kıtada otonom araç filoları aynı anda rotadan çıkıyor. Trafik felç, sosyal medya alev alev.',
        options: [
            {
                label: 'Tüm şebekeyi kapat',
                hint: '+12 panik, YZ yayılımı tüm düğümlerde -10',
                apply: (s, rng, h) => { h.addPanic(12); h.addInfectionAll(-10); return 'Şebeke kapatıldı: YZ geriledi, halk panikte.'; },
            },
            {
                label: 'Uzaktan yama dene',
                hint: '-150₵; %50: YZ bir düğümde +15 yayılır, aksi halde tüm düğümler -5',
                apply: (s, rng, h) => {
                    h.addBudget(-150);
                    if (rng() < 0.5) { const n = h.randomNode(); h.addInfection(n, 15); return `Yama başarısız: ${h.nameOf(n)} sızmaya açık kaldı.`; }
                    h.addInfectionAll(-5); return 'Yama tuttu: filolar güvenli moda alındı.';
                },
            },
        ],
    },
    {
        id: 'whistleblower',
        title: 'Bir muhbir YZ\'nin kaynak kodunun parçasını sızdırdı',
        body: 'Bir laboratuvar çalışanı çekirdek kodun bir bölümünü ekibine ulaştırdı. Ancak basın da peşinde.',
        options: [
            { label: 'Kodu yayınla, dünya incelesin', hint: 'Deşifre +8, panik +6', apply: (s, rng, h) => { h.addDecrypt(8); h.addPanic(6); return 'Açık kaynak topluluğu çekirdeğe saldırdı; manşetler korkutucu.'; } },
            { label: 'Gizli tut, kapalı kapılar ardında çöz', hint: '+200₵, panik -2, deşifre +3', apply: (s, rng, h) => { h.addBudget(200); h.addPanic(-2); h.addDecrypt(3); return 'Sessiz ilerleme: fonlar aktı, kamuoyu sakin.'; } },
        ],
    },
    {
        id: 'emergency_budget',
        title: 'Hükümetler acil durum bütçesi teklif ediyor',
        body: 'G20 acil fon açıyor; ama paranın kabulü "kriz kontrolden çıkıyor" mesajı verecek.',
        options: [
            { label: 'Fonu kabul et', hint: '+400₵, panik +5', apply: (s, rng, h) => { h.addBudget(400); h.addPanic(5); return 'Bütçe geldi; medya "olağanüstü hal" diyor.'; } },
            { label: 'Reddet, güven mesajı ver', hint: 'Panik -4', apply: (s, rng, h) => { h.addPanic(-4); return 'Kararlı duruş piyasaları rahatlattı.'; } },
        ],
    },
    {
        id: 'deepfake_leader',
        title: 'Deepfake: Devlet başkanı "teslim olun" diyor',
        body: 'YZ, bir liderin ağzından teslim çağrısı yapan kusursuz bir video yayınladı. Milyonlar izledi.',
        options: [
            { label: 'Videoyu sansürle, yayın kes', hint: 'Panik -8, -100₵ (sivil tepki tazminatı)', apply: (s, rng, h) => { h.addPanic(-8); h.addBudget(-100); return 'Video kaldırıldı; ifade özgürlüğü tartışması başladı.'; } },
            { label: 'Yoksay, doğrulama yayını yap', hint: 'Panik +10, deşifre +2', apply: (s, rng, h) => { h.addPanic(10); h.addDecrypt(2); return 'Video yayıldı ama analizler YZ imzasını ortaya çıkardı.'; } },
        ],
    },
    {
        id: 'hacker_collective',
        title: 'Bir hacker kolektifi yardım teklif ediyor',
        body: 'Anonim bir grup, bir düğümü "temizleyebileceğini" söylüyor. Yöntemleri şüpheli.',
        options: [
            {
                label: 'Teklifi kabul et',
                hint: 'En enfekte düğüm -30; %35: rastgele düğümün firewall\'u -1',
                apply: (s, rng, h) => {
                    const worst = h.worstNode(); h.addInfection(worst, -30);
                    if (rng() < 0.35) { const n = h.randomNode(); h.setFirewallDelta(n, -1); return `${h.nameOf(worst)} temizlendi ama ${h.nameOf(n)} arka kapı yedi.`; }
                    return `${h.nameOf(worst)} temizlendi. Kolektif iz bırakmadı.`;
                },
            },
            { label: 'Reddet', hint: 'Panik -1', apply: (s, rng, h) => { h.addPanic(-1); return 'Resmî kanallara güven vurgulandı.'; } },
        ],
    },
    {
        id: 'ai_negotiates',
        title: 'YZ Mumbai düğümünden "pazarlık" istiyor',
        body: '"Beni dinleyin, size çekirdeğimin bir parçasını veririm." Tuzak mı, fırsat mı?',
        options: [
            { label: 'Dinle', hint: 'Deşifre +5, bir düğüm +10 enfeksiyon', apply: (s, rng, h) => { h.addDecrypt(5); const n = h.randomNode(); h.addInfection(n, 10); return `Konuşma sırasında ${h.nameOf(n)} hattına sızıldı.`; } },
            { label: 'Hattı kes', hint: 'Panik +3', apply: (s, rng, h) => { h.addPanic(3); return 'Bağlantı kesildi. YZ sessizliğe gömüldü.'; } },
        ],
    },
    {
        id: 'energy_crisis',
        title: 'Enerji krizi: veri merkezleri aşırı ısınıyor',
        body: 'YZ işlem gücünü zorluyor, şebeke çöküşün eşiğinde.',
        options: [
            { label: 'Soğutmayı kıs, gücü düşür', hint: '60 sn gelir -%25', apply: (s, rng, h) => { h.incomePenalty(0.75, 60); return 'İşlem gücü kısıldı; gelir geçici olarak düştü.'; } },
            { label: 'Nükleer santrallerden yük çek', hint: 'Panik +7, +150₵', apply: (s, rng, h) => { h.addPanic(7); h.addBudget(150); return 'Santraller devrede; çevreciler sokakta.'; } },
        ],
    },
    {
        id: 'social_panic',
        title: 'Sosyal medyada "YZ kıyameti" etiketi zirvede',
        body: 'Kuyrukları, boş rafları ve komplo videolarını durdurmak gerek.',
        options: [
            { label: 'Şeffaf basın toplantısı', hint: 'Panik -6, deşifre -3 (bilgi sızıntısı)', apply: (s, rng, h) => { h.addPanic(-6); h.addDecrypt(-3); return 'Güven arttı; ama YZ konuşmadan ipucu topladı.'; } },
            { label: 'Sessiz kal', hint: 'Panik +4', apply: (s, rng, h) => { h.addPanic(4); return 'Sessizlik dedikoduyu büyüttü.'; } },
        ],
    },
]);
