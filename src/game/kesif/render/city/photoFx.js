/*
 * KEŞİF render/city — FOTO MODU GÖRSELİ (photo_map, Neon Meridyen Faz 4). Dünyayı DEĞİŞTİRMEZ: saat/yağmur ön ayarları yalnız kare çizimi boyunca geçerlidir,
 * kare bitince (G.afterRender, gameRender.render sonunda) gerçek değerler geri yüklenir. Simülasyon dondurma ayrı (systems/cityPhoto: G.simFrozen).
 *
 *   createPhotoFx(G) → fx
 *     fx.active                       foto modu görseli açık mı
 *     fx.begin()                      açılış: G.afterRender kancasını kurar (yalnız-görsel geçersiz kılma geri alıcısı)
 *     fx.apply(settings, camPose, opts)   HER KARE (sistemlerin frameUpdate'i; render.frame ÖNCESİ): saat/yağmur ön ayarı, postfx (pozlama, bloom, vinyet, filtre, gren),
 *                                     kamera konumu/yönü/FOV, oyuncu/elde eşya görünürlüğü. camPose {x,y,z,yaw,pitch}; opts {hideSelf, driving}
 *     fx.restore()                    geçersiz kılmayı geri al (afterRender çağırır; idempotent)
 *     fx.end()                        kapanış: geri al, postfx foto modunu kapat, derecelendirmeyi sıfırla, kancayı bırak
 *     fx.stats                        {frames, swaps, restores}
 *   drawFrame(ctx, w, h, frameId, opts)   çerçeve + (isteğe bağlı) «Neon Meridyen» imi; kayıt ve önizleme AYNI geometriyi (photoMath.frameLayout) kullanır
 *   MARK_TEXT
 */
import {
  filterIndex, frameLayout, phaseOf, rainOf, tuneFor,
} from '../../sim/city/map/photoMath.js';

export const MARK_TEXT = 'Neon Meridyen';

const wrap01 = (v) => v - Math.floor(v);

/* ------------------------------------------------------------------------------------------------
 * Çerçeve çizimi (yalnız 2D bağlam; DOM yok)
 * ---------------------------------------------------------------------------------------------- */
function mark(ctx, w, h, lay, color) {
  const size = Math.max(11, Math.round(Math.min(w, h) * 0.026));
  ctx.save();
  ctx.font = '700 ' + size + 'px system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  if (lay.caption > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2a2f45';
    ctx.fillText(MARK_TEXT, w / 2, h - lay.border - Math.round(lay.caption * 0.3));
  } else {
    ctx.textAlign = 'right';
    const x = w - Math.max(10, lay.border + 8);
    const y = h - Math.max(10, lay.border + lay.bars + 8);
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = Math.round(size * 0.4);
    ctx.fillStyle = color || 'rgba(255,255,255,0.82)';
    ctx.fillText(MARK_TEXT, x, y);
  }
  ctx.restore();
}

