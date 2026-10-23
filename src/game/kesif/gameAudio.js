/*
 * KEŞİF — oyun ses katmanı: audio.js'i oyun bağlamına bağlar (G.sound, adım sesleri, dinleyici, ortam sesi).
 *
 *   createGameAudio(G) → { audio, sound(name,pos?,opts?), footstep(mat, sprinting, pos), frame(dt, listener, env), dispose() }
 *
 * Adım/iniş/zıplama/su sesleri fizik olaylarından (gamePlayer) çağrılır; ortam (bölge, biyom, yeraltı, su altı, gece, hava)
 * ≈2 Hz'de audio.setAmbient'e verilir. Sessizde ve ses bağlamı yokken tüm çağrılar zararsızdır.
 */
import { createKesifAudio } from './audio.js';
import { ambientAudioFor } from './gameEnv.js';

const KNOWN_MAT = { taş: 1, toprak: 1, kum: 1, ahşap: 1, çim: 1, kar: 1, su: 1, metal: 1, yaprak: 1, cam: 1 };

export function createGameAudio(G) {
  const o = G.opts;
  const audio = createKesifAudio({ muted: !!o.muted, musicEnabled: o.music !== false });
  const popts = { x: 0, y: 0, z: 0, vol: 1, pitch: 1 };
  let ambAcc = 1;
  let disposed = false;

  function sound(name, pos, opts) {
    if (disposed || !name) return null;
    try {
      const op = opts || null;
      if (!pos && !op) return audio.play(name);
      popts.x = pos ? pos.x : 0;
      popts.y = pos ? pos.y : 0;
      popts.z = pos ? pos.z : 0;
      popts.vol = op && op.vol !== undefined ? op.vol : 1;
      popts.pitch = op && op.pitch !== undefined ? op.pitch : 1;
      if (!pos) {
        // konumsuz (arayüz) ses: yalnız ses düzeyi/perde
        return audio.play(name, { vol: popts.vol, pitch: popts.pitch });
      }
      return audio.play(name, popts);
    } catch {
      return null;
    }
  }

  function footstep(mat, sprinting, pos) {
    const m = KNOWN_MAT[mat] ? mat : 'çim';
    sound('step:' + m, pos, { vol: sprinting ? 0.9 : 0.62, pitch: 0.92 + ((G.time.tick * 7) % 13) / 80 });
  }

  /** listener: {x,y,z,yaw}; env: gameEnv.env (+underwater, combat). */
  function frame(dt, listener, env) {
    if (disposed) return;
    audio.setListener(listener, listener.yaw);
    ambAcc += dt;
    if (ambAcc >= 0.5) {
      ambAcc = 0;
      audio.setAmbient(ambientAudioFor(env));
    }
    audio.update(dt);
  }

  return {
    audio,
    sound,
    footstep,
    frame,
    dispose() {
      if (disposed) return;
      disposed = true;
      audio.dispose();
    },
  };
}
