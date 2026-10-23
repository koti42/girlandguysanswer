/*
 * Devam Et listesi için yerel kayıt okuyucu.
 *
 * Motor (three) lobi paketine girmesin diye `sim/saveStorage.js` yalnızca tembel
 * (dinamik) olarak yüklenir (saf JS: save.js + adaptörler, three/DOM yok).
 * `import.meta.glob` kullanılır: dosya yoksa ya da yüklenemezse derleme/çalışma
 * kırılmaz, liste boş döner.
 *
 * Kullanılan sözleşme (sim/saveStorage.js): createBestAdapter() ve
 * listSlots(adapter) -> [{ slot, summary:{ name, seed, worldCode, mode, playTime, savedAt, zone:{name} } }].
 * Lobi yalnızca macera kayıtlarını listeler; oyun sayfası `entry.saveId` (= slot adı)
 * ile aynı adaptörden loadFromSlot ile yükler.
 */

const loaders = import.meta.glob('../../../game/kesif/sim/saveStorage.js');

/** Yerel kayıt özetleri (lobinin normalizeSave biçimine uygun); hiçbir koşulda fırlatmaz. */
export async function loadLocalSaves() {
    const load = Object.values(loaders)[0];
    if (typeof load !== 'function') return [];
    try {
        const mod = await load();
        const list = await mod.listSlots(mod.createBestAdapter());
        return (Array.isArray(list) ? list : [])
            .filter((e) => e && e.slot && e.summary && (e.summary.mode || 'macera') === 'macera')
            .map((e) => ({ ...e.summary, id: e.slot, updatedAt: e.summary.savedAt || e.summary.createdAt || 0 }));
    } catch {
        return [];
    }
}

export default loadLocalSaves;
