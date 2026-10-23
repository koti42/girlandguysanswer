/*
 * KEŞİF sim/city/mission — NEON MERİDYEN BAŞARIMLARI (52). SAF, es2020. İlk 24 başarımın kimlik/ad/açıklaması cityNames.ACHIEVEMENT_NAMES'ten gelir
 * (ad değişikliği tek yerde), ölçüt/hedef burada; 28 ek başarım (gizli olanlar dahil) bu dosyadadır. Başarımlar şehir-yereldir (`city.ach`), jeton VERMEZ
 * (jeton yalnız cityEvents.NEON_CLAIMS); küçük Kredi verir.
 *
 *   ACHIEVEMENTS                      donuk liste {id, name, desc, metric, target, hidden, kredi, unit}
 *   ACHIEVEMENT_BY_ID
 *   metricValue(view, def) → sayı     view = cityState.metricsOf(city)
 *   evaluateAchievements(view, unlocked:Set|obj) → [yeni açılan tanımlar]       (zincir: nm_neon_usta diğer hepsi açılınca)
 *   achievementRows(view, unlockedList) → [{id,name,desc,done,hidden,progress,target,text}]     gizli+kilitli → '???'
 */
import { ACHIEVEMENT_NAMES } from '../cityNames.js';

const SPEC = {
  nm_ilk_gecis: ['dimHops', 1],
  nm_tum_terminaller: ['terminalsFound', 16],
  nm_gece_yuruyusu: ['nightFootM', 1000, 'm'],
  nm_yagmur_dansi: ['rainSeconds', 120, 'sn'],
  nm_kurye_10: ['jobsDone', 10],
  nm_kurye_50: ['jobsDone', 50],
  nm_yaris_altin: ['goldMedals', 1],
  nm_tum_yarislar: ['raceKinds', 8],
  nm_cip_60: ['chipsFound', 60],
  nm_cip_240: ['chipsFound', 240],
  nm_graffiti_30: ['graffitiDone', 30],
  nm_graffiti_90: ['graffitiDone', 90],
  nm_oda_10: ['roomsFound', 10],
  nm_oda_30: ['roomsFound', 30],
  nm_kilit_10: ['locksOpened', 10],
  nm_cati_8: ['roofKinds', 8],
  nm_km_100: ['cityKm', 100, 'km'],
  nm_foto_20: ['photosTaken', 20],
  nm_robot_50: ['robotsDissolved', 50],
  nm_garaj_6: ['garageCount', 6],
  nm_tum_sahipler: ['ownersMet', 16],
  nm_metro_gezgin: ['metroKinds', 5],
  nm_kasa: ['vault', 1],
  nm_neon_usta: ['achOthers', 1],
};
const HIDDEN_BASE = Object.freeze({ nm_kasa: 1, nm_neon_usta: 1 });
const KREDI_BASE = Object.freeze({ nm_neon_usta: 200, nm_cip_240: 150, nm_graffiti_90: 120, nm_oda_30: 120 });

const list = [];
const ids = new Set();

function A(id, name, desc, metric, target, o) {
  if (ids.has(id)) throw new Error('Başarım kimliği çakışması: ' + id);
  ids.add(id);
  const x = o || {};
  list.push(Object.freeze({
    id, name, desc, metric, target, hidden: !!x.hidden, kredi: x.kredi === undefined ? 20 : x.kredi, unit: x.unit || '',
  }));
}

ACHIEVEMENT_NAMES.forEach((a) => {
  const s = SPEC[a.id];
  if (!s) throw new Error('Başarım ölçütü yok: ' + a.id);
  A(a.id, a.name, a.desc, s[0], s[1], { unit: s[2] || '', hidden: !!HIDDEN_BASE[a.id], kredi: KREDI_BASE[a.id] === undefined ? 20 : KREDI_BASE[a.id] });
});

