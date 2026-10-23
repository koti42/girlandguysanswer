/*
 * KEŞİF blok sistemi — blok yerleştirme: geçerlilik kuralları ve eylem.
 *
 *   checkPlacement(G,S,hit,blockId) → {ok, code}   (PAYLAŞILAN sonuç nesnesi — hemen oku)
 *       kodlar: 'ok' 'mode' 'readOnly' 'bounds' 'height' 'unloaded' 'occupied' 'player' 'mob' 'support'
 *   PLACE_MESSAGES[code]                           Türkçe ipucu metinleri
 *   isReplaceable(id)                              hava, sıvı, ot/çiçek (çapraz bitki, sertlik 0)
 *   placeHeld(G,S,hit,edge) → boolean              eldeki blok eşyasını hit.placeAt'e koyar (tüketir, ses/parçacık/olay)
 *   placeBlockAt(G,S,x,y,z,id,opts) → boolean      doğrudan yerleştirme (kontrolsüz değil: sınır/yüklü denetimi yapar)
 *
 * Kurallar: inşa modunda yalnız inşa edilebilir (id ≤ 99) bloklar, sıvı kaynakları yalnız inşada; harita modunda yerleştirme yok.
 * Dünya dışı/üretilmemiş hücre yok; hedef hücre boş/sıvı/ot olmalı; çarpışmalı blok oyuncu ya da yaratık gövdesine konamaz;
 * meşale/fener/bitki/kaktüs/sarmaşık destek ister (blocksSupport ile aynı kural, düşmeyecek yere konur).
 * Yönelim: blok verisinde meta yok; merdiven/kapı/yatak yönü mesher kuralıyla ('fixed') belirlenir → burada yön seçimi gerekmez.
 */
import { BLOCKS, LIQUID_LUT } from '../sim/blocks.js';
import { WORLD_H } from '../sim/constants.js';
import { ITEMS } from '../sim/items.js';
import {
  PLACE_REPEAT, deny, isReadOnly, overlapsMobs, overlapsPlayer, setHint, soundFor,
} from './blocksCore.js';
import { afterPlacement, isSupported, supportKind } from './blocksSupport.js';

export const PLACE_MESSAGES = Object.freeze({
  ok: '',
  mode: 'Bu modda bu blok yerleştirilemez.',
  bounds: 'Yapı alanının dışına blok konamaz.',
  height: 'Daha yükseğe ya da alçağa blok konamaz.',
  unloaded: 'Orası henüz yüklenmedi.',
  occupied: 'Orada zaten bir şey var.',
  player: 'Kendi içine blok koyamazsın.',
  mob: 'Orada bir yaratık var.',
  support: 'Bu blok orada tutunamaz.',
});

const RES = { ok: false, code: 'mode' };
function res(ok, code) {
  RES.ok = ok;
  RES.code = code;
  return RES;
}

export function isReplaceable(id) {
  if (id === 0) return true;
  if (LIQUID_LUT[id] === 1) return true;
  const b = BLOCKS[id];
  return !!b && b.shape === 'cross' && b.hardness === 0;
}

export function checkPlacement(G, S, hit, blockId) {
  return checkAt(G, hit.placeAt.x, hit.placeAt.y, hit.placeAt.z, blockId);
}

/** Konum + blok için tüm kurallar (mod, sınır, doluluk, gövde, destek). Yerleştirme hedefinden bağımsızdır. */
export function checkAt(G, x, y, z, blockId) {
  if (isReadOnly(G)) return res(false, 'readOnly');
  const rec = BLOCKS[blockId];
  if (!rec || blockId < 1) return res(false, 'mode');
  if (G.mode === 'insa' && !rec.buildable) return res(false, 'mode');
  if (rec.liquid && G.mode !== 'insa') return res(false, 'mode');
  const world = G.world;
  const yLo = world.legacy === false ? world.yMin + 1 : 1;
  const yHi = world.yMax !== undefined ? world.yMax : WORLD_H - 1;
  if (y < yLo || y > yHi) return res(false, 'height');
  if (world.frame && !world.isBlockInBounds(x, z)) return res(false, 'bounds');
  const cur = world.getBlock(x, y, z);
  if (cur === null) return res(false, 'unloaded');
  if (cur === blockId || !isReplaceable(cur)) return res(false, 'occupied');
  if (rec.solid) {
    if (overlapsPlayer(G, x, y, z, blockId)) return res(false, 'player');
    if (overlapsMobs(G, x, y, z, blockId)) return res(false, 'mob');
  }
  const kind = supportKind(blockId);
  if (kind && !isSupported(world, kind, blockId, x, y, z)) return res(false, 'support');
  return res(true, 'ok');
}

