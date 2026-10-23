/*
 * KEŞİF blok sistemi — kullanma (sağ tık / dokun-yerleştir / E-F): blok işlevleri ve eldeki eşyanın kullanımı.
 *
 *   dispatchUse(G,S) → 'puzzle' | 'prop' | 'block' | 'none'   ('prop': sim/props etkileşimi; en yakın kazanır, eşitlikte prop — propsInteract.js)
 *        sıra (addendum §D): ① puzzles.handleInteract({type:'use',x,y,z,item,playerId}) → ② blok işlevi (sandık, tezgah/ocak/örs,
 *        kapı, yatak, tabela, kitaplık, kol) → ③ 'none' (çağıran yerleştirmeye/eşya kullanımına geçer).
 *        İşlevli ama burada tüketilmeyen bloklar (sunak, mühür yuvası, rün, kilitli kapı …) ile işlevsiz bloklar için
 *        {type:'blockUse',x,y,z,id,item,handled:false} yayılır ('content' dinler, ele alırsa evt.handled = true → yerleştirme yapılmaz);
 *        tabela/kitaplık/kol da önce bu olayla sorulur, kimse ele almazsa yerel işlev çalışır. Çömelen oyuncu elinde yerleştirilebilir blok varsa blok işlevi atlanır (bulmaca hâlâ önce).
 *   applyHeldItem(G,S) → boolean       yiyecek (yeme başlar), zırh (giy), pusula, yetenek eşyası; tüketilmezse 'itemUse' yayar
 *   toggleDoor(G,S,x,y,z) → boolean  kapı/açık kapı + dikey yığındaki komşu kapılar birlikte; gövdeye çarpacaksa açılmaz/kapanmaz
 *   sleepInBed(G,S,x,y,z)                doğma noktasını ayarlar; geceyse ve yakında düşman yoksa sabaha atlar
 *   openChest(G,S,x,y,z,id)          G.chestPos + G.setUi('chest')
 *   openStation(G,S,x,y,z,kind)      G.setUi('crafting'); istasyon bu pozisyona sabitlenir (dört blok menzilini aşsa da sayılır)
 *   compassText(G) / signText(G,x,y,z)
 */
import { B, BLOCKS } from '../sim/blocks.js';
import { ITEMS } from '../sim/items.js';
import { clockPhase, isNight, skipToMorning } from '../sim/daynight.js';
import { getMobType } from '../sim/mobTypes.js';
import { hash3 } from '../sim/rng.js';
import { structuresInRegion } from '../sim/structures.js';
import {
  isReadOnly, overlapsMobs, overlapsPlayer, setHint,
} from './blocksCore.js';
import { openChestSlots, chestKey } from './blocksChest.js';
import { startEat } from './blocksEat.js';
import { propUse } from './propsInteract.js';

const DIRS = ['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı'];

const SHELF_LINES = Object.freeze([
  'Tozlu ciltler: "Mühürler yalnızca kristallerle açılır. Her tapınak bir kristal saklar."',
  'Eski bir günlük: "Kazma ne kadar iyiyse maden o kadar derinde bulunur."',
  'Yırtık bir sayfa: "Geceleri meşale taşı. Gölgeler ışıktan kaçar."',
  'Bir kitap: "Sandıklar yalnızca bir kez doldurulur; bulduğunu yanına al."',
  'Not defteri: "Bulmaca çözülmüyorsa sıfırla ve sakin kal; kapılar hep açılabilir."',
  'Harita parçası: "Gözcü kuleleri çevreyi gösterir; haritanı oradan aç."',
  'Eski bir tarif: "Ocak için kömür ya da odun lazım; ham madeni eritmeden alet yapılmaz."',
  'Kenarına çizilmiş bir şiir: "Kim keşfederse, herkes keşfeder."',
  'Eski bir not: "Büyü Masasının çevresine ne kadar kitaplık dizersen büyüler o kadar güçlü olur. Beş kitaplık ustalık demektir."',
]);

