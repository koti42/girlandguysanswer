/*
 * KEŞİF sim — ilerleme ölçütleri (saf). Görevler ve başarımlar hedeflerini bu ölçütler üzerinden toplam değerlerle
 * değerlendirir (olay sırasına bağlı değil → kayıttan yükleme ve "önceden yapılmış iş" otomatik sayılır).
 *
 * `p`: Progression örneği (alanları: stats, zonesUnlocked, crystals, placed, seals, bossesDefeated, abilities,
 * discovered, zonesVisited, parkourTiers, questsDone, achievements, flags, revealCount).
 */
import { ZONE_COUNT } from './constants.js';
import { revealedPercent } from './progressionMap.js';
import { xpLevel } from './progressionData.js';
import { TECH_CRAFTED_KEYS, TECH_PLACEABLE_IDS } from './techData.js';

function sumMap(map, keys) {
  let n = 0;
  for (let i = 0; i < keys.length; i++) n += map[keys[i]] || 0;
  return n;
}
function sumPrefix(map, prefix) {
  let n = 0;
  const ks = Object.keys(map);
  for (let i = 0; i < ks.length; i++) if (ks[i].indexOf(prefix) === 0) n += map[ks[i]];
  return n;
}
function countTrue(obj) {
  let n = 0;
  const ks = Object.keys(obj);
  for (let i = 0; i < ks.length; i++) if (obj[ks[i]]) n++;
  return n;
}
function structuresOfType(p, type) {
  const list = p.discovered.structures;
  const pre = type + ':';
  let n = 0;
  for (let i = 0; i < list.length; i++) if (list[i].indexOf(pre) === 0) n++;
  return n;
}

/** Ad → (p) => sayı. Parametresiz ölçütler. */
export const SCALAR_METRICS = Object.freeze({
  blocksBroken: (p) => p.stats.blocksBroken,
  blocksPlaced: (p) => p.stats.blocksPlaced,
  mobsKilled: (p) => p.stats.mobsKilled,
  hostileKilled: (p) => p.stats.hostileKilled,
  distance: (p) => Math.floor(p.stats.distance),
  playTimeMin: (p) => Math.floor(p.stats.playTime / 60),
  deaths: (p) => p.stats.deaths,
  puzzlesSolved: (p) => p.stats.puzzlesSolved,
  crystalsCollected: (p) => p.stats.crystalsCollected,
  itemsCrafted: (p) => p.stats.itemsCrafted,
  smelted: (p) => p.stats.smelted,
  itemsPicked: (p) => p.stats.itemsPicked,
  foodEaten: (p) => p.stats.foodEaten,
  bedUses: (p) => p.stats.bedUses,
  chestsOpened: (p) => p.stats.chestsOpened,
  chestStores: (p) => p.stats.chestStores,
  enchants: (p) => p.stats.enchants,
  spellsCast: (p) => p.stats.spellsCast,
  potionsBrewed: (p) => p.stats.potionsBrewed,
  potionsDrunk: (p) => p.stats.potionsDrunk,
  manaCrystals: (p) => p.stats.manaCrystals,
  // teknoloji (techData.js)
  portalsPlaced: (p) => p.stats.portalsPlaced,
  portalsUsed: (p) => p.stats.portalsUsed,
  teleports: (p) => p.stats.teleports,
  scans: (p) => p.stats.scans,
  drillBlocks: (p) => p.stats.drillBlocks,
  jetpackSeconds: (p) => Math.floor(p.stats.jetpackSeconds),
  techPlaced: (p) => sumMap(p.stats.placed, TECH_PLACEABLE_IDS),
  distinctTechPlaced: (p) => TECH_PLACEABLE_IDS.filter((id) => (p.stats.placed[id] || 0) > 0).length,
  distinctTechCrafted: (p) => TECH_CRAFTED_KEYS.filter((k) => (p.stats.crafted[k] || 0) > 0).length,
  treesFelled: (p) => p.stats.treesFelled,
  treesGrown: (p) => p.stats.treesGrown,
  nights: (p) => p.stats.nights,
  abilityUses: (p) => p.stats.abilityUses,
  sealsComplete: (p) => countTrue(p.seals),
  bossesDefeated: (p) => countTrue(p.bossesDefeated),
  abilityCount: (p) => countTrue(p.abilities),
  zonesUnlocked: (p) => countTrue(p.zonesUnlocked),
  zonesVisited: (p) => countTrue(p.zonesVisited),
  structuresDiscovered: (p) => p.discovered.structures.length,
  biomesDiscovered: (p) => p.discovered.biomes.length,
  exploredPct: (p) => revealedPercent(p.revealCount),
  exploredCells: (p) => p.revealCount,
  parkourTiers: (p) => countTrue(p.parkourTiers),
  parkourRuns: (p) => Object.keys(p.stats.parkourBest).length,
  questsDone: (p) => countTrue(p.questsDone),
  achievementsDone: (p) => p.achievements.length,
  conquered: (p) => (p.flags.victory ? 1 : 0),
  xpLevel: (p) => xpLevel(p.stats.xp),
  distinctCrafted: (p) => Object.keys(p.stats.crafted).length,
  // alet türü (kazma/balta/kürek/kılıç) başına en az bir kez üretilenlerin sayısı (0..4)
  toolTypesCrafted: (p) => ['item:kazma_', 'item:balta_', 'item:kürek_', 'item:kılıç_'].filter((pre) => sumPrefix(p.stats.crafted, pre) > 0).length,
  // üretilen toplam zırh parçası
  armorCrafted: (p) => ['item:miğfer_', 'item:göğüslük_', 'item:bacaklık_', 'item:çizme_'].reduce((n, pre) => n + sumPrefix(p.stats.crafted, pre), 0),
  // üretilen farklı istasyon bloğu (tezgah, ocak, taş kesici, dokuma tezgahı)
  stationsCrafted: (p) => ['blok:tezgah', 'blok:ocak', 'blok:taş_kesici', 'blok:dokuma_tezgahı'].filter((k) => (p.stats.crafted[k] || 0) > 0).length,
  distinctMobKinds: (p) => Object.keys(p.stats.mobKinds).length,
  distinctBlocksPlaced: (p) => Object.keys(p.stats.placed).length,
  templesDone: (p) => {
    let n = 0;
    for (let z = 0; z < ZONE_COUNT; z++) n += (p.crystals[z] || []).length;
    return n;
  },
  fastParkour: (p) => {
    // 90 sn altı biten parkur sayısı
    let n = 0;
    const ks = Object.keys(p.stats.parkourBest);
    for (let i = 0; i < ks.length; i++) if (p.stats.parkourBest[ks[i]] <= 90000) n++;
    return n;
  },
});

