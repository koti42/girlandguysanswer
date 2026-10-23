/*
 * KEŞİF — kalite kademesi shader'larını yükleme ekranında / ilk karelerde, küçük dilimlerle önceden derler ve çizdirir.
 *
 *   planTierVariants(curTier) → [{tier, post, material, clouds}]    başka kademelerin program anahtarını belirleyen alanlar (saf)
 *   needsUnit(kind, variant, cur) → bool                            bu birim o kademe için yeniden derlenmeli mi (saf)
 *   createSliceClock({budgetMs, now}) → {start(), over(), spent()}  dilim bütçesi saati (saf; testlerde sahte `now`)
 *   collectUnits(G) → [{obj, mat, kind}]                            sahnedeki benzersiz malzemeler (+ henüz mesh'i olmayan chunk malzemeleri)
 *   createTierWarmer(G) → { step(budgetMs) → {done, ms, units}, done, compiled, stats, reset() }
 *
 * Neden: ilk high→medium/low geçişinde ~0,5 sn donma vardı (gerçek RTX 3060/ANGLE-D3D11). Program anahtarı üç şeyden oluşur —
 *   (1) çizim hedefi: son işleme açıkken sahne HalfFloat ara hedefe, kapalıyken ekrana çizilir (çıkış renk uzayı/ton eşleme farklı →
 *       sahnedeki TÜM malzemelerin programı yeniden bağlanır, ~40 program), (2) chunk malzeme tanımları (USE_NORMAL_MAP/HIGH_DETAIL),
 *   (3) gökyüzü bulut kipi.
 * Yalnız `renderer.compile` yetmez: ANGLE/D3D11 girdi/çıktı düzenine bağlı program çeşitlerini ÇİZİM anında derler. Bu yüzden iki geçiş:
 *   A) derleme: diğer kademelerin durumu (malzeme tanımı + bulut kipi + hedef türü) GEÇİCİ kurulur, `renderer.compile` ile bağlanma
 *      başlatılır (KHR_parallel_shader_compile: arka planda); durum aynı çağrıda geri alınır.
 *   B) çizim: program hazırsa (isReady) birimin kopyası (aynı geometri/malzeme) 1×1 pikselde çizilir → çizim-zamanı çeşitleri derlenir.
 * three her malzemenin kullandığı programları kendi `programs` haritasında tuttuğundan gerçek geçişte her şey hazırdır.
 * Hiçbir kare farklı durumda çizilmez (durum yalnız tek bir dilimin içinde geçici açılır). Dilim bütçesi dolunca durur.
 */
import { QUALITY } from './render/quality.js';
import { MESH_ATTRIBUTES } from './render/mesher.js';

export const TIERS = Object.freeze(['low', 'medium', 'high']);

const nowDefault = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/** Kademenin program anahtarını etkileyen alanları. */
export function variantOf(tier) {
  const q = QUALITY[tier] || QUALITY.medium;
  return {
    tier: q.key, post: !!q.post, material: q.material, clouds: q.clouds,
  };
}

/**
 * Isıtılacak kademeler. Sıra: önce otomatik uyarlamanın ineceği bir alt kademe, sonra bir üst, sonra kalan. Geçerli kademe yoktur.
 */
export function planTierVariants(curTier) {
  const cur = TIERS.indexOf(curTier) >= 0 ? curTier : 'medium';
  const i = TIERS.indexOf(cur);
  const order = [];
  if (i > 0) order.push(TIERS[i - 1]);
  if (i < TIERS.length - 1) order.push(TIERS[i + 1]);
  for (let k = 0; k < TIERS.length; k++) if (order.indexOf(TIERS[k]) < 0 && TIERS[k] !== cur) order.push(TIERS[k]);
  return order.map(variantOf);
}

/**
 * Birim türüne göre gerekli mi? kind: 'chunk' (chunk malzemeleri) | 'sky' (gökyüzü kubbesi) | 'other' (kalan her şey).
 * cur: {post, material, clouds}. Hedef türü değişiyorsa her şeyin programı değişir; yoksa yalnız tanımı değişenler.
 */
