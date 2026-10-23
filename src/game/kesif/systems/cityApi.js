/*
 * KEŞİF — "cityApi" sistemi (order 35): Neon Meridyen sunucu talepleri (neon:* jeton ödülleri; sözleşme §16). Faz 4, paket discovery_missions.
 * İstemci YALNIZ olay üretir: kazanılan talep `city.claims[k]=1` (kalıcı) olur ve `reward` olayı yayılır; ağ işini sayfanın talep yürütücüsü yapar
 * (createRewardClaimer: oturum aç, geri çekilmeli yeniden deneme, 409/422 sınıflaması, günlük tavan). Sunucu tutarı, süre/günlük/ömür sınırlarını KENDİSİ uygular
 * (istemciye güvenilmez); tek-seferliktir. Oyunu ASLA bloklamaz; giriş yoksa (setCityRewardsEnabled(false)) hiçbir şey yayılmaz ve arayüz jeton satırlarını gizler.
 * Doğrudan kip: `G.opts.cityClaim(key, idemKey) → Promise` verilirse (gömme/QA) kuyruk kendi geri çekilmesiyle gönderir.
 *
 *   G.cityApi = {view(), markClaimed(key), setEnabled(b), queue, enabled}
 *   API (window.__game): getCityRewards() → {enabled, items:[{key, short, name, amount, state}]} · setCityRewardsEnabled(bool) · markRewardClaimed'e neon:* anahtarları content üzerinden bağlanır
 *   Olaylar: reward{key} (yeniden yayım ≤ 90 sn'de bir, onaylanana dek)
 */
import { evaluateClaims, NEON_AMOUNTS, NEON_CLAIMS, isNeonKey, shortKey } from '../sim/city/cityEvents.js';
import { createClaimQueue } from '../sim/city/mission/claimQueue.js';
import { getKit } from './cityMissionsKit.js';

export const CITY_API_ORDER = 35;
const NAMES = Object.freeze({
  firstjob: 'İlk iş', goldrace: 'İlk altın madalya', chips60: '60 veri çipi', easter: 'Diyar Işığı',
});
const HINTS = Object.freeze({
  firstjob: 'Bir kurye ya da taksi işi tamamla.',
  goldrace: 'Bir yarışta altın madalya kazan.',
  chips60: '60 veri çipi topla.',
  easter: 'Kasa\'daki gizemli ışığı bul.',
});

export function createSystem(G) {
  const kit = getKit(G);
  const st = { enabled: true, acc: 0.9, version: 0 };
  const transport = G.opts && typeof G.opts.cityClaim === 'function' ? G.opts.cityClaim : null;
  const queue = createClaimQueue({
    getCity: () => (kit.ctx() ? kit.blob() : null),
    now: () => (G.time ? G.time.seconds : 0),
    emit: (e) => G.emit(e),
    enabled: () => st.enabled,
    transport,
  });
  const api = {
    queue,
    get enabled() {
      return st.enabled;
    },
    setEnabled(b) {
      st.enabled = !!b;
      st.version++;
      return st.enabled;
    },
    markClaimed(key) {
      if (!isNeonKey(key)) return false;
      const was = queue.onClaimed(key);
      st.version++;
      return was;
    },
    view() {
      const c = kit.ctx() ? kit.blob() : null;
      const cl = c && c.claims ? c.claims : {};
      return {
        enabled: st.enabled,
        items: NEON_CLAIMS.map((key) => {
          const k = shortKey(key);
          const s = cl[k] === 2 ? 'alindi' : cl[k] === 1 ? 'bekliyor' : 'kilitli';
          return {
            key, short: k, name: NAMES[k], hint: HINTS[k], amount: NEON_AMOUNTS[k], state: s,
          };
        }),
      };
    },
  };
  G.cityApi = api;

  return {
    name: 'cityApi',
    order: CITY_API_ORDER,

    fixedUpdate(_G, dt) {
      if (!kit.ctx()) return;
      st.acc += dt;
      if (st.acc < 1) return;
      st.acc = 0;
      const c = kit.blob();
      if (!c) return;
      const fresh = evaluateClaims(c, kit.metrics());
      if (fresh.length > 0) st.version++;
      queue.tick();
    },

    /** Boyut değişimi: kuyruk durumu blobda (kalıcı) ve ctx/blob her çağrıda taze okunur; yalnız değerlendirme sayacı sıfırlanır (şehre dönüşte talepler hemen yeniden bakılır). */
    onDimension() {
      st.acc = 0.9;
      st.version++;
    },

    api() {
      return {
        getCityRewards: () => api.view(),
        setCityRewardsEnabled: (b) => api.setEnabled(b),
      };
    },

    dispose() {
      queue.reset();
      G.cityApi = null;
    },
  };
}

export default createSystem;
