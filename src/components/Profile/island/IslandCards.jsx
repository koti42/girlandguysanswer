import React from 'react';
import { Link } from 'react-router-dom';
import { LuAward, LuCalendar, LuLock, LuMapPin, LuMessageCircle, LuStar, LuTrophy } from 'react-icons/lu';
import { formatNumber } from '../../game/gameUtils';
import { badgeItems, followState, questionItems } from './islandUtils';

/*
 * Ada duraklarının bilgi kartları (DOM; sahne içinde değil, böylece metin
 * seçilebilir, okunabilir ve erişilebilir kalır). Veri GERÇEK profil
 * verisidir; gizli hesapta kilitli durumda hiçbir sayı/başlık sızmaz.
 */

const LANDMARKS = {
    hakkinda: 'Tabela',
    sorular: 'Posta kutusu',
    cevaplar: 'Fener',
    rozetler: 'Rozet kulesi',
    takip: 'İskele',
};

const TITLES = {
    sorular: 'Son sorular',
    cevaplar: 'Cevaplar',
    rozetler: 'Rozetler',
    takip: 'Takip',
};

const Locked = ({ what }) => (
    <p className="ih-note" data-testid="island-locked">
        <LuLock aria-hidden="true" />
        <span>Bu hesap gizli. {what} görmek için takip etmelisin.</span>
    </p>
);

const Stat = ({ value, label, to }) => {
    const inner = (
        <>
            <strong className="ih-stat__v">{formatNumber(value)}</strong>
            <span className="ih-stat__l">{label}</span>
        </>
    );
    return (
        <li className="ih-statcell">
            {to ? (
                <Link to={to} className="ih-stat ih-stat--link">
                    {inner}
                </Link>
            ) : (
                <div className="ih-stat">{inner}</div>
            )}
        </li>
    );
};

const SeeAll = ({ onClick, children }) => (
    <button type="button" className="ih-btn ih-btn--ghost" onClick={onClick}>
        {children}
    </button>
);

const FollowButton = ({ profile, onFollowToggle }) => {
    if (!onFollowToggle) return null;
    const f = followState(profile);
    return (
        <button
            type="button"
            className={`ih-btn ${f.active ? 'ih-btn--quiet' : 'ih-btn--primary'}`}
            onClick={onFollowToggle}
            disabled={f.disabled}
            aria-pressed={f.active}
        >
            {f.label}
        </button>
    );
};

function AboutBody({ profile, isOwn, canMsg, onFollowToggle }) {
    const level = profile.level?.name ? profile.level : null;
    const general = Number(profile.ranks?.general);
    const hasLocation = profile.location && profile.location !== 'Konum belirtilmedi';
    return (
        <>
            <p className="ih-handle">@{profile.username}</p>
            <p className="ih-bio">{profile.bio || (isOwn ? 'Henüz bir hakkında yazısı eklemedin.' : 'Henüz bir hakkında yazısı yok.')}</p>
            <ul className="ih-chips" aria-label="Profil özeti">
                {level && (
                    <li className="ih-chip" style={level.color ? { '--chip': level.color } : undefined}>
                        <LuStar aria-hidden="true" /> {level.name}
                    </li>
                )}
                {general > 0 && (
                    <li className="ih-chip">
                        <LuTrophy aria-hidden="true" /> Genel #{general}
                    </li>
                )}
                {profile.joinedDate && (
                    <li className="ih-chip">
                        <LuCalendar aria-hidden="true" /> Katıldı {profile.joinedDate}
                    </li>
                )}
                {hasLocation && (
                    <li className="ih-chip ih-chip--soft">
                        <LuMapPin aria-hidden="true" /> {profile.location}
                    </li>
                )}
            </ul>
            {!isOwn && (
                <div className="ih-actions">
                    <FollowButton profile={profile} onFollowToggle={onFollowToggle} />
                    {canMsg && (
                        <Link to={`/messages/${encodeURIComponent(profile.username)}`} className="ih-btn ih-btn--ghost">
                            <LuMessageCircle aria-hidden="true" /> Mesaj
                        </Link>
                    )}
                </div>
            )}
        </>
    );
}

