/*
 * KEŞİF sim/city/vehicle — ARAÇ KAYDI (saf). Sözleşme §14: `dims.neon.city` içinde {garage:{owned≤6,active}, summoned|null, rental|null}. Trafik/yaya kayda girmez.
 * Bu modül yalnız araçla ilgili anahtarları doğrular/üretir; `kredi`, görev vb. citystate'in (Faz 4) alanlarıdır ve DOKUNULMAZ.
 *
 *   VEHICLE_SAVE_KEYS               ['garage','summoned','rental','vstats']
 *   defaultVehicleSave() → {garage:{owned:[],active:0}, summoned:null, rental:null, vstats:{km:0,enters:0}}
 *   sanitizeVehicleSave(raw) → temiz nesne (bilinmeyen sınıf/NaN/__proto__ güvenli; sınırlar: ≤ 6 araç, konum ±1000, y −420..420)
 *   readVehicleSave(city) → sanitizeVehicleSave(city)         writeVehicleSave(city, save)   city nesnesine yalnız VEHICLE_SAVE_KEYS yazar
 */
import { RENTAL_SECONDS, isVehicleClass, sanitizeCosmetics } from './vehicleData.js';

export const VEHICLE_SAVE_KEYS = Object.freeze(['garage', 'summoned', 'rental', 'vstats']);
export const MAX_OWNED = 6;
const LIM_XZ = 1000;
const LIM_Y = 420;

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

export function defaultVehicleSave() {
  return {
    garage: { owned: [], active: 0 },
    summoned: null,
    rental: null,
    vstats: { km: 0, enters: 0 },
  };
}

function pose(raw) {
  if (!isObj(raw)) return null;
  const x = raw.x;
  const y = raw.y;
  const z = raw.z;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  if (Math.abs(x) > LIM_XZ || Math.abs(z) > LIM_XZ || Math.abs(y) > LIM_Y) return null;
  const yaw = Number.isFinite(raw.yaw) ? raw.yaw : 0;
  const dmg = Number.isFinite(raw.dmg) ? Math.max(0, Math.min(1, raw.dmg)) : 0;
  return {
    x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100, yaw: Math.round((yaw % (Math.PI * 2)) * 1000) / 1000, dmg: Math.round(dmg * 100) / 100,
  };
}

export function sanitizeVehicleSave(raw) {
  const out = defaultVehicleSave();
  if (!isObj(raw)) return out;
  const g = isObj(raw.garage) ? raw.garage : null;
  if (g && Array.isArray(g.owned)) {
    const seen = Object.create(null);
    for (let i = 0; i < g.owned.length && out.garage.owned.length < MAX_OWNED; i++) {
      const e = g.owned[i];
      if (!isObj(e) || !isVehicleClass(e.cls) || seen[e.cls]) continue; // sınıf başına tek araç
      seen[e.cls] = true;
      out.garage.owned.push({ cls: e.cls, cos: sanitizeCosmetics(e.cos, e.cls) });
    }
    const act = Number.isInteger(g.active) ? g.active : 0;
    out.garage.active = out.garage.owned.length === 0 ? 0 : Math.max(0, Math.min(out.garage.owned.length - 1, act));
  }
  const s = isObj(raw.summoned) ? raw.summoned : null;
  if (s && Number.isInteger(s.idx) && s.idx >= 0 && s.idx < out.garage.owned.length) {
    const p = pose(s);
    if (p) out.summoned = Object.assign({ idx: s.idx }, p);
  }
  const r = isObj(raw.rental) ? raw.rental : null;
  // qa5: kalan süre 0,1 sn'ye yuvarlandıktan SONRA > 0 olmalı (yoksa left:0 kiralık yazılır, ikinci temizleme onu atardı → gidiş-dönüş kararsız)
  const left = r && Number.isFinite(r.left) ? Math.min(RENTAL_SECONDS, Math.round(r.left * 10) / 10) : 0;
  if (r && isVehicleClass(r.cls) && left > 0) {
    const p = pose(r);
    if (p) out.rental = Object.assign({ cls: r.cls, left }, p);
  }
  const vs = isObj(raw.vstats) ? raw.vstats : null;
  if (vs) {
    out.vstats.km = Number.isFinite(vs.km) && vs.km >= 0 ? Math.min(1e6, Math.round(vs.km * 1000) / 1000) : 0;
    out.vstats.enters = Number.isInteger(vs.enters) && vs.enters >= 0 ? Math.min(1e6, vs.enters) : 0;
  }
  return out;
}

export function readVehicleSave(city) {
  return sanitizeVehicleSave(city);
}

export function writeVehicleSave(city, save) {
  if (!isObj(city) || !isObj(save)) return city;
  for (let i = 0; i < VEHICLE_SAVE_KEYS.length; i++) {
    const k = VEHICLE_SAVE_KEYS[i];
    city[k] = save[k] === undefined ? null : save[k];
  }
  return city;
}
