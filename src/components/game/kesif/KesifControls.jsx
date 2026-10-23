import React, { useId } from 'react';

/** Anahtar (role="switch"): etiket + Açık/Kapalı metni + görsel kaydırıcı. Düğmenin tamamı 44 px+ . */
export function KxSwitch({ label, hint, on, onChange, icon: Icon, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className="kx-switch"
      onClick={() => onChange(!on)}
    >
      <span className="kx-switch-txt">
        <span className="kx-switch-label">
          {Icon ? <Icon aria-hidden="true" /> : null} {label}
        </span>
        {hint ? <span className="kx-switch-hint">{hint}</span> : null}
      </span>
      <span className="kx-switch-state" aria-hidden="true">
        {on ? 'Açık' : 'Kapalı'}
      </span>
      <span className="kx-switch-track" aria-hidden="true" data-on={on ? '1' : '0'}>
        <span className="kx-switch-knob" />
      </span>
    </button>
  );
}

/** Kaydırıcı: <input type="range"> + canlı değer metni (aria-valuetext). */
export function KxSlider({ label, value, min, max, step, onChange, format, disabled = false }) {
  const id = useId();
  const text = format ? format(value) : String(value);
  return (
    <div className="kx-slider">
      <div className="kx-slider-label">
        <label htmlFor={id}>{label}</label>
        <span className="kx-slider-value" aria-hidden="true">
          {text}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={text}
        data-no-tap
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** Seçenek grubu (aria-pressed düğmeler): kalite gibi az seçenekli ayarlar. */
export function KxSegment({ label, value, choices, onChange }) {
  const id = useId();
  return (
    <div className="kx-seg" role="group" aria-labelledby={id}>
      <span id={id} className="kx-seg-label">
        {label}
      </span>
      <div className="kx-seg-row" data-cols={choices.length}>
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={value === c.value}
            className="kx-seg-btn"
            data-on={value === c.value ? '1' : '0'}
            onClick={() => onChange(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
