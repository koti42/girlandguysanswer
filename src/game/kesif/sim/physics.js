/*
 * KEŞİF sim — fizik ve oyuncu hareketi (saf; DOM/three yok, worker-güvenli, belirlenimci).
 *
 * İki katman:
 *  1) moveBox(world, aabb, vel, dt, opts)  GENEL çarpışma süpürmesi (mob, düşen eşya, mermi, oyuncu). Eksen ayrımlı
 *     (önce Y, sonra büyük yatay eksen, sonra küçüğü), bloğun ÇARPIŞMA KUTULARINA karşı tam kesişim (slab/merdiven/çit/kapı),
 *     yüksek hızda bile tünelleme yok (süpürülen hacimdeki tüm hücreler taranır). Sıcak yol ayırma yapmaz
 *     (modül düzeyinde çalışma tamponları; dönen nesne YENİDEN KULLANILIR — hemen oku ya da opts.out ver).
 *  2) stepPlayer(body, input, world, dt, abilities, settings)  tam oyuncu modeli: yürü/koş/çömel (kenardan düşmez)/zıpla
 *     (coyote + zıplama tamponu)/otomatik basamak/yüzme/tırmanma/uçma/buz/zıplama bloğu/çift zıplama/planör/kanca/geri tepme/
 *     düşme hasarı. Sabit 60 Hz için tasarlandı; uzun dt eşit alt adımlara bölünür.
 *
 * Koordinatlar: x,z yatay (blok), y yukarı; AABB ayak merkezi (x,y,z) ve (w,h). Dünya: getBlock(x,y,z) → kimlik | null
 * (null = henüz üretilmedi → oyuncu için DUVAR sayılır, kimse boşluğa düşmez).
 * Bakış: yaw=0 → -Z'ye bakar (three kamerası), yaw artınca sola döner. ileri = (-sin yaw, -cos yaw), sağ = (cos yaw, -sin yaw).
 * input: {moveX(sağ+), moveZ(ileri+), yaw, jump(basılı), jumpPressed?, sprint, crouch, glide, toggleFly(tek seferlik),
 *         grapple:{x,y,z}|null (kanca at isteği), grappleRelease}
 * abilities: {doubleJump, glide, grapple, fly}   settings: {mode:'macera'|'insa'|'harita', autoJump, mods?}
 * settings.mods: magicMods nesnesi — speedMul (yürüme/koşma), jumpMul (zıplama hızı) ve jetpack için thrust/thrustVy okunur; yoksa kimlik.
 * Jetpack (techMods): mods.thrust > 0 iken havada zıplama tuşu basılı tutulursa yukarı itiş (net ivme thrust − yerçekimi, azami
 * yükselme hızı thrustVy); body.thrusting/body.thrustT (itiş süresi, sn) güncellenir — oyun katmanı thrustT'yi yakıta çevirip sıfırlar.
 */
import { BLOCKS } from './blocks.js';
import { worldMaxY, worldMinY } from './constants.js';
import {
  CS, collBegin, collClip, collEnd, collOverlap, collPredict,
} from './props/colliderPhysics.js';

/* ------------------------------------------------------------------------------------------------
 * Sabitler
 * ---------------------------------------------------------------------------------------------- */
export const PLAYER = Object.freeze({
  width: 0.6, height: 1.8, crouchHeight: 1.5, eye: 1.62, crouchEye: 1.32,
  walk: 4.3, sprint: 5.6, crouch: 1.3, swim: 2.4, swimSprint: 3.4, lava: 1.0,
  climb: 2.6, climbHoriz: 1.8, fly: 7.5, flySprint: 14, flyVertical: 6.5,
  gravity: 30, jumpHeight: 1.25,
  jumpSpeed: Math.sqrt(2 * 30 * 1.25), // ≈ 8,66 b/s → tepe ≈ 1,25 blok
  doubleJumpSpeed: 7.8, terminal: 55, glideFall: 2.2, glideSpeed: 9, step: 0.6,
  coyote: 0.12, jumpBuffer: 0.12, flyDoubleTap: 0.3, fallSafe: 3, voidY: -24,
  grappleRange: 28, grappleSpeed: 26,
});

/** Jetpack itişi bu dikey hızın altındayken (zıplamanın tepe noktası civarı) başlar. */
const THRUST_ENGAGE_VY = 3;
const EPS = 1e-7;
const GROUND_PROBE = 0.002;
const MAX_SUBSTEP = 1 / 30;
const MAX_MOVE = 96;
/** Bundan büyük |koordinat| anlamsızdır (dünya birkaç bin blok): hücre döngüleri Infinity/1e300'de hiç bitmezdi. */
const MAX_COORD = 1e7;
const KNOCK_TIME = 0.3;

const NO_BOXES = [];
const FULL_BOX = [0, 0, 0, 1, 1, 1];
const FULL_LIST = [FULL_BOX];
const NO_ABILITIES = Object.freeze({});
const NO_SETTINGS = Object.freeze({});
const EMPTY_OPTS = Object.freeze({});
const AJ = [1, 0, 0];
const AK = [2, 2, 1];

// Çalışma tamponları (kare başı ayırma yok).
const _a = new Float64Array(6);
const _p = new Float64Array(6);
const _n = new Float64Array(6);
const _cell = [0, 0, 0];
let _clipped = false;
let _hx = false;
let _hz = false;

const RESULT = {
  onGround: false, hitX: false, hitY: false, hitZ: false, hitCeiling: false,
  inLiquid: false, headInLiquid: false, liquidId: 0, climbable: false, damage: 0,
  impactVy: 0, stepped: false,
};
const _box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const _vel = { x: 0, y: 0, z: 0 };
const _opts = {
  stepHeight: 0, stickToGround: false, collideLiquids: false, unloadedSolid: true, sneak: false,
  contactDamage: false, eyeHeight: undefined, out: null,
};

/* ------------------------------------------------------------------------------------------------
 * Hücre → çarpışma kutuları
 * ---------------------------------------------------------------------------------------------- */