/** Pusula metni: başlangıç noktasının yönü ve uzaklığı. */
export function compassText(G) {
  const b = G.body;
  const sp = G.spawn || { x: 0, z: 0 };
  const dx = sp.x - b.x;
  const dz = sp.z - b.z;
  const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
  if (dist < 4) return 'Başlangıç noktasındasın.';
  let ang = Math.atan2(dx, -dz); // 0 = kuzey (−Z), + = doğu (+X)
  if (ang < 0) ang += Math.PI * 2;
  const dir = DIRS[Math.round(ang / (Math.PI / 4)) % 8];
  return 'Başlangıç noktası ' + dir + ' yönünde, yaklaşık ' + dist + ' blok uzakta.';
}

/** Tabela metni: yapı verisindeki ipucu; oyuncunun koyduğu boş tabela. */
export function signText(G, x, y, z) {
  if (G.mode === 'macera' && G.world) {
    try {
      const list = structuresInRegion(G.world.seed, x, z, x, z);
      for (let i = 0; i < list.length; i++) {
        const sg = list[i].signs || [];
        for (let k = 0; k < sg.length; k++) {
          if (sg[k].x === x && sg[k].y === y && sg[k].z === z) return sg[k].text;
        }
      }
    } catch {
      /* yapı sorgusu başarısız: boş tabela */
    }
  }
  return 'Tabelada hiçbir şey yazmıyor.';
}

function say(G, S, text, secs) {
  setHint(G, S, text, secs || 6);
  G.speak(text);
}

function swingUse(G) {
  if (G.viewModel && G.viewModel.swing) G.viewModel.swing('use');
}

export function openChest(G, S, x, y, z, id) {
  openChestSlots(G, x, y, z);
  const pos = { x, y, z };
  S.chestPos = pos;
  G.chestPos = pos;
  S.pos.x = x + 0.5; S.pos.y = y + 0.5; S.pos.z = z + 0.5;
  G.sound('chest_open', S.pos, { vol: 0.9 });
  swingUse(G);
  G.setUi('chest');
  G.emit({
    type: 'chestOpened', x, y, z, id, key: chestKey(x, y, z),
  });
  return true;
}

export function openStation(G, S, x, y, z, kind) {
  if (G.mode !== 'macera') {
    setHint(G, S, 'Üretim yalnızca macera modunda var.', 2.5);
    G.sound('ui_error', undefined, { vol: 0.4 });
    return true;
  }
  S.pinned = {
    x, y, z, kind,
  };
  swingUse(G);
  G.setUi('crafting');
  G.sound('ui_open', undefined, { vol: 0.6 });
  return true;
}

export function toggleDoor(G, S, x, y, z) {
  const world = G.world;
  const id = world.getBlock(x, y, z);
  if (id !== B.DOOR && id !== B.DOOR_OPEN) return false;
  const toOpen = id === B.DOOR;
  const next = toOpen ? B.DOOR_OPEN : B.DOOR;
  const cells = [y];
  for (let yy = y + 1; yy < y + 4; yy++) {
    const b = world.getBlock(x, yy, z);
    if (b !== B.DOOR && b !== B.DOOR_OPEN) break;
    cells.push(yy);
  }
  for (let yy = y - 1; yy > y - 4; yy--) {
    const b = world.getBlock(x, yy, z);
    if (b !== B.DOOR && b !== B.DOOR_OPEN) break;
    cells.push(yy);
  }
  for (let i = 0; i < cells.length; i++) {
    if (overlapsPlayer(G, x, cells[i], z, next) || overlapsMobs(G, x, cells[i], z, next)) {
      setHint(G, S, 'Kapının önünde biri var.', 1.8);
      G.sound('ui_error', undefined, { vol: 0.4 });
      return true;
    }
  }
  for (let i = 0; i < cells.length; i++) world.setBlock(x, cells[i], z, next);
  S.pos.x = x + 0.5; S.pos.y = y + 0.5; S.pos.z = z + 0.5;
  G.sound('door_open', S.pos, { vol: 0.9, pitch: toOpen ? 1 : 0.85 });
  swingUse(G);
  G.emit({
    type: 'doorToggled', x, y, z, open: toOpen,
  });
  return true;
}

