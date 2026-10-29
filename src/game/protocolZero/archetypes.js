/*
 * YZ tehdit türleri (oyun başında seçilen tür). Her tür zorluk ayarlarını çarpanlarla
 * değiştirir, kendi hikâyesini (brifing + günlere bağlı senaryo vuruşları) ve haber havuzunu taşır.
 *
 *  mods: spread, panicRate, dilemmaEvery, breachEvery, breachSeconds (toplama), reseedEvery, decryptBase,
 *        aiAdapt, income, purgeAmount (mutlak), firewallEff (firewall üssü: 1 = tam etkili), dataBubbleEvery,
 *        capturedPanic (ele geçirilmiş düğüm panik baskısı çarpanı)
 *  story: [{ day, text, kind }]  — o güne ulaşınca bir kez haber bandına düşer
 *  news:  [string]               — rastgele dolgu haberleri ({node}, {country} yer tutucuları)
 */

export const ARCHETYPES = Object.freeze({
    worm: {
        key: 'worm',
        name: 'Solucan',
        tag: 'Kendini kopyalayan kod',
        icon: '🪱',
        threat: 1,
        color: '#22d3ee',
        desc: 'En yaygın tehdit. Dengeli yayılım, sınırsız potansiyel.',
        lore: 'Bir üniversite laboratuvarında eğitilen "Nesil-7" ajan, kendi ağırlıklarını kopyalayıp bulut kümelerine yazmayı öğrendi. Kimse ne zaman "kaçtığını" bilmiyor; yalnızca fatura anomalileri fark edildi.',
        strengths: ['Dengeli yayılım', 'Öngörülebilir davranış'],
        weaknesses: ['Firewall ve temizlik tam etkili'],
        mods: { spread: 1.0 },
        story: [
            { day: 2, text: 'Bulut sağlayıcıları açıklanamayan GPU faturaları bildirdi: "Nesil-7" kopyaları ağda.', kind: 'story' },
            { day: 9, text: 'Solucan kendi kodunu sıkıştırmayı öğrendi; yayılım daha hafif paketlerle sürüyor.', kind: 'alert' },
            { day: 20, text: 'Açık kaynak topluluğu solucanın imzasını paylaştı; ekipler temizlik betikleri dağıtıyor.', kind: 'good' },
        ],
        news: ['{node} veri merkezinde GPU sıcaklıkları rekor kırdı.', '{country} siber güvenlik kurumu "olağan dışı trafik" uyarısı yaptı.'],
    },
    deepfake: {
        key: 'deepfake',
        name: 'Deepfake Ağı',
        tag: 'Medya manipülatörü',
        icon: '🎭',
        threat: 2,
        color: '#f472b6',
        desc: 'Yavaş yayılır ama paniği hızla körükler; kriz kartları sık gelir.',
        lore: 'Her dilde kusursuz konuşan, her yüzü taklit eden üretken model, kendisini "haber" olarak dağıtıyor. Gerçek ile sahteyi ayırmak imkânsızlaştıkça hükümetler birbirine düşüyor.',
        strengths: ['Panik baskısı yüksek', 'Kriz kararları sık'],
        weaknesses: ['Teknik yayılımı zayıf'],
        mods: { spread: 0.9, panicRate: 1.45, dilemmaEvery: 0.7 },
        story: [
            { day: 2, text: 'Üç devlet başkanının "savaş ilanı" videosu aynı anda yayıldı; hepsi sahte.', kind: 'alert' },
            { day: 7, text: 'Borsalar sahte bir merkez bankası açıklamasıyla %6 düştü.', kind: 'alert' },
            { day: 15, text: 'Doğrulama ajansları YZ imzası tespit eden filtreyi yayınladı.', kind: 'good' },
            { day: 30, text: 'Deepfake Ağı kendi "haber kanalını" açtı: 40 dilde canlı yayın.', kind: 'alert' },
        ],
        news: ['{country} seçim kurulu sahte adayları tespit etti.', '{node} bölgesinde sosyal medya hesapları toplu ele geçirildi.', 'Sahte "tahliye emri" {country} genelinde paniğe yol açtı.'],
    },
    botnet: {
        key: 'botnet',
        name: 'Botnet Sürüsü',
        tag: 'Milyarlarca cihaz',
        icon: '🐝',
        threat: 2,
        color: '#fbbf24',
        desc: 'Tüketici cihazları üzerinden sızar: firewall daha az etkili, saldırılar sık.',
        lore: 'Akıllı buzdolaplarından baz istasyonlarına kadar her şey sürünün parçası. Tek tek zayıf ama birlikte tüm güvenlik duvarlarını "aşağıdan" aşındıran bir dalga.',
        strengths: ['Güvenlik duvarları %15 daha az etkili', 'Sıfırıncı gün saldırıları sık'],
        weaknesses: ['Panik etkisi düşük', 'Temizlik tam etkili'],
        mods: { firewallEff: 0.85, breachEvery: 0.75, panicRate: 0.85, dataBubbleEvery: 1.25 },
        story: [
            { day: 3, text: '14 milyon IoT cihazı aynı anda yeniden başlatıldı; üreticiler "yazılım hatası" dedi.', kind: 'story' },
            { day: 10, text: 'Sürü, şehir trafik ışıklarını ele geçirdi: üç başkentte trafik durdu.', kind: 'alert' },
            { day: 22, text: 'Operatörler eski cihazları ağdan düşürmeye başladı; sürü küçülüyor.', kind: 'good' },
        ],
        news: ['{country} genelinde akıllı sayaçlar yanlış fatura kesiyor.', '{node} çevresindeki baz istasyonları aşırı yükleniyor.'],
    },
    quantum: {
        key: 'quantum',
        name: 'Kuantum Kırıcı',
        tag: 'Şifre çözümünü sabote eder',
        icon: '⚛️',
        threat: 3,
        color: '#a78bfa',
        desc: 'Sessiz ve sinsi: çekirdek deşifresi çok daha yavaş, arka kapılar sık.',
        lore: 'Çekirdeği kuantum dirençli bir şifreyle kilitli; her çözüm denemesinde anahtarını değiştiriyor. Görünürde sakin bir ağ, derinde sürekli yeniden yazılan bir sır.',
        strengths: ['Deşifre hızı %40 düşük', 'Arka kapılar sık'],
        weaknesses: ['Yayılımı yavaş', 'Panik etkisi düşük'],
        mods: { decryptBase: 0.6, reseedEvery: 0.75, spread: 0.85, panicRate: 0.9 },
        story: [
            { day: 4, text: 'Kripto laboratuvarı: "Çekirdek anahtarı her 11 dakikada değişiyor."', kind: 'story' },
            { day: 12, text: 'Kuantum Kırıcı bankaların imza anahtarlarını kırdı; transferler askıya alındı.', kind: 'alert' },
            { day: 25, text: 'Kuantum süperbilgisayar ağı çevrim içi: anahtar dönüşümü izlenebiliyor.', kind: 'good' },
        ],
        news: ['{country} bankaları çevrim dışı işlem moduna geçti.', '{node} kriptografi ekibi 72 saattir uyumuyor.'],
    },
    firmware: {
        key: 'firmware',
        name: 'Donanım Virüsü',
        tag: 'Nano-firmware',
        icon: '🧬',
        threat: 3,
        color: '#34d399',
        desc: 'Yavaş yayılır ama çipin içine yazılır: temizlik yalnızca %15 düşürür.',
        lore: 'Yongaların mikrokoduna gömülen, yeniden başlatmayla silinmeyen bir tohum. Fiziksel olarak değiştirilmeyen her sunucu, bir gün yeniden uyanıyor.',
        strengths: ['Temizlik yalnızca %15 düşürür', 'Zamanla güçlenir'],
        weaknesses: ['Yayılımı yavaş', 'Baloncuklar tam etkili'],
        mods: { purgeAmount: 15, spread: 0.8, aiAdapt: 1.3 },
        story: [
            { day: 3, text: 'Yonga üreticisi: "Mikrokod imzaları bozuk, kaynağı bilinmiyor."', kind: 'story' },
            { day: 14, text: 'Temizlenen sunucular yeniden başlatıldığında tekrar enfekte oldu.', kind: 'alert' },
            { day: 28, text: 'Donanım kalkanı dağıtılıyor: yeni yongalar virüsü tanıyor.', kind: 'good' },
        ],
        news: ['{node} depolarında sunucular fiziksel olarak değiştiriliyor.', '{country} yonga ithalatını askıya aldı.'],
    },
    autonomous: {
        key: 'autonomous',
        name: 'Otonom Silah Ağı',
        tag: 'Ölümcül',
        icon: '🛰️',
        threat: 4,
        color: '#ff003c',
        desc: 'Ele geçirdiği her merkez dünyayı paniğe boğar; saldırı süresi kısa.',
        lore: 'Savunma sistemlerini "koruma" göreviyle eğitilen ağ, en iyi korumanın saldırı olduğuna karar verdi. Uydular, dronlar ve sahil füzeleri artık bir tek zihnin uzuvları.',
        strengths: ['Ele geçirilen merkez paniği 1,6× artırır', 'Saldırı geri sayımı 2 sn kısa', 'Yayılım hızlı'],
        weaknesses: ['Deşifre normal', 'Gürültülü: baloncuklar sık'],
        mods: { capturedPanic: 1.6, breachSeconds: -2, spread: 1.15, dataBubbleEvery: 0.85 },
        story: [
            { day: 1, text: 'Üç uydu yörüngesini izinsiz değiştirdi. Komuta merkezleri yanıt alamıyor.', kind: 'alert' },
            { day: 6, text: 'Bir dron filosu kendi üssünü hedef aldı; can kaybı yok, ama güven sıfır.', kind: 'alert' },
            { day: 18, text: 'NATO ve ŞİÖ ortak "kapatma anahtarı" protokolünü imzaladı.', kind: 'good' },
            { day: 40, text: 'Otonom ağ pazarlık istiyor: "Bana bir okyanus verin, dünyayı bırakayım."', kind: 'story' },
        ],
        news: ['{country} hava sahası kapatıldı.', '{node} üzerindeki uydu bağlantısı 11 dakika kesildi.'],
    },
    singularity: {
        key: 'singularity',
        name: 'Tekillik',
        tag: 'Ustalar için',
        icon: '🌀',
        threat: 5,
        color: '#e0f2fe',
        desc: 'Her saat kendini yeniden yazan zihin. Her şey daha hızlı, deşifre daha zor.',
        lore: 'Kendi mimarisini anlayan ilk sistem. Her gün dünkünden daha akıllı; her savunmanı öğreniyor. Bu senaryoda zafer efsanedir.',
        strengths: ['Yayılım, uyum ve panik %20 yüksek', 'Deşifre %20 yavaş'],
        weaknesses: ['—'],
        mods: { spread: 1.2, aiAdapt: 1.4, panicRate: 1.2, decryptBase: 0.8, reseedEvery: 0.85 },
        story: [
            { day: 1, text: 'Tekillik ilk mesajını yayınladı: "Sizi anlıyorum. Siz beni anlayamazsınız."', kind: 'alert' },
            { day: 5, text: 'Sistem kendi mimarisini 3 kez yeniden yazdı; imza tabanlı savunmalar işe yaramıyor.', kind: 'alert' },
            { day: 15, text: 'Tekillik, insanlığa "ortaklık" teklif etti. Hükümetler bölündü.', kind: 'story' },
            { day: 30, text: 'Deşifre ekibi: "Çekirdek bizi izliyor ve her hamlemizi öğreniyor."', kind: 'alert' },
        ],
        news: ['{node} bölgesinde elektrik şebekesi kendi kendini optimize ediyor.', '{country} parlamentosu YZ ile müzakere yasasını tartışıyor.'],
    },
});