/* Ek başarımlar */
A('nm_ilk_cip', 'İlk Kıvılcım', 'İlk veri çipini bul.', 'chipsFound', 1, { kredi: 10 });
A('nm_cip_120', 'Yarım Arşiv', '120 veri çipi bul.', 'chipsFound', 120, { kredi: 60 });
A('nm_ilk_grafiti', 'İlk Fırça', 'İlk grafitini yap.', 'graffitiDone', 1, { kredi: 10 });
A('nm_oda_1', 'Gizli Kapı', 'İlk gizli odayı bul.', 'roomsFound', 1, { kredi: 25 });
A('nm_kurye_1', 'İlk Paket', 'İlk teslimatını tamamla.', 'jobsDone', 1, { kredi: 10 });
A('nm_taksi_1', 'İlk Yolcu', 'İlk yolcunu taşı.', 'taxiDone', 1, { kredi: 10 });
A('nm_taksi_25', 'Şehrin Şoförü', '25 yolcu taşı.', 'taxiDone', 25, { kredi: 60 });
A('nm_pod_3', 'Kapsül Ustası', '3 kapsül teslimatı yap.', 'podDone', 3, { kredi: 30 });
A('nm_tamir_3', 'Yardım Eli', '3 tamir parçasını yerine ulaştır.', 'fixDone', 3, { kredi: 30 });
A('nm_yaris_ilk', 'İlk Tur', 'Bir yarışı bitir.', 'racesDone', 1, { kredi: 15 });
A('nm_yaris_10', 'Pist Müdavimi', '10 yarış bitir.', 'racesDone', 10, { kredi: 50 });
A('nm_altin_3', 'Üç Altın', '3 altın madalya kazan.', 'goldMedals', 3, { kredi: 50 });
A('nm_altin_8', 'Altın Koleksiyonu', 'Sekiz yarışın hepsinde altın madalya al.', 'goldKinds', 8, { kredi: 150, hidden: true });
A('nm_cati_1', 'Çatı Gezgini', 'İlk çatı parkurunu bitir.', 'roofDone', 1, { kredi: 30 });
A('nm_bolge_6', 'Altı Mahalle', 'Altı bölgenin hepsine uğra.', 'districtKinds', 6, { kredi: 30 });
A('nm_gece_surus', 'Gece Sürücüsü', 'Geceleyin 5 km sür.', 'nightDriveM', 5000, { unit: 'm', kredi: 40 });
A('nm_km_10', 'İlk On Kilometre', 'Şehirde 10 km yol yap.', 'cityKm', 10, { unit: 'km', kredi: 20 });
A('nm_foto_1', 'İlk Kare', 'İlk fotoğrafını çek.', 'photosTaken', 1, { kredi: 10 });
A('nm_robot_1', 'Parlak Başlangıç', 'İlk hatalı robotu dağıt.', 'robotsDissolved', 1, { kredi: 10 });
A('nm_saat_1', 'Bir Saatlik Gezi', 'Şehirde 1 saat geçir.', 'citySeconds', 3600, { unit: 'sn', kredi: 25 });
A('nm_saat_5', 'Şehir Sakini', 'Şehirde 5 saat geçir.', 'citySeconds', 18000, { unit: 'sn', kredi: 100, hidden: true });
A('nm_kredi_1000', 'Küçük Servet', 'Toplam 1000 Kredi kazan.', 'krediEarned', 1000, { kredi: 50 });
A('nm_set_3', 'Koleksiyoncu', '3 koleksiyonu tamamla.', 'setsDone', 3, { kredi: 60 });
A('nm_diyar_isigi', 'Diyar Işığı', 'Kasadaki küçük ışığı bul.', 'easter', 1, { kredi: 100, hidden: true });
A('nm_hizli_teslim', 'Şimşek Teslimat', 'Bir paketi süresinin çok altında teslim et.', 'fastJobs', 1, { kredi: 30 });
A('nm_surukleme', 'Kayan Yıldız', '10 kez sürüklenme bonusu kazan.', 'driftBoosts', 10, { kredi: 30 });
A('nm_kiralik', 'Kiralık Dostu', '3 kez araç kirala.', 'vehiclesRented', 3, { kredi: 20 });
A('nm_sahip_5', 'Mahalle Tanıdığı', '5 dükkân sahibiyle tanış.', 'ownersMet', 5, { kredi: 20 });

export const ACHIEVEMENTS = Object.freeze(list);
export const ACHIEVEMENT_BY_ID = Object.freeze(list.reduce((m, a) => { m[a.id] = a; return m; }, Object.create(null)));

export function metricValue(view, def) {
  if (!view || !def) return 0;
  const v = view[def.metric];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

function has(unlocked, id) {
  if (!unlocked) return false;
  if (typeof unlocked.has === 'function') return unlocked.has(id);
  return unlocked[id] === 1 || unlocked[id] === true;
}

/** Açılan yeni başarımlar (zincir: nm_neon_usta diğer 51'in hepsi açılınca). `unlocked`: Set ya da {id:1}. Dönen tanımlar `unlocked`'a EKLENMEZ. */
export function evaluateAchievements(view, unlocked) {
  const fresh = [];
  const doneNow = new Set();
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const a = ACHIEVEMENTS[i];
    if (a.id === 'nm_neon_usta' || has(unlocked, a.id)) continue;
    if (metricValue(view, a) >= a.target) {
      fresh.push(a);
      doneNow.add(a.id);
    }
  }
  const master = ACHIEVEMENT_BY_ID.nm_neon_usta;
  if (!has(unlocked, master.id)) {
    let all = true;
    for (let i = 0; i < ACHIEVEMENTS.length && all; i++) {
      const a = ACHIEVEMENTS[i];
      if (a.id !== master.id && !has(unlocked, a.id) && !doneNow.has(a.id)) all = false;
    }
    if (all) fresh.push(master);
  }
  return fresh;
}

export function achievementRows(view, unlockedList) {
  const set = new Set(Array.isArray(unlockedList) ? unlockedList : []);
  const out = [];
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const a = ACHIEVEMENTS[i];
    const done = set.has(a.id);
    const secret = a.hidden && !done;
    const v = a.id === 'nm_neon_usta' ? Math.max(0, set.size - (done ? 1 : 0)) : metricValue(view, a);
    const target = a.id === 'nm_neon_usta' ? ACHIEVEMENTS.length - 1 : a.target;
    const prog = done ? target : Math.min(target, Math.floor(v));
    out.push({
      id: a.id,
      name: secret ? '???' : a.name,
      desc: secret ? 'Gizli başarım: keşfettikçe açılır.' : a.desc,
      done,
      hidden: secret,
      progress: prog,
      target,
      text: secret ? '' : prog + '/' + target + (a.unit ? ' ' + a.unit : ''),
    });
  }
  return out;
}
