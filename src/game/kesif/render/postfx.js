/*
 * KEŞİF render — post-fx: emisyon güdümlü bloom + vinyet + hafif renk derecelendirme/ton eşleme + su altı/hasar/iyileşme/boss/mühür
 * efektleri. Düşük kalite = doğrudan renderer.render (ara hedef yok).
 *
 *   createPostFx(THREE, {renderer, scene, camera, quality, reducedMotion}) → {
 *     render(dt), setSize(w, h, dpr), setQuality(q), warm(), setEffects({underwater, hurt, heal, boss, seal, warp, fade}),
 *     setCamera(camera), getEffectState(), tune(t), setGrade(name), setGradeRain(k), get enabled, dispose() }
 *
 * Neden özel çift-filtre bloom (UnrealBloomPass değil)? Bkz. postfxShaders.js: daha az geçiş/doku okuması, bağımlılık yok,
 * mobilde ucuz. Sahne HalfFloat HDR hedefe çizilir (chunk shader'ı emisyonu HDR ekler); bloom eşiği parlaklığa (>~1) bakar,
 * yani yalnız emisyonlu bloklar, güneş diski/parıltı ve lav parlar; gündüz yüzeyleri değil.
 * Renk yönetimi (r186): ara hedefler doğrusal; ton eşleme + sRGB dönüşümü yalnız son geçişte, three'nin
 * tonemapping_fragment/colorspace_fragment parçalarıyla yapılır (renderer.toneMapping / outputColorSpace'e uyar).
 * MSAA: HalfFloat render hedefinin `samples` özelliği (destek varsa). HalfFloat render desteği yoksa post-fx kapalı kalır.
 *
 * Boyut geçişi efektleri: `warp` (0..1; dilim kayması + RGB ayrışması + tarama; reducedMotion/erişilebilirlik'te otomatik siyaha karartmaya
 * çevrilir) ve `fade` (0..1 siyaha karartma). İkisi de YUMUŞATILMAZ (geçiş makinesi eğriyi sürer) ve düşük kademede (post-fx kapalı) bile
 * etkinken yalnız geçiş süresince ara hedefe çizilir (bloom/MSAA yok) → telefonda da geçiş görünür. Derecelendirme: setGrade('neon') şehir
 * ayarı {bloom .95, threshold .8, knee .5, saturation 1.18, vignette .28} (yağmurda bloom 1,1'e doğru), setGrade('overworld') eski değerler.
 *
 * Efekt değerleri 0..1 (boolean de kabul edilir); render(dt) içinde yumuşatılır. getEffectState() düşük kalitede
 * (post-fx kapalı) HUD'un CSS kaplamasıyla aynı efekti çizebilmesi için yumuşatılmış değerleri verir.
 */
import { QUALITY } from './quality.js';
import {
  FS_VERTEX, DOWN_FRAGMENT, UP_FRAGMENT, COMPOSITE_FRAGMENT,
} from './postfxShaders.js';

function qualityOf(q) {
  if (typeof q === 'string') return QUALITY[q] || QUALITY.high;
  return q || QUALITY.high;
}

function num(v) {
  return v === true ? 1 : v === false || v === undefined || v === null ? 0 : Math.max(0, Math.min(1, Number(v) || 0));
}

/** Boyuta göre renk derecelendirme/bloom ayarları (tune girdisi biçimi). overworld = createPostFx varsayılanları. */
export const POSTFX_GRADES = Object.freeze({
  overworld: Object.freeze({
    bloom: 0.5, threshold: 1.0, knee: 0.55, exposure: 1.0, saturation: 1.06, vignette: 0.85,
  }),
  neon: Object.freeze({
    bloom: 0.95, threshold: 0.8, knee: 0.5, exposure: 1.0, saturation: 1.18, vignette: 0.28,
  }),
});
/** Şehirde yağmurda bloom bu değere doğru artar (tasarım: 1,1). */
export const NEON_RAIN_BLOOM = 1.1;

