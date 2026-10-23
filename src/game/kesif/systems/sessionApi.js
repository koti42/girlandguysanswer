/*
 * KEŞİF — oturum sisteminin genel api yöntemleri (G.registry.mergeApi ile api'ye eklenir; ad çakışması = hata).
 *
 *   buildSessionApi(G, rt) → {
 *     save() → saveObject | null            elle kayıt: onSave({save, reason:'manual', summary}) tetikler ve kaydı döndürür (harita modunda null)
 *     getSaveSummary() → {name, seed, worldCode, mode, playTime, savedAt, createdAt, zone:{id,name}, level, truncated}
 *     getWorldCode() → string               macera: Dünya Kodu; inşa/harita: ''
 *     exportMap({title?, desc?}) → {ok, map, meta:{title,desc,blockCount,spawn,time,base,bytes,chunkCount,encodedBytes}, errors, codes}
 *                                           yalnızca inşa modu; geçersizse ok:false + Türkçe errors[0]
 *     setMapTime('gündüz'|'gece'|'gün batımı') → ad | null     inşa/harita zaman kilidi
 *     command(name, args) → {ok, message, data?}               hata ayıklama komutları (yalnız dev / ?debug=1)
 *   }
 *   rt: {saver}
 */
import { exportMap, setMapTime, worldCodeFor } from './sessionModes.js';
import { runCommand } from './sessionCommands.js';

export function buildSessionApi(G, rt) {
  const { saver } = rt;
  return {
    save() {
      if (G.destroyed) return null;
      const r = saver.save('manual', { force: true });
      return r ? r.save : null;
    },
    getSaveSummary() {
      return saver.summary();
    },
    getWorldCode() {
      return worldCodeFor(G);
    },
    exportMap(opts) {
      return exportMap(G, opts);
    },
    setMapTime(name) {
      const r = setMapTime(G, name);
      if (r && typeof G.publishHud === 'function') G.publishHud(true);
      return r;
    },
    command(name, args) {
      return runCommand(G, name, args, { saver });
    },
  };
}