function QuestionsBody({ profile, questions, canView, onSelectTab }) {
    if (!canView) return <Locked what="sorularını" />;
    const items = questionItems(questions, 3);
    const total = profile.stats?.questions ?? 0;
    return (
        <>
            <div className="ih-row">
                <p className="ih-lead">
                    <strong>{formatNumber(total)}</strong> soru sordu
                </p>
                <SeeAll onClick={() => onSelectTab?.('questions')}>Tümünü gör</SeeAll>
            </div>
            {items.length > 0 ? (
                <ul className="ih-list" aria-label="Son sorular">
                    {items.map((q) => (
                        <li key={q.id}>
                            <Link to={q.to} className="ih-linkrow">
                                <span>{q.title}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="ih-note">Henüz hiç soru sormamış.</p>
            )}
        </>
    );
}

function AnswersBody({ profile, canView, onSelectTab }) {
    if (!canView) return <Locked what="cevaplarını" />;
    const s = profile.stats || {};
    return (
        <>
            <ul className="ih-stats">
                <Stat value={s.answers ?? 0} label="Cevap" />
                <Stat value={s.opinions ?? 0} label="Bence" />
            </ul>
            <div className="ih-actions">
                <SeeAll onClick={() => onSelectTab?.('answers')}>Cevapları gör</SeeAll>
                <SeeAll onClick={() => onSelectTab?.('opinions')}>Benceleri gör</SeeAll>
            </div>
        </>
    );
}

function BadgesBody({ profile, canView, onSelectTab }) {
    if (!canView) return <Locked what="rozetlerini" />;
    const { items, extra } = badgeItems(profile.badges, 8);
    return (
        <>
            {items.length > 0 ? (
                <ul className="ih-badges" aria-label="Rozetler">
                    {items.map((b) => (
                        <li key={b.id} className="ih-badge" title={b.description || b.name}>
                            {b.icon ? (
                                <img src={b.icon} alt="" className="ih-badge__img" loading="lazy" />
                            ) : (
                                <LuAward aria-hidden="true" className="ih-badge__ico" />
                            )}
                            <span>{b.name}</span>
                        </li>
                    ))}
                    {extra > 0 && <li className="ih-badge ih-badge--more">+{formatNumber(extra)} rozet</li>}
                </ul>
            ) : (
                <p className="ih-note">Henüz rozet kazanmamış.</p>
            )}
            <div className="ih-actions">
                <SeeAll onClick={() => onSelectTab?.('badges')}>Tümünü gör</SeeAll>
            </div>
        </>
    );
}

function FollowBody({ profile, isOwn, canView, onFollowToggle }) {
    const base = `/profile/${encodeURIComponent(profile.username)}`;
    const s = profile.stats || {};
    return (
        <>
            {canView ? (
                <ul className="ih-stats">
                    <Stat value={s.followers ?? 0} label="Takipçi" to={`${base}/followers`} />
                    <Stat value={s.following ?? 0} label="Takip" to={`${base}/following`} />
                </ul>
            ) : (
                <Locked what="takipçi sayılarını" />
            )}
            {!isOwn && (
                <div className="ih-actions">
                    <FollowButton profile={profile} onFollowToggle={onFollowToggle} />
                </div>
            )}
        </>
    );
}

const IslandCard = ({ id, stop, index, total, profile, isOwn, canView, canMsg, questions, onFollowToggle, onSelectTab }) => {
    const titleId = `${id}-title`;
    const title = stop.key === 'hakkinda' ? profile.name || profile.username : TITLES[stop.key] || stop.label;
    return (
        <article id={id} className="ih-card" data-stop={stop.key} aria-labelledby={titleId} key={stop.key}>
            <p className="ih-card__eyebrow">
                {LANDMARKS[stop.key] || stop.label} · {index + 1}/{total}
            </p>
            <h2 id={titleId} className="ih-card__title">
                {title}
            </h2>
            {stop.key === 'hakkinda' && (
                <AboutBody profile={profile} isOwn={isOwn} canMsg={canMsg} onFollowToggle={onFollowToggle} />
            )}
            {stop.key === 'sorular' && (
                <QuestionsBody profile={profile} questions={questions} canView={canView} onSelectTab={onSelectTab} />
            )}
            {stop.key === 'cevaplar' && <AnswersBody profile={profile} canView={canView} onSelectTab={onSelectTab} />}
            {stop.key === 'rozetler' && <BadgesBody profile={profile} canView={canView} onSelectTab={onSelectTab} />}
            {stop.key === 'takip' && (
                <FollowBody profile={profile} isOwn={isOwn} canView={canView} onFollowToggle={onFollowToggle} />
            )}
        </article>
    );
};

export default IslandCard;
