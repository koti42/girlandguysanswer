/*
 * KEŞİF sim/city/ped — SOKAK NPC DİYALOGLARI C: 2 dost robot, bank sakini, 2 çocuk (npc_vendors). Aile dostu; çocuklar bilmece sorar (doğru cevap +5 Kredi, bir kez).
 */
import {
  bye, ch, graph, nd,
} from './dialogueKit.js';

const back = ch('Geri dön', 'root');
const hello = (id) => [{ hint: 'veda' }, id];

const PILI = graph('robot_pili', {
  entry: [hello('bye')],
  nodes: {
    root: nd('Bip! Ben Pili; sokakları ışıl ışıl yaparım.', [
      ch('Ne temizliyorsun?', 'work'),
      ch('Bir şaka yap', 'joke'),
      ch('Yağmurda ne yapıyorsun?', 'rain'),
      bye('Hoşça kal', 'Bip bip, güle güle!'),
    ], { mood: 'selam' }),
    work: nd('Tozları toplarım, neon tabelaların camını silerim.', [ch('Devam et', 'work2'), back, bye()]),
    work2: nd('Şehir parlayınca herkes gülümsüyor; benim ödülüm bu.', [back, bye()]),
    rain: nd('Yağmurda şemsiyemi açarım; su birikintilerini severim!', [ch('Devam et', 'rain2'), back, bye()]),
    rain2: nd('Neon ışıkları suya yansıyınca yeni bir şehir doğar.', [back, bye()], { act: [{ k: 'hint', id: 'yagmur' }] }),
    joke: nd('Süpürge robot dedi ki: Hayat toz toprak, ben temizim.', [ch('Devam et', 'punch'), back, bye()], { mood: 'neşe' }),
    punch: nd('Toz da: Ben her zaman geri gelirim. Bip!', [ch('Ha ha, güzeldi!', 'root', { act: [{ k: 'rel', d: 1 }] }), bye()], { mood: 'neşe' }),
    bye: nd('Bip bop! Yine gel, sokaklar temiz kalsın.', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

const BIP = graph('robot_bip', {
  entry: [hello('bye')],
  nodes: {
    root: nd('Bip bop! Ben Bip, bir merak makinesiyim!', [
      ch('Sana ne öğreteyim?', 'learn'),
      ch('Görev var mı?', 'offer', { c: { quest: ['nm_robot_10', 'none'] } }),
      ch('Görevim nasıl gidiyor?', 'status', { c: { quest: ['nm_robot_10', 'active'] } }),
      ch('Bir şaka yap', 'joke'),
      bye('Hoşça kal', 'Bip bop, görüşürüz!'),
    ], { mood: 'selam' }),
    learn: nd('Bana bir şey anlat; ben de öğrenip hatırlarım!', [ch('Devam et', 'learn2'), back, bye()]),
    learn2: nd('Şehir dostça; sen de herkese gülümse, olur mu?', [back, bye()]),
    offer: nd('Kanalizasyondaki arızalı robotlar hata veriyor; durdur mu?', [
      ch('Yardım ederim', 'accepted', { act: [{ k: 'mission', id: 'nm_robot_10' }] }),
      ch('Sonra bakarım', 'root'),
      bye(),
    ], { mood: 'hevesli' }),
    accepted: nd('Teşekkürler! Onlar dağılınca parçalar bana kalsın.', [back, bye()], { mood: 'dost' }),
    status: nd('Arızalı robotlar hâlâ hata veriyor; dikkatli ol.', [back, bye()]),
    joke: nd('Robot kediye demiş: Mırıldanmayı öğret bana!', [ch('Devam et', 'punch'), back, bye()], { mood: 'neşe' }),
    punch: nd('Kedi: Önce gıdıkla. Robot: Bip! Mırr!', [ch('Ha ha, güzeldi!', 'root'), bye()], { mood: 'neşe' }),
    bye: nd('Bip bop! Merakla kal, dostum.', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

const RIZA = graph('buyukbaba_riza', {
  entry: [hello('bye')],
  nodes: {
    root: nd('Otur evladım, bankta yer var; şehri izleriz.', [
      ch('Eski günleri anlat', 'story'),
      ch('Bir atasözü söyle', 'proverb'),
      ch('Bir şaka yap', 'joke'),
      bye('Hoşça kal', 'Sağlıkla kal, evladım.'),
    ], { mood: 'selam' }),
    story: nd('Bu meydan eskiden otoparkmış; şimdi herkesin bahçesi.', [ch('Devam et', 'story2'), back, bye()]),
    story2: nd('Terminaller kurulunca çocuklar saatlerce izlemiş.', [ch('Devam et', 'story3'), back, bye()]),
    story3: nd('Şehir büyür, ışıklar çoğalır; insan hep aynı kalır.', [back, bye()]),
    proverb: nd('Damlaya damlaya göl olur, evladım.', [ch('Başka?', 'proverb2'), back, bye()]),
    proverb2: nd('Sakin giden yolu bitirir, telaşlı yolu şaşırır.', [back, bye()]),
    joke: nd('Bankta oturan dede: Ben ne zaman büyüyeceğim? Hiç.', [ch('Devam et', 'punch'), back, bye()], { mood: 'neşe' }),
    punch: nd('Çünkü gençlik zaten bende; yaş sadece sayı!', [ch('Ha ha, güzeldi!', 'root', { act: [{ k: 'rel', d: 1 }] }), bye()], { mood: 'neşe' }),
    bye: nd('Sağlıkla, evladım; bank hep burada duruyor.', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
  },
});

/** Çocuk şablonu: saklambaç + bilmece (doğru cevap bir kez +5 Kredi). p: {greet, hide[2], riddle, options[3], correct (0..2), flag, say} */
function kidGraph(npcId, p) {
  const opt = (i) => ch(p.options[i], i === p.correct ? 'right' : 'wrong');
  return graph(npcId, {
    entry: [hello('bye')],
    nodes: {
      root: nd(p.greet, [
        ch('Saklambaç oynayalım', 'hide'),
        ch('Bir bilmece sor', 'riddle'),
        bye('Hoşça kal', p.say),
      ], { mood: 'selam' }),
      hide: nd(p.hide[0], [ch('Devam et', 'hide2'), back, bye()], { mood: 'neşe' }),
      hide2: nd(p.hide[1], [back, bye()], { mood: 'neşe' }),
      riddle: nd(p.riddle, [opt(0), opt(1), opt(2), bye()], { mood: 'merak' }),
      right: nd('Bildin! Sen çok zekisin, alkışlıyorum!', [back, bye()], {
        act: [{ k: 'kredi', n: 5 }, { k: 'flag', key: p.flag, v: true }, { k: 'rel', d: 1 }], once: true, mood: 'neşe',
      }),
      wrong: nd('Yaklaştın ama olmadı. Bir daha dene!', [ch('Tekrar dene', 'riddle'), back, bye()], { mood: 'merak' }),
      bye: nd('Yine oynayalım, söz mü? Güle güle!', [ch('Biraz daha konuşalım', 'root'), bye()], { mood: 'veda' }),
    },
  });
}

export const STREET_C_GRAPHS = Object.freeze([
  PILI, BIP, RIZA,
  kidGraph('cocuk_alp', {
    greet: 'Selam! Ben Alp, şehri keşfediyorum!',
    hide: ['Tamam, ben saklanıyorum! Sen yüze kadar say.', 'Bir, iki, üç... Bul beni, çok iyi saklandım!'],
    riddle: 'Ayağı yok yürür, ağzı yok konuşur. Bu nedir?',
    options: ['Saat', 'Yağmur', 'Radyo'],
    correct: 0,
    flag: 'k_alp',
    say: 'Güle güle, yine gel!',
  }),
  kidGraph('cocuk_elif', {
    greet: 'Merhaba! Ben Elif, bilmeceleri çok severim.',
    hide: ['Gözlerini kapat, ben şu direğin arkasına geçeyim!', 'Hazır mısın? Ben buradayım, gel gel gel!'],
    riddle: 'Ne kadar çoksa o kadar az görürsün. Nedir bu?',
    options: ['Neon', 'Karanlık', 'Gölge'],
    correct: 1,
    flag: 'k_elif',
    say: 'Güle güle, bol bilmece!',
  }),
]);
