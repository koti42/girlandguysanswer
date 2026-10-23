/*
 * KEŞİF mobs sistemi — ilk kullanımda takılmayı önlemek için shader/program ısınması.
 *
 *   warmPrograms(G, parts) → {pool:[model], keepers:[model]} | null
 *     renderer.compile ile telegraf, hasar sayısı sprite'ı, mermi/ışın malzemeleri, yere düşen eşya ve HER yaratık türünün
 *     malzeme varyantlarını (opak + ölüm çözülmesi/saydam; her ayrıntı kademesi) önceden derler.
 *
 * Not: three bir program, onu kullanan son malzeme bırakılınca silinir. Bu yüzden ısınma modelleri atılmaz:
 *   pool     normal (opak) durumdaki 1'er model/tür → görünüm havuzuna verilir (ilk doğuşta kurulum maliyeti de kalkar)
 *   keepers  saydam (çözülme) varyantını canlı tutan, çizilmeyen modeller (yalnızca program anahtarı bakımından benzersiz olanlar)
 * Yazılım GL'de her program saniyeler sürer, gerçek GPU'da onlarca ms; three derlemeyi paralel/asenkron başlatır, böylece iş
 * yükleme ekranında biter. Hatalar yutulur (ısınma isteğe bağlıdır).
 */
import { createMobModel } from '../render/mobModels.js';
import { createDroppedItem } from '../render/heldItems.js';
import { MOB_KEYS } from '../sim/mobTypes.js';
import { precompileForState } from '../gameWarm.js';

function programKeys(renderer, model, out) {
  const keys = [];
  model.root.traverse((o) => {
    const m = o.material;
    if (!o.isMesh && !o.isSprite) return;
    if (!m) return;
    const pr = renderer.properties.get(m);
    const cp = pr && pr.currentProgram;
    if (cp && cp.cacheKey) keys.push(cp.cacheKey);
  });
  if (out) for (let i = 0; i < keys.length; i++) out[keys[i]] = true;
  return keys;
}

function build(G, quality, seedBase, boneAtlas) {
  const models = [];
  for (let i = 0; i < MOB_KEYS.length; i++) {
    const m = createMobModel(G.THREE, MOB_KEYS[i], { quality, seed: seedBase + i, boneAtlas });
    m.root.position.set(G.camera.position.x, G.camera.position.y, G.camera.position.z);
    G.entityRoot.add(m.root);
    models.push(m);
  }
  return models;
}

/**
 * Programlar GERÇEK çizim hedefiyle derlenir: son işleme açıkken sahne yarı-kayan noktalı ara hedefe çizilir (çıkış renk uzayı
 * srgb-linear, ton eşleme yok); düz renderer.compile ekran hedefiyle (srgb + ton eşleme) başka program anahtarı üretir ve
 * kimseyle paylaşılmayan türler (kelebek kanadı, ateş böceği, kristal böceği) ilk görünüşte takılırdı (39–79 ms, 4K'da ~190 ms).
 */
function compileScene(G) {
  const post = !!(G.postfx && G.postfx.enabled);
  if (!precompileForState(G.THREE, G.renderer, G.scene, G.camera, post)) G.renderer.compile(G.scene, G.camera);
}

function compileLevels(G, models) {
  for (let lv = 0; lv < 3; lv++) {
    for (let i = 0; i < models.length; i++) models[i].setDetail(lv);
    compileScene(G);
  }
}

export function warmPrograms(G, parts, quality) {
  const renderer = G.renderer;
  if (!renderer || typeof renderer.compile !== 'function' || !renderer.properties || !G.scene || !G.camera) return null;
  const q = quality || 'low';
  const temp = [];
  const pool = [];
  const keepers = [];
  let dissolved = [];
  try {
    // 1) opak durum
    const atlas = parts.views && parts.views.boneAtlas ? parts.views.boneAtlas : undefined; // görünümlerle aynı program çeşidi
    const normal = build(G, q, 1, atlas);
    compileLevels(G, normal);
    // 2) saydam (çözülme) durumu: ikinci küme; yalnızca yeni program anahtarı getirenleri sakla
    dissolved = build(G, q, 101, atlas);
    for (let i = 0; i < dissolved.length; i++) dissolved[i].deathDissolve(0.5);
    // yere düşen eşyalar (standart + temel malzemeler, blok atlası)
    const keys = ['item:elmas', 'blok:taş', 'item:kılıç_demir'];
    for (let i = 0; i < keys.length; i++) {
      const g = createDroppedItem(G.THREE, keys[i]);
      G.entityRoot.add(g);
      temp.push(g);
    }
    if (parts.drops && typeof parts.drops.prime === 'function') parts.drops.prime(keys); // toplu çizimin instanced program çeşitleri
    parts.tele.warm(true);
    parts.floaters.warm(true);
    parts.shots.warm(true);
    compileLevels(G, dissolved);
    const seen = {};
    for (let i = 0; i < normal.length; i++) programKeys(renderer, normal[i], seen);
    const keep = [];
    for (let i = 0; i < dissolved.length; i++) {
      const ks = programKeys(renderer, dissolved[i], null);
      let fresh = false;
      for (let k = 0; k < ks.length; k++) {
        if (!seen[ks[k]]) {
          seen[ks[k]] = true;
          fresh = true;
        }
      }
      keep.push(fresh);
    }
    for (let i = 0; i < dissolved.length; i++) {
      const m = dissolved[i];
      if (keep[i]) {
        m.root.visible = false;
        keepers.push(m);
      } else {
        m.dispose();
      }
    }
    dissolved = [];
    for (let i = 0; i < normal.length; i++) {
      normal[i].reset();
      normal[i].root.visible = false;
      pool.push(normal[i]);
    }
    return { pool, keepers };
  } catch {
    for (let i = 0; i < pool.length; i++) pool[i].dispose();
    return null;
  } finally {
    try {
      parts.tele.warm(false);
      parts.floaters.warm(false);
      parts.shots.warm(false);
    } catch { /* yut */ }
    for (let i = 0; i < temp.length; i++) {
      if (temp[i].parent) temp[i].parent.remove(temp[i]);
    }
    for (let i = 0; i < dissolved.length; i++) dissolved[i].dispose();
  }
}
