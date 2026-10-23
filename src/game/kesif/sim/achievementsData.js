/*
 * KEŞİF sim — başarım tanımları (saf veri). Her başarım bir ölçüt (progressionMetrics.SCALAR_METRICS) ve hedefe bağlıdır.
 * icon: arayüzün simge eşlemesi için anahtar. unit: ilerleme metnindeki birim. hidden: açılana dek gizli.
 */
import { TREE_ACHIEVEMENTS } from './treeData.js';

export const ACHIEVEMENT_ICONS = Object.freeze([
  'kilic', 'kazma', 'blok', 'ayak', 'harita', 'bulmaca', 'kristal', 'muhur', 'boss', 'tac', 'bot', 'kanca', 'planor',
  'portal', 'yildiz', 'ates', 'elma', 'yatak', 'sandik', 'kalp', 'kitap', 'ay', 'zaman', 'pusula', 'cekic',
]);

const list = [];
const ids = new Set();

function A(id, title, desc, icon, metric, target, o) {
  if (ids.has(id)) throw new Error('Başarım kimliği çakışması: ' + id);
  ids.add(id);
  const x = o || {};
  list.push(Object.freeze({
    id, title, desc, icon, metric, target, unit: x.unit || '', hidden: !!x.hidden, xp: x.xp === undefined ? target > 0 ? 20 : 0 : x.xp,
  }));
}

