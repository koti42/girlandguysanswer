/*
 * KEŞİF render — chunk işçisi (modül worker). Üretim + ışık + mesh hesabını ana thread'den uzakta yapar.
 *
 * Oluşturma:  new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })   (chunkMgrWorkers.js yapar)
 *
 * Protokol (ana thread → işçi):
 *   {t:'init', seed, mode, base, bounds, decorate:boolean, uvTable:Float32Array, meshOpts?:object, gen?:'overworld'|'city', dim?:string, ep?:number}
 *        → {t:'ready', decorate:boolean, ep}  decorate=false: istenmedi ya da sim/structures.js yüklenemedi
 *        init YENİDEN gönderilebilir (boyut geçişinde havuz devredilir): üretici/tohum/sınır/atlas/mesh seçenekleri değişir; işçiler yeniden
 *        başlatılmaz (şehir planı önbelleği ısınmış kalır). Sonraki her iş mesajı `ep` (epoch) taşır; yanıt aynı `ep`i yankılar → yönetici
 *        eski boyuttan kalan sonuçları atar. Her iş, kendi mesajı ALINDIĞI andaki bağlamla (gctx/uvTable/meshOpts) çalışır.
 *   {t:'gen', id, cx, cz, openRings, edits:Uint32Array|null, overlay:Uint8Array|null}
 *        → {t:'chunk', id, cx, cz, data:{cx,cz,legacy,secs:[si,b,l,…],heightMap,biomeMap}, ms}   (kesit tamponları TRANSFER edilir)
 *        yüzey bandı (y ≥ 0) + ışık; derin kesitler (y < 0) tembeldir → 'gensec'
 *   {t:'gensec', id, cx, cz, sis:number[], openRings, edits:Uint32Array|null}
 *        → {t:'sections', id, cx, cz, list:[{si,b}], ms}                                         (b: Uint8Array | tek tip sayı)
 *   {t:'mesh', id, cx, cz, band:{s0,ns}, version, lod?:0|1|2, center:wire, nb:{n,s,e,w,ne,nw,se,sw}}
 *        → {t:'meshed', id, cx, cz, version, mesh, ms}                           (mesh tamponları TRANSFER edilir)
 *        wire = chunkMgrCore.chunkToWire(chunk, s0-1, s0+ns): {cx,cz,yMin,sectionCount,s0,sb,sl,biomeMap}
 *   {t:'setAtlas', uvTable}   {t:'setMeshOpts', opts}   {t:'dispose'}
 *   hata → {t:'error', id, message}      tanılama → {t:'log', message}
 *
 * Sözleşmedeki taslaktan farklar: düzenlemeler `gen` mesajıyla (Uint32Array) gelir (ayrı setEdits yok); `gen` yanıtı mesh
 * İÇERMEZ — chunk World'e alınıp komşu ışık dikişi yapıldıktan sonra `mesh` işi ayrı gönderilir (komşu verisi gerekir).
 *
 * Yapı kancası: sim/structures.js eşzamanlı yazıldığı için DİNAMİK içe aktarılır; yoksa/yüklenemezse kanca yok (decorate:false
 * bildirilir ve ana thread buna göre işçi yolunu bırakır → iki yol aynı dünyayı üretir).
 */
import {
  makeGenContext, generateChunkData, generateSectionsData, chunkToTransfer, meshFromWire,
} from './chunkMgrCore.js';
import { collectTransferables } from './mesher.js';

let gctx = null;
let uvTable = null;
let meshOpts = null;
let decorateReady = Promise.resolve(false);

/** Yanıta epoch ekler. */
function reply(msg, src, transfer) {
  if (src && src.ep !== undefined) msg.ep = src.ep;
  post(msg, transfer);
}

function post(msg, transfer) {
  self.postMessage(msg, transfer || []);
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

async function loadDecorate() {
  try {
    const m = await import('../sim/structures.js');
    return typeof m.decorateChunk === 'function' ? m.decorateChunk : null;
  } catch (e) {
    post({ t: 'log', message: 'sim/structures.js yüklenemedi: ' + String((e && e.message) || e) });
    return null;
  }
}

async function onInit(msg) {
  const g = makeGenContext({
    seed: msg.seed, mode: msg.mode, base: msg.base, bounds: msg.bounds, gen: msg.gen, dim: msg.dim,
  });
  gctx = g;
  uvTable = msg.uvTable || null;
  meshOpts = msg.meshOpts || null;
  let ok = false;
  if (msg.decorate) {
    const mine = loadDecorate().then((fn) => {
      g.decorate = fn;
      return !!fn;
    });
    decorateReady = mine;
    ok = await mine;
  } else {
    decorateReady = Promise.resolve(false);
  }
  reply({ t: 'ready', decorate: ok }, msg);
}

// Not: her iş, mesajı alındığı andaki bağlamla (g/uv/mo) çalışır; arada yeni init gelse bile eski epoch'un işi eski bağlamla biter.
function onGen(msg, g) {
  const t0 = now();
  const c = generateChunkData(g, msg.cx, msg.cz, msg.openRings, msg.edits || null, msg.overlay || null);
  const tr = chunkToTransfer(c);
  reply({
    t: 'chunk',
    id: msg.id,
    cx: msg.cx,
    cz: msg.cz,
    data: tr.data,
    ms: now() - t0,
  }, msg, tr.transfer);
}

function onGenSec(msg, g) {
  const t0 = now();
  const r = generateSectionsData(g, msg.cx, msg.cz, msg.sis, msg.openRings, msg.edits || null);
  reply({
    t: 'sections',
    id: msg.id,
    cx: msg.cx,
    cz: msg.cz,
    list: r.list,
    ms: now() - t0,
  }, msg, r.transfer);
}

function onMesh(msg, uv, mo) {
  const t0 = now();
  const mesh = meshFromWire(msg.center, msg.nb, uv, mo, msg.lod | 0, msg.band || null);
  reply({
    t: 'meshed',
    id: msg.id,
    cx: msg.cx,
    cz: msg.cz,
    version: msg.version,
    mesh,
    ms: now() - t0,
  }, msg, collectTransferables(mesh));
}

self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || typeof msg.t !== 'string') return;
  try {
    switch (msg.t) {
      case 'init':
        onInit(msg).catch((e) => reply({ t: 'error', id: -1, message: String((e && e.message) || e) }, msg));
        break;
      case 'gen': {
        const g = gctx;
        decorateReady.then(() => onGen(msg, g)).catch((e) => reply({ t: 'error', id: msg.id, message: String((e && e.message) || e) }, msg));
        break;
      }
      case 'gensec': {
        const g = gctx;
        decorateReady.then(() => onGenSec(msg, g)).catch((e) => reply({ t: 'error', id: msg.id, message: String((e && e.message) || e) }, msg));
        break;
      }
      case 'mesh':
        onMesh(msg, uvTable, meshOpts);
        break;
      case 'setAtlas':
        uvTable = msg.uvTable;
        break;
      case 'setMeshOpts':
        meshOpts = msg.opts || null;
        break;
      case 'dispose':
        self.close();
        break;
      default:
        break;
    }
  } catch (e) {
    reply({ t: 'error', id: msg.id === undefined ? -1 : msg.id, message: String((e && e.message) || e) }, msg);
  }
};
