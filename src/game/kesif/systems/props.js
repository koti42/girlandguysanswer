/*
 * KEŞİF — "props" sistemi (order 23): şehir proplarının (sim/props) oyuna bağlanması. Sözleşme KESIF_CITY_CONTRACT §6, §20.
 *
 *   G.props        geçerli boyutun PropWorld'ü (overworld'de null); G.propRenderer  prop çizicisi (tek örnek; boyut değişince setWorld)
 *   Her boyut bağlamı {props, colliders} çifti taşır (gameDimension DimCtx); sistem
 *     • neon dünyasında G.props yoksa katmanı kendisi kurar (createPropLayer) ve World'e bağlar (attachPropLayer: world.colliders + chunk olayları),
 *     • G.props başka bir PropWorld'e dönüşünce (swap) yeniden bağlar ve çiziciye verir (eski dünyanın katmanı kendi bağlamında kalır),
 *     • overworld'de çizici gizlenir (sıfır maliyet; world.colliders null → fizik bayt-bayt aynı).
 *   fixedUpdate: PropWorld.tick(dt) (zamanlayıcılar) → efektleri yürütür; oturma denetleyicisi (propsSeat) ve ortam sesleri (propsAmbient).
 *   frameUpdate: sokak çizicisi + iç mekân çizicisi (render/props/propRendererInterior: chunk başına pişirilmiş tek çağrı; sokak grubunun çocuğu).
 *   Olaylar (onEvent): propSeat → oturma/yatma (zıpla/F ile kalkış) · lockOpened → kilit köprüsü (propIndoor.markLockOpen).
 *   Etkileşim (kullan/ipucu) blocks sistemindeki iki kancadan gelir (propsInteract.js); efektler propsEffects.js'de yürütülür.
 *   serialize/restore: {v:1, props:{id36:[state,flags,extra?]}} — dimState.js boyut kaydı ctx.props.serialize()'ı zaten yazar; bu sistem yalnız
 *   boyut bağlamı olmayan (tek dünya/test) durumlar için kendi kaydını tutar (G.dimMgr varsa null).
 * Olaylar: propUsed {id,key,t,x,y,z,effects}, propUi {ui,…}, propDialog, propLock, dimensionOp {op:'back'|'home'}, terminalFound (terminal efekti).
 * Hata ayıklama: G.propStats() → render istatistikleri.   Kalite: G.quality.settings.effTier → çizici kademesi ('low' | 'medium' | 'high').
 */
import * as THREE from 'three';
import { createPropRenderer } from '../render/props/propRenderer.js';
import { createInteriorPropRenderer } from '../render/props/propRendererInterior.js';
import {
  attachPropLayer, createPropLayer, detachPropLayer, layerOf,
} from '../sim/props/propLayer.js';
import { markLockOpen } from '../sim/props/propIndoor.js';
import { runPropEffects } from './propsEffects.js';
import { createSeatController } from './propsSeat.js';
import { createPropAmbience } from './propsAmbient.js';

const TIER_DENSITY = Object.freeze({ low: 0.5, medium: 0.8, high: 1 });

