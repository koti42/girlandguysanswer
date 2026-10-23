/*
 * KEŞİF sim — ilerleme durum makinesi (saf; DOM/three yok, Math.random/Date.now yok).
 *
 *   const p = createProgression(seed, {mode:'macera', difficulty:'normal'});
 *   const out = p.onEvent(evt);   // motor olaylarını tüketir
 *
 * ÇIKTI (onEvent/grantAbility dönüşü; hiçbir şey olmadıysa paylaşılan boş nesne — DEĞİŞTİRME):
 *   { events:[...onEvent'e iletilecek], rewards:[{key}] (sunucu `claim` anahtarları), unlockZones:[i], unlockZone:i|null,
 *     grantAbilities:[key], grantAbility:key|null, giveItems:[{item,count}] }
 * events girdi olayının kendisini TEKRARLAMAZ; yalnızca türetilenleri taşır: crystal, sealProgress, sealComplete,
 * bossDoor, zoneUnlocked, ability, victory, discover, parkourRecord, achievement, questUpdate, levelUp.
 *
 * Girdi olayları (type): puzzleSolved{id,zone,difficulty?} crystalCollected{zone,id?} crystalPlaced{zone,id?}
 *   bossDefeated{zone|key} mobKilled{key,xp?} blockBroken{id} blockPlaced{id} itemCrafted{item,count,recipeId?}
 *   structureDiscovered{id,structType,zone?,x?,z?} parkourDone{id,tier,ms} zoneEnter{zone} itemPickedUp{item,count}
 *   died distance{d} eaten{item} bedUsed chestOpened chestStored{item} dayPassed abilityUsed xp{amount} reveal{x,z,radius?} sync
 *   biomeEntered{biome} tick{dt,x,z,light?,torch?,biome?}   (tick: oyun süresi, yürünen mesafe, harita açılımı)
 *
 * Ödül anahtarları sunucuyla birebir (progressionData.js üst yorumu). Yalnız 'macera' modunda ödül/ilerleme üretilir.
 * Seal mantığı: bölge i'nin tüm Anahtar Kristalleri (ZONES[i].temples) Mühür Sunağı'na yerleşince seal[i] tamamdır →
 * bölge i+1 açılır, boss kapısı çözülür, `zone:i:seal` ödülü (i ≥ 1). Boss yenilince yetenek (zone 1-4), `zone:i:boss`;
 * Gölge Hükümdar → zafer + `world:conquered`.
 */
import {
  BIOMES, BIOME_KEYS, MAX_BLOCK_ID, ZONES, ZONE_COUNT,
} from './constants.js';
import { getMobType, isBossKey } from './mobTypes.js';
import {
  ABILITY_INFO, ABILITY_LIST, BOSS_REWARD_ITEMS, DIFFICULTIES, PARKOUR_REWARD_ITEMS, PARKOUR_TIER_NAMES,
  SEAL_REWARD_ITEMS, ZONE_RULES, canonKey, isRewardKey, safeId, safeMobKey, xpLevel,
} from './progressionData.js';
import {
  MAP_CELL, MAP_GRID, MAP_HALF, REVEAL_RADIUS, cellIndex, createRevealGrid, revealCircle, revealedPercent,
} from './progressionMap.js';
import {
  migrateProgression, registerProgressionMigration, resetProgression, restoreProgression, serializeProgression,
  unregisterProgressionMigration,
} from './progressionState.js';
import {
  getActiveQuest, getActiveQuests, getHint, getHintInfo, getQuestHud, getQuestLines, getQuestList, syncQuests,
} from './quests.js';
import { checkAchievements, getAchievementList } from './achievements.js';

export { migrateProgression, registerProgressionMigration, unregisterProgressionMigration };
export * from './progressionData.js';

function freezeOut() {
  return Object.freeze({
    events: Object.freeze([]), rewards: Object.freeze([]), unlockZones: Object.freeze([]), unlockZone: null,
    grantAbilities: Object.freeze([]), grantAbility: null, giveItems: Object.freeze([]),
  });
}
export const EMPTY_OUTPUT = freezeOut();

