/*
 * KEŞİF render — teknoloji görsellerinin toplayıcısı: portal çerçeveleri + makine efektleri + tarama işaretleri.
 *
 *   createTechVisuals(G, T) → { update(dt), dispose(), portal, machine, markers }
 *
 * G.scene + G.THREE gerekir (testlerde yoksa çağrılmaz). Hepsi tek karede ≤ 0,5 ms hedefler; makine taraması 8 Hz.
 */
import { SCANNER } from '../sim/techData.js';
import { createMachineFx } from './techMachineFx.js';
import { createBackpack } from './techBackpack.js';
import { createPortalVisual } from './techPortalVisual.js';
import { createScanMarkers } from './techScanMarkers.js';

export function createTechVisuals(G, T) {
  const THREE = G.THREE;
  const reduced = () => !!(G.reducedMotion || G.accessibility);
  const parent = G.scene;
  const skins = G.cosmetics ? G.cosmetics.skins : null; // Keşif mağaza görünümü (portal renkleri); yoksa varsayılan
  const portal = createPortalVisual(THREE, parent, { reducedMotion: reduced(), palette: skins && skins.portal ? skins.portal : null });
  const machine = createMachineFx(THREE, G, T, parent, { reducedMotion: reduced() });
  const markers = createScanMarkers(THREE, parent, { reducedMotion: reduced() });
  const backpack = createBackpack(THREE, G);
  let time = 0;
  let lastMavi;
  let lastTuruncu;

  function update(dt) {
    time += dt;
    const tech = T.tech;
    const pr = tech.portals;
    if (pr.mavi !== lastMavi || pr.turuncu !== lastTuruncu) {
      lastMavi = pr.mavi;
      lastTuruncu = pr.turuncu;
      portal.sync(tech.portalFrames());
    }
    const r = reduced();
    portal.update(dt, G.camera, G.particles, r, time);
    machine.update(dt, G.camera, time, r);
    const sc = tech.scanner;
    markers.sync(sc.pings, tech.time - sc.at, SCANNER.period + 4);
    markers.update(time, G.renderer && G.renderer.getPixelRatio ? G.renderer.getPixelRatio() : 1, r);
    backpack.update(!!T.jet.has, !!T.jet.thrusting, time);
  }

  function dispose() {
    portal.dispose();
    machine.dispose();
    markers.dispose();
    backpack.dispose();
  }

  return {
    update, dispose, portal, machine, markers, backpack,
  };
}
