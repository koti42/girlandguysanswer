/*
 * KEŞİF sim/props — PROP KATMANI bağlama yardımcıları (saf; three/DOM yok). Bir boyut bağlamı (DimCtx) için
 * {props: PropWorld, colliders: ColliderIndex} çiftini kurar ve World'e bağlar:
 *   world.colliders = layer.colliders        (physics.moveBox kancası okur; overworld'de null kalır → bayt-bayt aynı fizik)
 *   world 'chunkLoad'  → layer.props.loadChunk(cx,cz)         'chunkUnload' → layer.props.unloadChunk(cx,cz)
 *
 *   createPropLayer({citySeed, density?, choiceUi?}) → {props, colliders}
 *   attachPropLayer(world, layer) → detach()      idempotent (aynı world+layer ikinci kez bağlanırsa aynı detach döner); yüklü chunk'lar hemen yüklenir
 *   detachPropLayer(world)                        aboneliği keser, world.colliders'ı null yapar (prop durumu layer'da KALIR: boyuta dönünce sürer)
 *   layerOf(world) → layer | null
 * Boyut değişiminde (`swap`) eski dünya zaten boşaltılır; detach eski dünyayı bırakır, yeni dünya için attach çağrılır.
 */
import { ColliderIndex } from './colliderIndex.js';
import { PropWorld } from './propWorld.js';

const ATTACHED = new WeakMap();

export function createPropLayer(opts) {
  const o = opts || {};
  const colliders = new ColliderIndex();
  const props = new PropWorld({
    citySeed: o.citySeed, colliders, density: o.density, choiceUi: o.choiceUi,
  });
  return { props, colliders };
}

export function layerOf(world) {
  const a = ATTACHED.get(world);
  return a ? a.layer : null;
}

export function detachPropLayer(world) {
  const a = ATTACHED.get(world);
  if (!a) return false;
  a.offLoad();
  a.offUnload();
  if (world.colliders === a.layer.colliders) world.colliders = null;
  ATTACHED.delete(world);
  return true;
}

export function attachPropLayer(world, layer) {
  const cur = ATTACHED.get(world);
  if (cur && cur.layer === layer) return cur.detach;
  if (cur) detachPropLayer(world);
  const pw = layer.props;
  world.colliders = layer.colliders;
  const offLoad = world.on('chunkLoad', (e) => {
    const c = e && e.chunk;
    if (c) pw.loadChunk(c.cx, c.cz);
  });
  const offUnload = world.on('chunkUnload', (e) => {
    if (e) pw.unloadChunk(e.cx, e.cz);
  });
  const detach = () => {
    const a = ATTACHED.get(world);
    if (a && a.layer === layer) detachPropLayer(world);
  };
  ATTACHED.set(world, {
    layer, offLoad, offUnload, detach,
  });
  world.forEachChunk((c) => pw.loadChunk(c.cx, c.cz));
  return detach;
}
