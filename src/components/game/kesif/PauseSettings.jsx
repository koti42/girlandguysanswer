import React, { useState } from 'react';
import { LuAccessibility, LuCheck, LuCircleHelp, LuGamepad2, LuLightbulb, LuMusic, LuSmartphone, LuVibrate, LuVolume2 } from 'react-icons/lu';
import { KxSegment, KxSlider, KxSwitch } from './KesifControls.jsx';
import { clearHintSeen } from './kxHintSeen.js';
import { QUALITY_CHOICES, SETTING_RANGES } from './kxSettings.js';

const pctText = (v) => Math.round(v * 100) + '%';

/** "İpuçlarını yeniden göster": tek seferlik kontrol ipucunun görüldü işaretini siler (bir sonraki oyunda yine çıkar). */
const ResetHints = () => {
  const [done, setDone] = useState(false);
  return (
    <>
      <button
        type="button"
        className="kx-switch"
        data-testid="kx-reset-hints"
        onClick={() => {
          clearHintSeen();
          setDone(true);
        }}
      >
        <span className="kx-switch-txt">
          <span className="kx-switch-label">
            {done ? <LuCheck aria-hidden="true" /> : <LuLightbulb aria-hidden="true" />} İpuçlarını yeniden göster
          </span>
          <span className="kx-switch-hint">Kontroller ipucu bir sonraki oyunda yeniden çıkar</span>
        </span>
        <span className="kx-switch-state" aria-hidden="true">
          {done ? 'Tamam' : 'Sıfırla'}
        </span>
      </button>
      <p className="kx-sr" role="status">
        {done ? 'İpuçları sıfırlandı. Kontrol ipucu bir sonraki oyunda yeniden çıkacak.' : ''}
      </p>
    </>
  );
};

/**
 * Duraklatma menüsünün ayarlar sayfası. Bölümler: Kontroller, Dokunmatik düzen (yalnız dokunmatik),
 * Görüntü, Ses ve titreşim, Oyun. `s` mevcut ayarlar, `set(patch)` bir değeri günceller.
 * onHowTo verilirse en üstte "Nasıl Oynanır / Kontroller" girişi çıkar (ipucu bildirimi bu yolu söyler: Esc → Ayarlar → Nasıl Oynanır).
 */
const PauseSettings = ({ s, set, touch, gyroSupported = true, onHowTo }) => (
  <div className="kx-settings">
    {onHowTo && (
      <button type="button" className="kx-btn" onClick={onHowTo} data-testid="kx-settings-howto">
        <LuCircleHelp aria-hidden="true" /> Nasıl Oynanır / Kontroller
      </button>
    )}
    <section aria-labelledby="kx-set-ctl" className="kx-set-sec">
      <h3 id="kx-set-ctl">Kontroller</h3>
      <KxSlider label="Bakış hassasiyeti" value={s.sensitivity} {...rng('sensitivity')} format={pctText} onChange={(v) => set({ sensitivity: v })} />
      <KxSwitch label="Dikey bakışı ters çevir" on={s.invertY} onChange={(v) => set({ invertY: v })} />
      {touch && gyroSupported && (
        <KxSwitch label="Jiroskopla bak" hint="Telefonu çevirerek nişan al" icon={LuSmartphone} on={s.gyro} onChange={(v) => set({ gyro: v })} />
      )}
    </section>

    {touch && (
      <section aria-labelledby="kx-set-touch" className="kx-set-sec">
        <h3 id="kx-set-touch">Dokunmatik düzen</h3>
        <KxSwitch label="Sol elli düzen" hint="Joystick sağa, düğmeler sola geçer" icon={LuGamepad2} on={s.leftHanded} onChange={(v) => set({ leftHanded: v })} />
        <KxSlider label="Joystick boyutu" value={s.joystickScale} {...rng('joystickScale')} format={pctText} onChange={(v) => set({ joystickScale: v })} />
        <KxSlider label="Düğme saydamlığı" value={s.buttonOpacity} {...rng('buttonOpacity')} format={pctText} onChange={(v) => set({ buttonOpacity: v })} />
        <KxSwitch label="Çömelmeyi kilitle" hint="Düğmeye bir kez dokun, bir daha bırakana kadar çömel" on={s.crouchToggle} onChange={(v) => set({ crouchToggle: v })} />
      </section>
    )}

    <section aria-labelledby="kx-set-view" className="kx-set-sec">
      <h3 id="kx-set-view">Görüntü</h3>
      <KxSlider label="Görüş açısı" value={s.fov} {...rng('fov')} format={(v) => v + '°'} onChange={(v) => set({ fov: v })} />
      <KxSlider label="Görüş mesafesi" value={s.viewDist} {...rng('viewDist')} format={(v) => v + ' parça (' + v * 16 + ' blok)'} onChange={(v) => set({ viewDist: v })} />
      <KxSegment label="Grafik kalitesi" value={s.quality} choices={QUALITY_CHOICES} onChange={(v) => set({ quality: v })} />
      <KxSwitch label="Erişilebilirlik modu" hint="Daha büyük yazı, yüksek karşıtlık" icon={LuAccessibility} on={s.accessibility} onChange={(v) => set({ accessibility: v })} />
    </section>

    <section aria-labelledby="kx-set-snd" className="kx-set-sec">
      <h3 id="kx-set-snd">Ses ve titreşim</h3>
      <KxSwitch label="Ses efektleri" icon={LuVolume2} on={!s.muted} onChange={(v) => set({ muted: !v })} />
      <KxSwitch label="Müzik" icon={LuMusic} on={s.music} onChange={(v) => set({ music: v })} />
      {touch && <KxSwitch label="Titreşim" icon={LuVibrate} on={s.haptics} onChange={(v) => set({ haptics: v })} />}
    </section>

    <section aria-labelledby="kx-set-game" className="kx-set-sec">
      <h3 id="kx-set-game">Oyun</h3>
      <KxSwitch label="Kolay mod" hint="Hasar almadan rahatça keşfet" on={s.easy} onChange={(v) => set({ easy: v })} />
      <ResetHints />
    </section>
  </div>
);

function rng(key) {
  const r = SETTING_RANGES[key];
  return { min: r[0], max: r[1], step: r[2] };
}

export default PauseSettings;
