/*
 * KEŞİF sim/city/mission — HİKÂYE GÖREV ZİNCİRİ `neon` (14): Hoş geldin → ilk sürüş → ilk teslimat → altı mahalle → yarış → çip/grafiti/çatı/foto/taksi/robot/gizli oda/boya →
 * Diyar Işığı (Kasa yumurtası). SAF, es2020. Görev durumu `city.quests[id]` (1 etkin, 2 bitti); ilerleme `metricsOf(city)` ölçütlerinden TOPLAM olarak hesaplanır
 * (görev sonradan başlarsa önceki ilerleme sayılır → soft-lock yok). 12 görev kimliği/adı cityNames.QUEST_CHAIN_NEON'dan; iki ek görev (hoş geldin, altı mahalle) burada.
 *
 *   QUESTS (donuk) · QUEST_BY_ID · CHAIN_ORDER
 *   questState(quests, id) → 0 yok | 1 etkin | 2 bitti          startQuest(quests, id) → bool (yalnız 0 → 1)
 *   questProgress(view, def) → {have, need}                      evaluateQuests(view, quests) → {done:[def…]} (etkin ve ölçüt tamamsa 2 yapar)
 *   autoStart(view, quests) → [başlayan def…]                   nm_hosgeldin ilk girişte; nm_portal_yumurtasi 8 görev bitince
 *   activeQuest(quests) → def | null (zincir sırasındaki ilk etkin)       questRows(view, quests) → arayüz satırları
 *   questTarget(seed, def, x, z) → {x,z,label} | null            hedefe yönlendiren en yakın ilgi noktası (sır olan görevlerde null)
 */
import { QUEST_CHAIN_NEON } from '../cityNames.js';
import { pois } from '../cityPlan.js';
import { KREDI } from './missionData.js';

const EXTRA = Object.freeze({
  nm_hosgeldin: { name: 'Hoş Geldin', desc: 'Birisiyle konuşarak şehre selam ver.' },
  nm_bolgeler: { name: 'Altı Mahalle', desc: 'Altı bölgenin hepsine uğra.' },
});

const SPEC = [
  ['nm_hosgeldin', 'talks', 1, 'Yakındaki biriyle konuş: Konuş düğmesine bas.', 'zeynep', null],
  ['nm_ilk_surus', 'driveM', 300, 'Bir araca bin (F) ve şehirde 300 metre sür.', 'zeynep', 'rental'],
  ['nm_ilk_teslimat', 'jobsDone', 1, 'Kurye masasına git, bir iş al ve teslim et.', 'arda', 'courier_desk'],
  ['nm_bolgeler', 'districtKinds', 6, 'Altı bölgenin hepsine uğra.', null, null],
  ['nm_yaris_bronz', 'racesWon', 1, 'Bir yarış kapısına git ve yarışı en az bronzla bitir.', 'hakem_kaan', 'race_gate'],
  ['nm_cip_10', 'chipsFound', 10, 'Sokaklarda parlayan veri çiplerini topla.', 'deniz', null],
  ['nm_graffiti_5', 'graffitiDone', 5, 'Boş duvarlara grafiti yap (Pazar, Konteyner, Tepe).', 'lale', null],
  ['nm_cati_parkur', 'roofDone', 1, 'Bir çatı parkurunun dış merdivenini bul ve tırman.', 'baran', 'roof_start'],
  ['nm_fotograf', 'photosTaken', 1, 'Foto moduna geç ve güzel bir kare yakala.', 'yesim', 'photo_spot'],
  ['nm_taksi_5', 'taxiDone', 5, 'Taksi masasından yolcu al ve 5 yolcu taşı.', 'taksi_sevgi', null],
  ['nm_robot_10', 'robotsDissolved', 10, 'Liman ve Sanayi bölgesinde hatalı robotları dağıt.', 'bip', null],
  ['nm_gizli_oda', 'roomsFound', 1, 'Kitaplıkların arkasına bak: bir gizli oda var.', 'selin', null],
  ['nm_garaj_boya', 'paintJobs', 1, 'Garaj terminalinde aracını yeniden boya.', 'tamirci', 'garage'],
  ['nm_portal_yumurtasi', 'easter', 1, 'Kasa\'ya in ve gizemli ışığı bul. (Kart 3 gerekir.)', null, null],
];

const byQuestId = (id) => QUEST_CHAIN_NEON.find((q) => q.id === id) || null;

