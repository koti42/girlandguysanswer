/*
 * KEŞİF — hata ayıklama komutları: api.command(name, args). YALNIZCA geliştirme derlemesi, `?debug=1` ya da opts.debug ile açıktır;
 * üretimde her çağrı {ok:false} döner ve hiçbir şeye dokunmaz. Test ajanları ve geliştirici demo için.
 *
 *   parseCommandLine('tp 10 70 -5') → {name:'tp', args:['10','70','-5']}      tırnaklı argümanlar ("derin mağara") tek parça
 *   commandsEnabled(G, env?) → bool
 *   runCommand(G, name, args, ctx?) → {ok, message, data?}                    args: dizi | metin | nesne({args:[…]})
 *   COMMAND_HELP → {ad: 'kullanım'}                                            COMMAND_NAMES
 *   registerCommand(name, help, fn(G, args, ctx)) → ek komut (systems/dimCommands.js: dim dimhop dimstat tpd props givegate nocost); help çıktısına eklenir
 *
 * Komutlar (koordinatlarda '~' = oyuncunun bulunduğu yer, '~5' = +5):
 *   tp x y z | tp x z | tp spawn | tp zone N | tp structure [tür]      ışınla (güvenli zemine; kilitli bölgeye gitmez)
 *   give <eşya> [adet]                  eşya anahtarı, takma adı ('kazma_demir') ya da blok anahtarı ('taş')
 *   time gündüz|gece|gün batımı|şafak|öğle|0..1 | time freeze|unfreeze
 *   weather clear|rain|snow|storm|auto
 *   godmode [on|off]   fly [on|off]   heal   mana [n|full]   (büyü: mana ayarla / doldur)
 *   charge                              envanterdeki tüm şarjlı teknoloji eşyalarını doldurur (jetpack, alet, zırh, tarayıcı, portal tabancası)
 *   tech                                makine/ağ/portal özeti (G.tech)
 *   spawnmob <tür> [adet]               ASCII tür anahtarı ('golge', 'kokana'…) — önünde 4 blok
 *   setblock x y z <blok|id|hava>
 *   unlockzone [n]                      gerçek ilerleme hattıyla (kristal→mühür→bölge) n bölge açar
 *   solvepuzzle [id|nearest]            bulmacayı çözülmüş işaretler (G.solvePuzzle varsa onu kullanır)
 *   crystal [bölge] [adet]              Anahtar Kristali toplama olayı
 *   ability <doubleJump|grapple|glide|portalGun|all>
 *   reveal [yarıçap]                    haritayı açar     seed    dünya tohumu/kodu     stats    özet     save    elle kaydet
 */
import { itemByKey, ITEM_LIST, blockItemKey } from '../sim/items.js';
import { blockByKey, B } from '../sim/blocks.js';
import {
  foldTr, MAX_BLOCK_ID, ZONES, ZONE_COUNT,
} from '../sim/constants.js';
import { setClockPhase } from '../sim/daynight.js';
import { normalizeMobKey, getMobType } from '../sim/mobTypes.js';
import { ZONE_RULES, ABILITY_LIST } from '../sim/progressionData.js';
import { nearestStructure } from '../sim/structures.js';
import { chargeInventory } from '../sim/techCharge.js';

export const COMMAND_HELP = Object.freeze({
  tp: 'tp x y z | tp x z | tp spawn | tp zone N | tp structure [tür]',
  give: 'give <eşya> [adet]',
  time: 'time gündüz|gece|gün batımı|şafak|öğle|0..1|freeze|unfreeze',
  weather: 'weather clear|rain|snow|storm|auto',
  godmode: 'godmode [on|off]',
  fly: 'fly [on|off]',
  heal: 'heal',
  mana: 'mana [n|full]',
  charge: 'charge',
  tech: 'tech',
  spawnmob: 'spawnmob <tür> [adet]',
  setblock: 'setblock x y z <blok|id|hava>',
  unlockzone: 'unlockzone [n]',
  solvepuzzle: 'solvepuzzle [id|nearest]',
  crystal: 'crystal [bölge] [adet]',
  ability: 'ability <doubleJump|grapple|glide|portalGun|all>',
  reveal: 'reveal [yarıçap]',
  seed: 'seed',
  stats: 'stats',
  save: 'save',
  help: 'help',
});
export const COMMAND_NAMES = Object.freeze(Object.keys(COMMAND_HELP));