export function createSystem(G) {
  let renderer = null;
  let interior = null;
  const seat = createSeatController(G);
  const ambience = createPropAmbience(G, { limit: 2 });
  let shown = null;
  let msgText = null;
  let msgT = 0;

  function tierOf() {
    const q = G.quality && G.quality.settings ? G.quality.settings.effTier : null;
    return q === 'low' || q === 'medium' || q === 'high' ? q : 'high';
  }

  function say(text) {
    msgText = text;
    msgT = 5;
    if (G.hud) G.hud.hint = text;
    if (typeof G.speak === 'function') G.speak(text);
  }

  function ensureRenderer() {
    if (renderer || !G.scene) return renderer;
    renderer = createPropRenderer({
      THREE,
      uniforms: G.materials ? G.materials.uniforms : undefined,
      quality: tierOf(),
      createCanvas: G.opts && typeof G.opts.createCanvas === 'function' ? G.opts.createCanvas : undefined,
      anisotropy: 4,
    });
    G.scene.add(renderer.group);
    G.propRenderer = renderer;
    renderer.group.visible = false;
    interior = createInteriorPropRenderer({
      THREE,
      uniforms: G.materials ? G.materials.uniforms : undefined,
      quality: tierOf(),
      signAtlas: renderer.atlas,
      createCanvas: G.opts && typeof G.opts.createCanvas === 'function' ? G.opts.createCanvas : undefined,
      anisotropy: 4,
    });
    renderer.group.add(interior.group);
    G.interiorPropRenderer = interior;
    return renderer;
  }

  /** Çizicinin gösterdiği PropWorld'ü değiştirir (null = gizle). */
  function show(pw) {
    if (shown === pw) return;
    shown = pw;
    const r = pw ? ensureRenderer() : renderer;
    if (!r) return;
    const getLight = (x, y, z) => (G.world ? G.world.getLight(x, y, z) : 0);
    if (pw) {
      r.setWorld(pw, { getLight });
      if (interior) interior.setWorld(pw, { getLight });
      r.group.visible = true;
    } else {
      r.setWorld(null);
      if (interior) interior.setWorld(null);
      r.group.visible = false;
    }
  }

  /**
   * Geçerli G.world için prop katmanını doğrular/bağlar (idempotent; her adımda ucuz: iki WeakMap erişimi). G.world önbelleğe alınmaz:
   * eski dünyaya bağlı katman, dünya bağlamında (DimCtx) kalır ve geri dönülünce aynı PropWorld ile sürer.
   */
  function sync() {
    const world = G.world;
    if (!world) return;
    if (world.dim !== 'neon') {
      show(null);
      return;
    }
    let layer = layerOf(world);
    if (G.props) {
      if (!layer || layer.props !== G.props) layer = { props: G.props, colliders: G.props.colliders };
    } else {
      if (!layer) layer = createPropLayer({ citySeed: world.seed, density: TIER_DENSITY[tierOf()] });
      G.props = layer.props;
    }
    attachPropLayer(world, layer);
    show(layer.props);
  }

  return {
    name: 'props',
    order: 23,

    init() {
      G.propStats = () => {
        if (!renderer) return null;
        const st = Object.assign({}, renderer.stats);
        if (interior) {
          st.interior = Object.assign({}, interior.stats);
          st.draws += interior.stats.draws;
          st.tris += interior.stats.tris;
        }
        return st;
      };
      G.propSeat = seat;
      sync();
    },

    onDimension() {
      seat.stand('dim');
      sync();
    },

    onEvent(_G, e) {
      if (!e) return;
      if (e.type === 'propSeat') seat.start(e);
      else if (e.type === 'lockOpened' && typeof e.lockId === 'string') markLockOpen(e.lockId);
    },

    fixedUpdate(_G, dt) {
      sync();
      const pw = G.props;
      if (!pw) return;
      const fx = pw.tick(dt);
      if (fx.length > 0) runPropEffects(G, fx, { say });
      seat.fixedUpdate(dt);
      ambience.setLimit({ low: 1, medium: 2, high: 3 }[tierOf()]);
      ambience.update(dt);
      if (msgT > 0) {
        msgT -= dt;
        if (msgT <= 0 && G.hud && G.hud.hint === msgText) G.hud.hint = null;
      }
    },

    frameUpdate(_G, dt) {
      if (!renderer || !G.props || !G.camera) return;
      const t = tierOf();
      if (renderer.quality !== t) renderer.setQuality(t);
      renderer.update(dt, G.camera);
      if (interior) {
        if (interior.quality !== t) interior.setQuality(t);
        interior.update(dt, G.camera);
      }
    },

    serialize() {
      if (G.dimMgr || !G.props) return null;
      return { v: 1, props: G.props.serialize() };
    },

    restore(_G, data) {
      if (!data || typeof data !== 'object' || !G.props) return;
      G.props.restore(data.props);
    },

    dispose() {
      seat.stand('dim');
      if (G.world) detachPropLayer(G.world);
      if (interior) {
        if (renderer) renderer.group.remove(interior.group);
        interior.dispose();
      }
      if (renderer) {
        if (G.scene) G.scene.remove(renderer.group);
        renderer.dispose();
      }
      interior = null;
      G.interiorPropRenderer = null;
      G.propSeat = null;
      renderer = null;
      shown = null;
      G.propRenderer = null;
      G.propStats = null;
      G.props = null;
    },
  };
}