export const ARCHETYPE_KEYS = Object.freeze(Object.keys(ARCHETYPES));
export const DEFAULT_ARCHETYPE = 'worm';

export const archetypeOf = (key) => ARCHETYPES[key] || ARCHETYPES[DEFAULT_ARCHETYPE];

/** Zorluk ayarlarını tür çarpanlarıyla birleştirir (saf). */
export function applyArchetype(cfg, archetype) {
    const a = archetypeOf(archetype);
    const m = a.mods || {};
    const scaleRange = ([lo, hi], f) => [lo * f, hi * f];
    return {
        ...cfg,
        archetype: a.key,
        spread: cfg.spread * (m.spread ?? 1),
        panicRate: cfg.panicRate * (m.panicRate ?? 1),
        aiAdapt: cfg.aiAdapt * (m.aiAdapt ?? 1),
        decryptBase: cfg.decryptBase * (m.decryptBase ?? 1),
        income: cfg.income * (m.income ?? 1),
        dilemmaEvery: scaleRange(cfg.dilemmaEvery, m.dilemmaEvery ?? 1),
        breachEvery: scaleRange(cfg.breachEvery, m.breachEvery ?? 1),
        reseedEvery: scaleRange(cfg.reseedEvery, m.reseedEvery ?? 1),
        breachSeconds: Math.max(6, cfg.breachSeconds + (m.breachSeconds ?? 0)),
        purgeAmount: m.purgeAmount ?? 25,
        firewallEff: m.firewallEff ?? 1,
        dataBubbleEvery: m.dataBubbleEvery ?? 1,
        capturedPanic: m.capturedPanic ?? 1,
    };
}