export function needsUnit(kind, variant, cur) {
  if (variant.post !== cur.post) return true;
  if (kind === 'chunk') return variant.material !== cur.material;
  if (kind === 'sky') return variant.clouds !== cur.clouds;
  return false;
}

/** Dilim saati: start() ile başlar, over() bütçe dolduysa true. `now` enjekte edilebilir. */
export function createSliceClock(opts) {
  const o = opts || {};
  const now = o.now || nowDefault;
  const budget = o.budgetMs > 0 ? o.budgetMs : 6;
  let t0 = 0;
  return {
    start() { t0 = now(); },
    over() { return now() - t0 >= budget; },
    spent() { return now() - t0; },
    get budget() { return budget; },
  };
}

/** Malzeme listesi (dizi ya da tek) → dizi. */
function matsOf(obj) {
  const m = obj && obj.material;
  if (!m) return [];
  return Array.isArray(m) ? m : [m];
}

/**
 * Sahnedeki benzersiz malzemeler için birim listesi (malzeme başına ilk nesne). kind: chunk/sky/other.
 * G: {scene, materials, sky, THREE}.
 */
export function collectUnits(G) {
  const chunkMats = new Set();
  const cm = G.materials || {};
  [cm.opaque, cm.cutout, cm.transparent].forEach((m) => { if (m) chunkMats.add(m); });
  const skyRoot = G.sky && G.sky.object3D ? G.sky.object3D : null;
  const seen = new Set();
  const units = [];
  G.scene.traverse((obj) => {
    if (!(obj.isMesh || obj.isPoints || obj.isLine || obj.isSprite)) return;
    const ms = matsOf(obj);
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      // program çeşidi: malzeme + (instanced / deri) → aynı malzemeyi kullanan farklı türde nesneler ayrı birimdir
      const uk = m ? m.uuid + (obj.isInstancedMesh ? ':i' : '') + (obj.isSkinnedMesh ? ':s' : '') : '';
      if (!m || seen.has(uk)) continue;
      seen.add(uk);
      let kind = 'other';
      if (chunkMats.has(m)) kind = 'chunk';
      else if (skyRoot) {
        for (let p = obj; p; p = p.parent) if (p === skyRoot) { kind = 'sky'; break; }
      }
      units.push({ obj, mat: m, kind });
    }
  });
  // sahnede henüz mesh'i olmayan chunk malzemeleri (ör. su/saydam: ilk su chunk'ı gelmeden) için çizilmeyen kukla ağ
  if (G.THREE && chunkMats.size > 0) {
    chunkMats.forEach((m) => {
      if (seen.has(m.uuid)) return; // (chunk malzemeleri sahnede yalnız düz Mesh olarak bulunur)
      // gerçek chunk geometrisiyle aynı öznitelik kümesi (three program anahtarı `normal` vb. varlığına bakar → farklı olursa ısınma boşa gider)
      const geo = new G.THREE.BufferGeometry();
      for (let i = 0; i < MESH_ATTRIBUTES.length; i++) {
        const at = MESH_ATTRIBUTES[i];
        geo.setAttribute(at.name, new G.THREE.BufferAttribute(new Float32Array(at.itemSize * 3), at.itemSize));
      }
      const mesh = new G.THREE.Mesh(geo, m);
      mesh.frustumCulled = false;
      units.push({ obj: mesh, mat: m, kind: 'chunk', dummy: geo });
    });
  }
  return units;
}

/**
 * Boyut değişince kademe ısınmasını yeniden planlatır (qa_gpu): şehir sahnesinin prop/araç/yaya/gökdelen malzemeleri ana diyardakinden farklı program çeşitleri taşır; ısınma ana diyarda bitmiş
 * olsa da şehirde ilk kalite değişimi 0,7–1,4 sn donuyordu. state: {dim:null|string} (çağıranın tuttuğu nesne). İlk çağrı yalnız boyutu kaydeder. Dönüş: sıfırlandı mı.
 * (Isınma dilimleri geçişin donuk/siyah `hold` karelerinde de çalışır: derleme takılmaları görünmez. Gecikmeli/geçiş dışı başlatma denendi: kademe değişimiyle yarışıp
 * bırakılmış programlara `glGetProgramiv` uyarısı veriyordu; bu yüzden hemen yeniden planlanır.)
 */
