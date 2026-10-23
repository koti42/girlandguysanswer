/*
 * KEŞİF — kalite uygulama planı (saf mantık; three/DOM yok, node'da test edilir).
 *
 *   effectiveViewDist(userView, tierView, hardMax?)   kullanıcı üst sınırı ile kademe görüş mesafesinin küçüğü
 *   planQualityChange(change, userView) → ops[]        render/quality.js değişim tanımlayıcısı → uygulanacak işlemler
 *   triangleBudget(tier) → görünür üçgen bütçesi            createViewBudget(opts) → { update(dt, tris, tier, draws?) → cut, cut, reset() }
 *   createFrameSampler({warmupFrames, windowFrames})   spike'ları (uzun kareleri) kalite örneğine sokmadan filtreler
 *
 * ops öğeleri: {op:'pixelRatio', value} | {op:'viewDist', value} | {op:'postfx', settings} | {op:'materials', level}
 *   | {op:'sky', settings} | {op:'weather', settings} | {op:'particles', tier} | {op:'chunks', settings} | {op:'atlas', tier}
 * Atlas yalnız `atlasChanged` (elle kademe) ile yenilenir; otomatik uyarlama atlası değiştirmez (tüm chunk'lar yeniden mesh'lenir).
 */
export function effectiveViewDist(userView, tierView, hardMax) {
  const max = hardMax > 0 ? hardMax : 12;
  const t = Math.max(3, Math.min(max, Math.round(tierView)));
  if (userView === null || userView === undefined || !Number.isFinite(userView)) return t;
  return Math.max(3, Math.min(t, Math.round(userView)));
}

/** Kademe başına görünür üçgen bütçesi (sözleşme: ≲150k düşük, ≲300k orta, ≲400k yüksek). */
export function triangleBudget(tier) {
  return tier === 'low' ? 150000 : tier === 'medium' ? 300000 : 400000;
}

/** Çizim çağrısı bütçesi (sözleşme: ≲ 250). Aşılırsa üçgen bütçesi aşılmış gibi (oransal) görüş mesafesi kısılır. */
export const DRAW_BUDGET = 250;
/** Masaüstü (ince işaretçi) GPU'larda çizim çağrısı bütçesi: CPU tarafı telefondan kat kat güçlüdür (ölçüm: RTX 3060'ta 370 çağrı ≈ 3,5 ms). */
export const DRAW_BUDGET_DESKTOP = 520;
export function drawBudgetFor(coarse) {
  return coarse ? DRAW_BUDGET : DRAW_BUDGET_DESKTOP;
}
/** Neon Meridyen (sözleşme §1.14/§17): TÜM kademelerde toplam çizim çağrısı ≤ 250 (post geçişleri dahil) — masaüstü ayrıcalığı (520) YOK. */
export const CITY_DRAW_BUDGET = 250;
/** Şehir denetleyicisinin hedefi: tek kare gecikmeyle yakalanan tepeler 250 tavanını aşmasın diye ~%5 pay bırakılır. */
export const CITY_DRAW_TARGET = 238;
export function drawBudgetForDim(coarse, dim) {
  return dim === 'neon' ? CITY_DRAW_BUDGET : drawBudgetFor(coarse);
}

/**
 * Üçgen (ve çizim çağrısı) bütçesine göre görüş mesafesi kırpması (chunk): bütçe aşılınca her 2,5 sn'de 1 chunk kısar (en çok maxCut),
 * bütçenin %55'ine inince 1 chunk geri verir. Gürültüye karşı düzleştirilmiş üçgen sayısı kullanılır.
 */
export function createViewBudget(opts) {
  const o = opts || {};
  const maxCut = o.maxCut >= 0 ? o.maxCut : 3;
  const cooldown = o.cooldown > 0 ? o.cooldown : 2.5;
  const drawBudget = o.drawBudget > 0 ? o.drawBudget : DRAW_BUDGET;
  // tetik eşiği: bütçenin kaç katı aşılınca kısılır (varsayılan 1,12 histerezis; şehir 1,0: bütçe sert tavandır)
  const trigger = o.trigger > 0 ? o.trigger : 1.12;
  // düzleştirme hızı (1/sn): şehirde hızlı (ani tepeler tavanı aşmadan yakalanır)
  const rate = o.smoothRate > 0 ? o.smoothRate : 1.5;
  let cut = 0;
  let smooth = -1;
  let cd = cooldown;
  return {
    update(dt, tris, tier, draws) {
      if (!(tris >= 0)) return cut;
      const budget = triangleBudget(tier);
      // yük = üçgen ya da (varsa) çizim çağrısı bütçesinin oransal karşılığı, hangisi büyükse
      const load = draws > 0 ? Math.max(tris, (draws / drawBudget) * budget) : tris;
      smooth = smooth < 0 ? load : smooth + (load - smooth) * Math.min(1, dt * rate);
      cd -= dt;
      if (cd > 0) return cut;
      if (smooth > budget * trigger && cut < maxCut) {
        cut++;
        cd = cooldown;
        smooth = -1;
      } else if (smooth < budget * 0.55 && cut > 0) {
        cut--;
        cd = cooldown * 2;
        smooth = -1;
      }
      return cut;
    },
    get cut() {
      return cut;
    },
    reset() {
      cut = 0;
      smooth = -1;
      cd = cooldown;
    },
  };
}