function cellBoxes(world, x, y, z, su, cl) {
  if (y > worldMaxY(world)) return NO_BOXES; // tavan üstü hava; taban altını World karar verir (macera: ana kaya)
  const id = world.getBlock(x, y, z);
  if (id === null || id === undefined) return su ? FULL_LIST : NO_BOXES;
  if (id === 0) return NO_BOXES;
  const b = BLOCKS[id];
  if (!b) return NO_BOXES;
  if (b.liquid) return cl ? FULL_LIST : NO_BOXES;
  return b.collision;
}

/**
 * a kutusu d kadar `axis` ekseninde ilerlerse izin verilen mesafe. Kutuyu taşımaz; kısıtlandıysa _clipped=true.
 * Zaten iç içe geçen kutular yok sayılır (blok oyuncunun üstüne konursa sıkışmaz, dışarı çıkabilir).
 */
function clipAxis(world, a, axis, d, su, cl) {
  _clipped = false;
  if (d === 0) return 0;
  if (!saneBox(a)) return 0;
  const j = AJ[axis];
  const k = AK[axis];
  const lo = a[axis];
  const hi = a[axis + 3];
  let c0;
  let c1;
  if (d > 0) {
    c0 = Math.floor(hi - EPS);
    c1 = Math.floor(hi + d);
  } else {
    c0 = Math.floor(lo + d) - (axis === 1 ? 1 : 0);
    c1 = Math.floor(lo + EPS);
  }
  // Çit gibi 1'den yüksek kutular alt hücrede durur: Y aralığı bir hücre aşağı genişletilir.
  const j0 = Math.floor(a[j] + EPS) - (j === 1 ? 1 : 0);
  const j1 = Math.floor(a[j + 3] - EPS);
  const k0 = Math.floor(a[k] + EPS) - (k === 1 ? 1 : 0);
  const k1 = Math.floor(a[k + 3] - EPS);
  const aj0 = a[j];
  const aj1 = a[j + 3];
  const ak0 = a[k];
  const ak1 = a[k + 3];
  for (let cj = j0; cj <= j1; cj++) {
    for (let ck = k0; ck <= k1; ck++) {
      for (let c = c0; c <= c1; c++) {
        _cell[axis] = c;
        _cell[j] = cj;
        _cell[k] = ck;
        const boxes = cellBoxes(world, _cell[0], _cell[1], _cell[2], su, cl);
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (!(aj0 < cj + b[j + 3] - EPS && aj1 > cj + b[j] + EPS)) continue;
          if (!(ak0 < ck + b[k + 3] - EPS && ak1 > ck + b[k] + EPS)) continue;
          if (d > 0) {
            const bmin = c + b[axis];
            if (bmin >= hi - EPS) {
              let g = bmin - hi;
              if (g < 0) g = 0;
              if (g < d) {
                d = g;
                _clipped = true;
              }
            }
          } else {
            const bmax = c + b[axis + 3];
            if (bmax <= lo + EPS) {
              let g = bmax - lo;
              if (g > 0) g = 0;
              if (g > d) {
                d = g;
                _clipped = true;
              }
            }
          }
        }
      }
    }
  }
  if (CS.n > 0) {
    const r = collClip(a, axis, d); // voxel dışı çarpışma kutuları (world.colliders; prop/kapı/kabin)
    if (r !== d) {
      d = r;
      _clipped = true;
    }
  }
  return d;
}

/** Kutu koordinatları sonlu ve makul mü? (NaN/Infinity → false; hücre döngülerini sonsuz döngüden korur) */
function saneBox(a) {
  for (let i = 0; i < 6; i++) {
    const v = a[i];
    if (!(v > -MAX_COORD && v < MAX_COORD)) return false;
  }
  return true;
}

function moveAxis(world, a, axis, d, su, cl) {
  const r = clipAxis(world, a, axis, d, su, cl);
  a[axis] += r;
  a[axis + 3] += r;
  return r;
}

/** a kutusu (ox,oy,oz kaymasıyla) herhangi bir çarpışma kutusuyla iç içe mi? */
function overlapsSolid(world, a, ox, oy, oz, su, cl) {
  if (!saneBox(a) || !(Math.abs(ox) < MAX_COORD && Math.abs(oy) < MAX_COORD && Math.abs(oz) < MAX_COORD)) return true;
  const n0 = a[0] + ox;
  const n1 = a[1] + oy;
  const n2 = a[2] + oz;
  const n3 = a[3] + ox;
  const n4 = a[4] + oy;
  const n5 = a[5] + oz;
  const x1 = Math.floor(n3 - EPS);
  const y1 = Math.floor(n4 - EPS);
  const z1 = Math.floor(n5 - EPS);
  for (let x = Math.floor(n0 + EPS); x <= x1; x++) {
    for (let y = Math.floor(n1 + EPS) - 1; y <= y1; y++) {
      for (let z = Math.floor(n2 + EPS); z <= z1; z++) {
        const boxes = cellBoxes(world, x, y, z, su, cl);
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (n0 < x + b[3] - EPS && n3 > x + b[0] + EPS
            && n1 < y + b[4] - EPS && n4 > y + b[1] + EPS
            && n2 < z + b[5] - EPS && n5 > z + b[2] + EPS) return true;
        }
      }
    }
  }
  if ((CS.on || world.colliders) && collOverlap(world, n0, n1, n2, n3, n4, n5)) return true;
  return false;
}

/** Kutu hiçbir katı ile kesişmiyor mu? (ayakta durma, yerleştirme, doğma kontrolü) */
export function isBoxFree(world, minX, minY, minZ, maxX, maxY, maxZ, opts) {
  const o = opts || EMPTY_OPTS;
  _n[0] = minX; _n[1] = minY; _n[2] = minZ; _n[3] = maxX; _n[4] = maxY; _n[5] = maxZ;
  return !overlapsSolid(world, _n, 0, 0, 0, o.unloadedSolid !== false, !!o.collideLiquids);
}