function newOut() {
  return {
    events: [], rewards: [], unlockZones: [], unlockZone: null, grantAbilities: [], grantAbility: null, giveItems: [],
  };
}
function hasContent(o) {
  return o.events.length > 0 || o.rewards.length > 0 || o.unlockZones.length > 0 || o.grantAbilities.length > 0
    || o.giveItems.length > 0;
}
function zoneOf(v) {
  const z = Math.floor(Number(v));
  return z >= 0 && z < ZONE_COUNT ? z : -1;
}
function pos(n, max) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(v, max) : 0;
}
function biomeName(key) {
  for (let i = 0; i < BIOMES.length; i++) if (BIOMES[i].key === key) return BIOMES[i].name;
  return key;
}
function bump(map, key, n) {
  map[key] = (map[key] || 0) + n;
}

export class Progression {
  constructor(seed, opts) {
    const o = opts || {};
    this.seed = seed === undefined ? 0 : seed;
    this.mode = o.mode === 'insa' || o.mode === 'harita' ? o.mode : 'macera';
    resetProgression(this);
    if (o.difficulty && DIFFICULTIES[o.difficulty]) this.difficulty = o.difficulty;
    this._lx = null;
    this._lz = null;
    this._lcell = -1;
    this._lrad = 0;
    this._slow = 0;
  }

  /** İlerleme/ödül üreten mod mu (yalnız macera). */
  get active() {
    return this.mode === 'macera';
  }

  get victory() {
    return !!this.flags.victory;
  }

  /* ------------------------------------------------------------------------------------------- */
  onEvent(evt) {
    if (!evt || typeof evt !== 'object') return EMPTY_OUTPUT;
    const t = evt.type;
    if (t === 'tick') return this._tick(evt);
    const out = newOut();
    this._dispatch(t, evt, out);
    return this._finish(out);
  }

  _dispatch(t, e, out) {
    const s = this.stats;
    switch (t) {
      case 'blockBroken': {
        const id = Math.floor(Number(e.id));
        // count: toplu kırılma (ağaç devrilince kütükler; treefall sistemi) — yoksa 1
        const n = e.count > 1 ? Math.min(1000, Math.floor(e.count)) : 1;
        s.blocksBroken += n;
        if (id >= 1 && id <= MAX_BLOCK_ID) bump(s.broken, id, n);
        break;
      }
      case 'blockPlaced': {
        const id = Math.floor(Number(e.id));
        s.blocksPlaced++;
        if (id >= 1 && id <= MAX_BLOCK_ID) bump(s.placed, id, 1);
        break;
      }
      case 'mobKilled': this._mobKilled(e, out); break;
      case 'itemCrafted': this._itemCrafted(e); break;
      case 'itemPickedUp': {
        const n = Math.floor(pos(e.count === undefined ? 1 : e.count, 100000));
        const k = canonKey(e.item);
        if (n > 0) {
          s.itemsPicked += n;
          if (k) bump(s.picked, k, n);
        }
        break;
      }
      case 'puzzleSolved': this._puzzleSolved(e, out); break;
      case 'crystalCollected': this._crystalCollected(e, out); break;
      case 'crystalPlaced': this._crystalPlaced(e, out); break;
      case 'bossDefeated': this._bossDefeated(e, out); break;
      case 'structureDiscovered': this._structureDiscovered(e, out); break;
      case 'biomeEntered': this._biome(e.biome, out); break;
      case 'parkourDone': this._parkourDone(e, out); break;
      case 'zoneEnter': {
        const z = zoneOf(e.zone);
        if (z >= 0 && this.zonesUnlocked[z]) this.zonesVisited[z] = true;
        break;
      }
      case 'died': s.deaths++; break;
      case 'eaten': {
        s.foodEaten++;
        const k = canonKey(e.item);
        if (k) bump(s.eaten, k, 1);
        break;
      }
      case 'bedUsed': s.bedUses++; break;
      case 'chestOpened': s.chestsOpened++; break;
      case 'chestStored': s.chestStores++; break;
      // büyü sistemi olayları (magic*.js): büyüleme, büyü, demleme (şişe adedi kadar), iksir içme, Mana Kristali
      case 'enchanted': s.enchants++; break;
      case 'spellCast': s.spellsCast++; break;
      case 'potionBrewed': s.potionsBrewed += Math.max(1, Math.floor(pos(e.count === undefined ? 1 : e.count, 3))); break;
      case 'potionDrunk': s.potionsDrunk++; break;
      case 'manaCrystalUsed': s.manaCrystals++; break;
      // teknoloji olayları (tech*.js): portal, ışınlanma, tarama, matkap (machineTick.drilled), jetpack (jetpackFuel.burned sn)
      case 'portalPlaced': s.portalsPlaced++; break;
      case 'portalUsed': s.portalsUsed++; break;
      case 'teleported': s.teleports++; break;
      case 'scanPing': s.scans++; break;
      case 'machineTick': s.drillBlocks += Math.floor(pos(e.drilled, 5000)); break;
      case 'jetpackFuel': s.jetpackSeconds += pos(e.burned, 10); break;
      case 'treeFelled': s.treesFelled += Math.max(1, Math.floor(pos(e.trees === undefined ? 1 : e.trees, 50))); break;
      case 'treeGrown': s.treesGrown++; break;
      case 'dayPassed': s.nights++; break;
      case 'abilityUsed': s.abilityUses++; break;
      case 'distance': s.distance += pos(e.d, 5000); break;
      case 'xp': this._addXp(pos(e.amount, 100000), out); break;
      case 'reveal': {
        const x = Number(e.x);
        const z = Number(e.z);
        if (Number.isFinite(x) && Number.isFinite(z)) this.revealAt(x, z, pos(e.radius, 400) || REVEAL_RADIUS.tower, 2);
        break;
      }
      default: break; // 'sync' ve bilinmeyenler: yalnız görev/başarım yenileme
    }
  }

