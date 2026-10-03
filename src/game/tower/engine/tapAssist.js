/*
 * İlk katlarda dokunuş yardımı (saf; test edilir).
 *
 * Sim'de kat 1 kulenin 4,5 m yanından (off = -R) doğar ve |off| ≥ boy iken
 * dokunuş ıskadır: oyun anında biter. Yeni oyuncu kat "yaklaşırken"
 * (kulenin yanında belirdiği an) basıp daha ilk katta kaybediyordu.
 *
 * İlk ASSIST_FLOORS katta, kalan örtüşme boyun ASSIST_MIN_OVERLAP'ından
 * azsa (ıska dahil) dokunuş sim'e hiç gönderilmez; motor yerine "erken" ya
 * da "geç" uyarısı verir. Sim'e dokunulmaz: kayda girmeyen girdi
 * uygulanmaz, sunucu replay'i aynı kalır (TOWER_SIM_VERSION değişmez).
 */

export const ASSIST_FLOORS = 2;
// Kalan örtüşme ≥ boy / ASSIST_OVERLAP_DIV ise dokunuş geçer (tamsayı karşılaştırma).
export const ASSIST_OVERLAP_DIV = 3;
export const ASSIST_MIN_OVERLAP = 1 / ASSIST_OVERLAP_DIV;
// Hedef vurgusu (kenar parlaması) bu kata kadar.
export const GUIDE_FLOORS = 3;

/**
 * Kat k (hareketli kat, ≥ 1), ofset off (mm), hareket eksenindeki boy size
 * (mm), doğduğundan beri t tick, hız v mm/tick, salınım R mm.
 * Döner: null (dokunuş sim'e gider) | 'early' (kat kuleye yaklaşıyor) |
 * 'late' (kat kuleden uzaklaşıyor).
 */
export function judgeTap(k, off, size, t, v, R) {
    if (!(k >= 1 && k <= ASSIST_FLOORS)) return null;
    if (!(size > 0)) return null;
    const a = off < 0 ? -off : off;
    if ((size - a) * ASSIST_OVERLAP_DIV >= size) return null;
    // ping-pong: ph < 2R iken -R → +R (artan), sonra azalan.
    const four = 4 * R;
    let ph = (t * v) % four;
    if (ph < 0) ph += four;
    const increasing = ph < 2 * R;
    const approaching = off === 0 || (off < 0 ? increasing : !increasing);
    return approaching ? 'early' : 'late';
}

/**
 * Hizalama 0..1: kat kulenin tam üstündeyken 1, örtüşme boyun yarısına
 * inince 0 (hedef vurgusunun parlaklığı).
 */
export function alignment(off, size) {
    if (!(size > 0)) return 0;
    const a = (off < 0 ? -off : off) / size;
    const g = 1 - a * 2;
    return g <= 0 ? 0 : g >= 1 ? 1 : g * g * (3 - 2 * g);
}

/**
 * Motorun dokunuş kararı (saf): 'ignore' | 'early' | 'late' | 'send'.
 *  - Oyun 'running' değilse (geri sayım, başlatma tuşu, duraklama, bitiş)
 *    ya da kat kaymıyorsa (doğma beklemesi, soru) yok sayılır: geri sayımda
 *    basılan Boşluk ilk kata geçmez.
 *  - Aynı tick'te ikinci dokunuş yok sayılır (aynı basışın pointer + tuş
 *    olarak iki kez gelmesi ya da çift dokunuş kayda girmesin).
 *  - İlk katlarda judgeTap uyarısı; yoksa sim'e gönder.
 * g: { phase, paused, ended, simPhase, tick, lastTapTick, floor (son
 * yerleşen), off, size, t, v, R }
 */
export function tapDecision(g) {
    if (g.paused || g.ended || g.phase !== 'running') return 'ignore';
    if (g.simPhase !== 'moving' || g.lastTapTick === g.tick) return 'ignore';
    return judgeTap(g.floor + 1, g.off, g.size, g.t, g.v, g.R) || 'send';
}
