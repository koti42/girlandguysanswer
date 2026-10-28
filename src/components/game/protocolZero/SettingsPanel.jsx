import React from 'react';
import { LuHouse, LuKeyboard, LuLocateFixed, LuVolume2, LuVolumeX, LuX } from 'react-icons/lu';
import { SPEEDS } from '../../../game/protocolZero/constants';

/** AYARLAR paneli: ses, hız, görünümü sıfırla, kısayollar, çıkış. */
const SettingsPanel = ({ muted, onToggleMute, speed, onSpeed, onResetView, onExit, onClose }) => (
    <aside className="pz-panel pz-card" aria-labelledby="pz-settings-title">
        <div className="pz-panel-head">
            <div>
                <p className="pz-eyebrow">Komuta merkezi</p>
                <h2 id="pz-settings-title" className="pz-h">Ayarlar</h2>
            </div>
            <button type="button" onClick={onClose} className="pz-icon-btn !h-9 !w-9" aria-label="Kapat">
                <LuX aria-hidden="true" />
            </button>
        </div>
        <div className="pz-panel-body space-y-3 p-3">
            <button type="button" onClick={onToggleMute} className="pz-btn pz-btn-ghost w-full justify-between" aria-pressed={!muted}>
                <span className="flex items-center gap-2">{muted ? <LuVolumeX aria-hidden="true" /> : <LuVolume2 aria-hidden="true" />} Ses efektleri</span>
                <span className="text-xs">{muted ? 'Kapalı' : 'Açık'}</span>
            </button>
            <div className="pz-stat">
                <p className="pz-stat-label">Oyun hızı</p>
                <div className="pz-speed mt-1 inline-flex gap-0.5 rounded-xl bg-black/30 p-0.5" role="radiogroup" aria-label="Oyun hızı">
                    {SPEEDS.map((s) => (
                        <button key={s} type="button" role="radio" aria-checked={speed === s} aria-pressed={speed === s} onClick={() => onSpeed(s)}>
                            {s === 0 ? '||' : `${s}x`}
                        </button>
                    ))}
                </div>
            </div>
            <button type="button" onClick={onResetView} className="pz-btn pz-btn-ghost w-full justify-start">
                <LuLocateFixed aria-hidden="true" /> Harita görünümünü sıfırla
            </button>
            <div className="pz-stat">
                <p className="pz-stat-label flex items-center gap-1"><LuKeyboard aria-hidden="true" /> Kısayollar</p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-white/80">
                    <li><kbd className="rounded bg-white/10 px-1">Boşluk</kbd> duraklat / devam</li>
                    <li><kbd className="rounded bg-white/10 px-1">T</kbd> savunma ağacı · <kbd className="rounded bg-white/10 px-1">G</kbd> dünya durumu · <kbd className="rounded bg-white/10 px-1">H</kbd> tehdit</li>
                    <li><kbd className="rounded bg-white/10 px-1">Ok tuşları</kbd> haritayı kaydır · <kbd className="rounded bg-white/10 px-1">+</kbd>/<kbd className="rounded bg-white/10 px-1">−</kbd> yakınlaştır</li>
                    <li><kbd className="rounded bg-white/10 px-1">Esc</kbd> paneli kapat</li>
                </ul>
            </div>
            <button type="button" onClick={onExit} className="pz-btn pz-btn-ghost w-full justify-start !text-rose-200">
                <LuHouse aria-hidden="true" /> Görevi bırak, lobiye dön
            </button>
        </div>
    </aside>
);

export default SettingsPanel;