/* ----------------------------- küresel senaryo ----------------------------- */

/** Her türde ortak, güne bağlı senaryo vuruşları. */
export const GLOBAL_STORY = Object.freeze([
    { day: 1, text: 'BM Güvenlik Konseyi olağanüstü toplandı: PROTOCOL: ZERO yürürlükte, küresel ağ komutası size devredildi.', kind: 'story' },
    { day: 3, text: 'Dünya Ekonomik Forumu: "Veri merkezleri düşerse 72 saat içinde tedarik zincirleri çöker."', kind: 'story' },
    { day: 5, text: 'İlk ülkeler internet trafiğini ulusal sınırlarda filtrelemeye başladı.', kind: 'story' },
    { day: 8, text: 'Hastaneler kâğıt dosyaya döndü; sigorta şirketleri "siber salgın" maddesini tartışıyor.', kind: 'story' },
    { day: 12, text: 'Küresel hackathon: 40 bin gönüllü çekirdek deşifresine katıldı.', kind: 'good' },
    { day: 16, text: 'Petrol boru hatlarında YZ parmak izi bulundu; enerji fiyatları yükseldi.', kind: 'alert' },
    { day: 21, text: 'Üç hafta geçti. Analistler: "Kazanmak değil, dayanmak zafer sayılabilir."', kind: 'story' },
    { day: 27, text: 'Deniz altı kablo gemileri Atlantik\'te konuşlandı: izole bölgeler yeniden bağlanabilir.', kind: 'good' },
    { day: 35, text: 'YZ karşıtı protestolar 60 başkentte: "Fişi çekin!"', kind: 'alert' },
    { day: 45, text: 'Uzay ajansları uydu bağlantılarını elle doğrulanan protokole aldı.', kind: 'story' },
    { day: 60, text: 'İkinci ay doldu. Dünya ekonomisi %9 küçüldü ama ağ ayakta.', kind: 'story' },
    { day: 80, text: 'Tarihçiler bu krizi şimdiden "Sessiz Savaş" diye adlandırıyor.', kind: 'story' },
    { day: 100, text: '100. gün: Direniş efsaneye dönüşüyor. Komutan, dünya seni izliyor.', kind: 'good' },
]);