/** Sonradan kaydedilen komutlar (başka sistemler): ad → {help, fn}. Yerleşik komutların üzerine yazamaz. */
const EXTRA = new Map();
export function registerCommand(name, help, fn) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9_]{0,24}$/.test(name) || typeof fn !== 'function') return false;
  if (Object.prototype.hasOwnProperty.call(COMMAND_HELP, name)) return false;
  EXTRA.set(name, { help: String(help || name), fn });
  return true;
}

const TIME_NAMES = {
  şafak: 0.02, safak: 0.02, sabah: 0.08, gündüz: 0.22, gunduz: 0.22, öğle: 0.25, ogle: 0.25, 'gün batımı': 0.5, 'gun batimi': 0.5, aksam: 0.52, akşam: 0.52, gece: 0.75,
};

const ok = (message, data) => ({ ok: true, message, data });
const err = (message) => ({ ok: false, message });

/** 'a b "c d"' → ['a','b','c d'] */
export function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m = re.exec(line);
  while (m !== null) {
    out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
    m = re.exec(line);
  }
  return out;
}

export function parseCommandLine(line) {
  if (typeof line !== 'string') return null;
  const t = tokenize(line.trim().replace(/^\//, ''));
  if (t.length === 0) return null;
  return { name: t[0].toLowerCase(), args: t.slice(1) };
}

function normalizeArgs(args) {
  if (args === undefined || args === null) return [];
  if (Array.isArray(args)) return args.map((a) => (typeof a === 'string' ? a : String(a)));
  if (typeof args === 'string') return tokenize(args.trim());
  if (typeof args === 'number' || typeof args === 'boolean') return [String(args)];
  if (typeof args === 'object') {
    if (Array.isArray(args.args)) return normalizeArgs(args.args);
    return Object.keys(args).map((k) => String(args[k]));
  }
  return [];
}

export function commandsEnabled(G, env) {
  if (G.debug === true || (G.opts && G.opts.debug === true)) return true;
  let dev = false;
  try {
    const e = env !== undefined ? env : (typeof import.meta !== 'undefined' ? import.meta.env : null);
    dev = !!(e && e.DEV);
  } catch {
    dev = false;
  }
  return dev;
}

/** '~', '~3', '12.5' → sayı | NaN */
export function coord(tok, base) {
  if (typeof tok !== 'string' || tok === '') return NaN;
  if (tok.charAt(0) === '~') {
    if (tok.length === 1) return base;
    const n = Number(tok.slice(1));
    return Number.isFinite(n) ? base + n : NaN;
  }
  const n = Number(tok);
  return Number.isFinite(n) ? n : NaN;
}

function flag(tok, cur) {
  if (tok === undefined) return !cur;
  const t = String(tok).toLowerCase();
  if (t === 'on' || t === '1' || t === 'true' || t === 'aç' || t === 'ac') return true;
  if (t === 'off' || t === '0' || t === 'false' || t === 'kapat') return false;
  return !cur;
}

function resolveItem(arg) {
  let it = itemByKey(arg);
  if (it) return it;
  const f = foldTr(arg);
  it = itemByKey('item:' + f) || itemByKey('blok:' + f);
  if (it) return it;
  const blk = blockByKey(arg) || blockByKey(f);
  if (blk && blk.id >= 1) {
    const k = blockItemKey(blk.id);
    if (k) return itemByKey(k);
  }
  for (let i = 0; i < ITEM_LIST.length; i++) {
    if (foldTr(ITEM_LIST[i].name) === f) return ITEM_LIST[i];
  }
  return null;
}

function cheats(G) {
  if (!G.cheats) G.cheats = { god: false, fly: false };
  return G.cheats;
}

function ensureFlyAccessor(G) {
  const desc = Object.getOwnPropertyDescriptor(G.abilities, 'fly');
  if (desc && typeof desc.get === 'function') return;
  Object.defineProperty(G.abilities, 'fly', {
    enumerable: true,
    configurable: true,
    get: () => G.mode === 'insa' || cheats(G).fly === true,
    set: () => {},
  });
}

function frontPoint(G, dist) {
  const b = G.body;
  const x = b.x - Math.sin(G.player.yaw) * dist;
  const z = b.z - Math.cos(G.player.yaw) * dist;
  return { x, z };
}

function surfaceAt(G, x, z) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const cx = bx >> 4;
  const cz = bz >> 4;
  if (!G.world.hasChunk(cx, cz)) {
    if (!G.world.canGenerate(cx, cz)) return -1;
    G.world.ensureChunk(cx, cz);
  }
  return G.world.surfaceY(bx, bz, { ignoreFoliage: true });
}

const HANDLERS = {
  tp(G, a) {
    const b = G.body;
    const sub = a[0] ? a[0].toLowerCase() : '';
    let x;
    let y;
    let z;
    if (sub === 'spawn') {
      x = G.spawn.x; y = G.spawn.y; z = G.spawn.z;
    } else if (sub === 'zone') {
      const n = Math.floor(Number(a[1]));
      if (!(n >= 0 && n < ZONE_COUNT)) return err('Bölge numarası 0-' + (ZONE_COUNT - 1) + ' olmalı.');
      if (G.mode === 'macera' && !G.progression.zonesUnlocked[n]) return err(ZONES[n].name + ' henüz kilitli (unlockzone ile aç).');
      const r = n === 0 ? 24 : (ZONES[n].rIn + ZONES[n].rOut) / 2;
      x = r; z = 0; y = NaN;
    } else if (sub === 'structure') {
      const s = nearestStructure(G.seed, b.x, b.z, a[1] ? { type: a[1] } : {});
      if (!s) return err('Yakında yapı bulunamadı.');
      if (G.mode === 'macera' && !G.progression.zonesUnlocked[s.zone]) return err('En yakın yapı kilitli bölgede (' + ZONES[s.zone].name + ').');
      x = s.x; z = s.z; y = s.y;
    } else if (a.length >= 3) {
      x = coord(a[0], b.x); y = coord(a[1], b.y); z = coord(a[2], b.z);
    } else if (a.length === 2) {
      x = coord(a[0], b.x); z = coord(a[1], b.z); y = NaN;
    } else return err('Kullanım: ' + COMMAND_HELP.tp);
    const explicitY = sub === '' && a.length >= 3;
    if (!Number.isFinite(x) || !Number.isFinite(z) || (explicitY && !Number.isFinite(y))) return err('Geçersiz koordinat.');
    if (!Number.isFinite(y)) {
      const top = surfaceAt(G, x, z);
      if (top < 0) return err('Orası henüz üretilemiyor (kilitli bölge ya da sınır dışı).');
      y = top + 2;
    }
    const cx = Math.floor(x) >> 4;
    const cz = Math.floor(z) >> 4;
    if (!G.world.hasChunk(cx, cz) && !G.world.canGenerate(cx, cz)) return err('Orası üretilemiyor (kilitli bölge ya da sınır dışı).');
    const t = G.teleport(x, y, z, { maxR: 24 });
    return ok('Işınlandı: ' + t.x.toFixed(1) + ', ' + t.y.toFixed(1) + ', ' + t.z.toFixed(1), t);
  },

  give(G, a) {
    if (!a[0]) return err('Kullanım: ' + COMMAND_HELP.give);
    const it = resolveItem(a[0]);
    if (!it) return err('Bilinmeyen eşya: ' + a[0]);
    const n = Math.max(1, Math.min(2304, Math.floor(Number(a[1] === undefined ? 1 : a[1])) || 1));
    const left = G.inventory.add(it.key, n);
    return ok(it.name + ' x' + (n - left) + (left > 0 ? ' (envanter dolu, ' + left + ' sığmadı)' : ''), { item: it.key, given: n - left, left });
  },

  time(G, a) {
    const v = (a.join(' ') || '').toLowerCase();
    if (v === 'freeze' || v === 'unfreeze') {
      G.clock.frozen = v === 'freeze';
      return ok(G.clock.frozen ? 'Saat durdu.' : 'Saat akıyor.');
    }
    let ph;
    if (Object.prototype.hasOwnProperty.call(TIME_NAMES, v)) ph = TIME_NAMES[v];
    else if (v !== '' && Number.isFinite(Number(v))) ph = Number(v);
    else return err('Kullanım: ' + COMMAND_HELP.time);
    setClockPhase(G.clock, ph);
    return ok('Saat ayarlandı (faz ' + (Math.round((((ph % 1) + 1) % 1) * 100) / 100) + ').', { phase: ph });
  },

  weather(G, a) {
    const k = (a[0] || '').toLowerCase();
    if (k === 'auto' || k === 'null' || k === 'off') {
      G._weatherForce = null;
      return ok('Hava kendi akışına döndü.');
    }
    if (k !== 'clear' && k !== 'rain' && k !== 'snow' && k !== 'storm') return err('Kullanım: ' + COMMAND_HELP.weather);
    const inten = k === 'storm' ? 0.95 : k === 'clear' ? 0 : 0.7;
    G._weatherForce = {
      kind: k === 'storm' ? 'rain' : k, intensity: inten, cover: k === 'clear' ? 0.12 : 0.55 + inten * 0.4,
    };
    return ok('Hava: ' + k);
  },

  godmode(G, a) {
    const c = cheats(G);
    c.god = flag(a[0], c.god);
    if (c.god) {
      G.survival.invuln = Math.max(G.survival.invuln, 1);
      G.survival.lastDamage = Infinity; // dokunulmazlık karesi "önceki hasardan büyük farkı geçirir": derin düşüş ölümüne karşı
      G.survival.hp = G.survival.maxHp;
    }
    return ok('Ölümsüzlük ' + (c.god ? 'açık' : 'kapalı') + '.', { on: c.god });
  },

  fly(G, a) {
    const c = cheats(G);
    ensureFlyAccessor(G);
    c.fly = flag(a[0], c.fly || G.body.flying);
    if (G.mode === 'insa') {
      G.body.flying = c.fly;
      c.fly = false;
    } else G.body.flying = c.fly;
    return ok('Uçuş ' + (G.body.flying ? 'açık' : 'kapalı') + '.', { on: G.body.flying });
  },

  heal(G) {
    const s = G.survival;
    s.hp = s.maxHp;
    s.hunger = s.maxHunger;
    s.saturation = 5;
    s.oxygen = s.maxOxygen;
    s.dead = false;
    return ok('Can, açlık ve oksijen doldu.');
  },

  mana(G, a) {
    if (!G.magic || !G.magic.state) return err('Büyü sistemi yok.');
    const st = G.magic.state;
    const n = a[0] === undefined || a[0] === 'full' ? st.maxMana : Number(a[0]);
    if (!Number.isFinite(n)) return err('Kullanım: ' + COMMAND_HELP.mana);
    st.mana = Math.max(0, Math.min(st.maxMana, n));
    st.cooldowns = {};
    return ok('Mana ' + Math.floor(st.mana) + '/' + st.maxMana + '.');
  },

  charge(G) {
    if (!G.inventory) return err('Envanter yok.');
    const used = chargeInventory(G.inventory, 1e6);
    return ok('Şarjlı eşyalar dolduruldu (' + Math.round(used) + ' birim).', { used });
  },

  tech(G) {
    if (!G.tech) return err('Teknoloji sistemi yok.');
    const t = G.tech;
    const p = t.portals;
    const data = {
      machines: t.count(),
      networks: t.netInfo.map((n) => ({ nodes: n.nodes, gen: n.gen, demand: n.demand, supplied: n.supplied, stored: n.stored, cap: n.cap, live: n.live })),
      portals: { mavi: p.mavi ? [p.mavi.x, p.mavi.y, p.mavi.z] : null, turuncu: p.turuncu ? [p.turuncu.x, p.turuncu.y, p.turuncu.z] : null },
      pings: t.scanner.pings.length,
    };
    return ok(data.machines + ' makine, ' + data.networks.length + ' ağ.', data);
  },

  spawnmob(G, a) {
    if (!a[0]) return err('Kullanım: ' + COMMAND_HELP.spawnmob);
    const key = normalizeMobKey(a[0]);
    if (!key) return err('Bilinmeyen yaratık: ' + a[0]);
    if (!G.em) return err('Yaratık yöneticisi yok.');
    const n = Math.max(1, Math.min(12, Math.floor(Number(a[1] === undefined ? 1 : a[1])) || 1));
    const def = getMobType(key);
    let made = 0;
    for (let i = 0; i < n; i++) {
      const p = frontPoint(G, 4 + (i % 4) * 0.8);
      const top = surfaceAt(G, p.x + i * 0.3, p.z);
      const y = (top >= 0 ? top + 1 : G.body.y) + 0.05;
      const e = def && def.boss && typeof G.em.spawnBoss === 'function' ? G.em.spawnBoss(key, p.x + i * 0.3, y, p.z, {}) : G.em.spawn(key, p.x + i * 0.3, y, p.z, {});
      if (e) made++;
    }
    return made > 0 ? ok(made + ' × ' + (def ? def.name : key) + ' doğdu.', { key, count: made }) : err('Yaratık doğurulamadı (' + key + ').');
  },

  setblock(G, a) {
    if (a.length < 4) return err('Kullanım: ' + COMMAND_HELP.setblock);
    const b = G.body;
    const x = Math.floor(coord(a[0], b.x));
    const y = Math.floor(coord(a[1], b.y));
    const z = Math.floor(coord(a[2], b.z));
    if (![x, y, z].every(Number.isFinite)) return err('Geçersiz koordinat.');
    const tok = a.slice(3).join(' ').replace(/^blok:/, '');
    let id;
    if (/^\d+$/.test(tok)) id = Number(tok);
    else if (foldTr(tok) === 'hava' || foldTr(tok) === 'air') id = B.AIR;
    else {
      const blk = blockByKey(tok) || blockByKey(foldTr(tok));
      id = blk ? blk.id : -1;
    }
    if (!(id >= 0 && id <= MAX_BLOCK_ID)) return err('Bilinmeyen blok: ' + tok);
    const cx = x >> 4;
    const cz = z >> 4;
    if (!G.world.hasChunk(cx, cz) && G.world.canGenerate(cx, cz)) G.world.ensureChunk(cx, cz);
    const done = G.world.setBlock(x, y, z, id);
    return done ? ok('Blok yerleştirildi: ' + x + ',' + y + ',' + z + ' = ' + id, { x, y, z, id }) : err('Blok yazılamadı (değer aynı, sınır dışı ya da chunk yok).');
  },

  unlockzone(G, a) {
    if (G.mode !== 'macera') return err('Bölge kilitleri yalnızca macera modunda var.');
    const p = G.progression;
    let want = a[0] === undefined ? -1 : Math.floor(Number(a[0]));
    if (a[0] !== undefined && !(want >= 1 && want < ZONE_COUNT)) return err('Bölge numarası 1-' + (ZONE_COUNT - 1) + ' olmalı.');
    if (want < 0) {
      want = 1;
      while (want < ZONE_COUNT && p.zonesUnlocked[want]) want++;
      if (want >= ZONE_COUNT) return ok('Tüm bölgeler zaten açık.');
    }
    let opened = 0;
    for (let z = 0; z < want; z++) {
      if (p.zonesUnlocked[z + 1]) continue;
      const need = ZONE_RULES[z].required;
      for (let k = 0; k < need; k++) G.emit({ type: 'crystalPlaced', zone: z, id: 'cheat#' + z + '#' + k });
      if (p.zonesUnlocked[z + 1]) opened++;
    }
    return ok(opened > 0 ? opened + ' bölge açıldı.' : ZONES[want].name + ' zaten açık.', { opened });
  },

  solvepuzzle(G, a) {
    const pm = G.puzzles;
    if (!pm) return err('Bulmaca yöneticisi yok.');
    const b = G.body;
    const arg = a[0];
    const id = !arg || arg === 'nearest' ? pm.nearest(b.x, b.y, b.z, 64) : arg;
    if (!id || !pm.has(id)) return err('Bulmaca bulunamadı' + (arg && arg !== 'nearest' ? ': ' + arg : ' (yakında yok).'));
    if (pm.isSolved(id)) return ok('Zaten çözülmüş: ' + id, { id });
    if (typeof G.solvePuzzle === 'function') {
      const r = G.solvePuzzle(id);
      return r === false ? err('Çözülemedi: ' + id) : ok('Çözüldü: ' + id, { id });
    }
    const entry = pm._entries && pm._entries.get(id);
    if (!entry || typeof pm._markSolved !== 'function') return err('Bu sürümde zorla çözme desteklenmiyor.');
    pm._markSolved(entry);
    return ok('Çözülmüş işaretlendi: ' + id, { id });
  },

  crystal(G, a) {
    if (G.mode !== 'macera') return err('Kristaller yalnızca macera modunda.');
    const zi = a[0] === undefined ? G.hud.zone.id : Math.floor(Number(a[0]));
    if (!(zi >= 0 && zi < ZONE_COUNT)) return err('Geçersiz bölge.');
    const n = Math.max(1, Math.min(12, Math.floor(Number(a[1] === undefined ? 1 : a[1])) || 1));
    const have = G.progression.crystals[zi].length;
    for (let i = 0; i < n; i++) G.emit({ type: 'crystalCollected', zone: zi, id: 'cheat#' + zi + '#' + (have + i) });
    return ok(ZONES[zi].name + ': ' + G.progression.crystals[zi].length + ' kristal.', { zone: zi, count: G.progression.crystals[zi].length });
  },

  ability(G, a) {
    if (!G.progression) return err('İlerleme yok.');
    const k = a[0];
    const list = k === 'all' ? ABILITY_LIST : ABILITY_LIST.filter((x) => foldTr(x) === foldTr(k || ''));
    if (list.length === 0) return err('Yetenek: ' + ABILITY_LIST.join(', ') + ', all');
    list.forEach((x) => G.grantAbility(x));
    return ok('Yetenek verildi: ' + list.join(', '), { abilities: list });
  },

  reveal(G, a) {
    if (!G.progression || typeof G.progression.revealAt !== 'function') return err('Harita açma yok.');
    const r = Math.max(8, Math.min(512, Math.floor(Number(a[0] === undefined ? 96 : a[0])) || 96));
    const n = G.progression.revealAt(G.body.x, G.body.z, r);
    return ok('Harita açıldı (' + r + ' blok, ' + n + ' hücre).', { cells: n });
  },

  seed(G) {
    return ok('Tohum: ' + G.seed + ' · Dünya Kodu: ' + G.worldCode, { seed: G.seed, worldCode: G.worldCode, seedInput: G.seedInput });
  },

  stats(G, _a, ctx) {
    const p = G.progression ? G.progression.summary() : {};
    const c = G.em && typeof G.em.counts === 'function' ? G.em.counts() : null;
    const data = {
      mode: G.mode,
      tick: G.time.tick,
      playTime: Math.round(G.time.playTime),
      pos: [G.body.x, G.body.y, G.body.z].map((v) => Math.round(v * 10) / 10),
      hp: G.survival.hp,
      zone: G.hud.zone,
      entities: c,
      puzzles: G.puzzles ? G.puzzles.size : 0,
      progression: p,
      save: ctx && ctx.saver ? ctx.saver.stats : null,
      cheats: G.cheats || null,
    };
    return ok('Özet hazır.', data);
  },

  save(G, _a, ctx) {
    if (!ctx || !ctx.saver) return err('Kayıt sistemi yok.');
    const r = ctx.saver.save('manual');
    return r ? ok('Kaydedildi (' + Math.round(r.bytes / 1024) + ' KB, ' + r.ms.toFixed(1) + ' ms).', { bytes: r.bytes, ms: r.ms }) : err('Bu modda kayıt yok.');
  },

  help() {
    const extra = Array.from(EXTRA.keys());
    return ok(COMMAND_NAMES.map((k) => COMMAND_HELP[k]).concat(extra.map((k) => EXTRA.get(k).help)).join('\n'), { commands: COMMAND_NAMES.concat(extra) });
  },
};

/**
 * Komutu çalıştırır. ctx: {saver, env}. Üretimde ({@link commandsEnabled} false) hiçbir şey yapmaz.
 * Hata yutulur → {ok:false, message}.
 */
export function runCommand(G, name, args, ctx) {
  if (!commandsEnabled(G, ctx && ctx.env)) return err('Hata ayıklama komutları bu derlemede kapalı.');
  let n = name;
  let a = args;
  if (typeof name === 'string' && (args === undefined || args === null) && /\s/.test(name.trim())) {
    const p = parseCommandLine(name);
    if (p) { n = p.name; a = p.args; }
  }
  if (typeof n !== 'string') return err('Komut adı gerekli.');
  n = n.trim().toLowerCase().replace(/^\//, '');
  const h = Object.prototype.hasOwnProperty.call(HANDLERS, n) ? HANDLERS[n] : EXTRA.has(n) ? EXTRA.get(n).fn : null;
  if (!h) return err('Bilinmeyen komut: ' + n + ' (help)');
  try {
    return h(G, normalizeArgs(a), ctx) || err('Komut sonuç vermedi.');
  } catch (e) {
    return err('Komut hatası: ' + ((e && e.message) || e));
  }
}
