/*
 * KEŞİF bulmaca altyapısı — efektler (saf).
 *
 * Bulmaca `interact`/`tick` işlevleri `{state, effects:[...]}` döner. Efekt biçimleri:
 *   {kind:'setBlock', x,y,z,id}              dünyaya blok yaz (kayıtlı düzenleme olur)
 *   {kind:'setBlocks', blocks:[[x,y,z,id]…]} toplu yazım
 *   {kind:'sound', name, x?,y?,z?}           ses (oyun/ses katmanı çalar)
 *   {kind:'particles', fx, x,y,z, color?}    parçacık
 *   {kind:'message', text}                   Türkçe ipucu/ileti (HUD + sesli okuma)
 *   {kind:'solved'}                          bulmacayı çözülmüş say (isSolved zaten true ise gerekmez)
 *   {kind:'spawn', type,x,y,z, opts?}        varlık doğur
 *   {kind:'giveItem', item, count}           oyuncuya eşya ver
 *   {kind:'reset'}                           bulmacayı başlangıç durumuna döndür (yanlış hamlede otomatik sıfırlama)
 * Bilinmeyen `kind`lar olduğu gibi `onEffect`e iletilir (ileri uyum).
 */

/** Efekt kurucuları: `fx.setBlock(x,y,z,id)` vb. */
export const fx = Object.freeze({
  setBlock: (x, y, z, id) => ({ kind: 'setBlock', x, y, z, id }),
  setBlocks: (blocks) => ({ kind: 'setBlocks', blocks }),
  sound: (name, x, y, z) => ({ kind: 'sound', name, x, y, z }),
  particles: (name, x, y, z, color) => ({ kind: 'particles', fx: name, x, y, z, color }),
  message: (text) => ({ kind: 'message', text }),
  solved: () => ({ kind: 'solved' }),
  spawn: (type, x, y, z, opts) => ({ kind: 'spawn', type, x, y, z, opts }),
  giveItem: (item, count) => ({ kind: 'giveItem', item, count: count === undefined ? 1 : count }),
  reset: () => ({ kind: 'reset' }),
});

function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

/**
 * Efekt listesini uygular. `target`:
 *   setBlock(x,y,z,id)              ZORUNLU (World, FakeWorld ya da PuzzleManager olabilir)
 *   spawnEntity(type,x,y,z,opts)    ops.   — 'spawn' efektleri için
 *   onEffect(effect)                ops.   — blok-dışı her efekt için (sound/particles/message/spawn/giveItem/bilinmeyen)
 * Döner: { applied, skipped, solved:boolean, reset:boolean, events:[blok-dışı efektler] }
 * (`solved`/`reset` işaretlerini çağıran uygular; bu işlev bulmaca durumuna dokunmaz.)
 */
export function applyEffects(target, effects, extra) {
  const out = {
    applied: 0, skipped: 0, solved: false, reset: false, events: [],
  };
  if (!effects || !target) return out;
  const list = Array.isArray(effects) ? effects : [effects];
  const meta = extra || null;
  const forward = (e) => {
    const ev = meta ? Object.assign({}, e, meta) : e;
    out.events.push(ev);
    if (typeof target.onEffect === 'function') target.onEffect(ev);
  };
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || typeof e !== 'object' || typeof e.kind !== 'string') {
      out.skipped++;
      continue;
    }
    switch (e.kind) {
      case 'setBlock':
        if (isInt(e.x) && isInt(e.y) && isInt(e.z) && isInt(e.id) && e.id >= 0 && e.id <= 127) {
          target.setBlock(e.x, e.y, e.z, e.id);
          out.applied++;
        } else out.skipped++;
        break;
      case 'setBlocks':
        if (Array.isArray(e.blocks)) {
          for (let k = 0; k < e.blocks.length; k++) {
            const b = e.blocks[k];
            if (b && isInt(b[0]) && isInt(b[1]) && isInt(b[2]) && isInt(b[3]) && b[3] >= 0 && b[3] <= 127) {
              target.setBlock(b[0], b[1], b[2], b[3]);
            } else out.skipped++;
          }
          out.applied++;
        } else out.skipped++;
        break;
      case 'solved':
        out.solved = true;
        out.applied++;
        break;
      case 'reset':
        out.reset = true;
        out.applied++;
        break;
      case 'spawn':
        if (typeof e.type === 'string' && typeof target.spawnEntity === 'function') {
          target.spawnEntity(e.type, e.x, e.y, e.z, e.opts);
        }
        forward(e);
        out.applied++;
        break;
      case 'message':
        if (typeof e.text === 'string' && e.text.length > 0) {
          forward(e);
          out.applied++;
        } else out.skipped++;
        break;
      default:
        forward(e);
        out.applied++;
    }
  }
  return out;
}