/* Savaş */
A('ilk_av', 'İlk Av', 'İlk yaratığı yen.', 'kilic', 'mobsKilled', 1, { xp: 10 });
A('avci_25', 'Avcı', 'Yirmi beş yaratık yen.', 'kilic', 'mobsKilled', 25, { xp: 30 });
A('avci_100', 'Usta Avcı', 'Yüz yaratık yen.', 'kilic', 'mobsKilled', 100, { xp: 60 });
A('avci_500', 'Efsanevi Avcı', 'Beş yüz yaratık yen.', 'kilic', 'mobsKilled', 500, { xp: 150 });
A('tur_cesit', 'Av Koleksiyonu', 'Sekiz farklı yaratık türünü yen.', 'kilic', 'distinctMobKinds', 8, { xp: 50 });
/* Kazı ve inşa */
A('kazici_100', 'Kazıcı', 'Yüz blok kır.', 'kazma', 'blocksBroken', 100, { xp: 15 });
A('madenci_1000', 'Madenci', 'Bin blok kır.', 'kazma', 'blocksBroken', 1000, { xp: 50 });
A('yer_efendisi', 'Yerin Efendisi', 'On bin blok kır.', 'kazma', 'blocksBroken', 10000, { xp: 200 });
A('yapici_50', 'Yapıcı', 'Elli blok yerleştir.', 'blok', 'blocksPlaced', 50, { xp: 15 });
A('mimar_500', 'Mimar', 'Beş yüz blok yerleştir.', 'blok', 'blocksPlaced', 500, { xp: 50 });
A('mimarbasi', 'Mimarbaşı', 'Beş bin blok yerleştir.', 'blok', 'blocksPlaced', 5000, { xp: 200 });
A('renk_cumbusu', 'Renk Cümbüşü', 'Yirmi farklı blok türü yerleştir.', 'blok', 'distinctBlocksPlaced', 20, { xp: 40 });
/* Keşif */
A('yuruyus_1k', 'Yürüyüşçü', 'Bin blok yürü.', 'ayak', 'distance', 1000, { unit: 'blok', xp: 20 });
A('yuruyus_10k', 'Gezgin', 'On bin blok yürü.', 'ayak', 'distance', 10000, { unit: 'blok', xp: 80 });
A('yuruyus_50k', 'Dünya Yürüyüşçüsü', 'Elli bin blok yürü.', 'ayak', 'distance', 50000, { unit: 'blok', xp: 200 });
A('biyom_5', 'Doğa Gezgini', 'Beş biyom keşfet.', 'harita', 'biomesDiscovered', 5, { xp: 40 });
A('biyom_9', 'Biyom Bilgesi', 'Dokuz farklı biyom keşfet.', 'harita', 'biomesDiscovered', 9, { xp: 120 });
A('biyom_15', 'Doğa Âşığı', 'On beş farklı biyom keşfet.', 'harita', 'biomesDiscovered', 15, { xp: 160 });
A('biyom_hepsi', 'Dünya Gezgini', 'Yirmi iki biyomun hepsini keşfet.', 'harita', 'biomesDiscovered', 22, { xp: 300 });
A('harita_10', 'Harita Çizici', 'Dünyanın yüzde 10\'unu keşfet.', 'harita', 'exploredPct', 10, { unit: '%', xp: 50 });
A('harita_50', 'Kâşif', 'Dünyanın yarısını keşfet.', 'harita', 'exploredPct', 50, { unit: '%', xp: 200 });
A('yapi_5', 'Meraklı', 'Beş yapı keşfet.', 'pusula', 'structuresDiscovered', 5, { xp: 30 });
A('yapi_25', 'Arkeolog', 'Yirmi beş yapı keşfet.', 'pusula', 'structuresDiscovered', 25, { xp: 100 });
A('bolge_gez', 'Dünyanın Kalbi', 'Beş bölgenin hepsine ayak bas.', 'pusula', 'zonesVisited', 5, { xp: 150 });
/* Bulmaca ve mühür */
A('bulmaca_1', 'Düşünür', 'İlk bulmacayı çöz.', 'bulmaca', 'puzzlesSolved', 1, { xp: 15 });
A('bulmaca_10', 'Bilmece Çözücü', 'On bulmaca çöz.', 'bulmaca', 'puzzlesSolved', 10, { xp: 50 });
A('bulmaca_30', 'Bulmaca Ustası', 'Otuz bulmaca çöz.', 'bulmaca', 'puzzlesSolved', 30, { xp: 120 });
A('bulmaca_60', 'Zihin Mimarı', 'Altmış bulmaca çöz.', 'bulmaca', 'puzzlesSolved', 60, { xp: 250 });
A('kristal_3', 'Kristal Avcısı', 'Üç Anahtar Kristali topla.', 'kristal', 'crystalsCollected', 3, { xp: 40 });
A('kristal_hepsi', 'Tüm Kristaller', 'On dört Anahtar Kristalinin hepsini topla.', 'kristal', 'templesDone', 14, { xp: 250 });
A('muhur_1', 'Mührü Kıran', 'İlk mührü aç.', 'muhur', 'sealsComplete', 1, { xp: 40 });
A('muhur_5', 'Beş Mühür', 'Tüm mühürleri aç.', 'muhur', 'sealsComplete', 5, { xp: 250 });
/* Boss ve ilerleme */
A('boss_1', 'Dev Avcısı', 'İlk boss\'u yen.', 'boss', 'bossesDefeated', 1, { xp: 100 });
A('boss_4', 'Boss Avcısı', 'Dört boss\'un hepsini yen.', 'boss', 'bossesDefeated', 4, { xp: 300 });
A('fetih', 'Dünya Fethedildi', 'Gölge Hükümdar\'ı yen.', 'tac', 'conquered', 1, { xp: 500 });
A('yetenek_1', 'Yeni Güç', 'İlk yeteneği kazan.', 'bot', 'abilityCount', 1, { xp: 40 });
A('yetenek_4', 'Tam Donanım', 'Dört yeteneğin hepsini kazan.', 'portal', 'abilityCount', 4, { xp: 250 });
A('bolge_3', 'Sınır Aşan', 'Üç bölgenin kilidini aç.', 'muhur', 'zonesUnlocked', 3, { xp: 60 });
/* Üretim */
A('ilk_uretim', 'İlk Üretim', 'İlk eşyanı üret.', 'cekic', 'itemsCrafted', 1, { xp: 5 });
A('uretici_10', 'Çırak', 'On eşya üret.', 'cekic', 'itemsCrafted', 10, { xp: 15 });
A('uretici_100', 'Zanaatkâr', 'Yüz eşya üret.', 'cekic', 'itemsCrafted', 100, { xp: 50 });
A('uretici_500', 'Usta Zanaatkâr', 'Beş yüz eşya üret.', 'cekic', 'itemsCrafted', 500, { xp: 150 });
A('tarif_25', 'Tarif Defteri', 'Yirmi beş farklı eşya üret.', 'kitap', 'distinctCrafted', 25, { xp: 80 });
A('tam_takim', 'Tam Takım', 'Kazma, balta, kürek ve kılıç türlerinin her birinden üret.', 'kazma', 'toolTypesCrafted', 4, { xp: 40 });
A('zirhli', 'Zırhlı', 'Dört parça zırh üret.', 'kilic', 'armorCrafted', 4, { xp: 40 });
A('atolye', 'Atölye Kurucusu', 'Tezgah, ocak, taş kesici ve dokuma tezgahını üret.', 'cekic', 'stationsCrafted', 4, { xp: 60 });
A('depocu', 'Depocu', 'Sandıklara on kez eşya koy.', 'sandik', 'chestStores', 10, { xp: 25 });
A('tarif_50', 'Usta Tarif Defteri', 'Elli farklı eşya üret.', 'kitap', 'distinctCrafted', 50, { xp: 120 });
A('ilk_eritme', 'İlk Eritme', 'İlk eritme ya da pişirmeyi yap.', 'ates', 'smelted', 1, { xp: 10 });
A('ocak_20', 'Ocak Ustası', 'Yirmi kez eritme ya da pişirme yap.', 'ates', 'smelted', 20, { xp: 50 });
A('gurme', 'Gurme', 'Yirmi kez yemek ye.', 'elma', 'foodEaten', 20, { xp: 30 });
/* Parkur */
A('parkur_1', 'Atik', 'İlk parkuru bitir.', 'yildiz', 'parkourTiers', 1, { xp: 40 });
A('parkur_3', 'Çevik', 'Üç farklı kademede parkur bitir.', 'yildiz', 'parkourTiers', 3, { xp: 100 });
A('parkur_5', 'Parkur Efsanesi', 'Beş kademenin hepsinde parkur bitir.', 'yildiz', 'parkourTiers', 5, { xp: 300 });
A('hiz_seytani', 'Hız Şeytanı', 'Bir parkuru 90 saniyenin altında bitir.', 'zaman', 'fastParkour', 1, { xp: 100 });
/* Zaman ve yaşam */
A('zaman_30', 'Yeni Başlayan', 'Yarım saat oyna.', 'zaman', 'playTimeMin', 30, { unit: 'dk', xp: 20 });
A('zaman_300', 'Maceraperest', 'Beş saat oyna.', 'zaman', 'playTimeMin', 300, { unit: 'dk', xp: 150 });
A('gece_3', 'Gece Nöbeti', 'Üç geceyi atlat.', 'ay', 'nights', 3, { xp: 30 });
A('gece_20', 'Gece Kuşu', 'Yirmi geceyi atlat.', 'ay', 'nights', 20, { xp: 100 });
A('uykucu', 'Uykucu', 'Yatağı beş kez kullan.', 'yatak', 'bedUses', 5, { xp: 20 });
A('sandik_10', 'Hazine Avcısı', 'On sandık aç.', 'sandik', 'chestsOpened', 10, { xp: 50 });
A('ilk_dusus', 'Olsun, Düzelir', 'İlk kez yenil.', 'kalp', 'deaths', 1, { xp: 5, hidden: true });
A('dirilen', 'Dirilen', 'On kez yenil ve yine de devam et.', 'kalp', 'deaths', 10, { xp: 30, hidden: true });
/* Genel */
A('seviye_10', 'Deneyimli', 'On. seviyeye ulaş.', 'yildiz', 'xpLevel', 10, { xp: 0 });
A('gorev_10', 'Rehber Takipçisi', 'On görev tamamla.', 'kitap', 'questsDone', 10, { xp: 40 });
A('gorev_40', 'Yolun Ustası', 'Kırk görev tamamla.', 'kitap', 'questsDone', 40, { xp: 150 });
A('koleksiyoncu', 'Koleksiyoncu', 'Yirmi beş başarım aç.', 'tac', 'achievementsDone', 25, { xp: 0 });
/* Büyü ve simya */
A('buyucu_cirak', 'Büyücü Çırağı', 'İlk büyüyü yap.', 'kitap', 'enchants', 1, { xp: 20 });
A('buyucu_10', 'Büyü Ustası', 'On büyü yap.', 'kitap', 'enchants', 10, { xp: 80 });
A('buyucu_50', 'Büyü Üstadı', 'Elli büyü yap.', 'yildiz', 'enchants', 50, { xp: 200 });
A('asa_ilk', 'İlk Kıvılcım', 'İlk büyü atışını yap.', 'ates', 'spellsCast', 1, { xp: 20 });
A('asa_50', 'Asa Ustası', 'Elli büyü at.', 'ates', 'spellsCast', 50, { xp: 80 });
A('asa_500', 'Büyük Büyücü', 'Beş yüz büyü at.', 'portal', 'spellsCast', 500, { xp: 200 });
A('simyaci', 'Simyacı', 'İlk iksirini demle.', 'kalp', 'potionsBrewed', 1, { xp: 20 });
A('simyaci_20', 'Usta Simyacı', 'Yirmi şişe iksir demle.', 'kalp', 'potionsBrewed', 20, { xp: 80 });
A('iksir_10', 'İksir Tutkunu', 'On iksir iç.', 'elma', 'potionsDrunk', 10, { xp: 40 });
A('mana_ustasi', 'Mana Ustası', 'Azami mananı en yükseğe çıkar (on Mana Kristali).', 'kristal', 'manaCrystals', 10, { xp: 150 });