const list = SPEC.map((s) => {
  const base = byQuestId(s[0]) || EXTRA[s[0]];
  if (!base) throw new Error('Görev adı yok: ' + s[0]);
  return Object.freeze({
    id: s[0],
    name: base.name,
    desc: base.desc,
    metric: s[1],
    target: s[2],
    hint: s[3],
    giver: s[4],
    poi: s[5],
    kredi: s[0] === 'nm_portal_yumurtasi' ? KREDI.easter : KREDI.quest,
    secret: s[0] === 'nm_gizli_oda' || s[0] === 'nm_portal_yumurtasi',
  });
});

export const QUESTS = Object.freeze(list);
export const QUEST_BY_ID = Object.freeze(list.reduce((m, q) => { m[q.id] = q; return m; }, Object.create(null)));
export const CHAIN_ORDER = Object.freeze(list.map((q) => q.id));

export function questState(quests, id) {
  const v = quests && Object.prototype.hasOwnProperty.call(quests, id) ? quests[id] : 0;
  return v === 1 || v === 2 ? v : 0;
}

export function startQuest(quests, id) {
  if (!QUEST_BY_ID[id] || questState(quests, id) !== 0) return false;
  quests[id] = 1;
  return true;
}

export function questProgress(view, def) {
  const v = view && typeof view[def.metric] === 'number' && Number.isFinite(view[def.metric]) ? view[def.metric] : 0;
  return { have: Math.max(0, Math.min(def.target, Math.floor(v))), need: def.target };
}

/** Etkin görevlerden ölçütü tamam olanları bitirir; dönen {done:[def]}. */
export function evaluateQuests(view, quests) {
  const done = [];
  for (let i = 0; i < QUESTS.length; i++) {
    const q = QUESTS[i];
    if (questState(quests, q.id) !== 1) continue;
    const p = questProgress(view, q);
    if (p.have >= p.need) {
      quests[q.id] = 2;
      done.push(q);
    }
  }
  return { done };
}

function countDone(quests) {
  let n = 0;
  for (let i = 0; i < QUESTS.length; i++) if (questState(quests, QUESTS[i].id) === 2) n++;
  return n;
}

/** İlk girişte nm_hosgeldin; 8 görev bitince nm_portal_yumurtasi. Ayrıca zincirde ilk bitmemiş görev hiç etkin değilse onu başlatır (soft-lock yok). */
export function autoStart(view, quests) {
  const started = [];
  const begin = (id) => {
    if (startQuest(quests, id)) started.push(QUEST_BY_ID[id]);
  };
  if (view && view.dimHops >= 1) begin('nm_hosgeldin');
  if (countDone(quests) >= 8) begin('nm_portal_yumurtasi');
  let anyActive = false;
  for (let i = 0; i < QUESTS.length; i++) if (questState(quests, QUESTS[i].id) === 1) anyActive = true;
  if (!anyActive && view && view.dimHops >= 1) {
    for (let i = 0; i < QUESTS.length; i++) {
      const q = QUESTS[i];
      if (q.id === 'nm_portal_yumurtasi') continue;
      if (questState(quests, q.id) === 0) {
        begin(q.id);
        break;
      }
    }
  }
  return started;
}

export function activeQuest(quests) {
  for (let i = 0; i < QUESTS.length; i++) if (questState(quests, QUESTS[i].id) === 1) return QUESTS[i];
  return null;
}

export function questRows(view, quests) {
  return QUESTS.map((q) => {
    const st = questState(quests, q.id);
    const p = questProgress(view, q);
    return {
      id: q.id,
      title: st === 0 && q.secret ? '???' : q.name,
      desc: st === 0 && q.secret ? 'Bu görev zamanı gelince açılır.' : q.desc,
      hint: st === 1 ? q.hint : '',
      state: st === 2 ? 'done' : st === 1 ? 'active' : 'locked',
      progress: st === 2 ? q.target : p.have,
      goal: q.target,
    };
  });
}

const NEAR_CACHE = new Map();
function poiGroups(seed) {
  const key = seed | 0;
  let g = NEAR_CACHE.get(key);
  if (g) return g;
  g = {};
  const list2 = pois(key);
  for (let i = 0; i < list2.length; i++) {
    const p = list2[i];
    (g[p.type] || (g[p.type] = [])).push(p);
  }
  NEAR_CACHE.set(key, g);
  if (NEAR_CACHE.size > 3) NEAR_CACHE.delete(NEAR_CACHE.keys().next().value);
  return g;
}

export function questTarget(seed, def, x, z) {
  if (!def || !def.poi) return null;
  const arr = poiGroups(seed)[def.poi];
  if (!arr || arr.length === 0) return null;
  let best = null;
  let bd = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = (arr[i].x - x) * (arr[i].x - x) + (arr[i].z - z) * (arr[i].z - z);
    if (d < bd) {
      bd = d;
      best = arr[i];
    }
  }
  return best ? { x: best.x, z: best.z, label: def.name } : null;
}