/** Yatay hareket: büyük eksen önce. a taşınır; _hx/_hz ayarlanır. */
function horizontal(world, a, dx, dz, su, cl) {
  _hx = false;
  _hz = false;
  if (Math.abs(dx) >= Math.abs(dz)) {
    if (dx !== 0) {
      moveAxis(world, a, 0, dx, su, cl);
      _hx = _clipped;
    }
    if (dz !== 0) {
      moveAxis(world, a, 2, dz, su, cl);
      _hz = _clipped;
    }
  } else {
    moveAxis(world, a, 2, dz, su, cl);
    _hz = _clipped;
    if (dx !== 0) {
      moveAxis(world, a, 0, dx, su, cl);
      _hx = _clipped;
    }
  }
}

function clampMove(v) {
  if (!(v === v)) return 0; // NaN
  return v > MAX_MOVE ? MAX_MOVE : v < -MAX_MOVE ? -MAX_MOVE : v;
}

/** Ortam taraması: sıvı, tırmanılabilir, temas hasarı, kafa sıvıda mı. */
function scanEnv(world, a, o, res) {
  res.inLiquid = false;
  res.liquidId = 0;
  res.climbable = false;
  res.damage = 0;
  const x1 = Math.floor(a[3] - EPS);
  const y1 = Math.floor(a[4] - EPS);
  const z1 = Math.floor(a[5] - EPS);
  const wMin = worldMinY(world);
  const wMax = worldMaxY(world);
  for (let x = Math.floor(a[0] + EPS); x <= x1; x++) {
    for (let z = Math.floor(a[2] + EPS); z <= z1; z++) {
      for (let y = Math.floor(a[1] + EPS); y <= y1; y++) {
        if (y < wMin || y > wMax) continue;
        const id = world.getBlock(x, y, z);
        if (!id) continue;
        const b = BLOCKS[id];
        if (!b) continue;
        if (b.liquid) {
          res.inLiquid = true;
          if (b.damage > 0 || res.liquidId === 0) res.liquidId = id;
          if (b.damage > res.damage) res.damage = b.damage;
        }
        if (b.climbable) res.climbable = true;
      }
    }
  }
  const eyeOff = o.eyeHeight !== undefined ? o.eyeHeight : (a[4] - a[1]) * 0.9;
  const hy = Math.floor(a[1] + eyeOff);
  res.headInLiquid = false;
  if (hy >= wMin && hy <= wMax) {
    const hid = world.getBlock(Math.floor((a[0] + a[3]) * 0.5), hy, Math.floor((a[2] + a[5]) * 0.5));
    if (hid) {
      const hb = BLOCKS[hid];
      if (hb && hb.liquid) res.headInLiquid = true;
    }
  }
  if (o.contactDamage) {
    const m = 0.05;
    const cx1 = Math.floor(a[3] + m);
    const cy1 = Math.floor(a[4]);
    const cz1 = Math.floor(a[5] + m);
    for (let x = Math.floor(a[0] - m); x <= cx1; x++) {
      for (let z = Math.floor(a[2] - m); z <= cz1; z++) {
        for (let y = Math.floor(a[1]); y <= cy1; y++) {
          if (y < wMin || y > wMax) continue;
          const id = world.getBlock(x, y, z);
          if (!id) continue;
          const b = BLOCKS[id];
          if (!b || b.liquid || !(b.damage > 0)) continue;
          const bs = b.collision;
          for (let i = 0; i < bs.length; i++) {
            const c = bs[i];
            if (a[0] - m < x + c[3] && a[3] + m > x + c[0]
              && a[1] < y + c[4] && a[4] > y + c[1]
              && a[2] - m < z + c[5] && a[5] + m > z + c[2]) {
              if (b.damage > res.damage) res.damage = b.damage;
            }
          }
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * GENEL: moveBox
 * ---------------------------------------------------------------------------------------------- */
/**
 * aabb {minX,minY,minZ,maxX,maxY,maxZ} vel {x,y,z} (b/s) ile dt süresince hareket ettirilir (ikisi de YERİNDE değişir:
 * kutu taşınır, çarpılan eksenin hızı sıfırlanır).
 * opts: {stepHeight=0 (yalnız zemindeyken yürürken basamak çıkar), stickToGround=false (küçük inişlerde zemine yapışır),
 *        collideLiquids=false, unloadedSolid=true (null blok = katı), sneak=false (kenardan düşmez), sneakDrop=0.6,
 *        contactDamage=false (kaktüs vb. temas hasarı), eyeHeight (kafa sıvı testi, minY'den), out (sonuç nesnesi)}
 * → {onGround, hitX, hitY, hitZ, hitCeiling, inLiquid, headInLiquid, liquidId, climbable, damage, impactVy, stepped}
 *   Dönen nesne paylaşılan tampondur (opts.out vermezsen sonraki çağrıda ezilir).
 */
export function moveBox(world, aabb, vel, dt, opts) {
  const o = opts || EMPTY_OPTS;
  const su = o.unloadedSolid !== false;
  const cl = !!o.collideLiquids;
  const stepH = o.stepHeight > 0 ? o.stepHeight : 0;
  const res = o.out || RESULT;
  const a = _a;
  a[0] = aabb.minX; a[1] = aabb.minY; a[2] = aabb.minZ;
  a[3] = aabb.maxX; a[4] = aabb.maxY; a[5] = aabb.maxZ;
  if (!saneBox(a)) {
    // NaN/Infinity konum: hareket ettirmeden dön (çağıran bodyIsFinite ile kurtarır); aksi halde hücre döngüleri sonsuza kadar sürerdi.
    vel.x = 0; vel.y = 0; vel.z = 0;
    res.onGround = false; res.hitX = false; res.hitY = false; res.hitZ = false; res.hitCeiling = false;
    res.impactVy = 0; res.stepped = false; res.inLiquid = false; res.headInLiquid = false; res.liquidId = 0;
    res.climbable = false; res.damage = 0;
    return res;
  }
  let dx = clampMove(vel.x * dt);
  const dy = clampMove(vel.y * dt);
  let dz = clampMove(vel.z * dt);
  const cc = world.colliders;
  if (cc) collBegin(cc, a, dx, dy, dz, stepH, o.sneakDrop, dt);

  // Zeminde miydi? (basamak/yapışma/kenar koruması için; yukarı çıkıyorsa değil)
  clipAxis(world, a, 1, -GROUND_PROBE, su, cl);
  const grounded0 = _clipped && vel.y <= 1e-9;
  if (CS.n > 0 && collPredict(a, dt, grounded0)) {
    // platform taşıma: ayağın altındaki dinamik kutunun adım ötelemesi (önce Y, sonra X/Z)
    a[1] += CS.vy;
    a[4] += CS.vy;
    moveAxis(world, a, 0, CS.vx, su, cl);
    moveAxis(world, a, 2, CS.vz, su, cl);
  }

  let hitY = false;
  let hitCeiling = false;
  let onGround = false;
  let impact = 0;
  if (dy !== 0) {
    moveAxis(world, a, 1, dy, su, cl);
    hitY = _clipped;
    if (hitY) {
      if (dy < 0) {
        onGround = true;
        impact = -vel.y;
      } else {
        hitCeiling = true;
      }
      vel.y = 0;
    }
  } else if (grounded0) {
    onGround = true;
  }

  // Kenar koruması (çömelme): zeminin ucundan düşecek hareketi kısalt.
  if (o.sneak && onGround) {
    const drop = o.sneakDrop > 0 ? o.sneakDrop : 0.6;
    while (dx !== 0 && !overlapsSolid(world, a, dx, -drop, 0, su, cl)) {
      dx = Math.abs(dx) <= 0.05 ? 0 : dx - 0.05 * (dx > 0 ? 1 : -1);
    }
    while (dz !== 0 && !overlapsSolid(world, a, 0, -drop, dz, su, cl)) {
      dz = Math.abs(dz) <= 0.05 ? 0 : dz - 0.05 * (dz > 0 ? 1 : -1);
    }
    while (dx !== 0 && dz !== 0 && !overlapsSolid(world, a, dx, -drop, dz, su, cl)) {
      dx = Math.abs(dx) <= 0.05 ? 0 : dx - 0.05 * (dx > 0 ? 1 : -1);
      dz = Math.abs(dz) <= 0.05 ? 0 : dz - 0.05 * (dz > 0 ? 1 : -1);
    }
  }

  // Yatay hareket
  for (let i = 0; i < 6; i++) _p[i] = a[i];
  horizontal(world, a, dx, dz, su, cl);
  let hitX = _hx;
  let hitZ = _hz;
  let stepped = false;

  // Otomatik basamak: yalnızca zemindeyken ve bir şeye çarpıldıysa.
  if (stepH > 0 && grounded0 && onGround && (hitX || hitZ)) {
    for (let i = 0; i < 6; i++) _n[i] = a[i];
    const nx = (_n[0] - _p[0]) * (_n[0] - _p[0]) + (_n[2] - _p[2]) * (_n[2] - _p[2]);
    const nhx = hitX;
    const nhz = hitZ;
    for (let i = 0; i < 6; i++) a[i] = _p[i];
    const up = moveAxis(world, a, 1, stepH, su, cl);
    horizontal(world, a, dx, dz, su, cl);
    const shx = _hx;
    const shz = _hz;
    moveAxis(world, a, 1, -up, su, cl);
    const landed = _clipped;
    const sx = (a[0] - _p[0]) * (a[0] - _p[0]) + (a[2] - _p[2]) * (a[2] - _p[2]);
    if (landed && sx > nx + 1e-9) {
      stepped = true;
      hitX = shx;
      hitZ = shz;
    } else {
      for (let i = 0; i < 6; i++) a[i] = _n[i];
      hitX = nhx;
      hitZ = nhz;
    }
  }
  if (hitX) vel.x = 0;
  if (hitZ) vel.z = 0;

  // Yatay hareketten sonra destek hâlâ var mı? (kenardan taşan gövde havada sayılır)
  if (onGround) {
    clipAxis(world, a, 1, -GROUND_PROBE, su, cl);
    if (!_clipped) onGround = false;
  }
  // Zemine yapışma: küçük inişlerde (merdiven/yamaç) havaya fırlama ve sekme yok.
  if (o.stickToGround && grounded0 && !onGround && !stepped && vel.y <= 1e-9) {
    const drop = stepH > 0 ? stepH : 0.6;
    const keep0 = a[1];
    const keep4 = a[4];
    moveAxis(world, a, 1, -drop, su, cl);
    if (_clipped) onGround = true;
    else {
      a[1] = keep0;
      a[4] = keep4;
    }
  }

  aabb.minX = a[0]; aabb.minY = a[1]; aabb.minZ = a[2];
  aabb.maxX = a[3]; aabb.maxY = a[4]; aabb.maxZ = a[5];
  res.onGround = onGround;
  res.hitX = hitX;
  res.hitY = hitY;
  res.hitZ = hitZ;
  res.hitCeiling = hitCeiling;
  res.impactVy = impact;
  res.stepped = stepped;
  scanEnv(world, a, o, res);
  if (cc) collEnd();
  return res;
}

/* ------------------------------------------------------------------------------------------------
 * Oyuncu gövdesi
 * ---------------------------------------------------------------------------------------------- */
export function createPlayerBody(x = 0, y = 0, z = 0) {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0,
    w: PLAYER.width, h: PLAYER.height, eyeH: PLAYER.eye,
    onGround: false, crouching: false, forcedCrouch: false, sprinting: false, swimming: false,
    inLiquid: false, headInLiquid: false, inLava: false, climbing: false, touchClimbable: false,
    flying: false, gliding: false, thrusting: false, thrustT: 0,
    hitX: false, hitY: false, hitZ: false,
    airJumps: 0, coyote: 0, jumpBuf: 0, sinceJumpPress: 10, prevJump: false,
    knockT: 0, fallPeakY: y, submergedTime: 0, contactDps: 0, groundId: 0,
    speed: 0, stepDist: 0, inVoid: false,
    grapple: { active: false, x: 0, y: 0, z: 0, t: 0, cd: 0, stuck: 0 },
    events: [],
  };
}

/** Işınlanma/doğuş: konumu koyar, hız ve düşme izini sıfırlar. */
export function resetBody(body, x, y, z) {
  body.x = x; body.y = y; body.z = z;
  body.vx = 0; body.vy = 0; body.vz = 0;
  body.onGround = false; body.flying = false; body.gliding = false; body.climbing = false; body.thrusting = false;
  body.airJumps = 0; body.coyote = 0; body.jumpBuf = 0; body.knockT = 0;
  body.fallPeakY = y; body.inVoid = false; body.submergedTime = 0; body.stepDist = 0;
  body.grapple.active = false; body.grapple.cd = 0; body.grapple.stuck = 0;
  if (body.crouching) {
    body.crouching = false;
    body.h = PLAYER.height;
  }
  body.events.length = 0;
  return body;
}

/** Gövde AABB'sini out nesnesine yazar. */
export function bodyAABB(body, out) {
  const o = out || {};
  const hw = body.w * 0.5;
  o.minX = body.x - hw; o.maxX = body.x + hw;
  o.minY = body.y; o.maxY = body.y + body.h;
  o.minZ = body.z - hw; o.maxZ = body.z + hw;
  return o;
}

/** Göz yüksekliği (ayağa göre, hedef değer; yumuşatılmışı body.eyeH). */
export function eyeHeight(body) {
  return body.crouching ? PLAYER.crouchEye : PLAYER.eye;
}

/** Bakış yönü birim vektörü (yaw, pitch) → out {x,y,z}. */
export function lookDir(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

/** Geri tepme: yatay yön (dirX,dirZ) normalleştirilir. */
export function applyKnockback(body, dirX, dirZ, strength, lift = 4.5) {
  const l = Math.sqrt(dirX * dirX + dirZ * dirZ);
  if (l > 1e-9) {
    body.vx = (dirX / l) * strength;
    body.vz = (dirZ / l) * strength;
  }
  if (lift > 0 && !body.flying) {
    if (body.vy < lift) body.vy = lift;
    body.onGround = false;
    body.coyote = 0;
  }
  body.knockT = KNOCK_TIME;
  if (body.grapple.active) endGrapple(body, 'knockback');
}

/** Ayağın altındaki blok kimliği (merkez, yoksa köşeler); havadaysa 0. */
export function groundBlockId(world, body) {
  const hw = body.w * 0.5 - 0.02;
  const y = Math.floor(body.y - 0.05);
  if (y < worldMinY(world) || y > worldMaxY(world)) return 0;
  let id = world.getBlock(Math.floor(body.x), y, Math.floor(body.z));
  if (id) return id;
  const cx = [-hw, hw, -hw, hw];
  const cz = [-hw, -hw, hw, hw];
  for (let i = 0; i < 4; i++) {
    id = world.getBlock(Math.floor(body.x + cx[i]), y, Math.floor(body.z + cz[i]));
    if (id) return id;
  }
  return 0;
}

/* ------------------------------------------------------------------------------------------------
 * stepPlayer
 * ---------------------------------------------------------------------------------------------- */
function approach2(body, tx, tz, accel, h) {
  const dx = tx - body.vx;
  const dz = tz - body.vz;
  const d = Math.sqrt(dx * dx + dz * dz);
  const m = accel * h;
  if (d <= m) {
    body.vx = tx;
    body.vz = tz;
  } else {
    const k = m / d;
    body.vx += dx * k;
    body.vz += dz * k;
  }
}
/**
 * Tırmanırken 1×1'lik sarmaşık bacasından geçebilmek için gövdeyi tırmanılan hücrenin merkezine nazikçe çeker
 * (yalnızca o eksende oyuncu girdisi yoksa; 0,6'lık gövde 1'lik boşlukta ±0,2'den fazla kayıkken takılıyordu).
 */
function centerOnClimbable(world, body, wx, wz) {
  const cx = Math.floor(body.x);
  const cz = Math.floor(body.z);
  const cy = Math.floor(body.y + 0.5);
  const id = world.getBlock(cx, cy, cz);
  if (!id || !BLOCKS[id] || !BLOCKS[id].climbable) return;
  const ox = cx + 0.5 - body.x;
  const oz = cz + 0.5 - body.z;
  if (Math.abs(wx) < 0.1 && Math.abs(ox) > 0.02) body.vx = Math.max(-1.2, Math.min(1.2, ox * 8));
  if (Math.abs(wz) < 0.1 && Math.abs(oz) > 0.02) body.vz = Math.max(-1.2, Math.min(1.2, oz * 8));
}
function approach1(v, target, m) {
  if (v < target) return v + m > target ? target : v + m;
  return v - m < target ? target : v - m;
}

function endGrapple(body, reason) {
  const g = body.grapple;
  g.active = false;
  g.cd = 0.5;
  g.stuck = 0;
  const sp = Math.sqrt(body.vx * body.vx + body.vy * body.vy + body.vz * body.vz);
  if (sp > 12) {
    const k = 12 / sp;
    body.vx *= k; body.vy *= k; body.vz *= k;
  }
  body.fallPeakY = body.y;
  body.events.push({ type: 'grappleEnd', reason });
}

function canStand(world, body) {
  const hw = body.w * 0.5;
  _n[0] = body.x - hw; _n[1] = body.y; _n[2] = body.z - hw;
  _n[3] = body.x + hw; _n[4] = body.y + PLAYER.height; _n[5] = body.z + hw;
  return !overlapsSolid(world, _n, 0, 0, 0, true, false);
}

function stepCore(body, input, world, h, ab, st, pressed, toggleFly, jumpHeld) {
  const ev = body.events;
  const mode = st.mode || 'macera';
  const canFly = mode === 'insa' || !!ab.fly;
  body.sinceJumpPress += h;
  if (body.coyote > 0) body.coyote -= h;
  if (body.jumpBuf > 0) body.jumpBuf -= h;
  if (body.knockT > 0) body.knockT -= h;

  /* --- uçma açma/kapama: çift dokunuş zıpla ya da düğme --- */
  let doToggle = false;
  if (pressed) {
    const gap = body.sinceJumpPress;
    body.sinceJumpPress = 0;
    if (canFly && gap < PLAYER.flyDoubleTap) {
      doToggle = true;
      pressed = false;
      body.sinceJumpPress = 10;
    }
  }
  if (toggleFly) doToggle = true;
  if (doToggle && canFly) {
    body.flying = !body.flying;
    body.jumpBuf = 0;
    body.fallPeakY = body.y;
    if (body.flying) body.gliding = false;
    ev.push({ type: 'fly', on: body.flying });
  }
  if (body.flying && !canFly) body.flying = false;

  /* --- duruş: çömelme / ayağa kalkma (düşük tavanda zorunlu çömelme) --- */
  const wantCrouch = !!input.crouch && !body.flying && !body.swimming;
  if (wantCrouch) {
    if (!body.crouching) {
      body.crouching = true;
      body.h = PLAYER.crouchHeight;
    }
    body.forcedCrouch = false;
  } else if (body.crouching) {
    if (canStand(world, body)) {
      body.crouching = false;
      body.h = PLAYER.height;
      body.forcedCrouch = false;
    } else {
      body.forcedCrouch = true;
    }
  }
  const eyeTarget = body.crouching ? PLAYER.crouchEye : PLAYER.eye;
  body.eyeH += (eyeTarget - body.eyeH) * Math.min(1, h * 14);

  /* --- istenen hareket (dünya uzayı) --- */
  let mx = +input.moveX || 0;
  let mz = +input.moveZ || 0;
  let ml = Math.sqrt(mx * mx + mz * mz);
  if (ml > 1) {
    mx /= ml; mz /= ml; ml = 1;
  }
  if (ml < 0.02) {
    mx = 0; mz = 0; ml = 0;
  }
  if (input.yaw !== undefined) body.yaw = input.yaw;
  const sy = Math.sin(body.yaw);
  const cy = Math.cos(body.yaw);
  const wx = cy * mx - sy * mz;
  const wz = -sy * mx - cy * mz;
  body.sprinting = !!input.sprint && mz > 0.1 && !body.crouching;

  const wasOnGround = body.onGround;
  const wasInLiquid = body.inLiquid;
  const liquid = body.inLiquid && !body.flying;
  const lava = body.inLava;
  const slipId = body.groundId;
  const slip = wasOnGround && slipId ? BLOCKS[slipId].slip : 0;

  const g = body.grapple;
  if (g.cd > 0) g.cd -= h;
  if (ab.grapple && input.grapple && !g.active && g.cd <= 0 && !body.flying) {
    const t = input.grapple;
    const ex = t.x - body.x;
    const ey = t.y - (body.y + body.h * 0.6);
    const ez = t.z - body.z;
    const dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (dist <= PLAYER.grappleRange && dist > 1.5) {
      g.active = true; g.x = t.x; g.y = t.y; g.z = t.z; g.t = 0; g.stuck = 0;
      ev.push({ type: 'grappleStart', x: t.x, y: t.y, z: t.z, dist });
    } else {
      g.cd = 0.25;
      ev.push({ type: 'grappleFail', reason: dist > PLAYER.grappleRange ? 'range' : 'near' });
    }
  }

  let newVy = body.vy;
  let gravityOn = false;
  let gliding = false;
  let climbing = false;
  let thrusting = false;
  let stepHeight = PLAYER.step;
  let state = 'normal';

  if (g.active) {
    state = 'grapple';
    stepHeight = 0;
    g.t += h;
    const ex = g.x - body.x;
    const ey = g.y - (body.y + body.h * 0.6);
    const ez = g.z - body.z;
    const dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (input.grappleRelease || g.t > 4 || dist < 1.5 || g.stuck > 0.3) {
      endGrapple(body, g.stuck > 0.3 ? 'stuck' : dist < 1.5 ? 'reached' : g.t > 4 ? 'timeout' : 'release');
      state = 'normal';
      g.active = false;
    } else if (pressed) {
      pressed = false;
      endGrapple(body, 'jump');
      if (body.vy < 7) body.vy = 7;
      newVy = body.vy;
      state = 'normal';
    } else {
      const sp = Math.min(PLAYER.grappleSpeed, 6 + g.t * 70);
      body.vx = (ex / dist) * sp;
      body.vy = (ey / dist) * sp;
      body.vz = (ez / dist) * sp;
      newVy = body.vy;
      body.fallPeakY = body.y;
      body.onGround = false;
    }
  }

  if (state === 'normal' && body.flying) {
    state = 'fly';
    stepHeight = 0;
    const sp = body.sprinting ? PLAYER.flySprint : PLAYER.fly;
    approach2(body, wx * sp, wz * sp, 40, h);
    const ty = (jumpHeld ? PLAYER.flyVertical : 0) - (input.crouch ? PLAYER.flyVertical : 0);
    body.vy = approach1(body.vy, ty, 50 * h);
    newVy = body.vy;
    body.fallPeakY = body.y;
    body.coyote = 0;
    body.jumpBuf = 0;
  } else if (state === 'normal' && liquid) {
    state = 'liquid';
    const sp = lava ? PLAYER.lava : body.sprinting ? PLAYER.swimSprint : PLAYER.swim;
    approach2(body, wx * sp, wz * sp, 16, h);
    let ty;
    if (jumpHeld) ty = lava ? 2.2 : 3.4;
    else if (input.crouch) ty = -3.2;
    else ty = lava ? -1.0 : body.headInLiquid ? 0.9 : 0;
    if (jumpHeld && (body.hitX || body.hitZ) && !body.headInLiquid) ty = Math.max(ty, lava ? 4.5 : 6.2);
    body.vy = approach1(body.vy, ty, 60 * h);
    newVy = body.vy;
    body.airJumps = 0;
    body.fallPeakY = body.y;
    body.coyote = 0;
    body.jumpBuf = 0;
    pressed = false;
  } else if (state === 'normal' && body.touchClimbable && !wasOnGround) {
    state = 'climb';
  } else if (state === 'normal' && body.touchClimbable
    && (jumpHeld || input.crouch || ((body.hitX || body.hitZ) && mz > 0.1))) {
    state = 'climb';
  }

  if (state === 'climb') {
    climbing = true;
    const up = jumpHeld || (mz > 0.1 && (body.hitX || body.hitZ));
    const ty = up ? PLAYER.climb : input.crouch ? 0 : -1.5;
    approach2(body, wx * PLAYER.climbHoriz, wz * PLAYER.climbHoriz, 20, h);
    centerOnClimbable(world, body, wx, wz);
    body.vy = approach1(body.vy, ty, 40 * h);
    newVy = body.vy;
    body.airJumps = 0;
    body.fallPeakY = body.y;
    body.coyote = 0;
    body.jumpBuf = 0;
    pressed = false;
  }

  if (state === 'normal') {
    /* --- yatay ivme: zemin / buz / hava --- */
    // settings.mods (magicMods): speedMul (Hız iksiri/büyüsü/çizme), jumpMul (Zıplama iksiri); verilmezse kimlik
    const mods = st.mods;
    const spdMul = mods && mods.speedMul > 0 ? mods.speedMul : 1;
    const jmpMul = mods && mods.jumpMul > 0 ? mods.jumpMul : 1;
    const base = (body.crouching ? PLAYER.crouch : body.sprinting ? PLAYER.sprint : PLAYER.walk) * spdMul;
    const knock = body.knockT > 0 ? 0.15 : 1;
    let accel;
    if (wasOnGround) {
      if (ml > 0) accel = slip > 0 ? 55 * Math.pow(3 / 55, slip) : 55;
      else accel = slip > 0 ? 60 * Math.pow(1.2 / 60, slip) : 60;
    } else {
      accel = ml > 0 ? 14 : 3;
    }
    approach2(body, wx * base, wz * base, accel * knock, h);

    /* --- zıplama: coyote + tampon + çift zıplama --- */
    if (jumpHeld && wasOnGround) body.jumpBuf = PLAYER.jumpBuffer;
    else if (pressed) body.jumpBuf = PLAYER.jumpBuffer;
    const canGround = wasOnGround || body.coyote > 0;
    if (body.jumpBuf > 0 && canGround) {
      body.vy = PLAYER.jumpSpeed * jmpMul;
      newVy = body.vy;
      body.onGround = false;
      body.coyote = 0;
      body.jumpBuf = 0;
      body.fallPeakY = body.y;
      ev.push({ type: 'jump', block: body.groundId });
    } else if (pressed && !canGround && ab.doubleJump && body.airJumps < 1) {
      body.vy = PLAYER.doubleJumpSpeed * jmpMul;
      newVy = body.vy;
      body.airJumps += 1;
      body.jumpBuf = 0;
      body.fallPeakY = body.y;
      ev.push({ type: 'doubleJump' });
    }

    /* --- planör: havada, düşerken, düğme/zıpla basılı --- */
    const exhausted = body.airJumps >= (ab.doubleJump ? 1 : 0);
    if (ab.glide && !wasOnGround && body.coyote <= 0 && body.vy < 0
      && (input.glide || (jumpHeld && !pressed && exhausted && body.vy < -1))) {
      gliding = true;
      const gx = -sy * PLAYER.glideSpeed + wx * 3;
      const gz = -cy * PLAYER.glideSpeed + wz * 3;
      approach2(body, gx, gz, 6, h);
    }
    gravityOn = true;
    newVy = body.vy - PLAYER.gravity * h;
    // jetpack: havada, zıplama basılı; itiş bir kez başladıysa sürer, başlangıçta tepe noktasına yakın (vy < THRUST_ENGAGE_VY) açılır
    const thrustA = mods && mods.thrust > 0 ? mods.thrust : 0;
    if (thrustA > 0 && jumpHeld && !wasOnGround && body.coyote <= 0 && !gliding && (body.thrusting || body.vy < THRUST_ENGAGE_VY)) {
      thrusting = true;
      const cap = mods.thrustVy > 0 ? mods.thrustVy : 7;
      const natural = newVy;
      newVy = natural + thrustA * h;
      if (newVy > cap) newVy = Math.max(cap, natural);
      body.fallPeakY = body.y;
      body.thrustT += h;
    }
    if (gliding) {
      if (newVy < -PLAYER.glideFall) newVy = approach1(body.vy, -PLAYER.glideFall, 40 * h);
      body.fallPeakY = body.y;
    } else if (newVy < -PLAYER.terminal) {
      newVy = -PLAYER.terminal;
    }
  }
  body.gliding = gliding;
  body.climbing = climbing;
  body.thrusting = thrusting;
  const moveVy = gravityOn ? (body.vy + newVy) * 0.5 : body.vy;

  /* --- süpürme --- */
  const hw = body.w * 0.5;
  _box.minX = body.x - hw; _box.maxX = body.x + hw;
  _box.minY = body.y; _box.maxY = body.y + body.h;
  _box.minZ = body.z - hw; _box.maxZ = body.z + hw;
  _vel.x = body.vx; _vel.y = moveVy; _vel.z = body.vz;
  _opts.stepHeight = stepHeight;
  _opts.stickToGround = state === 'normal' || state === 'climb';
  _opts.sneak = body.crouching && wasOnGround && state === 'normal' && body.vy <= 0;
  _opts.contactDamage = true;
  _opts.eyeHeight = body.crouching ? PLAYER.crouchEye : PLAYER.eye;
  const px = body.x;
  const pz = body.z;
  const r = moveBox(world, _box, _vel, h, _opts);
  body.x = (_box.minX + _box.maxX) * 0.5;
  body.y = _box.minY;
  body.z = (_box.minZ + _box.maxZ) * 0.5;
  body.vx = _vel.x;
  body.vz = _vel.z;
  body.vy = r.hitY ? 0 : (gravityOn ? newVy : _vel.y);
  body.hitX = r.hitX; body.hitY = r.hitY; body.hitZ = r.hitZ;
  body.onGround = r.onGround;
  body.inLiquid = r.inLiquid;
  body.headInLiquid = r.headInLiquid;
  body.inLava = r.liquidId > 0 && BLOCKS[r.liquidId].damage > 0;
  body.touchClimbable = r.climbable;
  body.contactDps = r.damage;
  body.swimming = r.inLiquid && (r.headInLiquid || !r.onGround);
  body.submergedTime = r.headInLiquid ? body.submergedTime + h : 0;
  const mvx = body.x - px;
  const mvz = body.z - pz;
  body.speed = Math.sqrt(mvx * mvx + mvz * mvz) / h;

  if (state === 'grapple' && g.active) {
    const want = Math.sqrt(_vel.x * _vel.x + _vel.z * _vel.z);
    const got = body.speed;
    if ((r.hitX || r.hitY || r.hitZ) && got < Math.max(0.5, want * 0.3)) g.stuck += h;
    else g.stuck = 0;
  }

  /* --- sıvıya giriş --- */
  if (r.inLiquid && !wasInLiquid) {
    ev.push({ type: 'splash', impact: Math.max(0, -newVy), lava: body.inLava });
  }

  /* --- iniş: düşme hasarı, zıplama bloğu --- */
  const gid = r.onGround ? groundBlockId(world, body) : 0;
  body.groundId = gid;
  if (r.onGround && !wasOnGround) {
    const impact = Math.max(0, -newVy, r.impactVy);
    const dist = body.fallPeakY - body.y;
    const gb = gid ? BLOCKS[gid] : null;
    if (!(gb && gb.bounce > 0 && !body.crouching)) {
      if (dist > PLAYER.fallSafe && mode !== 'insa' && !body.flying && !r.inLiquid) {
        ev.push({ type: 'fall', distance: dist, damage: Math.ceil(dist - PLAYER.fallSafe), block: gid });
      }
      if (impact > 4.5) ev.push({ type: 'land', impact, block: gid });
    }
    body.airJumps = 0;
    body.gliding = false;
  }
  if (r.onGround) {
    body.coyote = PLAYER.coyote;
    body.airJumps = 0;
    const gb = gid ? BLOCKS[gid] : null;
    if (gb && gb.bounce > 0 && !body.crouching && !body.flying) {
      const impact = Math.max(0, -newVy, r.impactVy);
      const v = Math.min(28, Math.max(PLAYER.jumpSpeed * gb.bounce * 0.75, impact * 0.8));
      body.vy = v;
      body.onGround = false;
      body.coyote = 0;
      body.groundId = 0;
      body.fallPeakY = body.y;
      ev.push({ type: 'bounce', power: v, block: gid });
    } else if (body.flying && input.crouch) {
      // uçarken çömelip yere inince uçma biter
      body.flying = false;
      ev.push({ type: 'fly', on: false });
    }
  }

  /* --- düşme izi: tepe noktası --- */
  if (body.onGround || body.inLiquid || body.climbing || body.flying || body.grapple.active || body.gliding) {
    body.fallPeakY = body.y;
  } else if (body.y > body.fallPeakY) {
    body.fallPeakY = body.y;
  }

  /* --- adım sesi --- */
  if (body.onGround && !body.crouching && body.speed > 0.6) {
    body.stepDist += body.speed * h;
    const stride = body.sprinting ? 2.1 : 1.7;
    if (body.stepDist >= stride) {
      body.stepDist -= stride;
      ev.push({ type: 'step', block: body.groundId, sprinting: body.sprinting });
    }
  } else if (!body.onGround) {
    body.stepDist = 0;
  }

  /* --- boşluk --- */
  if (body.y < (world && world.killPlaneY !== undefined ? world.killPlaneY : PLAYER.voidY)) {
    if (!body.inVoid) {
      body.inVoid = true;
      ev.push({ type: 'void' });
    }
  } else {
    body.inVoid = false;
  }

  /* --- otomatik zıplama (dokunmatik): 1 blokluk engel, üstü boş --- */
  if (st.autoJump && body.onGround && ml > 0.5 && (r.hitX || r.hitZ) && !body.crouching && state === 'normal') {
    const wl = Math.sqrt(wx * wx + wz * wz);
    if (wl > 1e-6) {
      const ox = (wx / wl) * 0.3;
      const oz = (wz / wl) * 0.3;
      _n[0] = body.x - hw; _n[1] = body.y; _n[2] = body.z - hw;
      _n[3] = body.x + hw; _n[4] = body.y + body.h; _n[5] = body.z + hw;
      if (!overlapsSolid(world, _n, ox, 1.05, oz, true, false) && !overlapsSolid(world, _n, 0, 1.05, 0, true, false)) {
        body.jumpBuf = PLAYER.jumpBuffer;
      }
    }
  }
}

/**
 * Bir oyuncu adımı. Dönüş: body.events (her çağrıda sıfırlanır; olaylar:
 * jump, doubleJump, land{impact,block}, fall{distance,damage,block}, bounce, splash, step{block,sprinting}, fly{on},
 * grappleStart/End/Fail, void). Çevre bayrakları body üzerinde: inLiquid, headInLiquid, inLava, contactDps, swimming,
 * climbing, gliding, flying, crouching, forcedCrouch, onGround, submergedTime.
 */
export function stepPlayer(body, input, world, dt, abilities, settings) {
  const ev = body.events;
  ev.length = 0;
  if (!(dt > 0)) return ev;
  const ab = abilities || NO_ABILITIES;
  const st = settings || NO_SETTINGS;
  const inp = input || EMPTY_OPTS;
  const jumpHeld = !!inp.jump;
  const pressed = (jumpHeld && !body.prevJump) || !!inp.jumpPressed;
  body.prevJump = jumpHeld;
  const toggle = !!inp.toggleFly;
  const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP - 1e-9));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    stepCore(body, inp, world, h, ab, st, i === 0 && pressed, i === 0 && toggle, jumpHeld);
  }
  return ev;
}