function hostileNear(G, x, z) {
  if (!G.em || typeof G.em.queryMobs !== 'function') return false;
  const list = G.em.queryMobs(x, z, 14, (e) => {
    if (e.dead) return false;
    const t = getMobType(e.type);
    return !!t && !!t.hostile;
  });
  return list.length > 0;
}

export function sleepInBed(G, S, x, y, z) {
  swingUse(G);
  if (isReadOnly(G)) {
    say(G, S, 'Bu haritada yatak yalnızca süs.', 3);
    return true;
  }
  // Neon Meridyen (dims.neon.rules.beds = 'skipOnly'): yatak yalnız geceyi atlar; doğma noktası ana diyarındır, şehir koordinatı onu ezmez
  const city = G.dim === 'neon';
  const setNote = city ? '' : ' Doğma noktan bu yatağa ayarlandı.';
  if (!city) G.bedSpawn = { x: x + 0.5, y: y + 1, z: z + 0.5 };
  G.emit({ type: 'bedUsed', x, y, z });
  const night = !!G.clock && isNight(clockPhase(G.clock));
  if (!night) {
    say(G, S, 'Yalnızca geceleri uyuyabilirsin.' + setNote, 4);
    G.sound('ui_click', undefined, { vol: 0.5 });
    return true;
  }
  if (hostileNear(G, x + 0.5, z + 0.5)) {
    say(G, S, 'Yakınlarda yaratıklar var, şimdi uyuyamazsın.' + (city ? '' : ' Doğma noktan ayarlandı.'), 4);
    G.sound('ui_error', undefined, { vol: 0.4 });
    return true;
  }
  skipToMorning(G.clock);
  S.sleeping = true;
  say(G, S, 'İyi uykular! Sabah oldu;' + (city ? ' şehirde doğma noktan terminallerdir.' : ' doğma noktan bu yatağa ayarlandı.'), 4);
  G.sound('ui_open', undefined, { vol: 0.5 });
  G.haptic('light');
  G.emit({ type: 'slept', x, y, z });
  return true;
}

function toggleLever(G, S, x, y, z, id) {
  const next = id === B.LEVER ? B.LEVER_ON : B.LEVER;
  G.world.setBlock(x, y, z, next);
  S.pos.x = x + 0.5; S.pos.y = y + 0.5; S.pos.z = z + 0.5;
  G.sound('lever', S.pos, { vol: 0.9 });
  swingUse(G);
  G.emit({
    type: 'leverToggled', x, y, z, on: next === B.LEVER_ON,
  });
  return true;
}

/** 'content' sistemi (sunak, kristal, tabela, mühür…) blockUse'u dinler ve evt.handled = true işaretler. */
function emitUse(G, x, y, z, id, item) {
  const ev = {
    type: 'blockUse', x, y, z, id, item, handled: false,
  };
  G.emit(ev);
  return ev.handled === true;
}

function heldPlaces(G) {
  const key = G.inventory ? G.inventory.heldItem() : null;
  const it = key ? ITEMS[key] : null;
  return !!(it && it.placesBlock);
}

function heldIsStaff(G) {
  const key = G.inventory ? G.inventory.heldItem() : null;
  const it = key ? ITEMS[key] : null;
  return !!(it && it.magic && it.magic.staff);
}

