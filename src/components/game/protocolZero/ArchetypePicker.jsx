import React from 'react';
import { ARCHETYPES, ARCHETYPE_KEYS } from '../../../game/protocolZero/archetypes';

const skulls = (n) => '☠'.repeat(Math.max(1, Math.min(5, n)));

/**
 * Plague Inc. "hastalık türü" ekranı gibi YZ tehdit türü seçimi: kart ızgarası + seçili türün hikâyesi,
 * güçlü/zayıf yanları. `value` tür anahtarı, `onChange(key)`.
 */
const ArchetypePicker = ({ value, onChange }) => {
    const a = ARCHETYPES[value] || ARCHETYPES.worm;
    return (
        <div className="pz-arch">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" role="radiogroup" aria-label="Tehdit türü">
                {ARCHETYPE_KEYS.map((k) => {
                    const t = ARCHETYPES[k];
                    const active = value === k;
                    return (
                        <button
                            key={k}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onChange(k)}
                            className="pz-arch-card"
                            data-active={active ? '1' : '0'}
                            style={{ '--arch': t.color }}
                        >
                            <span className="pz-arch-threat" aria-label={`Tehdit seviyesi ${t.threat}`}>{skulls(t.threat)}</span>
                            <span className="pz-arch-icon" aria-hidden="true">{t.icon}</span>
                            <span className="pz-arch-name">{t.name}</span>
                            <span className="pz-arch-desc">{t.desc}</span>
                        </button>
                    );
                })}
            </div>
            <div className="pz-arch-detail" style={{ '--arch': a.color }} aria-live="polite">
                <div className="flex items-start gap-3">
                    <span className="text-4xl leading-none" aria-hidden="true">{a.icon}</span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">{a.tag} · Tehdit {skulls(a.threat)}</p>
                        <h3 className="text-xl font-black" style={{ color: a.color }}>{a.name}</h3>
                        <p className="mt-1 text-sm text-white/85">{a.lore}</p>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-rose-500/10 p-2.5 ring-1 ring-rose-400/25">
                        <p className="text-[10px] font-black uppercase tracking-wider text-rose-200">YZ'nin gücü</p>
                        <ul className="mt-1 list-disc pl-4 text-xs text-white/85">
                            {a.strengths.map((s) => (
                                <li key={s}>{s}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="rounded-xl bg-cyan-400/10 p-2.5 ring-1 ring-cyan-300/25">
                        <p className="text-[10px] font-black uppercase tracking-wider text-cyan-200">Zayıf yanı</p>
                        <ul className="mt-1 list-disc pl-4 text-xs text-white/85">
                            {a.weaknesses.map((s) => (
                                <li key={s}>{s}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ArchetypePicker;