export function drawFrame(ctx, w, h, frameId, opts) {
  if (!ctx || !(w > 0) || !(h > 0)) return;
  const o = opts || {};
  const lay = frameLayout(w, h, frameId);
  ctx.save();
  switch (frameId) {
    case 'ince': {
      ctx.strokeStyle = lay.color;
      ctx.lineWidth = lay.border * 2;
      ctx.strokeRect(0, 0, w, h);
      break;
    }
    case 'anlik': {
      ctx.fillStyle = lay.color;
      ctx.fillRect(0, 0, w, lay.border);
      ctx.fillRect(0, 0, lay.border, h);
      ctx.fillRect(w - lay.border, 0, lay.border, h);
      ctx.fillRect(0, h - lay.border - lay.caption, w, lay.border + lay.caption);
      break;
    }
    case 'sinema': {
      ctx.fillStyle = lay.color;
      if (lay.bars > 0) {
        ctx.fillRect(0, 0, w, lay.bars);
        ctx.fillRect(0, h - lay.bars, w, lay.bars);
      }
      break;
    }
    case 'neon': {
      const b = lay.border;
      ctx.shadowColor = lay.color;
      ctx.shadowBlur = b * 3;
      ctx.strokeStyle = lay.color;
      ctx.lineWidth = b;
      ctx.strokeRect(b, b, w - 2 * b, h - 2 * b);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ff4fd0';
      ctx.lineWidth = Math.max(2, Math.round(b * 1.4));
      const c = lay.corner;
      const q = b * 2.2;
      ctx.beginPath();
      ctx.moveTo(q, q + c); ctx.lineTo(q, q); ctx.lineTo(q + c, q);
      ctx.moveTo(w - q - c, q); ctx.lineTo(w - q, q); ctx.lineTo(w - q, q + c);
      ctx.moveTo(q, h - q - c); ctx.lineTo(q, h - q); ctx.lineTo(q + c, h - q);
      ctx.moveTo(w - q - c, h - q); ctx.lineTo(w - q, h - q); ctx.lineTo(w - q, h - q - c);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();
  if (o.mark !== false && o.mark !== 0) mark(ctx, w, h, lay, frameId === 'neon' ? '#9ff3ff' : null);
}

/* ------------------------------------------------------------------------------------------------
 * Görsel denetleyici
 * ---------------------------------------------------------------------------------------------- */
export function createPhotoFx(G) {
  const st = {
    active: false,
    swappedClock: false,
    swappedWeather: false,
    savedTime: 0,
    savedWeather: null,
    frames: 0,
    swaps: 0,
    restores: 0,
    prevAfter: null,
  };
  const tmp = {};
  const stats = st;

  function restore() {
    if (st.swappedClock && G.clock) {
      G.clock.time = st.savedTime;
      st.swappedClock = false;
      st.restores++;
    }
    if (st.swappedWeather) {
      G.weatherSim = st.savedWeather;
      st.savedWeather = null;
      st.swappedWeather = false;
      st.restores++;
    }
  }

  function swapClock(phase) {
    const c = G.clock;
    if (!c || !(c.dayLengthSec > 0)) return;
    if (!st.swappedClock) {
      st.savedTime = c.time;
      st.swappedClock = true;
    }
    c.time = wrap01(phase + (c.origin || 0)) * c.dayLengthSec;
    st.swaps++;
  }

  function swapWeather(intensity) {
    const real = st.swappedWeather ? st.savedWeather : G.weatherSim;
    if (!real) return;
    if (!st.swappedWeather) {
      st.savedWeather = real;
      st.swappedWeather = true;
    }
    Object.assign(tmp, real);
    const rain = intensity > 0;
    tmp.intensity = intensity;
    tmp.kind = rain ? 'rain' : 'clear';
    tmp.renderKind = tmp.kind;
    tmp.storm = rain ? Math.max(0.35, intensity * 0.5) : 0;
    tmp.cloudCover = rain ? 0.85 : 0.1;
    G.weatherSim = tmp;
    st.swaps++;
  }

  const fx = {
    get active() {
      return st.active;
    },
    stats,

    begin() {
      if (st.active) return;
      st.active = true;
      st.prevAfter = typeof G.afterRender === 'function' ? G.afterRender : null;
      G.afterRender = (dt) => {
        restore();
        if (st.prevAfter) st.prevAfter(dt);
      };
    },

    apply(s, pose, opts) {
      if (!st.active || !s) return;
      st.frames++;
      const o = opts || {};
      // görsel saat / yağmur (yalnız bu karenin çizimi için)
      const ph = phaseOf(s.time);
      if (ph !== null) swapClock(ph);
      else if (st.swappedClock) restore();
      const ri = rainOf(s.rain);
      if (ri !== null) swapWeather(ri);
      else if (st.swappedWeather) restore();
      // postfx: pozlama/bloom/vinyet + filtre + gren
      const px = G.postfx;
      if (px) {
        if (typeof px.tune === 'function') px.tune(tuneFor(s));
        if (typeof px.setPhoto === 'function') {
          px.setPhoto({
            filter: filterIndex(s.filter), amount: s.filterAmount, grain: s.grain, seed: G.reducedMotion || G.accessibility ? 0 : (st.frames % 97) + 1,
          });
        }
      }
      // kamera
      const cam = G.camera;
      if (cam && pose) {
        cam.position.set(pose.x, pose.y, pose.z);
        cam.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
        if (Math.abs(cam.fov - s.fov) > 0.01) {
          cam.fov = s.fov;
          cam.updateProjectionMatrix();
        }
        cam.updateMatrixWorld(true);
      }
      // oyuncu görünür (kendini gizle seçilmedikçe; araçtayken araç çizilir, karakter modeli değil)
      if (G.character && G.character.root) G.character.root.visible = !o.hideSelf && !o.driving;
      if (G.viewModel && typeof G.viewModel.setVisible === 'function') G.viewModel.setVisible(false);
    },

    restore,

    end() {
      if (!st.active) return;
      restore();
      const px = G.postfx;
      if (px) {
        if (typeof px.setPhoto === 'function') px.setPhoto(null);
        if (typeof px.setGrade === 'function') px.setGrade(G.dim === 'neon' ? 'neon' : 'overworld');
      }
      st.active = false;
      G.afterRender = st.prevAfter;
      st.prevAfter = null;
    },
  };
  return fx;
}
