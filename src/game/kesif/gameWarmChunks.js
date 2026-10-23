/*
 * KEŞİF — görünmeyen chunk mesh'lerini GPU'ya kare başına birkaç tane önceden yükler (ilk dönüşte ~100 ms'lik toplu yüklemeyi önler).
 *
 *   createChunkUploadWarmer({THREE, renderer, camera, chunkManager, getPostOn, fog, perFrame, budgetMs, now}) →
 *       { step(far) → yüklenen mesh sayısı, stats, dispose() }
 *
 * Mesh geometrisi three'de ilk ÇİZİLDİĞİNDE yüklenir; arkada/tıkalı bant bir kez kadraja girince (180° dönüş, üçüncü şahıs-önden
 * kamera) ~170 mesh tek karede yüklenir (RTX 3060'ta ~100 ms). Burada seçilen mesh'lerin kopyası (aynı geometri/malzeme) tek piksellik
 * makasla çizilir: yükleme yayılır, ekranda görünür hiçbir şey değişmez. Süre kare başına `budgetMs` ile sınırlıdır; yavaş karelerde
 * (dt > 30 ms) hiçbir şey yapılmaz. Seçim mantığı: render/chunkMgrWarm.js (saf, testli).
 */

const nowDefault = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export function createChunkUploadWarmer(d) {
  const THREE = d.THREE;
  const now = d.now || nowDefault;
  const budgetMs = d.budgetMs > 0 ? d.budgetMs : 3;
  let perFrame = d.perFrame > 0 ? d.perFrame : 3;
  const maxPerFrame = perFrame;
  const done = new WeakSet();
  const picked = [];
  const stats = { steps: 0, uploaded: 0, ms: 0, worstMs: 0 };
  const isDone = (m) => done.has(m.geometry);
  let proxy = null;
  let rt = null;
  let disposed = false;
  let idle = 0; // aday kalmayınca seçim sıklığı düşer (her kare tüm bantları gezmeye gerek yok)

  function ensureProxy() {
    if (proxy) return proxy;
    proxy = new THREE.Scene();
    return proxy;
  }

  function target(post) {
    if (!post) return null;
    if (!rt) rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
    return rt;
  }

  return {
    stats,
    /** far: sis mesafesi (blok). Dönüş: bu karede yüklenen mesh sayısı. */
    step(far) {
      if (disposed) return 0;
      if (idle > 0) { idle--; return 0; }
      const cam = d.camera;
      d.chunkManager.pickHidden(cam.position.x, cam.position.y, cam.position.z, far, perFrame, isDone, picked);
      if (picked.length === 0) { idle = 6; return 0; }
      const r = d.renderer;
      const t0 = now();
      const sc = ensureProxy();
      const clones = [];
      const prevRT = typeof r.getRenderTarget === 'function' ? r.getRenderTarget() : null;
      const prevScissor = r.getScissorTest();
      const prevAuto = r.autoClear;
      try {
        for (let i = 0; i < picked.length; i++) {
          const m = picked[i];
          const c = new THREE.Mesh(m.geometry, m.material);
          c.frustumCulled = false;
          sc.add(c);
          clones.push(c);
        }
        sc.fog = d.fog || null;
        r.setRenderTarget(target(d.getPostOn ? d.getPostOn() : false));
        r.autoClear = false;
        r.setScissorTest(true);
        r.setScissor(0, 0, 1, 1);
        r.render(sc, cam);
        for (let i = 0; i < picked.length; i++) done.add(picked[i].geometry);
      } catch {
        // yükleme başarısızsa yeniden denemesin (bağlam kaybı vb.)
        for (let i = 0; i < picked.length; i++) done.add(picked[i].geometry);
      } finally {
        for (let i = 0; i < clones.length; i++) sc.remove(clones[i]);
        r.setScissorTest(prevScissor);
        r.autoClear = prevAuto;
        try { r.setRenderTarget(prevRT); } catch { /* yut */ }
      }
      const ms = now() - t0;
      stats.steps++;
      stats.uploaded += clones.length;
      stats.ms += ms;
      if (ms > stats.worstMs) stats.worstMs = ms;
      // uyarlamalı: bütçeyi aşarsa sonraki karelerde daha az, rahatsa tekrar artır
      if (ms > budgetMs && perFrame > 1) perFrame--;
      else if (ms < budgetMs * 0.5 && perFrame < maxPerFrame) perFrame++;
      return clones.length;
    },
    dispose() {
      disposed = true;
      if (rt) { try { rt.dispose(); } catch { /* yut */ } rt = null; }
      proxy = null;
    },
  };
}