/** Doğrudan yerleştirme: kontrol + setBlock + olay/ses/parçacık. Eşya tüketimi çağıranda. */
export function placeBlockAt(G, S, x, y, z, id, opts) {
  const o = opts || {};
  const c = checkAt(G, x, y, z, id);
  if (!c.ok) return false;
  if (!G.world.setBlock(x, y, z, id)) return false;
  S.pos.x = x + 0.5; S.pos.y = y + 0.5; S.pos.z = z + 0.5;
  if (!o.silent) {
    G.sound(soundFor('place', id), S.pos, { vol: 0.8 });
    if (G.particles && G.particles.blockDust) {
      S.normal[0] = o.nx || 0; S.normal[1] = o.ny === undefined ? 1 : o.ny; S.normal[2] = o.nz || 0;
      G.particles.blockDust(id, S.pos, S.normal);
    }
  }
  G.emit({
    type: 'blockPlaced', x, y, z, id, item: o.item || null, by: o.by || 'player',
  });
  if (G.puzzles && typeof G.puzzles.handleInteract === 'function') {
    G.puzzles.handleInteract({
      type: 'blockPlaced', x, y, z, id, item: o.item || undefined, playerId: 'player',
    });
  }
  afterPlacement(G, S, x, y, z, id);
  return true;
}

/** Eldeki blok eşyasını hit.placeAt'e koyar. edge: tıklama kenarı (hata geri bildirimi yalnız kenarda). */
export function placeHeld(G, S, hit, edge) {
  const inv = G.inventory;
  const slot = inv ? inv.held() : null;
  if (!slot) return false;
  const it = ITEMS[slot.item];
  if (!it || !it.placesBlock) return false;
  const id = it.placesBlock;
  const c = checkPlacement(G, S, hit, id);
  if (!c.ok) {
    if (edge) {
      const p = S.plc;
      if (p.failT <= 0) {
        if (c.code === 'readOnly' || c.code === 'bounds' || c.code === 'height') {
          deny(G, S, c.code, c.code === 'readOnly' ? 'Bu haritada blok koyamazsın.' : PLACE_MESSAGES[c.code], 2);
        } else {
          G.sound('ui_error', undefined, { vol: 0.5 });
          setHint(G, S, PLACE_MESSAGES[c.code] || PLACE_MESSAGES.occupied, 2);
        }
        p.failT = 0.4;
      }
    }
    return false;
  }
  const px = hit.placeAt.x;
  const py = hit.placeAt.y;
  const pz = hit.placeAt.z;
  const ok = placeBlockAt(G, S, px, py, pz, id, {
    item: slot.item, nx: hit.face.nx, ny: hit.face.ny, nz: hit.face.nz,
  });
  if (!ok) return false;
  if (!inv.infinite) {
    const sel = inv.selected;
    if (slot.count > 1) inv.setSlot(sel, slot.item, slot.count - 1);
    else inv.setSlot(sel, null);
  }
  if (G.viewModel && G.viewModel.swing) G.viewModel.swing('place');
  S.charPlace.progress = 0;
  if (!G.charAction || G.charAction === S.charPlace || G.charAction === S.charMine) {
    G.charAction = S.charPlace;
    S.charT = 0.28;
  }
  G.haptic('light');
  S.plc.cool = PLACE_REPEAT;
  return true;
}
