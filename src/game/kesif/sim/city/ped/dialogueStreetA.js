/*
 * KEŞİF sim/city/ped — SOKAK NPC DİYALOGLARI A: 7 rehber, şehir ev sahibi, 3 mentor (npc_vendors). Aile dostu, özgün, her satır ≤60 kr.
 * Rehber şablonu: root → about/about2 · tip/tip2 (+ipucu efekti) · görev (koşul `q_<görev>`: yok/etkin/bitti üç ayrı seçenek; yalnız biri görünür).
 * Görev efektleri dış işleyiciye gider (discovery_missions); işleyici yoksa "Bu iş şimdilik kapalı." denir.
 */
import {
  bye, ch, graph, nd,
} from './dialogueKit.js';

const back = ch('Geri dön', 'root');
const questChoices = (id, label) => [
  ch(label, 'offer', { c: { quest: [id, 'none'] } }),
  ch('Görevim nasıl gidiyor?', 'status', { c: { quest: [id, 'active'] } }),
  ch('Görev için teşekkürler', 'thanks', { c: { quest: [id, 'done'] } }),
];

/** p: {greet, about[2], tip[2], hint, mission:{id, offer, accept, status, thanks, label, accLabel}, say} */
function guideGraph(npcId, p) {
  const m = p.mission;
  return graph(npcId, {
    entry: [[{ hint: 'veda' }, 'bye']],
    nodes: {
      root: nd(p.greet, [
        ch('Burası neresi?', 'about'),
        ch('Ne önerirsin?', 'tip'),
        ...questChoices(m.id, m.label),
        bye('Hoşça kal', p.say),
      ], { mood: 'selam' }),
      about: nd(p.about[0], [ch('Devam et', 'about2'), back, bye()]),
      about2: nd(p.about[1], [ch('Ne önerirsin?', 'tip'), back, bye()]),
      tip: nd(p.tip[0], [ch('Başka ipucu?', 'tip2'), back, bye()]),
      tip2: nd(p.tip[1], [back, bye()], { act: [{ k: 'hint', id: p.hint }] }),
      offer: nd(m.offer, [
        ch(m.accLabel, 'accepted', { act: [{ k: 'mission', id: m.id }] }),
        ch('Sonra bakarım', 'root'),
        bye(),
      ], { mood: 'hevesli' }),
      accepted: nd(m.accept, [back, bye()], { mood: 'dost' }),
      status: nd(m.status, [back, bye()]),
      thanks: nd(m.thanks, [back, bye()], { mood: 'dost' }),
      bye: nd('Yolun açık olsun, yine bekleriz!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
    },
  });
}

/* Not: root en çok 4 GÖRÜNÜR seçenek taşır (görev üçlüsünden yalnız biri görünür): konuş / öner / görev-durumu / çık. */
const GUIDES = {
  rehber_arda: {
    greet: 'Merkez\'e hoş geldin! Işıklar benden sorulur.',
    about: ['Merkez\'in kuleleri gökyüzüne kadar uzanır.', 'Meydanın altındaki tüneller şehri baştan başa keser.'],
    tip: ['Kuleye girmek yerine fuayeyi gez; içi serindir.', 'Meydan Tüneli hızlı geçer; yavaş gir, hızlı çık.'],
    hint: 'terminal',
    mission: {
      id: 'nm_ilk_teslimat',
      label: 'Görev var mı?',
      offer: 'Kurye masasına uğra; ilk teslimatın seni bekliyor.',
      accLabel: 'Kurye masasına gidelim',
      accept: 'Harika! Süreyi iyi kullan, ben burada beklerim.',
      status: 'Paketi süresinde ulaştır; sakin sür, acele etme.',
      thanks: 'İlk teslimat tamam; kuryeliğe hoş geldin!',
    },
    say: 'Merkez\'de görüşürüz!',
  },
  rehber_lale: {
    greet: 'Pazar\'a hoş geldin! Burada her tezgâhın bir sesi var.',
    about: ['Gece Pazarı ışıl ışıl; kehribar fenerler hiç sönmez.', 'Simit, çay, çiçek, boya; ne ararsan tezgâhta.'],
    tip: ['Boş duvarlara bak; grafiti için sprey şart.', 'Satıcılar eşyanı düşük fiyata geri alır; ona göre al.'],
    hint: 'satici',
    mission: {
      id: 'nm_graffiti_5',
      label: 'Görev var mı?',
      offer: 'Duvarlara beş renk bırak; Pazar seni anacak!',
      accLabel: 'Sprey zamanı!',
      accept: 'Boş duvarı bulunca basılı tut; renk kendiliğinden gelir.',
      status: 'Duvarlar seni bekliyor; renkli bir iz bırak.',
      thanks: 'Pazar duvarları artık rengârenk; teşekkürler!',
    },
    say: 'Pazarda keyifli yürüyüşler!',
  },
  rehber_baran: {
    greet: 'Hey, maceracı! Konteyner Mahallesi\'ne hoş geldin.',
    about: ['Burada konteynerler beş kat yükselir, hepsi renkli.', 'Çatıdan çatıya koşmak buranın en eğlenceli işi.'],
    tip: ['Sıçramadan önce boşluğu ölç: yürürken üç, koşarken dört.', 'Çatı parkurları dış merdivenle başlar; ucunu ara.'],
    hint: 'cati',
    mission: {
      id: 'nm_cati_parkur',
      label: 'Görev var mı?',
      offer: 'Bir çatı parkurunu bitir; manzara ödülün olsun.',
      accLabel: 'Çatılara çıkalım',
      accept: 'Merdiveni bul, kontrol noktalarını sırayla geç.',
      status: 'Parkurda sabırlı ol; düşersen yeniden dene.',
      thanks: 'Çatıların efendisi sensin; aferin!',
    },
    say: 'Çatılarda görüşürüz!',
  },
  rehber_deniz: {
    greet: 'Merhaba! Liman rüzgârı yüzünü okşadı mı?',
    about: ['Liman ve Sanayi dalga sesi, halat ve vinç kokar.', 'Kanalın üstündeki köprüler şehri iki yakaya bağlar.'],
    tip: ['Rıhtımın kenarına fazla yaklaşma; yolda kalmak güzeldir.', 'Veri çipleri limanda sandık gölgelerinde saklanır.'],
    hint: 'cipler',
    mission: {
      id: 'nm_cip_10',
      label: 'Görev var mı?',
      offer: 'On veri çipi topla; tarayıcı varsa daha kolay olur.',
      accLabel: 'Çip avına çıkalım',
      accept: 'Çipler sokaklarda, çatılarda, kanallarda saklı; iyi şanslar!',
      status: 'Çipleri saymaya devam et; her köşe bir şans.',
      thanks: 'On çip tamam; harika bir kaşifsin!',
    },
    say: 'Rüzgâr arkandan essin!',
  },
  rehber_selin: {
    greet: 'Teknopark\'a hoş geldin! Burada her şey ölçülü.',
    about: ['Laboratuvarlar yerin altında, parkın altında.', 'Teknopark\'ın ışıkları camgöbeği ve limon renkli.'],
    tip: ['Kitaplık ve panoların arkasına dikkatle bak.', 'Tarayıcı saklı odaları ve çipleri bulmana yardım eder.'],
    hint: 'tarayici',
    mission: {
      id: 'nm_gizli_oda',
      label: 'Görev var mı?',
      offer: 'Bir gizli oda bul; ipucu için sahiplerle konuş.',
      accLabel: 'Gizli oda arayalım',
      accept: 'Sahipler sır verir; ilişkiyi iyi tut, ipucu gelir.',
      status: 'Duvarların arkasına bak; bir kapı olabilir.',
      thanks: 'Gizli oda bulundu; çok meraklısın!',
    },
    say: 'Merakın hiç bitmesin!',
  },
  rehber_yesim: {
    greet: 'Merhaba! Tepe\'nin havası hep ferah.',
    about: ['Tepe Konutları sakin; çatı bahçeleri ve teraslar.', 'Buradan şehrin tamamı yukarıdan görünür.'],
    tip: ['Gün batımında teras başka güzel görünür.', 'Fotoğraf modu arayüzü gizler; serbest kamera kullan.'],
    hint: 'foto',
    mission: {
      id: 'nm_fotograf',
      label: 'Görev var mı?',
      offer: 'Güzel bir kare yakala; şehrin en iyi köşesini seç.',
      accLabel: 'Kareyi yakalayalım',
      accept: 'Fotoğraf modunu aç, kadraja bak, bir tık yeter.',
      status: 'Işık güzelken çek; gün batımı en iyisi.',
      thanks: 'Kare harika çıkmış; teşekkürler!',
    },
    say: 'Tepede huzurla kal!',
  },
};

/* ---------------------------------------------------------------------------------------------- Zeynep: ana rehber */
const ZEYNEP = graph('rehber_zeynep', {
  entry: [[{ hint: 'veda' }, 'bye']],
  nodes: {
    root: nd('Neon Meridyen\'e hoş geldin! Ben Zeynep, rehberin.', [
      ch('Burası neresi?', 'about'),
      ch('Nasıl yapılır?', 'help'),
      ch('İlk sürüşümü yapayım', 'offer', { c: { quest: ['nm_ilk_surus', 'none'] } }),
      ch('Görevim nasıl gidiyor?', 'status', { c: { quest: ['nm_ilk_surus', 'active'] } }),
      bye('Hoşça kal', 'Şehirde iyi eğlenceler!'),
    ], { mood: 'selam' }),
    about: nd('Burası Kapı Meydanı; şehre ilk adım, eve son adım.', [ch('Devam et', 'about2'), back, bye()]),
    about2: nd('Altı bölge var; haritadan hepsini göreceksin.', [ch('Nasıl yapılır?', 'help'), back, bye()]),
    help: nd('Hangi konuda yardım istersin?', [
      ch('Portal ve eve dönüş', 'h_portal'),
      ch('Harita ve işaretler', 'h_map'),
      ch('Kredi ve eşyalar', 'h_kredi'),
      bye(),
    ]),
    h_portal: nd('Terminallere dokun; bulduğun yer eve dönüş noktan olur.', [ch('Başka konu', 'help'), back, bye()], { act: [{ k: 'hint', id: 'terminal' }] }),
    h_map: nd('Haritayı aç; bulduğun yerler orada görünür.', [ch('Başka konu', 'help'), back, bye()], { act: [{ k: 'hint', id: 'harita' }] }),
    h_kredi: nd('Kredi yalnız şehirde geçer; eşya almak için harca.', [ch('Başka konu', 'help'), back, bye()], { act: [{ k: 'hint', id: 'kredi' }] }),
    offer: nd('İlk sürüşünü yapalım mı? Garaj hemen şurada.', [
      ch('Hadi başlayalım', 'accepted', { act: [{ k: 'mission', id: 'nm_ilk_surus' }] }),
      ch('Sonra bakarım', 'root'),
      bye(),
    ], { mood: 'hevesli' }),
    accepted: nd('Süper! Önce bir araca bin; gerisi kolay.', [back, bye()], { mood: 'dost' }),
    status: nd('Aracınla biraz dolaş; yollar açık, trafik dost.', [back, bye()]),
    bye: nd('Yolun açık olsun, yine bekleriz!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

/* ---------------------------------------------------------------------------------------------- Nilüfer Hanım: şehir ev sahibi */
const NILUFER = graph('ev_sahibi_nilufer', {
  entry: [[{ hint: 'veda' }, 'bye']],
  nodes: {
    root: nd('Hoş geldiniz! Neon Meridyen\'in kapısı herkese açık.', [
      ch('Şehrin hikâyesi nedir?', 'story'),
      ch('Şehirde neye dikkat etmeli?', 'rules'),
      ch('Hoş geldin hediyesi', 'gift', { c: { no: 'host_gift' } }),
      bye('Hoşça kal', 'Keyifli bir gezi dilerim!'),
    ], { mood: 'selam' }),
    story: nd('Işıklar bir akşam bir araya gelmiş, şehir doğmuş.', [ch('Devam et', 'story2'), back, bye()]),
    story2: nd('Herkes kendi renginden bir neon bırakmış buraya.', [ch('Devam et', 'story3'), back, bye()]),
    story3: nd('Şimdi burası dostların, kaşiflerin buluşma yeri.', [ch('Şehirde neye dikkat etmeli?', 'rules'), back, bye()]),
    rules: nd('Yayalara yol ver, trafikte sabırlı ol, herkese selam ver.', [ch('Başka ne var?', 'rules2'), back, bye()]),
    rules2: nd('Şehirden aldığın eşyalar ana diyara da gelir; boşa harcama.', [back, bye()], { act: [{ k: 'hint', id: 'esya' }] }),
    gift: nd('Küçük bir karşılama armağanı: al, şehirde işine yarar.', [ch('Çok teşekkürler!', 'root'), bye()], {
      act: [{ k: 'kredi', n: 15 }, { k: 'give', item: 'item:enerji_hücresi', n: 1 }, { k: 'flag', key: 'host_gift', v: true }], once: true, mood: 'dost',
    }),
    bye: nd('Yolunuz açık olsun; şehir sizi bekler.', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

/* ---------------------------------------------------------------------------------------------- mentorlar */
const POYRAZ = graph('mentor_poyraz', {
  entry: [[{ hint: 'veda' }, 'bye']],
  nodes: {
    root: nd('Yola güvenle çıkmak ustalıktır, evlat.', [
      ch('Sürüş ipuçları ver', 'drive'),
      ch('Yarışlar nasıl işler?', 'race'),
      ch('Bir şaka yap', 'joke'),
      bye('Hoşça kal', 'Yol seninle olsun!'),
    ], { mood: 'selam' }),
    drive: nd('Viraja girerken gazı bırak, çıkarken yavaşça ver.', [ch('Devam et', 'drive2'), back, bye()]),
    drive2: nd('Nitroyu düz yolda kullan; virajda ise kayarsın.', [ch('Yağmurda ne yapayım?', 'rain'), back, bye()]),
    rain: nd('Islak yolda mesafe uzar; önceden fren, nazik direksiyon.', [back, bye()], { act: [{ k: 'hint', id: 'yagmur' }] }),
    race: nd('Kapıları sırayla geç; altın madalya en hızlıya.', [ch('Devam et', 'race2'), back, bye()]),
    race2: nd('Hakemlerle konuş; yarış orada başlar.', [back, bye()], { act: [{ k: 'hint', id: 'yarislar' }] }),
    joke: nd('Araç dedi ki: Bana basma, ben de severim seni!', [ch('Devam et', 'punch'), back, bye()], { mood: 'neşe' }),
    punch: nd('Gaz pedalı da: Ben sadece nazik olmak istiyordum.', [ch('Ha ha, güzeldi!', 'root'), bye()], { mood: 'neşe' }),
    bye: nd('Direksiyon sende, yol açık; kolay gelsin!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

const AYCA = graph('mentor_ayca', {
  entry: [[{ hint: 'veda' }, 'bye']],
  nodes: {
    root: nd('Keşfetmek bir kas gibidir; kullandıkça güçlenir!', [
      ch('Neleri keşfedebilirim?', 'what'),
      ch('Ne önerirsin?', 'tip'),
      ch('Bir şaka yap', 'joke'),
      bye('Hoşça kal', 'Keşif seninle olsun!'),
    ], { mood: 'selam' }),
    what: nd('Veri çipleri, grafiti noktaları ve gizli odalar var.', [ch('Devam et', 'what2'), back, bye()]),
    what2: nd('Her biri haritada bir iz bırakır; sabırla topla.', [ch('Çipler nerede?', 'chips'), ch('Grafiti nasıl?', 'graf'), back, bye()]),
    chips: nd('Sokak köşelerinde, çatılarda ve kanallarda parlarlar.', [back, bye()], { act: [{ k: 'hint', id: 'cipler' }] }),
    graf: nd('Boş duvara gel, sprey basılı tut; kalıp seç.', [back, bye()], { act: [{ k: 'hint', id: 'grafiti' }] }),
    tip: nd('Kitaplığa ve panoya yakından bak; gizli oda olabilir.', [ch('Başka ipucu?', 'tip2'), back, bye()], { act: [{ k: 'hint', id: 'odalar' }] }),
    tip2: nd('Tarayıcın varsa çıt sesi yakında bir şey olduğunu söyler.', [back, bye()], { act: [{ k: 'hint', id: 'tarayici' }] }),
    joke: nd('Kaşif haritaya bakmış: Biz neredeyiz? Harita: Tam burada.', [ch('Devam et', 'punch'), back, bye()], { mood: 'neşe' }),
    punch: nd('Kaşif: Harika, yani kaybolmadık, yalnız buradayız.', [ch('Ha ha, güzeldi!', 'root'), bye()], { mood: 'neşe' }),
    bye: nd('Merakın hiç bitmesin; iyi keşifler!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

const SELIM = graph('mentor_selim', {
  entry: [[{ hint: 'veda' }, 'bye']],
  nodes: {
    root: nd('Teknoloji, merakın elektrikle buluşmasıdır!', [
      ch('Eşya alıp satmak', 'shop'),
      ch('Eşyalar eve gelir mi?', 'carry'),
      ch('Portal hakkında', 'portal'),
      bye('Hoşça kal', 'Şarjın dolu olsun!'),
    ], { mood: 'selam' }),
    shop: nd('Satıcılar eşyayı alır; geri satışta fark kalır, düşün.', [ch('Devam et', 'shop2'), back, bye()]),
    shop2: nd('Her gün stok değişir; bugünün tezgâhına bir bak.', [back, bye()], { act: [{ k: 'hint', id: 'satici' }] }),
    carry: nd('Satıcıdan aldığın eşyalar ana diyara da taşınır.', [ch('Hepsi mi?', 'carry2'), back, bye()]),
    carry2: nd('Kartlar ve şehre özel eşyalar kasada bekler.', [back, bye()], { act: [{ k: 'hint', id: 'esya' }] }),
    portal: nd('Portal tabancası boyut kapısı açar; şarj harcar.', [ch('Devam et', 'portal_son'), back, bye()]),
    portal_son: nd('Eve dönmek için bir terminal bulman yeter.', [back, bye()], { act: [{ k: 'hint', id: 'portal' }] }),
    bye: nd('Pil bitmeden terminali bul; kolay gelsin!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

export const STREET_A_GRAPHS = Object.freeze(
  Object.keys(GUIDES).map((id) => guideGraph(id, GUIDES[id])).concat([ZEYNEP, NILUFER, POYRAZ, AYCA, SELIM]),
);
