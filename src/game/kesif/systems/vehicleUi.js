/*
 * KEŞİF — "vehicleUi" sistemi (order 39; Neon Meridyen Faz 3, paket vehicle_ui): sürüş arayüzünün (React mini harita, göstergeler) ihtiyaç duyduğu
 * salt-okunur motor yüzeyi. Oyun durumunu DEĞİŞTİRMEZ (yalnız `G.driveMarker`ı görev paketine açar). gameSystems.js otomatik yükler.
 *
 *   API (gameApi'ye eklenir; paneller kesifPanelApi cephesinden okur):
 *     getDriveInfo()        → {dim, driving, seed, x, z, yaw, speed} | null (şehir dışında null). seed = şehir tohumu (roadNet/cityPois için)
 *     getTrafficDots(r?)    → {count, xz: Float32Array(2·count)} oyuncuya r (varsayılan 220 m) içindeki trafik araçları (G.traffic.view SoA; traffic_ai).
 *                             Dönen dizi her çağrıda YENİDEN KULLANILIR (kopyalamayın); trafik sistemi yoksa count 0.
 *     getDriveMarker()      → {x, z, label} | null     rota işareti (mini harita)
 *     setDriveMarker(m)     → bool   m = {x, z, label?} | null. Görev paketi (Faz 4) hedefi buradan verir; boyut değişince silinir.
 */
const MAX_DOTS = 64;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);

export const VEHICLE_UI_ORDER = 39;

export function createSystem(G) {
  const dots = { count: 0, xz: new Float32Array(MAX_DOTS * 2) };
  const info = {
    dim: 'overworld', driving: false, seed: 0, x: 0, z: 0, yaw: 0, speed: 0,
  };
  let marker = null;

  function readMarker() {
    if (marker) return marker;
    const m = G.driveMarker;
    return m && fin(m.x) && fin(m.z) ? m : null;
  }

  return {
    name: 'vehicleUi',
    order: VEHICLE_UI_ORDER,

    onDimension() {
      marker = null;
      G.driveMarker = null;
    },

    api() {
      return {
        getDriveInfo() {
          if (G.dim !== 'neon' || !G.world || !G.body) return null;
          const b = G.body;
          const e = G.vehicles && G.vehicles.driven ? G.vehicles.driven : null;
          info.dim = 'neon';
          info.driving = Boolean(e);
          info.seed = G.world.seed;
          info.x = e ? e.v.x : b.x;
          info.z = e ? e.v.z : b.z;
          info.yaw = e ? e.v.yaw : G.player.yaw;
          info.speed = e ? Math.sqrt(e.v.vx * e.v.vx + e.v.vz * e.v.vz) : 0;
          return info;
        },
        getTrafficDots(radius) {
          dots.count = 0;
          const v = G.traffic ? G.traffic.view : null;
          if (G.dim !== 'neon' || !G.body || !v || !(v.count > 0) || !v.x || !v.z) return dots;
          const r = fin(radius) && radius > 0 ? Math.min(radius, 600) : 220;
          const r2 = r * r;
          const b = G.body;
          let k = 0;
          const n = Math.min(v.count | 0, 4096);
          for (let i = 0; i < n && k < MAX_DOTS; i++) {
            if (v.fade && v.fade[i] < 0.3) continue;
            const dx = v.x[i] - b.x;
            const dz = v.z[i] - b.z;
            if (!(dx * dx + dz * dz <= r2)) continue;
            dots.xz[k * 2] = v.x[i];
            dots.xz[k * 2 + 1] = v.z[i];
            k++;
          }
          dots.count = k;
          return dots;
        },
        getDriveMarker() {
          return readMarker();
        },
        setDriveMarker(m) {
          if (m === null || m === undefined) {
            marker = null;
            G.driveMarker = null;
            return true;
          }
          if (typeof m !== 'object' || !fin(m.x) || !fin(m.z)) return false;
          marker = { x: m.x, z: m.z, label: typeof m.label === 'string' ? m.label.slice(0, 40) : '' };
          G.driveMarker = marker;
          return true;
        },
      };
    },

    dispose() {
      marker = null;
      G.driveMarker = null;
    },
  };
}

export default createSystem;
