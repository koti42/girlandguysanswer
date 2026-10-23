/*
 * KEŞİF render — birleşik yaratıkların kemik matrisleri için ORTAK doku (tek yükleme/kare).
 *
 *   createBoneAtlas(THREE, {rows = 64}) → { texture, capacity, used, begin(), add(rig) → taban dizin | -1, end(), dispose() }
 *
 * three her iskelet için ayrı kemik dokusu kurar ve çizilen HER karede yeniden yükler (yaratık başına ≈ 2 KB, 30 yaratık = 30 eşzamanlı
 * doku yüklemesi ≈ 0,8 ms CPU+GPU, RTX 3060'ta ölçüldü). Burada tüm görünür yaratıkların matrisleri tek DataTexture'a ardışık yazılır ve kare
 * başına TEK yükleme yapılır; her yaratığın malzemesi `uBoneBase` ile kendi dilimine bakar (mobMerge.patchRigidSkinShader). Matris düzeni
 * three'nin getBoneMatrix'iyle aynıdır: matris i = 4 texel, x = (4i) % genişlik, y = (4i) / genişlik.
 *
 * Kare protokolü (mobsModels.update sonunda): atlas.begin(); her görünür yaratık için `base = atlas.add(rig)` (rig.refreshBones() çağrılır ve
 * rig.uBase.value = base yazılır); atlas.end(). Hiçbir şey değişmediyse (aynı yerleşim, dilimler hâlâ rig'e ait, kirli rig yok) doku yeniden yüklenmez.
 */
export function createBoneAtlas(THREE, opts) {
  const o = opts || {};
  const width = 256; // texel; 64 matris/satır
  const rows = o.rows > 0 ? o.rows : 64;
  const capacity = (width / 4) * rows;
  const data = new Float32Array(width * rows * 4);
  const texture = new THREE.DataTexture(data, width, rows, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const owners = new Int32Array(capacity); // slot başına son yazan rig kimliği (başkası ezdiyse içerik yeniden yazılır)
  let nextId = 1;
  let cursor = 0;
  let lastCursor = -1;
  let changed = true;
  let disposed = false;

  return {
    texture,
    capacity,
    get used() { return cursor; },
    /** Kare başı. */
    begin() {
      cursor = 0;
      changed = false;
    },
    /**
     * rig: {bones.length, cache(Float32Array n*16), refreshBones() → true (içerik değişti) | false, uBase:{value}, lastBase, atlasId}
     * Dönüş: taban matris dizini; kapasite dolduysa -1 (yaratık çizilmemeli).
     */
    add(rig) {
      const n = rig.bones ? rig.bones.length : 0;
      if (n === 0 || cursor + n > capacity) return -1;
      const dirty = rig.refreshBones();
      const base = cursor;
      if (!rig.atlasId) rig.atlasId = nextId++;
      const id = rig.atlasId;
      let valid = !dirty && rig.lastBase === base;
      if (valid) {
        for (let k = 0; k < n; k++) {
          if (owners[base + k] !== id) { valid = false; break; }
        }
      }
      if (!valid) {
        data.set(rig.cache, base * 16);
        for (let k = 0; k < n; k++) owners[base + k] = id;
        changed = true;
      }
      rig.lastBase = base;
      rig.uBase.value = base;
      cursor += n;
      return base;
    },
    /** Kare sonu: yerleşim ya da içerik değiştiyse tek yükleme. */
    end() {
      if (disposed) return;
      if (changed || cursor !== lastCursor) texture.needsUpdate = true;
      lastCursor = cursor;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
    },
  };
}