export function planQualityChange(change, userView) {
  const ops = [];
  if (!change || !change.settings) return ops;
  const s = change.settings;
  const has = (k) => change.changed.indexOf(k) >= 0;
  if (has('pixelRatio')) ops.push({ op: 'pixelRatio', value: s.pixelRatio });
  if (has('viewDist') || has('effTier') || has('tier')) ops.push({ op: 'viewDist', value: effectiveViewDist(userView, s.viewDist) });
  if (has('post') || has('bloom') || has('bloomLevels') || has('msaa')) ops.push({ op: 'postfx', settings: s });
  if (has('material')) ops.push({ op: 'materials', level: s.material });
  if (has('clouds')) ops.push({ op: 'sky', settings: s });
  if (has('weather')) ops.push({ op: 'weather', settings: s });
  if (has('particles') || has('effTier')) ops.push({ op: 'particles', tier: s.effTier || 'medium' });
  if (has('maxUploads') || has('workers')) ops.push({ op: 'chunks', settings: s });
  if (change.atlasChanged) ops.push({ op: 'atlas', tier: s.atlas });
  return ops;
}

/**
 * Kare süresi örnekleyici: ilk `warmupFrames` kare ve tek seferlik uzun kareler (> spikeMs) kalite denetleyicisine
 * verilmez (chunk üretimi/shader derlemesi yüzünden düşük kaliteye kaymayı önler). Dönüş: örnek ms ya da -1 (atla).
 */
export function createFrameSampler(opts) {
  const o = opts || {};
  const warm = o.warmupFrames >= 0 ? o.warmupFrames : 90;
  const spikeMs = o.spikeMs > 0 ? o.spikeMs : 120;
  let n = 0;
  let prevSpike = false;
  return {
    sample(ms) {
      n++;
      if (n <= warm) return -1;
      if (!(ms > 0) || !Number.isFinite(ms)) return -1;
      if (ms > spikeMs) {
        // tek bir uzun kare (ör. shader derlemesi) sayılmaz; art arda ikinci uzun kare gerçek yavaşlıktır
        const skip = !prevSpike;
        prevSpike = true;
        return skip ? -1 : ms;
      }
      prevSpike = false;
      return ms;
    },
    /** Duraklatma/sekme dönüşü: tekrar ısınma. */
    rewarm(frames) {
      n = Math.max(0, warm - (frames >= 0 ? frames : 20));
      prevSpike = false;
    },
    get frames() {
      return n;
    },
  };
}

/**
 * Şehir çizim çağrısı yöneticisi (perf_tuner, Faz 5): son karenin TOPLAM çağrısı sert eşiği (hard) aşarsa sis/çizim uzaklığı çarpanı
 * (scale ∈ [minScale, 1]) hızla düşer, yumuşak eşiğin (soft) altına inince yavaş yükselir. Çarpan `getFogParams` çıktısına (fogNear/fogFar/
 * fadeStart/fadeEnd) uygulanır: uzak bantlar bölünmüş chunk adımı yerine sürekli (kesirli) ve sisle/çözünmeyle gizlenir → toplam çağrı her
 * kademede hard'ın biraz üstünü geçmez. Saf: three/DOM yok; NaN/negatif girdiye dayanıklı.
 */
export const CITY_DRAW_HARD = 226;
export const CITY_DRAW_SOFT = 216;
export function createDrawGovernor(opts) {
  const o = opts || {};
  const hard = o.hard > 0 ? o.hard : CITY_DRAW_HARD;
  const soft = o.soft > 0 && o.soft < hard ? o.soft : Math.max(1, hard - 10);
  const minScale = o.minScale > 0 && o.minScale < 1 ? o.minScale : 0.62;
  const attack = o.attack > 0 ? o.attack : 0.24; // çarpan/sn, aşan çağrı başına
  const release = o.release > 0 ? o.release : 0.07; // çarpan/sn
  let scale = 1;
  return {
    update(dt, calls) {
      if (!(dt > 0) || !Number.isFinite(dt) || !Number.isFinite(calls)) return scale;
      const d = Math.min(dt, 0.1);
      if (calls > hard) scale = Math.max(minScale, scale - attack * (calls - hard) * d);
      else if (calls < soft && scale < 1) scale = Math.min(1, scale + release * d);
      return scale;
    },
    get scale() {
      return scale;
    },
    reset() {
      scale = 1;
    },
  };
}

/** Şehir üçgen yöneticisi (aynı denetleyici, yüzde birimiyle): son karenin toplam üçgeni kademe bütçesinin %95'ini aşarsa çarpan düşer, %88'in altında yavaşça döner. */
export const CITY_TRIS_HARD = 95;
export const CITY_TRIS_SOFT = 88;
