import React from 'react';
import { tooltipModel } from './panelUtils.js';

/*
 * Eşya ipucu kartı (tooltip): ad (nadirlik renginde), tür/nadirlik, açıklama, özellikler, dayanıklılık.
 * slot yoksa `empty` yönergesi gösterilir.
 */
const PanelItemInfo = ({ slot, empty = 'Bir eşyayı incelemek için üzerine gel, odaklan veya dokun.', children }) => {
    const m = tooltipModel(slot);
    if (!m) {
        return (
            <div className="kp-info kp-info-empty" data-testid="item-info">
                <p>{empty}</p>
            </div>
        );
    }
    return (
        <div className={m.enchanted ? 'kp-info is-ench' : 'kp-info'} data-testid="item-info" style={{ '--kp-rar': m.color }}>
            <h3 className="kp-info-name">
                {m.name}
                {m.count > 1 ? <span className="kp-info-count"> ×{m.count}</span> : null}
            </h3>
            <p className="kp-info-meta">
                <span className="kp-rar-chip">{m.rarityLabel}</span> {m.kindLabel}
            </p>
            {m.desc ? <p className="kp-info-desc">{m.desc}</p> : null}
            {m.enchants.length ? (
                <ul className="kp-info-ench" aria-label="Büyüler" data-testid="item-ench">
                    {m.enchants.map((e) => (
                        <li key={e.key}>
                            <b>{e.name}</b>
                            <span>{e.text}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
            {m.magicLines.length ? (
                <ul className="kp-info-magic" aria-label="Büyü bilgisi">
                    {m.magicLines.map((l) => (
                        <li key={l}>{l}</li>
                    ))}
                </ul>
            ) : null}
            {m.techLines && m.techLines.length ? (
                <ul className="kp-info-tech" aria-label="Teknoloji bilgisi" data-testid="item-tech">
                    {m.techLines.map((l) => (
                        <li key={l}>{l}</li>
                    ))}
                </ul>
            ) : null}
            {m.lines.length ? (
                <dl className="kp-info-lines">
                    {m.lines.map((l) => (
                        <div key={l.label}>
                            <dt>{l.label}</dt>
                            <dd>{l.value}</dd>
                        </div>
                    ))}
                </dl>
            ) : null}
            {m.durability ? (
                <div className="kp-info-dur">
                    <span>
                        Dayanıklılık {m.durability.cur}/{m.durability.max}
                    </span>
                    <span
                        className={`kp-bar kp-bar-${m.durability.level}`}
                        role="progressbar"
                        aria-label="Dayanıklılık"
                        aria-valuemin={0}
                        aria-valuemax={m.durability.max}
                        aria-valuenow={m.durability.cur}
                    >
                        <span style={{ width: `${m.durability.pct}%` }} />
                    </span>
                </div>
            ) : null}
            {m.charge ? (
                <div className="kp-info-dur kp-info-chg" data-testid="item-charge">
                    <span>
                        Şarj {m.charge.cur}/{m.charge.max} ({m.charge.pct}%)
                    </span>
                    <span
                        className={`kp-bar kp-bar-chg kp-bar-${m.charge.level}`}
                        role="progressbar"
                        aria-label="Şarj"
                        aria-valuemin={0}
                        aria-valuemax={m.charge.max}
                        aria-valuenow={m.charge.cur}
                    >
                        <span style={{ width: `${m.charge.pct}%` }} />
                    </span>
                </div>
            ) : null}
            {children}
        </div>
    );
};

export default PanelItemInfo;
