/*
 * KEŞİF sim/city/vehicle — ARAÇ DURUMU (saf): oluşturma, poz, OBB/AABB, HUD özeti, kayıt. vehiclePhysics.js bunları yeniden dışa aktarır
 * (diğer paketler yalnız vehiclePhysics.js'i içe aktarır; alanlar orada belgelidir).
 */
import { getVehicleDef } from './vehicleData.js';

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const NO_OPTS = Object.freeze({});

export function createVehicle(cls, opts) {
  const d = getVehicleDef(cls);
  if (!d) throw new Error('Bilinmeyen araç sınıfı: ' + String(cls));
  const o = opts || NO_OPTS;
  return {
    id: (o.id | 0) >>> 0,
    propId: (o.propId | 0) >>> 0,
    cls: d.key,
    def: d,
    owner: typeof o.owner === 'string' ? o.owner : '',
    cosmetics: o.cosmetics || null,
    x: num(o.x), y: num(o.y), z: num(o.z), yaw: num(o.yaw),
    vx: 0, vy: 0, vz: 0, u: 0, w: 0, yawRate: 0, spin: 0,
    steer: 0, wheelAngle: 0, wheelSpin: 0, pitch: 0, roll: 0,
    gTop: num(o.y), onGround: true, airT: 0, vyGround: 0, airSpin: 0, hopT: 0, hopsLeft: 1, hopPrev: false,
    nitro: o.nitro === undefined ? 100 : clamp(num(o.nitro), 0, 100), nitroOn: false, nitroIdle: 0, nitroLock: false,
    drift: false, driftT: 0, skid: 0,
    gear: 1, rpm: d.rpm.idle, shiftT: 0, throttle: 0, brake: 0, handbrake: false,
    bumpT: 0, bumpCool: 0, hazardT: 0, edgeCool: 0,
    inWater: false, waterT: 0, governed: false, stuckT: 0, climbT: 0, wedgeT: 0, fallT: 0,
    km: 0, aLong: 0, latAcc: 0, dmg: o.dmg === undefined ? 0 : clamp(num(o.dmg), 0, 1),
    lights: { brake: false, reverse: false },
    events: [],
    good: {
      x: num(o.x), y: num(o.y), z: num(o.z), yaw: num(o.yaw), ok: false,
    },
  };
}

export function setPose(v, x, y, z, yaw) {
  v.x = num(x); v.y = num(y); v.z = num(z); v.yaw = num(yaw);
  v.vx = 0; v.vy = 0; v.vz = 0; v.u = 0; v.w = 0; v.yawRate = 0; v.spin = 0; v.steer = 0;
  v.onGround = true; v.airT = 0; v.vyGround = 0; v.pitch = 0; v.roll = 0; v.stuckT = 0; v.climbT = 0; v.wedgeT = 0; v.waterT = 0; v.inWater = false; v.fallT = 0;
  v.drift = false; v.driftT = 0; v.skid = 0; v.nitroOn = false; v.throttle = 0; v.brake = 0; v.handbrake = false; v.aLong = 0; v.latAcc = 0;
  v.airSpin = 0; v.hopT = 0; v.gTop = v.y;
  v.good.x = v.x; v.good.y = v.y; v.good.z = v.z; v.good.yaw = v.yaw; v.good.ok = true;
  return v;
}

export function parkVehicle(v) {
  v.vx = 0; v.vy = 0; v.vz = 0; v.u = 0; v.w = 0; v.yawRate = 0; v.spin = 0; v.nitroOn = false; v.drift = false; v.skid = 0;
  v.throttle = 0; v.brake = 0; v.handbrake = false; v.steer = 0; v.driftT = 0; v.aLong = 0; v.latAcc = 0;
  return v;
}

export function vehicleObb(v, out) {
  const o = out || {};
  const d = v.def;
  const sy = Math.sin(v.yaw);
  const cy = Math.cos(v.yaw);
  o.cx = v.x; o.cz = v.z; o.hl = d.length * 0.5; o.hw = d.width * 0.5;
  o.fx = -sy; o.fz = -cy; o.rx = cy; o.rz = -sy; o.y0 = v.y; o.y1 = v.y + d.height;
  return o;
}

export function aabbOf(v, out) {
  const o = out || {};
  const d = v.def;
  const sy = Math.sin(v.yaw);
  const cy = Math.cos(v.yaw);
  const hl = d.length * 0.5;
  const hw = d.width * 0.5;
  const hx = hl * Math.abs(sy) + hw * Math.abs(cy);
  const hz = hl * Math.abs(cy) + hw * Math.abs(sy);
  o.minX = v.x - hx; o.maxX = v.x + hx; o.minZ = v.z - hz; o.maxZ = v.z + hz; o.minY = v.y; o.maxY = v.y + d.height;
  return o;
}

export function hudOf(v, out) {
  const o = out || {};
  o.cls = v.cls;
  o.kmh = Math.min(400, Math.round(Math.sqrt(v.vx * v.vx + v.vz * v.vz) * 3.6));
  o.gear = v.gear;
  o.nitro = clamp(v.nitro / 100, 0, 1);
  o.drift = v.drift;
  o.camera = 0;
  return o;
}

export function physicsDigest(v) {
  return [v.x, v.y, v.z, v.yaw, v.vx, v.vy, v.vz, v.u, v.w, v.steer, v.pitch, v.roll, v.nitro, v.rpm, v.gear, v.km, v.yawRate, v.spin];
}

const r2 = (x) => Math.round(x * 100) / 100;

export function serializeVehicle(v) {
  return {
    cls: v.cls, x: r2(v.x), y: r2(v.y), z: r2(v.z), yaw: Math.round(v.yaw * 1000) / 1000, nitro: Math.round(v.nitro), km: Math.round(v.km * 1000) / 1000, dmg: r2(v.dmg),
  };
}

export function restoreVehicle(raw, extra) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.cls !== 'string' || !getVehicleDef(raw.cls)) return null;
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y) || !Number.isFinite(raw.z)) return null;
  if (Math.abs(raw.x) > 1e5 || Math.abs(raw.y) > 1e4 || Math.abs(raw.z) > 1e5) return null;
  const v = createVehicle(raw.cls, Object.assign({}, extra || null, {
    x: raw.x, y: raw.y, z: raw.z, yaw: Number.isFinite(raw.yaw) ? raw.yaw : 0, nitro: Number.isFinite(raw.nitro) ? raw.nitro : 100, dmg: Number.isFinite(raw.dmg) ? raw.dmg : 0,
  }));
  if (Number.isFinite(raw.km) && raw.km >= 0) v.km = raw.km;
  v.good.ok = true;
  return v;
}
