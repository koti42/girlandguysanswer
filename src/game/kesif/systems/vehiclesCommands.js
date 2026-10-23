/*
 * KEŞİF — araç hata ayıklama komutları (api.command; yalnız ?debug=1 / dev).
 *
 *   car <sınıf>        oyuncunun önüne aracı koyar ve biner (ücretsiz; sınıf: taksi spor kamyonet motor hoverbike suzulkay)
 *   kredi <n>          Kredi ekler (şehir cüzdanı)
 *   vstat              araç sistemi özeti (etkin araç, durum, istatistik)
 *   vreset             sürülen aracı en yakın yola yerleştirir
 */
import { registerCommand } from './sessionCommands.js';
import { VEHICLE_CLASSES } from '../sim/city/vehicle/vehicleData.js';
import { hudOf, resetToRoad } from '../sim/city/vehicle/vehiclePhysics.js';
import { roadSnapFor } from '../sim/city/vehicle/vehicleRoad.js';

const ok = (message, data) => ({ ok: true, message, data });
const err = (message) => ({ ok: false, message });

export function installVehicleCommands(G, h) {
  registerCommand('car', 'car <taksi|spor|kamyonet|motor|hoverbike|suzulkay>', (g, a) => {
    const mgr = h.manager();
    if (!mgr) return err('Araçlar yalnız Neon Meridyen\'de var.');
    const cls = a && a[0];
    if (VEHICLE_CLASSES.indexOf(cls) < 0) return err('Sınıf: ' + VEHICLE_CLASSES.join(' '));
    if (mgr.driven) h.exit({ force: true, reason: 'komut' });
    const b = g.body;
    const sy = Math.sin(g.player.yaw);
    const cy = Math.cos(g.player.yaw);
    const e = mgr.spawn({
      cls, x: b.x - sy * 5, y: b.y, z: b.z - cy * 5, yaw: g.player.yaw, role: 'rental', maxR: 8,
    });
    if (!e) return err('Yer bulunamadı.');
    if (h.enter(e)) return ok('Biniyorsun: ' + cls, { id: e.id });
    return err('Binilemedi.');
  });
  registerCommand('kredi', 'kredi <n>', (g, a) => {
    const n = Math.floor(Number(a && a[0]));
    if (!Number.isFinite(n) || n <= 0) return err('kredi <pozitif sayı>');
    if (!h.wallet.add(n, 'komut')) return err('Cüzdan yok (şehirde değilsin).');
    return ok('Kredi: ' + h.wallet.get(), { kredi: h.wallet.get() });
  });
  registerCommand('vstat', 'vstat', (g) => {
    const mgr = g.vehicles;
    if (!mgr) return ok('Araç yöneticisi yok (şehir dışı).', null);
    const d = mgr.driven;
    return ok('Araç özeti hazır.', {
      entries: mgr.entries.size,
      driven: d ? Object.assign({ id: d.id, role: d.role }, hudOf(d.v, {})) : null,
      stats: mgr.stats,
      sys: h.sys.stats,
      save: mgr.save,
      kredi: h.wallet.get(),
      version: mgr.version,
    });
  });
  registerCommand('vreset', 'vreset', (g) => {
    const mgr = g.vehicles;
    const d = mgr ? mgr.driven : null;
    if (!d) return err('Araç sürmüyorsun.');
    const snap = (x, z, y) => roadSnapFor(g.world.seed)(x, z, y, d.v.yaw);
    const done = resetToRoad(d.v, g.world, { roadSnap: snap });
    if (done) mgr.syncProp(d);
    return done ? ok('Yola yerleştirildi.') : err('Yol bulunamadı.');
  });
}