export function dispatchUse(G, S) {
  if (!S.has) return propUse(G, S);
  const t = S.target;
  const x = t.x;
  const y = t.y;
  const z = t.z;
  const id = t.id;
  const inv = G.inventory;
  const heldKey = inv ? inv.heldItem() : null;
  if (G.puzzles && typeof G.puzzles.handleInteract === 'function') {
    const handled = G.puzzles.handleInteract({
      type: 'use', x, y, z, item: heldKey || undefined, playerId: 'player',
    });
    if (handled) {
      swingUse(G);
      return 'puzzle';
    }
  }
  if (G.props && propUse(G, S) === 'prop') return 'prop';
  const rec = BLOCKS[id];
  if (!rec) return 'none';
  // çömelince elindeki yerleştirilebilir blok / asa, hedefteki bloğun işlevinden önce gelir (blok koy / büyü yap)
  if (G.player.crouching && (heldPlaces(G) || heldIsStaff(G))) return 'none';
  const label = rec.interact;
  if (!label) return emitUse(G, x, y, z, id, heldKey) ? 'block' : 'none';
  if (label === 'levha' || label === 'kitaplık' || label === 'kol') {
    if (emitUse(G, x, y, z, id, heldKey)) return 'block';
  }
  switch (label) {
    case 'sandık':
    case 'ödül_sandığı':
      openChest(G, S, x, y, z, id);
      return 'block';
    case 'tezgah':
      openStation(G, S, x, y, z, 'tezgah');
      return 'block';
    case 'ocak':
      openStation(G, S, x, y, z, 'ocak');
      return 'block';
    case 'örs':
      openStation(G, S, x, y, z, 'örs');
      return 'block';
    case 'kesici':
      openStation(G, S, x, y, z, 'kesici');
      return 'block';
    case 'dokuma':
      openStation(G, S, x, y, z, 'dokuma');
      return 'block';
    case 'laboratuvar':
      openStation(G, S, x, y, z, 'laboratuvar');
      return 'block';
    case 'kapı_aç':
    case 'kapı_kapat':
      toggleDoor(G, S, x, y, z);
      return 'block';
    case 'yatak':
      sleepInBed(G, S, x, y, z);
      return 'block';
    case 'levha':
      swingUse(G);
      say(G, S, signText(G, x, y, z), 8);
      return 'block';
    case 'kitaplık': {
      swingUse(G);
      const h = hash3(x, y, z, G.world.seed | 0) >>> 0;
      say(G, S, SHELF_LINES[h % SHELF_LINES.length], 8);
      return 'block';
    }
    case 'kol':
      toggleLever(G, S, x, y, z, id);
      return 'block';
    default:
      emitUse(G, x, y, z, id, heldKey);
      return 'block';
  }
}

export function applyHeldItem(G, S) {
  const inv = G.inventory;
  const key = inv ? inv.heldItem() : null;
  if (!key) return false;
  const it = ITEMS[key];
  if (!it) return false;
  // büyü sistemi (asa → büyü, iksir → içme, mana kristali): ele alındıysa yiyecek/zırh akışına geçilmez
  if (typeof G.magicUse === 'function' && G.magicUse(key, S.eat)) return true;
  // teknoloji (tarayıcı: tara, jetpack: yakıt yükle); tüketilmezse (kuantum zırhı, aletler) normal akış sürer
  if (typeof G.techUse === 'function' && G.techUse(key)) return true;
  if (it.food) return startEat(G, S);
  if (it.armor) {
    const worn = inv.equip(inv.selected);
    if (worn) {
      G.sound('place:metal', undefined, { vol: 0.6 });
      swingUse(G);
      G.emit({ type: 'armorEquipped', item: key });
      return true;
    }
    return false;
  }
  if (key === 'item:pusula') {
    say(G, S, compassText(G), 5);
    swingUse(G);
    return true;
  }
  if (it.ability) {
    if (G.mode === 'macera' && !G.abilities[it.ability] && typeof G.grantAbility === 'function') {
      G.grantAbility(it.ability);
      say(G, S, 'Yeni yetenek kazandın: ' + it.name + '.', 5);
    } else {
      say(G, S, it.desc || it.name, 4);
    }
    swingUse(G);
    return true;
  }
  G.emit({ type: 'itemUse', item: key });
  return false;
}
