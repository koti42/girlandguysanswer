/*
 * KEŞİF — sürüş girdisi köprüsü (vehicle_ui): input.js'in araç kipi için ihtiyaç duyduğu motor bilgilerini geri çağrı olarak verir.
 *
 *   createDriveCallbacks(G) → { isVehicleMode(), getDriveTelemetry(), isReducedMotion() }
 *     isVehicleMode        G.player.vehicle != null (sürülen araç var)
 *     getDriveTelemetry    {speed, u, x, y, z, yaw, cls, snap(x,z,y,yaw)} — aynı nesne yeniden kullanılır; araç yoksa null.
 *                          snap = roadSnapFor(şehir tohumu): şerit yardımı için en yakın sağ şerit merkezi.
 *     isReducedMotion      G.reducedMotion (titreşim kapanır)
 * G.world'ü önbelleğe almaz (boyut değişince değişir): her çağrıda okunur.
 */
import { roadSnapFor } from './sim/city/vehicle/vehicleRoad.js';

export function createDriveCallbacks(G) {
  const tele = {
    speed: 0, u: 0, x: 0, y: 0, z: 0, yaw: 0, cls: '', snap: null,
  };
  const snapFn = (x, z, y, yaw) => {
    const w = G.world;
    if (!w || G.dim !== 'neon') return null;
    return roadSnapFor(w.seed)(x, z, y, yaw);
  };
  tele.snap = snapFn;
  return {
    isVehicleMode: () => Boolean(G.player && G.player.vehicle),
    getDriveTelemetry: () => {
      const m = G.vehicles;
      const e = m && m.driven ? m.driven : null;
      if (!e) return null;
      const v = e.v;
      tele.speed = Math.sqrt(v.vx * v.vx + v.vz * v.vz);
      tele.u = v.u;
      tele.x = v.x;
      tele.y = v.y;
      tele.z = v.z;
      tele.yaw = v.yaw;
      tele.cls = v.cls;
      return tele;
    },
    isReducedMotion: () => Boolean(G.reducedMotion),
  };
}