/* Ağaç devirme (treeData.js) */
TREE_ACHIEVEMENTS.forEach((a) => A(a.id, a.title, a.desc, a.icon, a.metric, a.target, { xp: a.xp }));

/* Teknoloji */
A('tk_elektrikci', 'Elektrikçi', 'İlk teknoloji makinesini yerleştir.', 'cekic', 'techPlaced', 1, { xp: 20 });
A('tk_santral', 'Küçük Santral', 'On teknoloji bloğu yerleştir.', 'cekic', 'techPlaced', 10, { xp: 60 });
A('tk_muhendis', 'Mühendis', 'Sekiz farklı teknoloji bloğu yerleştir.', 'kazma', 'distinctTechPlaced', 8, { xp: 120 });
A('tk_teknolog', 'Teknoloji Ustası', 'Yirmi farklı teknoloji eşyası üret.', 'kitap', 'distinctTechCrafted', 20, { xp: 200 });
A('tk_derin_100', 'Derin Kazı', 'Madencilerle yüz blok kaz.', 'kazma', 'drillBlocks', 100, { xp: 50 });
A('tk_derin_1000', 'Yer Kabuğu', 'Madencilerle bin blok kaz.', 'kazma', 'drillBlocks', 1000, { xp: 150 });
A('tk_ucus_60', 'Gökyüzü Yolcusu', 'Jetpack ile toplam bir dakika uç.', 'bot', 'jetpackSeconds', 60, { unit: 'sn', xp: 60 });
A('tk_radar', 'Radar', 'Tarayıcıyla yirmi beş tarama yap.', 'pusula', 'scans', 25, { xp: 60 });
A('tk_isinlan_10', 'Dalga Boyu', 'Işınlanma platformlarıyla on kez ışınlan.', 'kristal', 'teleports', 10, { xp: 70 });
A('tk_portal_ilk', 'Portal Düşü', 'İlk portalını aç.', 'portal', 'portalsPlaced', 1, { xp: 30 });
A('tk_portal_25', 'Düşünen Portal', 'Portallardan yirmi beş kez geç.', 'portal', 'portalsUsed', 25, { xp: 120 });

export const ACHIEVEMENTS = Object.freeze(list);
export const ACHIEVEMENT_BY_ID = Object.freeze(list.reduce((m, a) => { m[a.id] = a; return m; }, {}));