  /** Sıradan hızlı yol: süre, mesafe, harita açılımı; görev/başarım denetimi ~2 sn'de bir. */
  _tick(e) {
    const dt = pos(e.dt, 5);
    this.stats.playTime += dt;
    let out = null;
    const x = Number(e.x);
    const z = Number(e.z);
    if (Number.isFinite(x) && Number.isFinite(z)) {
      if (this._lx !== null) {
        const dx = x - this._lx;
        const dz = z - this._lz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 12) this.stats.distance += d;
      }
      this._lx = x;
      this._lz = z;
      if (this.active) {
        const light = Number.isFinite(e.light) ? e.light : 15;
        let r = light >= 12 ? REVEAL_RADIUS.bright : light >= 6 ? REVEAL_RADIUS.dim : REVEAL_RADIUS.dark;
        if (e.torch) r += REVEAL_RADIUS.torchBonus;
        const ci = cellIndex(x, z);
        if (ci !== this._lcell || r !== this._lrad) {
          this._lcell = ci;
          this._lrad = r;
          this.revealAt(x, z, r, 1);
        }
      }
    }
    if (this.active && typeof e.biome === 'string') {
      out = newOut();
      this._biome(e.biome, out);
    }
    this._slow += dt;
    if (this._slow >= 2) {
      this._slow = 0;
      return this._finish(out || newOut());
    }
    return out && hasContent(out) ? this._finish(out) : EMPTY_OUTPUT;
  }

  /** Olay sonrası görev + başarım değerlendirmesi, ödül ve olay üretimi. */
  _finish(out) {
    if (!this.active) return EMPTY_OUTPUT;
    const q = syncQuests(this);
    for (let i = 0; i < q.completed.length; i++) {
      const c = q.completed[i];
      this._addXp(c.rewards.xp, out);
      for (let k = 0; k < c.rewards.items.length; k++) this._give(out, c.rewards.items[k].item, c.rewards.items[k].count);
      out.events.push({
        type: 'questUpdate', id: c.id, title: c.title, desc: c.desc, state: 'done', progress: c.n, goal: c.n,
        completed: true, rewards: c.rewards,
      });
    }
    for (let i = 0; i < q.changed.length; i++) {
      const c = q.changed[i];
      if (this.questsDone[c.quest.id]) continue;
      out.events.push({
        type: 'questUpdate', id: c.quest.id, title: c.quest.title, desc: c.quest.desc, state: 'active',
        progress: c.progress, goal: c.goal, completed: false,
      });
    }
    for (let guard = 0; guard < 4; guard++) {
      const fresh = checkAchievements(this);
      if (fresh.length === 0) break;
      for (let i = 0; i < fresh.length; i++) {
        const a = fresh[i];
        this._addXp(a.xp, out);
        out.events.push({ type: 'achievement', id: a.id, title: a.title, desc: a.desc, icon: a.icon });
      }
    }
    return hasContent(out) ? out : EMPTY_OUTPUT;
  }

  /* ------------------------------------------------------------------------------------------- */
  _give(out, item, count) {
    for (let i = 0; i < out.giveItems.length; i++) {
      if (out.giveItems[i].item === item) {
        out.giveItems[i].count += count;
        return;
      }
    }
    out.giveItems.push({ item, count });
  }

  _giveList(out, list) {
    if (!list) return;
    for (let i = 0; i < list.length; i++) this._give(out, list[i].item, list[i].count);
  }

  _addXp(n, out) {
    if (!(n > 0)) return;
    const before = xpLevel(this.stats.xp);
    this.stats.xp += n;
    const after = xpLevel(this.stats.xp);
    if (after > before) out.events.push({ type: 'levelUp', level: after });
  }

  /** Sunucu ödül talebi sıraya alınır (yalnız bir kez; zaten alınmışsa atlanır). */
  _award(key, out) {
    if (!this.active || !isRewardKey(key)) return;
    if (this.rewards.claimed.indexOf(key) >= 0 || this.rewards.pending.indexOf(key) >= 0) return;
    this.rewards.pending.push(key);
    out.rewards.push({ key });
  }

  _mobKilled(e, out) {
    const s = this.stats;
    const key = safeMobKey(e.key || e.mob || e.kind);
    s.mobsKilled++;
    const type = key ? getMobType(key) : null;
    if (key) bump(s.mobKinds, key, 1);
    if (type && type.hostile) s.hostileKilled++;
    const xp = e.xp !== undefined ? pos(e.xp, 1000) : type ? Math.min(type.xp || 0, 500) : 0;
    this._addXp(xp, out);
    if (key && isBossKey(key)) {
      const z = type.zone !== undefined ? type.zone : -1;
      if (z >= 1 && !this.bossesDefeated[z]) this._bossDefeated({ zone: z, key }, out);
    }
  }

  _itemCrafted(e) {
    const s = this.stats;
    const n = Math.floor(pos(e.count === undefined ? 1 : e.count, 10000));
    const k = canonKey(e.item);
    if (n <= 0) return;
    s.itemsCrafted += n;
    if (k) bump(s.crafted, k, n);
    // Laboratuvarda üretilen Portal Tabancası yeteneği de açar (boss ödülündeki gibi; eşya İKİNCİ kez verilmez)
    if (k === 'item:portal_tabancası') this.abilities.portalGun = true;
    const smelt = e.station === 'ocak' || (typeof e.recipeId === 'string' && e.recipeId.indexOf('ocak:') === 0);
    if (smelt) {
      s.smelted += n;
      if (k) bump(s.smeltedBy, k, n);
    }
  }

  _puzzleSolved(e, out) {
    const id = typeof e.id === 'string' ? e.id.slice(0, 64) : '';
    if (id && this._solvedSet.has(id)) return;
    if (id && this.solved.length < 800) {
      this.solved.push(id);
      this._solvedSet.add(id);
    }
    const s = this.stats;
    s.puzzlesSolved++;
    const z = zoneOf(e.zone);
    if (z >= 0) bump(s.puzzlesByZone, z, 1);
    this._addXp(10 + 5 * Math.min(5, pos(e.difficulty, 5) || (z >= 0 ? ZONES[z].difficulty : 1)), out);
  }

  _crystalCollected(e, out) {
    const z = zoneOf(e.zone);
    if (z < 0) return;
    const list = this.crystals[z];
    const id = typeof e.id === 'string' && e.id ? e.id.slice(0, 64) : 'k' + z + '#' + (list.length + 1);
    if (list.indexOf(id) >= 0 || list.length >= 12) return;
    list.push(id);
    this.stats.crystalsCollected++;
    this._addXp(25, out);
    out.events.push({
      type: 'crystal', zone: z, id, count: list.length, required: ZONE_RULES[z].required, zoneName: ZONES[z].name,
    });
  }

  _crystalPlaced(e, out) {
    const z = zoneOf(e.zone);
    if (z < 0 || this.seals[z]) return;
    const req = ZONE_RULES[z].required;
    const placed = this.placed[z];
    if (placed.length >= req) return;
    const id = typeof e.id === 'string' && e.id ? e.id.slice(0, 64) : 'p' + z + '#' + (placed.length + 1);
    if (placed.indexOf(id) >= 0) return;
    placed.push(id);
    // yerleştirilen kristal toplanmış sayılır (olay kaçmış olsa bile)
    const col = this.crystals[z];
    if (typeof e.id === 'string' && e.id) {
      if (col.indexOf(id) < 0 && col.length < 12) {
        col.push(id);
        this.stats.crystalsCollected++;
      }
    } else if (col.length < placed.length) {
      col.push('k' + z + '#' + (col.length + 1));
      this.stats.crystalsCollected++;
    }
    out.events.push({
      type: 'sealProgress', zone: z, placed: placed.length, required: req, zoneName: ZONES[z].name,
    });
    if (placed.length >= req) this._completeSeal(z, out);
  }

  _completeSeal(z, out) {
    if (this.seals[z]) return;
    this.seals[z] = true;
    const rule = ZONE_RULES[z];
    out.events.push({ type: 'sealComplete', zone: z, zoneName: rule.name, unlocks: rule.unlocks });
    this._addXp(60 + z * 20, out);
    if (rule.bossKey) {
      this.bossDoors[z] = true;
      out.events.push({ type: 'bossDoor', zone: z, bossKey: rule.bossKey });
    }
    if (rule.unlocks !== null) this._unlockZone(rule.unlocks, out);
    this._giveList(out, SEAL_REWARD_ITEMS[z]);
    if (rule.sealRewardKey) this._award(rule.sealRewardKey, out);
  }

  _unlockZone(i, out) {
    if (i < 1 || i >= ZONE_COUNT || this.zonesUnlocked[i] || !this.zonesUnlocked[i - 1]) return false;
    this.zonesUnlocked[i] = true;
    out.unlockZones.push(i);
    out.unlockZone = i;
    out.events.push({ type: 'zoneUnlocked', zone: i, name: ZONES[i].name });
    return true;
  }

  _bossDefeated(e, out) {
    let z = zoneOf(e.zone);
    if (z < 0 && e.key) {
      const k = safeMobKey(e.key);
      for (let i = 1; i < ZONE_COUNT; i++) if (ZONES[i].bossKey === k) z = i;
    }
    if (z < 1 || this.bossesDefeated[z]) return;
    this.bossesDefeated[z] = true;
    const rule = ZONE_RULES[z];
    this._addXp(150 + z * 50, out);
    this._giveList(out, BOSS_REWARD_ITEMS[z]);
    if (rule.ability) this._grantAbility(rule.ability, out);
    this._award(rule.bossRewardKey, out);
    if (z === ZONE_COUNT - 1) {
      this.flags.victory = true;
      out.events.push({ type: 'victory', zone: z, bossKey: rule.bossKey });
      this._award('world:conquered', out);
    }
  }

  _grantAbility(key, out) {
    const info = ABILITY_INFO[key];
    if (!info || this.abilities[key]) return false;
    this.abilities[key] = true;
    out.grantAbilities.push(key);
    out.grantAbility = key;
    this._give(out, info.item, 1);
    out.events.push({
      type: 'ability', key, name: info.name, desc: info.desc, item: info.item, zone: info.zone,
    });
    return true;
  }

  /** Elle yetenek ver (hile/test/boss dışı kaynak). Çıktı onEvent ile aynı biçimde. Zaten varsa boş çıktı. */
  grantAbility(key) {
    const out = newOut();
    this._grantAbility(key, out);
    return this._finish(out);
  }

  _structureDiscovered(e, out) {
    const st = typeof e.structType === 'string' ? e.structType : typeof e.structure === 'string' ? e.structure : '';
    let id = typeof e.id === 'string' ? e.id : '';
    if (!id && !st) return;
    if (id.indexOf(':') < 0 && st) id = st + ':' + id;
    id = id.slice(0, 64);
    const type = id.slice(0, id.indexOf(':') < 0 ? id.length : id.indexOf(':'));
    if (this._structSet.has(id) || this.discovered.structures.length >= 2000) return;
    this._structSet.add(id);
    this.discovered.structures.push(id);
    this._addXp(8 + 4 * pos(e.difficulty, 5), out);
    const x = Number(e.x);
    const z = Number(e.z);
    if (type === 'gozcukulesi' && Number.isFinite(x) && Number.isFinite(z) && this.active) {
      this.revealAt(x, z, REVEAL_RADIUS.tower, 2);
    }
    out.events.push({
      type: 'discover', kind: 'structure', id, structType: type, name: typeof e.name === 'string' ? e.name.slice(0, 60) : type,
      zone: zoneOf(e.zone),
    });
  }

  _biome(key, out) {
    if (BIOME_KEYS.indexOf(key) < 0 || this.discovered.biomes.indexOf(key) >= 0) return;
    this.discovered.biomes.push(key);
    this._addXp(5, out);
    out.events.push({ type: 'discover', kind: 'biome', id: key, name: biomeName(key) });
  }

  _parkourDone(e, out) {
    const tier = Math.floor(Number(e.tier));
    if (!(tier >= 1 && tier <= 5)) return;
    const id = safeId(typeof e.id === 'string' ? e.id.slice(0, 40) : '') || '';
    const ms = Math.floor(pos(e.ms, 86400000));
    let best = false;
    if (id && ms >= 1) {
      const prev = this.stats.parkourBest[id];
      if (prev === undefined) {
        if (Object.keys(this.stats.parkourBest).length < 300) {
          this.stats.parkourBest[id] = ms;
          best = true;
        }
      } else if (ms < prev) {
        this.stats.parkourBest[id] = ms;
        best = true;
      }
    }
    if (id && ms >= 1) {
      out.events.push({
        type: 'parkourRecord', id, tier, tierName: PARKOUR_TIER_NAMES[tier], ms, best, first: !this.parkourTiers[tier],
      });
    }
    if (!this.parkourTiers[tier]) {
      this.parkourTiers[tier] = true;
      this._addXp(20 * tier, out);
      this._giveList(out, PARKOUR_REWARD_ITEMS[tier]);
      this._award('parkour:' + tier + ':first', out);
    }
  }

  /* ------------------------------------------------------------------------------------------- */
  /** Haritayı (x,z) merkezli r blok yarıçapla açar; yeni hücre sayısı. */
  revealAt(x, z, r, level) {
    const n = revealCircle(this.reveal, x, z, r, level || 1);
    this.revealCount += n;
    return n;
  }

  isRevealed(x, z) {
    const i = cellIndex(x, z);
    return i >= 0 && this.reveal[i] !== 0;
  }

  /** Harita ekranı için: {cell, half, grid, data (canlı Uint8Array), explored, percent}. */
  mapView() {
    return {
      cell: MAP_CELL, half: MAP_HALF, grid: MAP_GRID, data: this.reveal, explored: this.revealCount,
      percent: revealedPercent(this.revealCount),
    };
  }

  isZoneUnlocked(i) {
    return i <= 0 ? true : !!this.zonesUnlocked[i];
  }

  /** Mühür ilerlemesi: {zone, collected, placed, required, done, bossDoor}. */
  sealProgress(zone) {
    const z = zoneOf(zone);
    if (z < 0) return null;
    return {
      zone: z, collected: this.crystals[z].length, placed: this.placed[z].length, required: ZONE_RULES[z].required,
      done: !!this.seals[z], bossDoor: !!this.bossDoors[z],
    };
  }

  hasAbility(key) {
    return !!this.abilities[key];
  }

  /** physics.stepPlayer yetenek nesnesi (kopya). */
  abilityFlags() {
    return {
      doubleJump: !!this.abilities.doubleJump, grapple: !!this.abilities.grapple,
      glide: !!this.abilities.glide, portalGun: !!this.abilities.portalGun,
    };
  }

  /** Kazanılmış ama envanterde bulunmayan yetenek eşyaları (ölümde kaybolmuş olabilir): [{item,count}]. */
  missingAbilityItems(inventory) {
    const out = [];
    for (let i = 0; i < ABILITY_LIST.length; i++) {
      const info = ABILITY_INFO[ABILITY_LIST[i]];
      if (this.abilities[info.key] && inventory.count(info.item) < 1) out.push({ item: info.item, count: 1 });
    }
    return out;
  }

  getDifficulty() {
    return DIFFICULTIES[this.difficulty];
  }

  setDifficulty(key) {
    if (!DIFFICULTIES[key]) return false;
    this.difficulty = key;
    return true;
  }

  pendingRewards() {
    return this.rewards.pending.map((key) => ({ key }));
  }

  /** Sunucu ödülü işledi (başarılı ya da 409 already_claimed): bekleyenden düşer, alınanlara yazılır. */
  markClaimed(key) {
    const i = this.rewards.pending.indexOf(key);
    if (i >= 0) this.rewards.pending.splice(i, 1);
    if (isRewardKey(key) && this.rewards.claimed.indexOf(key) < 0) this.rewards.claimed.push(key);
  }

  /** Sunucudan gelen daha önce alınmış anahtarları (overview.claimed) işler. */
  syncClaimed(keys) {
    if (!Array.isArray(keys)) return;
    for (let i = 0; i < keys.length; i++) if (isRewardKey(keys[i])) this.markClaimed(keys[i]);
  }

  /* ---- görev / başarım / günlük yüzeyi ---- */
  activeQuest() {
    return getActiveQuest(this);
  }

  activeQuests(max) {
    return getActiveQuests(this, max);
  }

  questLines(max) {
    return getQuestLines(this, max);
  }

  questHud() {
    return getQuestHud(this);
  }

  hint(ctx) {
    return getHint(this, ctx);
  }

  hintInfo(ctx) {
    return getHintInfo(this, ctx);
  }

  /** api.getJournal() gövdesi. */
  journal() {
    return {
      quests: getQuestList(this, {}).map((q) => ({
        id: q.id, title: q.title, desc: q.desc, state: q.state, progress: q.progress, goal: q.goal, chain: q.chain,
        hint: q.hint,
      })),
      achievements: getAchievementList(this).map((a) => ({
        id: a.id, title: a.title, desc: a.desc, done: a.done, progressText: a.progressText, icon: a.icon,
      })),
      discovered: { structures: this.discovered.structures.length, biomes: this.discovered.biomes.length },
      stats: this.summary(),
      abilities: this.abilityFlags(),
    };
  }

  /** Küçük istatistik özeti (HUD/günlük/sunucu özeti). */
  summary() {
    const s = this.stats;
    return {
      blocksBroken: s.blocksBroken, blocksPlaced: s.blocksPlaced, mobsKilled: s.mobsKilled,
      distance: Math.floor(s.distance), playTime: Math.floor(s.playTime), deaths: s.deaths,
      puzzlesSolved: s.puzzlesSolved, crystalsCollected: s.crystalsCollected, xp: Math.floor(s.xp),
      level: xpLevel(s.xp), explored: revealedPercent(this.revealCount),
      parkourBest: Object.assign({}, s.parkourBest),
    };
  }

  /* ---- kayıt ---- */
  serialize() {
    return serializeProgression(this);
  }

  /** Doğrulayarak yükler (atmaz). Veri nesne değilse false (durum boş sıfırlanır). */
  restore(data) {
    const ok = restoreProgression(this, data);
    this._lx = null;
    this._lz = null;
    this._lcell = -1;
    this._slow = 0;
    if (ok && this.mode !== 'macera') this.flags.victory = false;
    return ok;
  }

  static fromJSON(seed, data, opts) {
    const p = new Progression(seed, opts);
    p.restore(data);
    return p;
  }
}

export function createProgression(seed, opts) {
  return new Progression(seed, opts);
}

export { createRevealGrid };