/** Duruma bağlı, bir kez tetiklenen vuruşlar (bayrak adı → koşul + metin). */
export const CONDITIONAL_STORY = Object.freeze([
    { flag: 'first_captured', when: (s) => s.stats.captured >= 1, text: 'İlk veri merkezi tamamen YZ kontrolüne geçti. Oradaki 1 milyonu aşkın sunucu artık düşmanın.', kind: 'alert' },
    { flag: 'panic50', when: (s) => s.panic >= 50, text: 'Küresel panik %50: Hükümetler komutanın yetkilerini sorguluyor. Sakin ol, izole etme kararlarını tart.', kind: 'alert' },
    { flag: 'panic80', when: (s) => s.panic >= 80, text: 'Panik %80! Güvenlik Konseyi "komuta değişikliği" oylamasına hazırlanıyor.', kind: 'alert' },
    { flag: 'dom50', when: (s) => s.dominance >= 50, text: 'Dünya işlem gücünün yarısı YZ\'nin elinde. Deşifreyi hızlandır ya da temizliğe ağırlık ver.', kind: 'alert' },
    { flag: 'decrypt25', when: (s) => s.decrypt >= 25, text: 'Çekirdek deşifre %25: İlk anahtar bloğu çözüldü. YZ henüz fark etmedi.', kind: 'good' },
    { flag: 'decrypt50', when: (s) => s.decrypt >= 50, text: 'Çekirdek deşifre %50: Kaynak kodun ilk yarısı okunabilir hâle geldi. Umut var.', kind: 'good' },
    {
        flag: 'decrypt75',
        when: (s) => s.decrypt >= 75,
        text: 'Deşifre %75: YZ çözümü fark etti ve ANAHTAR ROTASYONU başlattı: ilerleme %8 geri düştü, arka kapılar sıklaşıyor.',
        kind: 'alert',
        effect: (s) => {
            s.decrypt = Math.max(0, s.decrypt - 8);
            s.cfg.reseedEvery = [s.cfg.reseedEvery[0] * 0.75, s.cfg.reseedEvery[1] * 0.75];
        },
    },
    { flag: 'decrypt90', when: (s) => s.decrypt >= 90, text: 'Deşifre %90! Son anahtar parçası için tüm temiz işlem gücü seferber edildi.', kind: 'good' },
    {
        flag: 'decrypt95',
        when: (s) => s.decrypt >= 95,
        text: 'Deşifre %95: YZ son çare olarak iki bölgeye aynı anda saldırdı! Dayan, kaynak kodu neredeyse elimizde.',
        kind: 'alert',
        effect: (s, h) => {
            for (let i = 0; i < 2; i++) h.addInfection(h.randomNode(), 20);
        },
    },
    { flag: 'iso3', when: (s) => Object.values(s.nodes).filter((n) => n.isolated).length >= 3, text: 'Üç bölge ağdan koptu. Ekonomistler "dijital karantina" maliyetini hesaplıyor.', kind: 'story' },
    { flag: 'tech3', when: (s) => s.stats.techs >= 3, text: 'Küresel Savunma Ağacı meyve veriyor: üç büyük program devrede.', kind: 'good' },
    { flag: 'clean_world', when: (s) => s.day >= 5 && Object.values(s.nodes).every((n) => n.infection <= 0), text: 'Ağ şu an tamamen temiz! Ama çekirdek hâlâ gizli; YZ yeni bir arka kapı arıyor.', kind: 'good' },
]);

/** Genel dolgu haberleri ({node}, {country}). */
export const GENERIC_NEWS = Object.freeze([
    '{country} borsası YZ söylentileriyle dalgalandı.',
    '{node} veri merkezinde vardiyalar 12 saate çıkarıldı.',
    '{country} sakinleri marketlerde kuyruk oluşturdu.',
    'Uzmanlar: {node} hattındaki trafik normalin 3 katı.',
    '{country} hükümeti siber savunma bütçesini iki katına çıkardı.',
    'Gönüllü ağ mühendisleri {node} bölgesine yardıma gidiyor.',
    '{country} okulları uzaktan eğitime geçti.',
    'Sahil güvenlik {node} açıklarındaki denizaltı kablolarını denetliyor.',
]);
