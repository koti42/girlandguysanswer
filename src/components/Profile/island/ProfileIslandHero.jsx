import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuSettings2 } from 'react-icons/lu';
import { prefersReducedMotion } from '../../game/avatar/avatarUtils';
import { coverToViewOffset } from '../../../game/island/viewOffset';
import IslandCard from './IslandCards';
import IslandPoster from './IslandPoster';
import IslandStopNav from './IslandStopNav';
import {
    ISLAND_HERO_HEIGHT,
    ISLAND_STOPS,
    a11yDomOn,
    canMessage,
    canViewContent,
    islandSupported,
    themeBadge,
    useIslandScene,
    wrapIndex,
} from './islandUtils';
import './island.css';

/*
 * Ada Profili kahramanı: profil başlığının kapak bandı yerine geçen 3B
 * yüzen ada sahnesi + DOM bilgi kartları.
 *
 *  - Sahne motoru (three.js) ayrı parça olarak yüklenir; önce sabit afiş ve
 *    yükleme parıltısı görünür, yükseklik baştan sabittir (düzen kayması yok).
 *  - WebGL2 yoksa, erişilebilirlik modu ya da hareket azaltma açıksa, motor
 *    yüklenemezse ya da WebGL bağlamı kaybolursa `fallback` (standart kapak)
 *    çizilir; o da verilmediyse afiş + kartlar kalır. Standart sekmeler
 *    sayfada zaten altta durur: erişilebilir yedek odur.
 *  - Kartlar pointer-events'i yalnız kendi kutularında alır; sahnede
 *    sürükleme kartlara takılmaz.
 */

const STAGE_LABEL =
    'Üç boyutlu ada sahnesi. Sol ve sağ ok tuşlarıyla duraklar arasında gezinebilir, fareyle ya da parmakla sürükleyerek adayı döndürebilirsin.';

const ProfileIslandHero = ({
    profile,
    isOwnProfile = false,
    tabsActions = null,
    onSelectTab = null,
    questions = null,
    avatar = null,
    fallback = null,
}) => {
    const uid = useId();
    const cardId = `ih-card-${uid}`;
    const rootRef = useRef(null);
    const dockRef = useRef(null);
    const [stopIndex, setStopIndex] = useState(0);
    const [cardOpen, setCardOpen] = useState(true);
    // Uygunluk montajda bir kez belirlenir (oturum içinde değişmez).
    const [eligible] = useState(() => !a11yDomOn() && !prefersReducedMotion() && islandSupported());

    const stops = ISLAND_STOPS;
    const onStopChange = useCallback((i) => setStopIndex(wrapIndex(i, stops.length)), [stops.length]);

    const { hostRef, phase, goTo, setViewOffset } = useIslandScene({
        enabled: eligible,
        avatar: avatar ?? profile?.game_avatar ?? null,
        gender: profile?.gender,
        profile,
        stops,
        onStopChange,
    });

    const degraded = !eligible || phase === 'failed';

    // Dar ekranda bilgi kartı alt sayfa olarak adanın büyük kısmını örter: ada, kartın üstündeki
    // görünür bölgeye kaydırılıp sığdırılır. Kart/nav yüksekliği sahneye oranlanır; boyut, kart
    // içeriği, durak değişimi ve kart aç/kapa ile yeniden ölçülür. Geniş ekranda 0 (sıfırlama).
    useEffect(() => {
        if (degraded) return undefined;
        const root = rootRef.current;
        const dock = dockRef.current;
        if (!root || !dock) return undefined;
        const narrow = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 767px)') : null;
        const apply = () => {
            if (!narrow || !narrow.matches) {
                setViewOffset(0);
                return;
            }
            // Dock, taşma katmanının (inset 0) içinde: kapladığı alan = katman yüksekliği - dock üstü.
            const layer = dock.offsetParent || root;
            const total = layer.clientHeight || root.clientHeight;
            setViewOffset(coverToViewOffset(total - dock.offsetTop, total));
        };
        apply();
        let ro = null;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(apply);
            ro.observe(dock);
            ro.observe(root);
        }
        window.addEventListener('resize', apply);
        window.addEventListener('orientationchange', apply);
        narrow?.addEventListener?.('change', apply);
        return () => {
            ro?.disconnect();
            window.removeEventListener('resize', apply);
            window.removeEventListener('orientationchange', apply);
            narrow?.removeEventListener?.('change', apply);
        };
    }, [degraded, phase, stopIndex, cardOpen, setViewOffset]);

    if (degraded && fallback) return fallback;

    const select = (i) => {
        const next = wrapIndex(i, stops.length);
        setStopIndex(next);
        goTo(next);
    };

    // Kart eylemi: ilgili standart sekmeyi aç ve başlık/sekmelerin görüneceği yere in.
    const selectTab = (tab) => {
        onSelectTab?.(tab);
        try {
            const el = rootRef.current;
            if (el && typeof window.scrollBy === 'function') {
                const bottom = el.getBoundingClientRect().bottom;
                if (bottom > 0) window.scrollBy({ top: bottom - 72, behavior: 'smooth' });
            }
        } catch {
            /* kaydırma isteğe bağlı */
        }
    };

    const stop = stops[stopIndex] || stops[0];
    const isOwn = Boolean(isOwnProfile);
    const badge = isOwn ? themeBadge(profile?.profile_theme) : null;
    const canView = canViewContent(profile, isOwn);
    const phaseAttr = degraded ? 'poster' : phase;

    return (
        <section
            ref={rootRef}
            className="ih"
            style={{ height: ISLAND_HERO_HEIGHT }}
            aria-label="Ada profili"
            data-testid="island-hero"
            data-phase={phaseAttr}
        >
            <IslandPoster hidden={phase === 'ready'} />

            {!degraded && (
                <div
                    ref={hostRef}
                    className="ih-stage"
                    tabIndex={0}
                    role="group"
                    aria-label={STAGE_LABEL}
                    data-testid="island-stage"
                />
            )}

            {!degraded && phase === 'loading' && (
                <div className="ih-shimmer" role="status" data-testid="island-loading">
                    <span className="sr-only">Ada sahnesi yükleniyor</span>
                </div>
            )}

            <div className="ih-overlay">
                <div className="ih-top">
                    {isOwn && (
                        <Link to="/settings#profil-temasi" className="ih-pill">
                            <LuSettings2 aria-hidden="true" /> Ada temasını yönet
                        </Link>
                    )}
                    {badge && (
                        <span className="ih-pill ih-pill--badge" data-testid="island-expiry">
                            {badge.label}
                        </span>
                    )}
                </div>

                <div ref={dockRef} className="ih-dock" data-testid="island-dock">
                    {cardOpen && (
                        <IslandCard
                            id={cardId}
                            stop={stop}
                            index={stops.indexOf(stop)}
                            total={stops.length}
                            profile={profile}
                            isOwn={isOwn}
                            canView={canView}
                            canMsg={canMessage(profile, Boolean(tabsActions?.isAdmin))}
                            questions={questions ?? profile?.questions}
                            onFollowToggle={tabsActions?.onFollowToggle}
                            onSelectTab={selectTab}
                        />
                    )}
                    <IslandStopNav
                        stops={stops}
                        index={stopIndex}
                        onSelect={select}
                        cardOpen={cardOpen}
                        onToggleCard={() => setCardOpen((v) => !v)}
                        cardId={cardId}
                    />
                </div>
            </div>
        </section>
    );
};

export default ProfileIslandHero;