export function createPostFx(THREE, opts) {
  const o = opts || {};
  const { renderer, scene } = o;
  let camera = o.camera;
  let q = qualityOf(o.quality);
  let reduced = !!o.reducedMotion;
  let disposed = false;

  const ext = renderer.extensions;
  const hdrOk = !!(ext && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')));
  const maxSamples = renderer.capabilities && renderer.capabilities.maxSamples ? renderer.capabilities.maxSamples : 0;

  // tam ekran üçgen
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const fsScene = new THREE.Scene();
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsMesh = new THREE.Mesh(tri, undefined);
  fsMesh.frustumCulled = false;
  fsScene.add(fsMesh);

  const mk = (frag, uniforms, extra) => new THREE.ShaderMaterial(Object.assign({
    vertexShader: FS_VERTEX,
    fragmentShader: frag,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }, extra || {}));

  const downMat = mk(DOWN_FRAGMENT, {
    tSrc: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uThreshold: { value: 1.0 },
    uKnee: { value: 0.55 },
    uPrefilter: { value: 0 },
  });
  const upMat = mk(UP_FRAGMENT, {
    tSrc: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uScale: { value: 1 },
  }, {
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  black.needsUpdate = true;
  const compUniforms = {
    tScene: { value: null },
    tBloom: { value: black },
    uTexel: { value: new THREE.Vector2() },
    uBloom: { value: 0.55 },
    uTime: { value: 0 },
    uUnder: { value: 0 },
    uHurt: { value: 0 },
    uHeal: { value: 0 },
    uBoss: { value: 0 },
    uSeal: { value: 0 },
    uVignette: { value: 0.85 },
    uExposure: { value: 1.0 },
    uSaturation: { value: 1.06 },
    uWobble: { value: reduced ? 0 : 1 },
    uAspect: { value: 1 },
    uWarp: { value: 0 },
    uFade: { value: 0 },
    uPhoto: { value: new THREE.Vector4(0, 1, 0, 0) },
  };
  const compMat = mk(COMPOSITE_FRAGMENT, compUniforms, { toneMapped: true });

  let sceneRT = null;
  let mips = [];
  let rtW = 0;
  let rtH = 0;
  let builtSamples = -1;
  let builtLevels = -1;
  let failed = false;
  let time = 0;
  let bloomK = 0.5;
  const eff = {
    underwater: 0, hurt: 0, heal: 0, boss: 0, seal: 0, warp: 0, fade: 0,
  };
  const tgt = {
    underwater: 0, hurt: 0, heal: 0, boss: 0, seal: 0, warp: 0, fade: 0,
  };
  let gradeName = 'overworld';
  let gradeRain = 0;
  const transitionActive = () => eff.warp > 0.001 || eff.fade > 0.001;
  let photoOn = false; // foto modu: filtre/gren/pozlama için düşük kademede de son geçiş çalışır
  const sizeV = new THREE.Vector2();

  function wantPost() {
    return (!!q.post || transitionActive() || photoOn) && hdrOk && !failed;
  }

  function applyGrade() {
    const g = POSTFX_GRADES[gradeName] || POSTFX_GRADES.overworld;
    const bloom = gradeName === 'neon' ? g.bloom + (NEON_RAIN_BLOOM - g.bloom) * gradeRain : g.bloom;
    bloomK = bloom;
    compUniforms.uExposure.value = g.exposure;
    compUniforms.uSaturation.value = g.saturation;
    compUniforms.uVignette.value = g.vignette;
    downMat.uniforms.uThreshold.value = g.threshold;
    downMat.uniforms.uKnee.value = g.knee;
  }

  function disposeTargets() {
    if (sceneRT) sceneRT.dispose();
    sceneRT = null;
    for (let i = 0; i < mips.length; i++) mips[i].dispose();
    mips = [];
    builtSamples = -1;
    builtLevels = -1;
  }

  function levelsWanted() {
    return q.bloom ? Math.max(2, Math.min(6, q.bloomLevels || 4)) : 0;
  }

  function build(w, h) {
    disposeTargets();
    rtW = Math.max(2, w);
    rtH = Math.max(2, h);
    const samples = Math.min(q.msaa || 0, maxSamples);
    try {
      sceneRT = new THREE.WebGLRenderTarget(rtW, rtH, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false,
        samples,
      });
      sceneRT.texture.generateMipmaps = false;
      const L = levelsWanted();
      let mw = rtW;
      let mh = rtH;
      for (let i = 0; i < L; i++) {
        mw = Math.max(2, mw >> 1);
        mh = Math.max(2, mh >> 1);
        const rt = new THREE.WebGLRenderTarget(mw, mh, {
          type: THREE.HalfFloatType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
        });
        rt.texture.generateMipmaps = false;
        mips.push(rt);
      }
      builtSamples = samples;
      builtLevels = L;
    } catch {
      failed = true;
      disposeTargets();
    }
  }

  function ensure() {
    renderer.getDrawingBufferSize(sizeV);
    const w = Math.floor(sizeV.x);
    const h = Math.floor(sizeV.y);
    if (!sceneRT || w !== rtW || h !== rtH || builtSamples !== Math.min(q.msaa || 0, maxSamples) || builtLevels !== levelsWanted()) {
      build(w, h);
    }
  }

  function pass(mat, target) {
    fsMesh.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(fsScene, fsCam);
  }

  function smooth(dt) {
    const k = Math.min(1, dt * 8);
    const kSlow = Math.min(1, dt * 3.5);
    eff.underwater += (tgt.underwater - eff.underwater) * kSlow * 1.4;
    eff.hurt += (tgt.hurt - eff.hurt) * (tgt.hurt > eff.hurt ? Math.min(1, dt * 30) : Math.min(1, dt * 4.5));
    eff.heal += (tgt.heal - eff.heal) * k * 0.6;
    eff.boss += (tgt.boss - eff.boss) * kSlow;
    eff.seal += (tgt.seal - eff.seal) * kSlow;
    for (const key in eff) if (Math.abs(eff[key] - tgt[key]) < 0.002) eff[key] = tgt[key];
  }

  function render(dt) {
    if (disposed) return;
    const step = dt > 0 ? Math.min(dt, 0.25) : 0;
    time += step;
    smooth(step);
    if (!wantPost()) {
      // düşük kademede geçiş bitti: geçiş için kurulan ara hedefler bırakılır
      if (!q.post && sceneRT) disposeTargets();
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    ensure();
    if (failed || !sceneRT) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    const prevAuto = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);
    renderer.autoClear = false;

    const L = mips.length;
    if (L > 0) {
      // aşağı: sahne → mip0 (parlak geçiş) → mip1 → …
      let src = sceneRT.texture;
      let sw = rtW;
      let sh = rtH;
      for (let i = 0; i < L; i++) {
        downMat.uniforms.tSrc.value = src;
        downMat.uniforms.uTexel.value.set(0.5 / sw, 0.5 / sh);
        downMat.uniforms.uPrefilter.value = i === 0 ? 1 : 0;
        pass(downMat, mips[i]);
        src = mips[i].texture;
        sw = mips[i].width;
        sh = mips[i].height;
      }
      // yukarı: mip[L-1] → mip[L-2] (toplamsal) → … → mip0
      for (let i = L - 1; i >= 1; i--) {
        upMat.uniforms.tSrc.value = mips[i].texture;
        upMat.uniforms.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height);
        upMat.uniforms.uScale.value = 1;
        pass(upMat, mips[i - 1]);
      }
      compUniforms.tBloom.value = mips[0].texture;
      compUniforms.uBloom.value = bloomK;
    } else {
      compUniforms.tBloom.value = black;
      compUniforms.uBloom.value = 0;
    }
    const u = compUniforms;
    u.tScene.value = sceneRT.texture;
    u.uTexel.value.set(1 / rtW, 1 / rtH);
    u.uTime.value = time;
    u.uUnder.value = eff.underwater;
    u.uHurt.value = reduced ? Math.min(eff.hurt, 0.6) : eff.hurt;
    u.uHeal.value = eff.heal;
    u.uBoss.value = eff.boss;
    u.uSeal.value = eff.seal;
    u.uWobble.value = reduced ? 0 : 1;
    u.uAspect.value = rtW / rtH;
    // reducedMotion: warp (dilim/RGB/tarama) yok → aynı eğri siyaha karartma olur (≤3 Hz, ani parlaklık değişimi yok)
    u.uWarp.value = reduced ? 0 : eff.warp;
    u.uFade.value = Math.max(eff.fade, reduced ? eff.warp * eff.warp * (3 - 2 * eff.warp) : 0);
    pass(compMat, null);
    renderer.autoClear = prevAuto;
  }

  return {
    render,

    /** w,h CSS pikseli; dpr piksel oranı. (Çizim tamponu boyutu otomatik izlenir; bu çağrı hedefleri hemen kurar.) */
    setSize(w, h, dpr) {
      if (disposed) return;
      const d = dpr > 0 ? dpr : 1;
      const pw = Math.max(2, Math.floor(w * d));
      const ph = Math.max(2, Math.floor(h * d));
      if (wantPost() && (pw !== rtW || ph !== rtH)) build(pw, ph);
    },

    /** 'low'|'medium'|'high' ya da quality.js ayar nesnesi ({post, bloom, bloomLevels, msaa}). */
    setQuality(nq) {
      q = qualityOf(nq);
      if (!q.post) disposeTargets();
    },

    setCamera(c) {
      camera = c;
    },

    /**
     * Son işleme programlarını (aşağı/yukarı örnekleme + birleştirme) çizimden ÖNCE bağlatır: son işleme kapalıyken açığa geçişte
     * ilk karede shader derlemesi beklenmesin. Gerçek hedef türleriyle derler (ara hedef HalfFloat, birleştirme ekrana).
     */
    warm() {
      if (disposed || !hdrOk || typeof renderer.compile !== 'function') return false;
      let rt = null;
      const prev = typeof renderer.getRenderTarget === 'function' ? renderer.getRenderTarget() : null;
      const prevMat = fsMesh.material;
      try {
        rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
        const jobs = [[downMat, rt], [upMat, rt], [compMat, null]];
        for (let i = 0; i < jobs.length; i++) {
          fsMesh.material = jobs[i][0];
          renderer.setRenderTarget(jobs[i][1]);
          renderer.compile(fsScene, fsCam);
        }
        return true;
      } catch {
        return false;
      } finally {
        fsMesh.material = prevMat;
        try { renderer.setRenderTarget(prev); } catch { /* yut */ }
        if (rt) rt.dispose();
      }
    },

    setReducedMotion(b) {
      reduced = !!b;
      compUniforms.uWobble.value = reduced ? 0 : 1;
    },

    /** {underwater, hurt, heal, boss, seal} — 0..1 ya da boolean; verilmeyen alan değişmez. */
    setEffects(e) {
      if (!e) return;
      if (e.underwater !== undefined) tgt.underwater = num(e.underwater);
      if (e.hurt !== undefined) tgt.hurt = num(e.hurt);
      if (e.heal !== undefined) tgt.heal = num(e.heal);
      if (e.boss !== undefined) tgt.boss = num(e.boss);
      if (e.seal !== undefined) tgt.seal = num(e.seal);
      // geçiş efektleri yumuşatılmaz: geçiş makinesi eğriyi kendisi sürer
      if (e.warp !== undefined) {
        tgt.warp = num(e.warp);
        eff.warp = tgt.warp;
      }
      if (e.fade !== undefined) {
        tgt.fade = num(e.fade);
        eff.fade = tgt.fade;
      }
    },

    /**
     * Foto modu (render/city/photoFx): {filter: 0..6 (0 yok), amount: 0..1, grain: 0..0.6, seed} ya da null/false (kapalı). Açıkken son geçiş (filtre, gren,
     * pozlama, vinyet) düşük kademede de çalışır; kapalıyken uPhoto.x = z = 0 ve ek maliyet yoktur.
     */
    setPhoto(p) {
      const v = compUniforms.uPhoto.value;
      if (!p) {
        photoOn = false;
        v.set(0, 1, 0, 0);
        return;
      }
      photoOn = true;
      const f = Number(p.filter);
      v.set(f >= 1 && f <= 6 ? Math.floor(f) : 0, Math.max(0, Math.min(1, p.amount === undefined ? 1 : Number(p.amount) || 0)), Math.max(0, Math.min(0.6, Number(p.grain) || 0)), reduced ? 0 : Number(p.seed) || 0);
    },

    /** 'overworld' | 'neon': bloom/eşik/diz/doygunluk/vinyet ayarı (bilinmeyen ad → overworld). */
    setGrade(name) {
      gradeName = POSTFX_GRADES[name] ? name : 'overworld';
      applyGrade();
    },

    /** Şehir derecelendirmesinde yağış şiddeti 0..1 (bloom 0,95 → 1,1). */
    setGradeRain(k) {
      const v = num(k);
      if (v === gradeRain) return;
      gradeRain = v;
      if (gradeName === 'neon') applyGrade();
    },

    /** Yumuşatılmış efekt değerleri (salt okunur). */
    getEffectState() {
      return eff;
    },

    /** Bloom yoğunluğu / pozlama ince ayarı: {bloom, exposure, saturation, vignette, threshold, knee}. */
    tune(t) {
      if (!t) return;
      if (t.bloom !== undefined) bloomK = t.bloom;
      if (t.exposure !== undefined) compUniforms.uExposure.value = t.exposure;
      if (t.saturation !== undefined) compUniforms.uSaturation.value = t.saturation;
      if (t.vignette !== undefined) compUniforms.uVignette.value = t.vignette;
      if (t.threshold !== undefined) downMat.uniforms.uThreshold.value = t.threshold;
      if (t.knee !== undefined) downMat.uniforms.uKnee.value = t.knee;
    },

    get enabled() {
      return wantPost();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      disposeTargets();
      downMat.dispose();
      upMat.dispose();
      compMat.dispose();
      black.dispose();
      tri.dispose();
    },
  };
}
