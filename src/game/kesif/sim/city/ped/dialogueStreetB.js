/*
 * KEŞİF sim/city/ped — SOKAK NPC DİYALOGLARI B: 6 satıcı, 2 kurye, taksi amiri, 2 yarış hakemi, tamirci, DJ, fotoğrafçı (npc_vendors).
 * Aile dostu, özgün, her satır ≤60 kr. Görev/iş/yarış/taksi/foto efektleri dış işleyiciye gider (discovery_missions / photo_map).
 */
import {
  bye, ch, graph, nd,
} from './dialogueKit.js';

const back = ch('Geri dön', 'root');
const hello = (id) => [{ hint: 'veda' }, id];

/* ---------------------------------------------------------------------------------------------- satıcılar */
/** p: {greet, pitch, gossip[2], joke[2], say} */
function vendorGraph(npcId, p) {
  return graph(npcId, {
    entry: [[{ hint: 'veda' }, 'bye']],
    nodes: {
      root: nd(p.greet, [
        ch('Neler var, bakayım', 'end', { act: [{ k: 'vendor', id: npcId }], say: p.say }),
        ch('Biraz sohbet edelim', 'chat'),
        bye('Hoşça kal', p.say),
      ], { mood: 'selam' }),
      chat: nd(p.pitch, [ch('Pazardan haberler?', 'gossip'), ch('Bir şaka yap', 'joke'), back, bye()]),
      gossip: nd(p.gossip[0], [ch('Başka?', 'gossip2'), back, bye()]),
      gossip2: nd(p.gossip[1], [back, bye()]),
      joke: nd(p.joke[0], [ch('Devam et', 'punch'), back, bye()], { mood: 'neşe' }),
      punch: nd(p.joke[1], [ch('Ha ha, güzeldi!', 'root', { act: [{ k: 'rel', d: 1 }] }), bye()], { mood: 'neşe' }),
      bye: nd('Yine bekleriz, iyi günler!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
    },
  });
}

const VENDORS = {
  satici_orhan: {
    greet: 'Sıcak simit, taze çay; buyur kardeşim!',
    pitch: 'Simidim çıtır, susamım bol, gönlüm geniş.',
    gossip: ['Sabah erken kalkanın simidi bol olur.', 'Pazarın en kalabalık saati akşamüstüdür.'],
    joke: ['Simit neden yuvarlak? Köşeleri yorulmuş.', 'Simit gülmüş; susamları saçılmış.'],
    say: 'Afiyet olsun!',
  },
  satici_gulsum: {
    greet: 'Gel yavrum, çay demli, bardak sıcak.',
    pitch: 'Çayım dupduru, sohbetim bol; otur, dinlen.',
    gossip: ['Yağmurlu akşamlar pazarın en tatlı saatidir.', 'Herkes bir çaylık dertleşir burada.'],
    joke: ['Çay neden hep sıcak? Soğursa kendine küser.', 'Bardak da gülmüş; çayın içi kıpır kıpır.'],
    say: 'Çayın bol olsun!',
  },
  satici_pelin: {
    greet: 'Hoş geldin! Çiçekler seni görünce açtı.',
    pitch: 'Her çiçeğin bir dili var; dinlemesini bil.',
    gossip: ['Papatyalar sabah, lavantalar akşam kokar.', 'Bahar Hanım\'ın çatı bahçesi şehrin en güzel yeri.'],
    joke: ['Çiçek arıya demiş: Her gün gelme, utanıyorum!', 'Arı: Merak etme, ben bal için geliyorum.'],
    say: 'Çiçekli günler!',
  },
  satici_yusuf: {
    greet: 'Parçalar sıralı, fiyatlar dürüst; sor bakalım.',
    pitch: 'Bakır tel, devre kartı, pil; eksik olmasın.',
    gossip: ['Tuna\'nın atölyesinden gelen kartlar kaliteli.', 'Çıkrık\'ın servo motorları da meşhurdur.'],
    joke: ['Pil neden mutlu? Hep dolu dolu yaşıyor.', 'Kablo da demiş: Ben bağ kurmayı severim.'],
    say: 'Parçaların hayrını gör!',
  },
  satici_mehtap: {
    greet: 'Renk arıyorsan doğru yerdesin, canım.',
    pitch: 'Sekiz boya, sonsuz renk; karıştır, dene!',
    gossip: ['Duvarlar boyayı sever, boya da duvarı.', 'Piraye\'nin stüdyosu tam bir renk cümbüşü.'],
    joke: ['Boya fırçaya sormuş: Neden hep eğiliyorsun?', 'Fırça: Sanatçıya saygıdan; ucum pembeleşti.'],
    say: 'Renkli günler!',
  },
  satici_nadir: {
    greet: 'Kumaşlar yumuşak, kesimler zarif; buyur!',
    pitch: 'Deri ceket, yün, renkli kumaş; her şey burada.',
    gossip: ['Neon renkler en çok geceleri yakışır.', 'Şehirde uzun yürüyecekseniz çizme alın.'],
    joke: ['Ceket gömleğe demiş: Sen çok ince kalmışsın!', 'Gömlek: Sen de benim üstümde fazla durma.'],
    say: 'Güle güle giy!',
  },
};

/* ---------------------------------------------------------------------------------------------- kuryeler */
function courierGraph(npcId, p) {
  return graph(npcId, {
    entry: [hello('bye')],
    nodes: {
      root: nd(p.greet, [
        ch('İş var mı?', 'end', { act: [{ k: 'job', board: 'kurye' }], say: 'Başarılar, süre işliyor!' }),
        ch('Nasıl çalışıyor?', 'rules'),
        ch('Bir ipucu ver', 'tip'),
        bye('Hoşça kal', p.say),
      ], { mood: 'selam' }),
      rules: nd('Üç iş seçersin; süre bitmeden paketi teslim et.', [ch('Devam et', 'rules2'), back, bye()]),
      rules2: nd('Yaya geçidinde dur; hız değil güven kazandırır.', [back, bye()], { act: [{ k: 'hint', id: 'isler' }] }),
      tip: nd(p.tip[0], [ch('Başka ipucu?', 'tip2'), back, bye()]),
      tip2: nd(p.tip[1], [back, bye()]),
      bye: nd('Paketler seni bekler; kolay gelsin!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
    },
  });
}

/* ---------------------------------------------------------------------------------------------- hakemler */
function marshalGraph(npcId, p) {
  return graph(npcId, {
    entry: [hello('bye')],
    nodes: {
      root: nd(p.greet, [
        ch('Yarışa başlayalım', 'end', { act: [{ k: 'race', id: p.race }], say: 'Hazır ol, kapılar seni bekliyor!' }),
        ch('Madalya kuralları', 'rules'),
        ch('Bir ipucu ver', 'tip'),
        bye('Hoşça kal', p.say),
      ], { mood: 'selam' }),
      rules: nd('Altın en hızlıya, gümüş biraz sonrasına, bronz azimlilere.', [ch('Devam et', 'rules2'), back, bye()]),
      rules2: nd('Işınlanma ya da araç değiştirme yarışı iptal eder.', [back, bye()], { act: [{ k: 'hint', id: 'yarislar' }] }),
      tip: nd(p.tip[0], [ch('Başka ipucu?', 'tip2'), back, bye()]),
      tip2: nd(p.tip[1], [back, bye()]),
      bye: nd('Kapılar açık; hazır olunca gel!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
    },
  });
}

/* ---------------------------------------------------------------------------------------------- taksi, tamirci, DJ, fotoğrafçı */
const TAKSI = graph('taksi_sevgi', {
  entry: [hello('bye')],
  nodes: {
    root: nd('Taksi durağı benden sorulur, canım! Nereye?', [
      ch('Taksi görevi alayım', 'end', { act: [{ k: 'taxi' }], say: 'Yolcunu rahat taşı, bahşiş senin!' }),
      ch('Araç kiralamak istiyorum', 'rent'),
      ch('Yolcu kuralları', 'rules'),
      bye('Hoşça kal', 'Yolun açık olsun, canım!'),
    ], { mood: 'selam' }),
    rent: nd('Kiralık araçlar meydandaki park yerinde; F ile bin.', [back, bye()], { act: [{ k: 'hint', id: 'garaj' }] }),
    rules: nd('Yolcunu rahat taşı; ani fren bahşişi kırar.', [ch('Devam et', 'rules2'), back, bye()]),
    rules2: nd('Yağmurda yavaş sür; yolcu da sen de rahat edersin.', [back, bye()], { act: [{ k: 'hint', id: 'taksi' }] }),
    bye: nd('Taksi hep hazır; ne zaman istersen gel!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

const TAMIRCI = graph('tamirci_yilmaz', {
  entry: [hello('bye')],
  nodes: {
    root: nd('Aman dikkat, bu motor huysuz ama iyi niyetli!', [
      ch('Garaj terminalini aç', 'end', { act: [{ k: 'garage' }], say: 'Boyayı sen seç, gerisi bende!' }),
      ch('Görev var mı?', 'offer', { c: { quest: ['nm_garaj_boya', 'none'] } }),
      ch('Görevim nasıl gidiyor?', 'status', { c: { quest: ['nm_garaj_boya', 'active'] } }),
      ch('Bir şaka yap', 'joke'),
      bye('Hoşça kal', 'Cıvatalar sıkı kalsın!'),
    ], { mood: 'selam' }),
    offer: nd('Aracına yeni bir boya at; garajda rengini seç.', [
      ch('Boyayı seçelim', 'accepted', { act: [{ k: 'mission', id: 'nm_garaj_boya' }] }),
      ch('Sonra bakarım', 'root'),
      bye(),
    ], { mood: 'hevesli' }),
    accepted: nd('Garaj terminalinde renk, ışık, jant; hepsi senin.', [back, bye()], { mood: 'dost' }),
    status: nd('Terminalde rengi seç; araç boyanınca iş tamam.', [back, bye()]),
    joke: nd('Motor dedi ki: Yağ ver, şarkı söyleyeyim!', [ch('Devam et', 'punch'), back, bye()], { mood: 'neşe' }),
    punch: nd('Yağı verdim, bu sefer de horluyor.', [ch('Ha ha, güzeldi!', 'root'), bye()], { mood: 'neşe' }),
    bye: nd('Cıvatalar sıkı, yağlar yerinde; yolun açık!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

const DJ = graph('dj_piksel', {
  entry: [hello('bye')],
  nodes: {
    root: nd('Hey! Sesi aç, şehri dinle, ritmi hisset.', [
      ch('Müzik ipuçları', 'music'),
      ch('Ritim dersi ver', 'beat'),
      ch('Bir şaka yap', 'joke'),
      bye('Hoşça kal', 'Ritim seninle olsun!'),
    ], { mood: 'selam' }),
    music: nd('Araçta R tuşu radyoyu açar; beş istasyon var.', [ch('Devam et', 'music2'), back, bye()]),
    music2: nd('Sessiz istasyon da var; bazen sessizlik en iyisidir.', [back, bye()], { act: [{ k: 'hint', id: 'radyo' }] }),
    beat: nd('Adımlarını ritme uydur; yürüyüş de bir müziktir.', [ch('Devam et', 'beat2'), back, bye()]),
    beat2: nd('Bir, iki, üç, dört; şimdi gülümse ve devam et!', [back, bye()]),
    joke: nd('Davul gitara demiş: Ritim bende, sen sadece eşlik et.', [ch('Devam et', 'punch'), back, bye()], { mood: 'neşe' }),
    punch: nd('Gitar: Olur, ama solo bende.', [ch('Ha ha, güzeldi!', 'root'), bye()], { mood: 'neşe' }),
    bye: nd('Sesi aç, gülümse, yürü; görüşürüz!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

const FOTOGRAFCI = graph('fotografci_irmak', {
  entry: [hello('bye')],
  nodes: {
    root: nd('Işık güzel mi? Bir kare her şeyi anlatır.', [
      ch('Fotoğraf modunu aç', 'end', { act: [{ k: 'photo', id: 'foto_ilk' }], say: 'Güzel bir kare yakala!' }),
      ch('Kadraj ipuçları', 'tip'),
      ch('Neden fotoğraf çekiyorsun?', 'why'),
      bye('Hoşça kal', 'Işığın hep güzel olsun!'),
    ], { mood: 'selam' }),
    tip: nd('Önce ışığa bak, sonra konuya; gölgeyi arkana al.', [ch('Başka ipucu?', 'tip2'), back, bye()]),
    tip2: nd('Filtreler neon geceyi, sepya eski bir anıyı gösterir.', [back, bye()], { act: [{ k: 'hint', id: 'foto' }] }),
    why: nd('Anlar geçer, kareler kalır; şehir de hep değişir.', [ch('Devam et', 'why2'), back, bye()]),
    why2: nd('Bazen en güzel kare kimsenin bakmadığı köşede olur.', [back, bye()]),
    bye: nd('Kamerayı unutma; her yer bir kare!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

export const STREET_B_GRAPHS = Object.freeze(
  Object.keys(VENDORS).map((id) => vendorGraph(id, VENDORS[id])).concat([
    courierGraph('kurye_ela', {
      greet: 'Selam! Paketler zamanlı, ben de zamanlıyım.',
      tip: ['Kısa yolu seç ama yaya geçidinde yavaşla.', 'Süreyi tam kullanırsan ödül tam gelir.'],
      say: 'Hızlı ve güvenli teslimatlar!',
    }),
    courierGraph('kurye_emir', {
      greet: 'Merhaba. Sıram düzenli, işim dakik.',
      tip: ['Rotayı önceden gözünde canlandır; zaman kazandırır.', 'Kamyonet birden çok paket taşır; yola göre seç.'],
      say: 'Kolay gelsin, süre senin dostun!',
    }),
    marshalGraph('hakem_kaan', {
      greet: 'Çevreyolu turu hazır; kapılar sıralı, kural net.',
      race: 0,
      tip: ['İlk turda hattı öğren; sonrasında hızlan.', 'Kapı yarıçapı geniş; tam ortadan geçmek şart değil.'],
      say: 'Adil yarışlar, dostum!',
    }),
    marshalGraph('hakem_derya', {
      greet: 'Sprint kısa ama yoğun; nefes almadan geçilir!',
      race: 6,
      tip: ['Sprintte nitroyu başta kullan; sona sakla.', 'Başlama çizgisinde hazır ol; geri sayım kısa.'],
      say: 'Hızlı ama güvenli, tamam mı?',
    }),
    TAKSI, TAMIRCI, DJ, FOTOGRAFCI,
  ]),
);
