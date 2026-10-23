/*
 * KEŞİF — "crowdVisual" sistemi (order 36): yaya çizimi (Neon Meridyen Faz 4, paket crowd_ai). Sözleşme §10, §17.
 * Yaya benzetimi (systems/crowd.js, G.crowd) verisini okur; render/city/crowdModels.js çizicisini sürer. Oyun durumunu DEĞİŞTİRMEZ.
 *
 *   G.crowdRender             çizici (crowdModels.createCrowdRenderer); yalnız şehirde sahneye görünür
 *   G.crowdRenderStats()      çizici istatistikleri ({near, mid, far, umbrellas, shadows, draws, tris, dropped})
 *   G.crowdVisualDebug        {extra: [betimleyici…], hideSim, tierOverride}  galeri/test: ek yayalar, benzetimi gizleme, kademe ezme (üretimde boş)
 *   Girdi (okur): G.crowd.fillView(alpha) (yumuşak ara değer), G.cityLook.state {night,rain,wet,shelter}, G.quality.settings.effTier, G.reducedMotion/G.accessibility,
 *                 G.materials.uniforms (paylaşılan gök/sis/ıslaklık/neon)
 */
import * as THREE from 'three';
import { createCrowdRenderer } from '../render/city/crowdModels.js';

export const CROWD_VISUAL_ORDER = 36;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function createSystem(G) {
  let rend = null;
  let warmed = false;
  let shown = false;
  const desc = {
    look: null, x: 0, y: 0, z: 0, yaw: 0, speed: 0, phase: 0, gesture: 0, tier: 0, fade: 1, umb: 0, lookYaw: 0, sky: 1, blk: 0, id: 0,
  };
  const env = {
    night: 0, rain: 0, wet: 0, shelter: 0, reduced: false,
  };

  const dbg = { extra: [], hideSim: false };

  function tierOf() {
    const q = G.quality && G.quality.settings ? G.quality.settings.effTier : null;
    return q === 'low' || q === 'medium' || q === 'high' ? q : 'high';
  }

  function ensure() {
    if (rend || !G.scene) return rend;
    rend = createCrowdRenderer({
      THREE,
      uniforms: G.materials ? G.materials.uniforms : undefined,
      quality: tierOf(),
      reducedMotion: !!(G.reducedMotion || G.accessibility),
    });
    G.scene.add(rend.group);
    G.crowdRender = rend;
    rend.group.visible = false;
    return rend;
  }

  const system = {
    name: 'crowdVisual',
    order: CROWD_VISUAL_ORDER,

    init() {
      G.crowdVisualDebug = dbg;
      G.crowdRenderStats = () => (rend ? rend.getStats() : null);
    },

    frameUpdate(_G, dt, alpha) {
      const cr = G.crowd;
      // ısınma geçişin DONMUŞ (hold) karelerinde yapılsın: yaya benzetimi (G.crowd) donuk sabit adım yüzünden geçiş bitince doğar → eskiden ısınma
      // geçiş sonrası ilk karede (~450 ms takılma) olurdu (perf_tuner, Faz 5)
      if (!warmed && G.dim === 'neon' && G.world && G.renderer && G.camera && G.scene && ensure()) {
        warmed = true;
        const vmg0 = G.viewModel && G.viewModel.group;
        const vmWas0 = vmg0 ? vmg0.visible : false;
        const variants0 = vmg0 ? [{ enter() { vmg0.visible = true; }, exit() {} }, { enter() { vmg0.visible = false; }, exit() { vmg0.visible = vmWas0; } }] : null;
        rend.warm(G.renderer, G.scene, G.camera, { variants: variants0 });
      }
      if (G.dim !== 'neon' || !G.world || (!cr && dbg.extra.length === 0)) {
        if (rend && shown) {
          rend.group.visible = false;
          shown = false;
        }
        return;
      }
      if (!ensure()) return;
      if (!shown) {
        rend.group.visible = true;
        shown = true;
      }
      rend.setQuality(tierOf());
      const lk = G.cityLook && G.cityLook.state ? G.cityLook.state : null;
      env.night = lk ? lk.night : 0;
      env.rain = lk ? lk.rain : 0;
      env.wet = lk ? lk.wet : 0;
      env.shelter = lk ? lk.shelter : 0;
      env.reduced = !!(G.reducedMotion || G.accessibility);
      rend.beginFrame(G.camera, clamp(dt || 0.016, 0.001, 0.1), env);
      const v = cr ? cr.fillView(clamp(alpha === undefined ? 1 : alpha, 0, 1)) : null;
      const peds = cr ? cr.peds : null;
      for (let k = 0; v && !dbg.hideSim && k < v.count; k++) {
        const p = peds[v.idx[k]];
        desc.look = p.look;
        desc.x = v.x[k]; desc.y = v.y[k]; desc.z = v.z[k]; desc.yaw = v.yaw[k]; desc.speed = v.speed[k]; desc.phase = v.phase[k];
        desc.gesture = v.gesture[k]; desc.tier = v.tier[k]; desc.fade = v.fade[k]; desc.umb = v.umb[k]; desc.lookYaw = v.lookYaw[k];
        desc.sky = v.sky[k]; desc.blk = v.blk[k]; desc.id = v.id[k];
        rend.add(desc);
      }
      for (let i = 0; i < dbg.extra.length; i++) {
        const e = dbg.extra[i];
        desc.speed = 0; desc.phase = 0; desc.gesture = 0; desc.tier = 0; desc.umb = 0; desc.lookYaw = 0; desc.blk = 0; desc.yaw = 0; desc.id = i + 1;
        Object.keys(e).forEach((key) => { desc[key] = e[key]; });
        if (e.sky === undefined) desc.sky = 1;
        if (e.fade === undefined) desc.fade = 1;
        rend.add(desc);
      }
      rend.endFrame();
    },

    onDimension(_G, _from, to) {
      const toId = typeof to === 'string' ? to : (to && to.id) || 'overworld';
      if (rend && toId !== 'neon') {
        rend.group.visible = false;
        shown = false;
      }
    },

    dispose() {
      if (rend) {
        if (rend.group.parent) rend.group.parent.remove(rend.group);
        rend.dispose();
      }
      rend = null;
      G.crowdRender = null;
    },
  };
  return system;
}

export default createSystem;
