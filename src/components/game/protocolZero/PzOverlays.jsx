import React from 'react';
import { LuHouse, LuPlay, LuVolume2, LuVolumeX } from 'react-icons/lu';
import { DIFFICULTIES } from '../../../game/protocolZero/constants';
import { archetypeOf } from '../../../game/protocolZero/archetypes';

/** Görev brifingi: oyun başlamadan önce (ses kilidi de burada açılır). */
export const BriefingOverlay = ({ difficulty, archetype, onStart, muted, onToggleMute }) => {
    const d = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    const a = archetypeOf(archetype);
    return (
        <div className="pz-modal-backdrop">
            <div className="pz-modal pz-glass pz-scan max-w-lg p-5 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="pz-brief-title">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-300 pz-blink">⬤ Acil durum brifingi · Gizli</p>
                <h1 id="pz-brief-title" className="pz-title mt-2 text-3xl sm:text-4xl">PROTOCOL: ZERO</h1>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Küresel YZ Karantinası · {d.name} ({d.tag})</p>
                <div className="mt-3 flex items-start gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                    <span className="text-3xl leading-none" aria-hidden="true">{a.icon}</span>
                    <div>
                        <p className="text-sm font-black" style={{ color: a.color }}>
                            Tehdit: {a.name} <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">· {a.tag}</span>
                        </p>
                        <p className="mt-1 text-xs text-white/75">{a.lore}</p>
                    </div>
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/85">
                    <p>Komutan, taktik harita senin: ülkeler kızıla döndükçe zaman daralır. Haber bandını izle; senaryo gün gün gelişecek.</p>
                    <ul className="list-disc space-y-1 pl-5 text-white/75">
                        <li>Ülkelere ve veri merkezlerine dokun: <strong className="text-cyan-200">firewall</strong> kur, <strong className="text-cyan-200">temizle</strong>, gerekirse <strong className="text-amber-200">kabloyu kes</strong>.</li>
                        <li><strong className="text-sky-200">Mavi baloncukları</strong> patlat: +₵ ve deşifre. <strong className="text-rose-200">Kızıl baloncuğu</strong> 5 sn içinde patlatırsan ilk sızma dalgası bastırılır.</li>
                        <li>Bütçe (₵) temiz bölgelerden akar; <strong className="text-violet-200">Savunma Ağacı</strong>ndan geliştirme al.</li>
                        <li>Zafer: <strong className="text-violet-200">çekirdek deşifre %100</strong> ya da 30. günden sonra <strong className="text-emerald-200">tam temizlik</strong>. Yenilgi: YZ hakimiyeti ya da panik %100.</li>
                    </ul>
                </div>
                <div className="mt-5 flex items-center gap-2">
                    <button type="button" onClick={onStart} className="pz-btn pz-btn-primary flex-1 !min-h-[56px] text-base" autoFocus>
                        <LuPlay aria-hidden="true" /> Görevi başlat
                    </button>
                    <button type="button" className="pz-icon-btn !h-14 !w-14" onClick={onToggleMute} aria-pressed={!muted} aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}>
                        {muted ? <LuVolumeX aria-hidden="true" /> : <LuVolume2 aria-hidden="true" />}
                    </button>
                </div>
            </div>
        </div>
    );
};

/** Duraklatma menüsü. */
export const PauseMenu = ({ open, onResume, onExit, muted, onToggleMute, day }) => {
    if (!open) return null;
    return (
        <div className="pz-modal-backdrop" onClick={onResume}>
            <div className="pz-modal pz-glass max-w-sm p-5 text-center" role="dialog" aria-modal="true" aria-labelledby="pz-pause-title" onClick={(e) => e.stopPropagation()}>
                <h2 id="pz-pause-title" className="pz-title text-2xl">Duraklatıldı</h2>
                <p className="mt-1 text-xs text-white/60">Gün {day} · Simülasyon bekliyor</p>
                <div className="mt-4 flex flex-col gap-2">
                    <button type="button" onClick={onResume} className="pz-btn pz-btn-primary !min-h-[52px]" autoFocus>
                        <LuPlay aria-hidden="true" /> Devam et
                    </button>
                    <button type="button" onClick={onToggleMute} className="pz-btn pz-btn-ghost !min-h-[48px]" aria-pressed={!muted}>
                        {muted ? <LuVolumeX aria-hidden="true" /> : <LuVolume2 aria-hidden="true" />} {muted ? 'Sesi aç' : 'Sesi kapat'}
                    </button>
                    <button type="button" onClick={onExit} className="pz-btn pz-btn-ghost !min-h-[48px] !text-rose-200">
                        <LuHouse aria-hidden="true" /> Görevi bırak, lobiye dön
                    </button>
                </div>
            </div>
        </div>
    );
};
