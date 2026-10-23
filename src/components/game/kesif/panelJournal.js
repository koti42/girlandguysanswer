/*
 * KEŞİF günlük — saf biçimleme yardımcıları (api.getJournal() çıktısı için).
 * getJournal() → { quests:[{id,title,desc,state,progress,goal}], achievements:[{id,title,desc,done,progressText}],
 *                  discovered:{structures:n,biomes:n}, stats:{...}, abilities:{doubleJump,grapple,glide,portalGun} }
 */
import { BIOMES, ZONES } from '../../../game/kesif/sim/constants.js';

export const JOURNAL_TABS = Object.freeze([
  { key: 'gorev', name: 'Görevler' },
  { key: 'basarim', name: 'Başarımlar' },
  { key: 'kesif', name: 'Keşifler' },
  { key: 'istatistik', name: 'İstatistik' },
  { key: 'yetenek', name: 'Yetenekler' },
]);

const BOSS_NAMES = Object.freeze({
  kokana: 'Kök Ana', tasbekci: 'Taş Bekçi', buzkral: 'Buz Kral', golgehukumdar: 'Gölge Hükümdar',
});

export const ABILITY_INFO = Object.freeze({
  doubleJump: { name: 'Çift Zıplama Botları', desc: 'Havadayken bir kez daha zıplarsın.', glyph: '⇡' },
  grapple: { name: 'Kanca', desc: 'Kanca noktalarına tutunup sallanırsın.', glyph: '⚓' },
  glide: { name: 'Planör', desc: 'Havada süzülerek uçurumları aşarsın.', glyph: '✈' },
  portalGun: { name: 'Kuantum Portal Silahı', desc: 'Mavi ve turuncu portal açarak ışınlanırsın.', glyph: '◉' },
});

/** Yetenek anahtarı → hangi bölgede/boss ile kazanılır (ipucu metni). */
export function abilitySource(key) {
  const z = ZONES.find((q) => q.abilityKey === key);
  if (!z) return '';
  const boss = z.bossKey ? BOSS_NAMES[z.bossKey] || z.bossKey : '';
  return z.name + (boss ? ' · ' + boss + ' yenilince' : '');
}

export function pct(progress, goal) {
  const g = Number(goal);
  const p = Number(progress);
  if (!(g > 0) || !Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, Math.round((p / g) * 100)));
}

/** Görev durumu → {key:'active'|'done'|'locked', label}. */
export function questState(q) {
  const s = String((q && q.state) || '').toLowerCase();
  if (['done', 'complete', 'completed', 'tamamlandı', 'tamamlandi', 'bitti'].indexOf(s) >= 0) return { key: 'done', label: 'Tamamlandı' };
  if (['locked', 'kilitli', 'gizli'].indexOf(s) >= 0) return { key: 'locked', label: 'Kilitli' };
  const g = Number(q && q.goal);
  if (g > 0 && Number(q.progress) >= g) return { key: 'done', label: 'Tamamlandı' };
  return { key: 'active', label: 'Sürüyor' };
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + ' sa ' + m + ' dk';
  if (m > 0) return m + ' dk ' + (s % 60) + ' sn';
  return s + ' sn';
}
export function formatMs(ms) {
  const total = Math.max(0, Number(ms) || 0) / 1000;
  const m = Math.floor(total / 60);
  const sec = total - m * 60;
  const txt = sec.toFixed(2).replace('.', ',');
  if (m > 0) return m + ':' + (sec < 10 ? '0' : '') + txt;
  return txt + ' sn';
}
function fmtInt(n) {
  return Math.round(Number(n) || 0).toLocaleString('tr-TR');
}

const STAT_DEFS = [
  ['blocksBroken', 'Kırılan blok', fmtInt],
  ['blocksPlaced', 'Yerleştirilen blok', fmtInt],
  ['mobsKilled', 'Yenilen yaratık', fmtInt],
  ['distance', 'Yürünen mesafe', (v) => (Number(v) >= 1000 ? (Math.round(Number(v) / 100) / 10).toString().replace('.', ',') + ' km' : fmtInt(v) + ' m')],
  ['playTime', 'Oyun süresi', formatDuration],
  ['deaths', 'Yenilgi', fmtInt],
];
export const STAT_KEYS = Object.freeze(STAT_DEFS.map((d) => d[0]));

/** stats nesnesi → [{key,label,value}] (bilinen alanlar sırayla; parkur rekorları ayrı satırlar). */
export function statRows(stats) {
  const st = stats && typeof stats === 'object' ? stats : {};
  const rows = [];
  STAT_DEFS.forEach(([key, label, fmt]) => {
    if (st[key] !== undefined && Number.isFinite(Number(st[key]))) rows.push({ key, label, value: fmt(st[key]) });
  });
  const pb = st.parkourBest;
  if (pb && typeof pb === 'object') {
    Object.keys(pb)
      .filter((k) => Number.isFinite(Number(pb[k])))
      .sort()
      .forEach((k, i) => rows.push({ key: 'parkour:' + k, label: 'Parkur rekoru ' + (i + 1), value: formatMs(pb[k]) }));
  }
  return rows;
}

/** Keşif özeti: [{key,label,value,max}] (biyom toplamı bilinir; yapılar için toplam yok). */
export function discoveryRows(discovered) {
  const d = discovered && typeof discovered === 'object' ? discovered : {};
  const biomes = Math.max(0, Math.floor(Number(d.biomes) || 0));
  const structures = Math.max(0, Math.floor(Number(d.structures) || 0));
  return [
    { key: 'biomes', label: 'Biyomlar', value: Math.min(biomes, BIOMES.length), max: BIOMES.length },
    { key: 'structures', label: 'Yapılar ve yerler', value: structures, max: 0 },
  ];
}

/** abilities nesnesi → [{key,name,desc,glyph,unlocked,source}] (4 yetenek her zaman listelenir). */
export function abilityRows(abilities) {
  const ab = abilities && typeof abilities === 'object' ? abilities : {};
  return Object.keys(ABILITY_INFO).map((key) => ({
    key,
    name: ABILITY_INFO[key].name,
    desc: ABILITY_INFO[key].desc,
    glyph: ABILITY_INFO[key].glyph,
    unlocked: !!ab[key],
    source: abilitySource(key),
  }));
}
