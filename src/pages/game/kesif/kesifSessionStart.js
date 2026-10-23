/*
 * Motoru kurmadan önce gereken veriyi hazırlar: yerel/bulut kaydı ve harita verisi.
 * Saf bir async işlev (React yok); hatalar atılmaz, `{ ok:false, text, retry }` döner.
 *
 * Motor sözleşmesi (game.js createKesifGame):
 *   macera  -> seed (Dünya Kodu | sayı) ve devam ediyorsa save (serileştirilmiş ham kayıt)
 *   insa    -> mapData (kendi haritam, düzenleme) | base (yeni)
 *   harita  -> mapData (oynanacak harita)
 */
import { classifyKesifError, kesifErrorText } from '../../../components/game/kesif/kesifUtils';
import { baseSlotFor, cloudSaveFrom, mapDataFromResponse, pickFreeSlot, readLocalSave } from './kesifSessionUtils';

const fail = (text, retry = false, login = false) => ({ ok: false, text, retry, login });
const failErr = (err, fallback) => fail(kesifErrorText(err, fallback), true, classifyKesifError(err).kind === 'unauth');

/**
 * @param {object} p
 * @param {object} p.entry          lobi girişi (buildEntry)
 * @param {boolean} p.member        üye mi (bulut/harita istekleri)
 * @param {object} p.api            kesifApi biçiminde istemci
 * @param {Function} p.loadStorage  () => Promise<sim/saveStorage modülü>
 * @param {object|null} p.resume    bağlam kaybı sonrası bellekteki durum { save?, mapData? }
 * @param {object|null} p.mapCache  { id, data, meta } önceki başarılı harita yüklemesi
 */
export async function prepareStart({ entry, member, api, loadStorage, resume = null, mapCache = null }) {
    const out = { ok: true, seed: entry.seed ?? undefined, save: null, mapData: null, mapMeta: null, slot: null, storage: null, mapCache: null };

    if (entry.mode === 'macera') {
        try {
            const mod = await loadStorage();
            out.storage = { mod, adapter: mod.createBestAdapter() };
        } catch {
            out.storage = null;
        }
        if (resume?.save) {
            out.save = resume.save;
        } else if (entry.saveId === 'cloud') {
            if (!member || !api) return fail('Bulut kaydını açmak için giriş yapmalısın.', false, true);
            try {
                out.save = cloudSaveFrom(await api.getSave());
            } catch (err) {
                return failErr(err, 'Bulut kaydı alınamadı.');
            }
            if (!out.save) return fail('Bulutta kayıtlı bir macera bulunamadı.');
        } else if (entry.saveId) {
            if (!out.storage) return fail('Kayıtlar bu cihazda okunamadı.');
            const r = await readLocalSave(out.storage.mod, out.storage.adapter, entry.saveId);
            if (!r.ok) return fail(r.text);
            out.save = r.save;
            out.slot = r.slot;
        }
        if (out.save && out.save.seed !== undefined && out.save.seed !== null) out.seed = out.save.seed;
        if (resume?.slot) out.slot = resume.slot;
        if (!out.slot && out.storage) {
            const base = baseSlotFor(entry, out.save);
            // Devam eden dünya kendi yuvasına yazar; yeni macera aynı koda ait eski kaydı ezmez.
            out.slot = out.save ? base : await pickFreeSlot(out.storage.mod, out.storage.adapter, base);
        }
        return out;
    }

    if (entry.mapId) {
        if (resume?.mapData) {
            out.mapData = resume.mapData;
            out.mapMeta = mapCache?.id === entry.mapId ? mapCache.meta : null;
            out.mapCache = mapCache;
            return out;
        }
        if (mapCache?.id === entry.mapId && mapCache.data) {
            out.mapData = mapCache.data;
            out.mapMeta = mapCache.meta || null;
            out.mapCache = mapCache;
            return out;
        }
        if (!api) return fail('Harita yüklenemedi.');
        let res;
        try {
            res = await api.map(entry.mapId);
        } catch (err) {
            return failErr(err, 'Harita yüklenemedi.');
        }
        const data = mapDataFromResponse(res);
        if (!data) return fail('Harita verisi okunamadı. Harita bozuk olabilir.');
        const m = res?.map || {};
        // Yalnızca kendi haritam düzenlenir; başkasının haritası "kaydet"te kopya olur.
        const meta = entry.mode === 'insa' && m.mine !== false && m.id ? { id: m.id, title: m.title || '', description: m.description || '' } : null;
        out.mapData = data;
        out.mapMeta = meta;
        out.mapCache = { id: entry.mapId, data, meta };
        return out;
    }

    if (resume?.mapData) out.mapData = resume.mapData;
    return out;
}