export function syncWarmDim(warmer, state, dim) {
  if (!warmer || !state || state.dim === dim) return false;
  const had = state.dim !== null && state.dim !== undefined;
  state.dim = dim;
  if (!had) return false;
  if (typeof warmer.reset === 'function') warmer.reset();
  return true;
}

export function createTierWarmer(G, opts) {
  const o = opts || {};
  const now = o.now || nowDefault;
  const MAX_WAITS = o.maxWaits > 0 ? o.maxWaits : 240; // hazır olmayan program için en çok bu kadar dilim beklenir
  let gapMs = o.gapMs >= 0 ? o.gapMs : 0; // çizim geçişinde iki dilim arası en az bekleme (GPU kuyruğu boşalsın: eşzamanlı sorgular beklemesin)
  let lastDrawAt = -1e9;
  const stats = {
    slices: 0, units: 0, drawn: 0, skipped: 0, variants: 0, ms: 0, worstSliceMs: 0, errors: 0, worstUnitMs: 0, slow: [],
  };
  const noteUnit = (u, phase, ms) => {
    if (ms > stats.worstUnitMs) stats.worstUnitMs = ms;
    if (ms > 12 && stats.slow.length < 12) {
      stats.slow.push({
        phase, ms: Math.round(ms), kind: u.kind, name: u.obj.name || u.obj.type, mat: u.mat.name || u.mat.type, inst: !!u.obj.isInstancedMesh,
      });
    }
  };
  let done = false;
  let planKey = '';
  let variants = null; // [{variant, current, units|null, ci, di, waits}]
  let phase = 'compile'; // 'compile' → 'draw'
  let vc = 0; // derleme geçişinde varyant dizini
  let vd = 0; // çizim geçişinde varyant dizini
  let proxy = null;
  let rt = null;

  const keyOf = (s) => (s.post ? 1 : 0) + '|' + s.material + '|' + s.clouds;

  function disposeRt() {
    if (rt) { try { rt.dispose(); } catch { /* yut */ } rt = null; }
  }

  /** Yalnız ışık/sis taşıyan küçük sahne: compile/draw tüm sahneyi (yüzlerce chunk) her çağrıda gezmesin. */
  function buildProxy() {
    const THREE = G.THREE;
    const p = new THREE.Scene();
    p.fog = G.scene.fog;
    // yalnız sahne kökündeki ışıklar (yarım küre + güneş): kol grubundaki meşale ışığı gibi geçici ışıklar program anahtarına SAYILMAZ
    // (anahtar ışık sayısını içerir; meşale kapalıyken gerçek çizim ışıksız anahtarla yapılır → fazladan ısıtma boşa derleme olurdu)
    for (let i = 0; i < G.scene.children.length; i++) {
      const obj = G.scene.children[i];
      if (obj.isLight && obj.visible) {
        try { p.add(obj.clone(false)); } catch { /* yut */ }
      }
    }
    return p;
  }

  function begin() {
    const cur = G.quality && G.quality.settings ? G.quality.settings : null;
    if (!cur || !G.renderer || typeof G.renderer.compile !== 'function' || !G.scene || !G.camera) return false;
    planKey = keyOf(cur);
    const plan = planTierVariants(cur.tier);
    // Aynı (post, material, clouds) üçlüsü bir kez; geçerli durumla aynı olan diğer kademeler atılır
    const seen = {};
    seen[planKey] = true;
    variants = [];
    for (let i = 0; i < plan.length; i++) {
      const v = plan[i];
      const key = keyOf(v);
      if (seen[key]) continue;
      seen[key] = true;
      variants.push({
        variant: v, current: false, units: null, ci: 0, di: 0, waits: 0,
      });
    }
    // geçerli durumun çizim-zamanı program çeşitleri en sona (ilk kullanım takılmaları: yağmur, ilk ölüm, ilk üçüncü şahıs…)
    variants.push({
      variant: variantOf(cur.tier), current: true, units: null, ci: 0, di: 0, waits: 0,
    });
    phase = 'compile';
    vc = 0;
    vd = 0;
    proxy = buildProxy();
    return true;
  }

  function target(post) {
    if (!post) return null;
    if (!rt) rt = new G.THREE.WebGLRenderTarget(8, 8, { type: G.THREE.HalfFloatType });
    return rt;
  }

  /** Birimin kopyasını 1×1 piksellik makasla çizer: ANGLE/D3D çizim-zamanı program çeşitleri (girdi/çıktı düzeni) burada derlenir. */
  function drawUnit(u) {
    const r = G.renderer;
    const clone = u.obj.clone(false);
    clone.visible = true;
    clone.frustumCulled = false;
    if (clone.isInstancedMesh && clone.count < 1) clone.count = 1; // boş toplu ağ da çizilsin: çizim-zamanı program çeşidi derlensin
    const prevScissor = r.getScissorTest();
    const prevAuto = r.autoClear;
    try {
      proxy.add(clone);
      r.autoClear = false;
      r.setScissorTest(true);
      r.setScissor(0, 0, 1, 1);
      r.render(proxy, G.camera);
    } finally {
      r.setScissorTest(prevScissor);
      r.autoClear = prevAuto;
      proxy.remove(clone);
      if (clone.isInstancedMesh && typeof clone.dispose === 'function') clone.dispose();
    }
  }

  /**
   * Birimin programını (varyant durumunda) hazırlar. compileOnly: yalnız bağlanmayı başlat. Aksi halde program hazırsa çizer.
   * Dönüş: çizildi mi (compileOnly'de hep true).
   */
  function prepare(u, v, cs, compileOnly) {
    const r = G.renderer;
    let ready = true;
    const body = () => {
      r.compile(u.obj, G.camera, proxy);
      if (compileOnly) return;
      const pr = r.properties && r.properties.get ? r.properties.get(u.mat) : null;
      const cp = pr ? pr.currentProgram : null;
      ready = !cp || typeof cp.isReady !== 'function' || cp.isReady();
      if (ready) drawUnit(u);
    };
    if (u.kind === 'chunk' && v.material !== cs.material && G.materials && typeof G.materials.setQuality === 'function') {
      G.materials.setQuality(v.material);
      try { body(); } finally { G.materials.setQuality(cs.material); }
    } else if (u.kind === 'sky' && v.clouds !== cs.clouds && G.sky && typeof G.sky.setQuality === 'function') {
      G.sky.setQuality({ clouds: v.clouds });
      try { body(); } finally { G.sky.setQuality({ clouds: cs.clouds }); }
    } else body();
    return ready;
  }

  /** Birimleri ilk kez gerektiğinde kurar (dilim içinde: gezinti ucuz; birimler malzeme başınadır). */
  function initEntry(entry, v, curState) {
    if (entry.units) return;
    const all = collectUnits(G);
    entry.units = entry.current ? all : all.filter((u) => needsUnit(u.kind, v, curState));
    // durum geçişi gerektirenler (gökyüzü/chunk) önce, kalanlar sonra
    entry.units.sort((x, y) => (x.kind === 'other' ? 1 : 0) - (y.kind === 'other' ? 1 : 0));
    stats.variants++;
    // son işlemenin kendi programları (aşağı/yukarı/birleştirme): kapalıyken açık kademeye geçişte
    if (!entry.current && v.post && !curState.post && G.postfx && typeof G.postfx.warm === 'function') G.postfx.warm();
  }

  function releaseDummies(entry) {
    if (!entry.units) return;
    for (let i = 0; i < entry.units.length; i++) if (entry.units[i].dummy) entry.units[i].dummy.dispose();
  }

  /**
   * İki geçiş: 1) DERLEME (tüm kademeler: bağlanmayı başlat; ucuz → yükleme ekranında biter), 2) ÇİZİM (hazır olanları 1×1 pikselde çiz;
   * bağlanması bitmeyeni beklemeden sonraki dilime bırak). Böylece bir kademenin bekleyen programı diğerlerinin derlenmesini geciktirmez.
   */
  function sliceOnce(budgetMs) {
    const clock = createSliceClock({ budgetMs, now });
    clock.start();
    const cur = G.quality.settings;
    const curState = { post: !!cur.post, material: cur.material, clouds: cur.clouds };
    const compiling = phase === 'compile';
    const entry = variants[compiling ? vc : vd];
    const v = entry.current ? curState : entry.variant;
    const r = G.renderer;
    const prevRT = typeof r.getRenderTarget === 'function' ? r.getRenderTarget() : null;
    // Isınma çizimlerinde program hata denetimi (getProgramInfoLog = bağlanmayı BEKLEYEN eşzamanlı sorgu) kapalı: bağlanma arka planda sürer
    const dbg = r.debug && typeof r.debug === 'object' ? r.debug : null;
    const prevCheck = dbg ? dbg.checkShaderErrors : true;
    if (dbg && o.skipShaderCheck !== false) dbg.checkShaderErrors = false;
    try {
      initEntry(entry, v, curState);
      r.setRenderTarget(target(v.post));
      if (compiling) {
        while (entry.ci < entry.units.length) {
          const tu = now();
          prepare(entry.units[entry.ci], v, curState, true);
          noteUnit(entry.units[entry.ci], 'compile', now() - tu);
          entry.ci++;
          stats.units++;
          if (clock.over()) break;
        }
      } else if (now() - lastDrawAt >= gapMs) {
        while (entry.di < entry.units.length) {
          const tu = now();
          const okDraw = prepare(entry.units[entry.di], v, curState, false);
          noteUnit(entry.units[entry.di], 'draw', now() - tu);
          if (okDraw) {
            entry.di++;
            entry.waits = 0;
            stats.drawn++;
          } else if (++entry.waits >= MAX_WAITS) {
            entry.di++;
            entry.waits = 0;
            stats.skipped++;
          } else break;
          if (clock.over() || gapMs > 0) break;
        }
        lastDrawAt = now();
      }
    } catch {
      stats.errors++;
      entry.ci = entry.units ? entry.units.length : 0;
      entry.di = entry.ci;
    } finally {
      try { r.setRenderTarget(prevRT); } catch { /* yut */ }
      if (dbg) dbg.checkShaderErrors = prevCheck;
    }
    if (compiling) {
      if (entry.units && entry.ci >= entry.units.length) {
        vc++;
        if (vc >= variants.length) phase = 'draw';
      }
    } else if (entry.units && entry.di >= entry.units.length) {
      releaseDummies(entry);
      vd++;
    }
    return clock.spent();
  }

  function finishAll() {
    done = true;
    disposeRt();
    proxy = null;
  }

  const api = {
    stats,
    get done() { return done; },
    /** Derleme geçişi (programları bağlatma) tüm kademeler için bitti mi? Yükleme ekranı bunu bekler; çizim geçişi sonra kare döngüsünde sürer. */
    get compiled() {
      return done || (!!variants && phase === 'draw');
    },
    /** Bir dilim çalıştırır (en çok ~budgetMs + bir birim). Bitince done=true. */
    step(budgetMs) {
      if (done) return { done: true, ms: 0, units: 0 };
      if (variants && G.quality && G.quality.settings && keyOf(G.quality.settings) !== planKey) api.reset(); // durum değişti: yeniden planla
      if (!variants && !begin()) { finishAll(); return { done: true, ms: 0, units: 0 }; }
      if (vd >= variants.length) { finishAll(); return { done: true, ms: 0, units: 0 }; }
      const before = stats.units + stats.drawn;
      const ms = sliceOnce(budgetMs > 0 ? budgetMs : 6);
      stats.slices++;
      stats.ms += ms;
      if (ms > stats.worstSliceMs) stats.worstSliceMs = ms;
      if (vd >= variants.length) finishAll();
      return { done, ms, units: stats.units + stats.drawn - before };
    },
    /** Çizim dilimleri arası en az bekleme (ms). */
    setGap(ms) { gapMs = ms >= 0 ? ms : 0; },
    /** Yeniden başlat (ör. kalite durumu değişti): sıfırdan planlar. */
    reset() {
      if (variants) for (let i = 0; i < variants.length; i++) releaseDummies(variants[i]);
      done = false;
      variants = null;
      phase = 'compile';
      vc = 0;
      vd = 0;
      disposeRt();
      proxy = null;
    },
  };
  return api;
}