/**
 * Hedef tanımı → mevcut değer. Tür:
 *   {type:'break', ids:[..]}       {type:'place', ids:[..]}
 *   {type:'craft', items:[..]|prefix:'item:kazma_'}   {type:'smelt', items:[..]|any:true}
 *   {type:'pickup', items:[..]|prefix}   {type:'kill', mobs:[..]|kind:'hostile'|'any'}
 *   {type:'puzzle', zone?}   {type:'crystal', zone}   {type:'sealPlace', zone}   {type:'seal', zone}
 *   {type:'boss', zone}   {type:'zone', zone}   {type:'discover', types:[..]}   {type:'parkour', tier?}
 *   {type:'ability', key}   {type:'eat'}   {type:'stat', name}
 */
export function goalValue(p, g) {
  const s = p.stats;
  switch (g.type) {
    case 'break': return sumMap(s.broken, g.ids);
    case 'place': return sumMap(s.placed, g.ids);
    case 'craft':
      return g.items ? sumMap(s.crafted, g.items) : sumPrefix(s.crafted, g.prefix);
    case 'smelt':
      return g.items ? sumMap(s.smeltedBy, g.items) : s.smelted;
    case 'pickup':
      return g.items ? sumMap(s.picked, g.items) : sumPrefix(s.picked, g.prefix);
    case 'kill':
      if (g.mobs) return sumMap(s.mobKinds, g.mobs);
      return g.kind === 'hostile' ? s.hostileKilled : s.mobsKilled;
    case 'puzzle': return g.zone === undefined ? s.puzzlesSolved : (s.puzzlesByZone[g.zone] || 0);
    case 'crystal': return (p.crystals[g.zone] || []).length;
    case 'sealPlace': return (p.placed[g.zone] || []).length;
    case 'seal': return p.seals[g.zone] ? 1 : 0;
    case 'boss': return p.bossesDefeated[g.zone] ? 1 : 0;
    case 'zone': return p.zonesVisited[g.zone] ? 1 : 0;
    case 'discover': {
      let n = 0;
      for (let i = 0; i < g.types.length; i++) n += structuresOfType(p, g.types[i]);
      return n;
    }
    case 'parkour':
      if (g.tier) return p.parkourTiers[g.tier] ? 1 : 0;
      return countTrue(p.parkourTiers);
    case 'ability': return p.abilities[g.key] ? 1 : 0;
    case 'eat': return s.foodEaten;
    case 'stat': {
      const f = SCALAR_METRICS[g.name];
      return f ? f(p) : 0;
    }
    default: return 0;
  }
}

export function scalarMetric(p, name) {
  const f = SCALAR_METRICS[name];
  return f ? f(p) : 0;
}
