/*
 * KEŞİF — "content" sistemi (order 30): DÜNYA İÇERİĞİ katmanı. Yapılar, bulmacalar, parkur, mühür/kristal/boss kapıları, ilerleme
 * entegrasyonu, harita/günlük ve rehberlik.
 *
 * Alt modüller (hepsi systems/content*.js):
 *   contentStructures  yapı kayıt defteri (bölge hücreleri, bulmaca kaydı, sandık/tabela/arena/güvenli bölge, keşif)
 *   contentPuzzles     oyuncu ↔ PuzzleManager (use/step/push/entity/portalShot), efektler (teleport/carry/giveItem/takeItem…)
 *   contentParkour     başlangıç/kontrol/bitiş, süre HUD'u, düşüş sıfırlama, yok olan platformlar
 *   contentSeal        Anahtar Kristali, Mühür Sunağı yuvaları, geçit animasyonu, bölge halkası eş zamanlı açılış
 *   contentBoss        boss kapıları/arka kasa, arena durumu, zafer
 *   contentProgress    görev HUD'u, ipuçları, ödül kuyruğu, yetenek eşyaları, gözcü kulesi, api.getGuidance
 *   contentMap         api.getMapInfo / api.getJournal
 *   contentGuide       sıradaki hedef + pusula (saf mantık)   contentAnim  kapı açma animasyonları   contentFx  ses/parçacık/ileti
 *
 * G'ye eklenenler (sistem kurar): G.content (= durum S), G.structureChests Map "x,y,z"→sandık tanımı, G.structureSigns Map "x,y,z"→
 * {text,name,structureId}, G.safeZones [{id,x,z,r}], G.arenas [{id,zone,key,name,x,y,z,r,entrance,door,rewardDoor,chest,unlocked,done}].
 *
 * Dinlenen olaylar: blockUse{x,y,z,id?,item?} (evt.handled=true işaretlenir), blockBroken (kristal kayası), portalShot, puzzleSolved,
 *   sealProgress, sealComplete, zoneUnlocked, bossDoor, bossDefeated, victory, ability, respawn, zoneEnter ve görev olayları.
 * Yayılan olaylar: structureDiscovered, crystalCollected, crystalPlaced, parkourDone, checkpoint, reveal, reward (yeniden bildirim).
 * api: getMapInfo, getJournal, getPuzzleHint, resetNearestPuzzle, getGuidance, markRewardClaimed, getPendingRewards.
 * Yalnız macera modunda içerik çalışır; insa/harita modunda api güvenli boş değerler döner.
 */
import { createContentFx } from './contentFx.js';
import { createContentState } from './contentState.js';
import { initStructures, updateStructures } from './contentStructures.js';
import {
  disposePuzzles, fixedPuzzles, handleUse, initPuzzles, onPortalShot, onPuzzleSolved, puzzleApi,
} from './contentPuzzles.js';
import { fixedParkour, initParkour } from './contentParkour.js';
import {
  disposeSeal, fixedSeal, initSeal, onBlockBroken, onSealEvent,
} from './contentSeal.js';
import { fixedBoss, initBoss, onBossEvent } from './contentBoss.js';
import {
  fixedProgress, frameProgress, initProgress, onProgressEvent, progressApi,
} from './contentProgress.js';
import { initMap, mapApi, tickMap } from './contentMap.js';
import { fixedAnims, flushAnims } from './contentAnim.js';

export function createSystem(G) {
  const fx = createContentFx(G);
  const S = createContentState(G, fx);
  const live = () => S.mode === 'macera' && !!G.progression && !!G.puzzles && G.dim !== 'neon';
  let mapT = 0;
  return {
    name: 'content',
    order: 30,
    S,

    init() {
      initMap(S);
      if (!live()) return;
      initPuzzles(S);
      initSeal(S);
      initBoss(S);
      initParkour(S);
      initProgress(S);
      initStructures(S); // kancalar kayıtlıyken: ilk bölge dolumu
    },

    fixedUpdate(_G, dt) {
      if (!live()) return;
      updateStructures(S, dt);
      fixedPuzzles(S, dt);
      fixedParkour(S, dt);
      fixedAnims(S, dt);
      fixedSeal(S);
      fixedBoss(S, dt);
      fixedProgress(S, dt);
      mapT += dt;
      if (mapT >= 0.2) {
        mapT = 0;
        tickMap(S);
      }
    },

    /** Boyut değişti: overworld'e dönüşte yapı taraması bulunulan konumdan yeniden başlar (şehirdeyken içerik donuktu). */
    onDimension() {
      S.lastX = -1e9;
      S.lastZ = -1e9;
      S.regQueue.length = 0;
    },

    frameUpdate(_G, dt) {
      if (!live()) {
        fx.frame(dt);
        return;
      }
      frameProgress(S, dt);
    },

    onEvent(_G, evt) {
      if (!live() || !evt) return;
      switch (evt.type) {
        case 'blockUse':
          if (Number.isFinite(evt.x) && Number.isFinite(evt.y) && Number.isFinite(evt.z)) handleUse(S, Math.floor(evt.x), Math.floor(evt.y), Math.floor(evt.z), evt);
          break;
        case 'portalShot':
          onPortalShot(S, evt);
          break;
        case 'puzzleSolved':
          onPuzzleSolved(S, evt);
          onProgressEvent(S, evt);
          break;
        case 'blockBroken':
          onBlockBroken(S, evt);
          break;
        case 'crystal':
        case 'sealProgress':
        case 'sealComplete':
        case 'zoneUnlocked':
          onSealEvent(S, evt);
          onProgressEvent(S, evt);
          break;
        case 'bossDoor':
        case 'bossDefeated':
        case 'victory':
          onBossEvent(S, evt);
          onProgressEvent(S, evt);
          break;
        case 'tick':
        case 'inventoryChanged':
        case 'uiChanged':
        case 'fx':
          break;
        default:
          onProgressEvent(S, evt);
      }
    },

    api() {
      return Object.assign({}, puzzleApi(S), progressApi(S), mapApi(S));
    },

    dispose() {
      flushAnims(S);
      disposePuzzles(S);
      disposeSeal(S);
    },
  };
}

export default createSystem;
