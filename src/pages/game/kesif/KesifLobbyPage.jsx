import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LuBookOpen, LuCloudOff, LuCompass, LuHammer, LuMap, LuMonitorX, LuPalette, LuPlay, LuPlus, LuSave, LuUsers } from 'react-icons/lu';
import { useAuth } from '../../../context/AuthContext';
import GameLayout from '../../../components/game/GameLayout';
import { GameLoading } from '../../../components/game/GameStates';
import WalletChip from '../../../components/game/shop/WalletChip';
import KesifHeroArt from '../../../components/game/kesif/KesifHeroArt';
import HowTo from '../../../components/game/kesif/HowTo';
import MapBrowser from '../../../components/game/kesif/MapBrowser';
import MyMaps from '../../../components/game/kesif/MyMaps';
import SlotShop from '../../../components/game/kesif/SlotShop';
import { AdventurePanel, BuildPanel, ContinuePanel } from '../../../components/game/kesif/KesifModePanels';
import { loadLocalSaves } from '../../../components/game/kesif/kesifSaves';
import {
    BASES,
    PLAY_PATH,
    STORAGE_KEYS,
    buildEntry,
    detectWebGL,
    entryForSave,
    generateWorldCode,
    kesifErrorText,
    mergeSaves,
    parseLobbyMode,
    slotLabel,
    storageGet,
    storageSet,
} from '../../../components/game/kesif/kesifUtils';
import kesifApiDefault from '../../../services/kesifApi';
import { prefersReducedMotion } from '../../../components/game/gameUtils';
import '../../../components/game/kesif/kesifLobby.css';

const SECTION_IDS = {
    macera: 'kesif-macera',
    devam: 'kesif-macera',
    insa: 'kesif-insa',
    topluluk: 'kesif-topluluk',
    haritalarim: 'kesif-haritalarim',
};

/** Bölüm başlığına kaydır ve odağı oraya taşı (klavye/ekran okuyucu kullanıcısı yerini bilsin). */
function jumpTo(key) {
    const section = document.getElementById(SECTION_IDS[key]);
    if (!section) return;
    section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    section.querySelector('h2')?.focus({ preventScroll: true });
}

const Section = ({ id, title, icon: Icon, tone, children, className = '' }) => (
    <section id={id} className={`game-card scroll-mt-4 rounded-3xl p-4 sm:p-5 ${className}`} aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} tabIndex={-1} className="mb-3 flex items-center gap-2 font-extrabold outline-none">
            <Icon className={tone} aria-hidden="true" /> {title}
        </h2>
        {children}
    </section>
);

const Tile = ({ cls, icon: Icon, title, sub, onClick, label }) => (
    <button type="button" onClick={onClick} className={`kesif-tile ${cls} game-press h-full w-full`} aria-label={label || `${title}. ${sub}`}>
        <Icon className="text-2xl" aria-hidden="true" />
        <span className="mt-auto text-lg font-black leading-tight">{title}</span>
        <span className="text-xs font-semibold text-white/80">{sub}</span>
    </button>
);

/*
 * Lobi: sinematik kahraman + altı mod karosu + bölümler (Yeni Macera / Devam
 * Et, İnşa Modu, Topluluk Haritaları, Haritalarım, Nasıl oynanır) ve Harita
 * Hakkı Al penceresi. Oyuna giriş: navigate(PLAY_PATH, { state: { entry } })
 * (biçim: kesifUtils.js buildEntry/readEntry). Misafir macera ve inşa
 * denemesini girişsiz oynar; bulut/harita/hak işleri üye ister.
 * ?mode=macera|insa|topluluk|haritalarim|slots doğrudan ilgili bölüme/pencereye gider.
 */
const Lobby = ({ member, api, loadSaves }) => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const [webgl] = useState(detectWebGL);
    const [code, setCode] = useState(() => generateWorldCode());
    const [base, setBase] = useState(() => {
        const saved = storageGet(STORAGE_KEYS.base);
        return BASES.some((b) => b.key === saved) ? saved : BASES[0].key;
    });
    const [ov, setOv] = useState({ status: member ? 'loading' : 'idle', profile: null, wallet: null, stats: null, cloud: null, error: '' });
    const [saves, setSaves] = useState({ status: 'loading', local: [] });
    // ?mode=slots (üye): pencere ilk çizimde açık gelir.
    const [slotsOpen, setSlotsOpen] = useState(() => member && parseLobbyMode(search) === 'slots');
    const jumped = useRef(false);

    const fetchOverview = useCallback(() => {
        api.overview().then(
            (d) =>
                setOv({
                    status: 'ready',
                    profile: d?.profile || null,
                    wallet: d?.wallet || null,
                    stats: d?.stats || null,
                    cloud: d?.cloud_save || null,
                    error: '',
                }),
            (err) => setOv((o) => ({ ...o, status: 'error', error: kesifErrorText(err, 'Hesap bilgilerin yüklenemedi.') }))
        );
    }, [api]);

    useEffect(() => {
        if (member) fetchOverview();
    }, [member, fetchOverview]);

    useEffect(() => {
        let alive = true;
        Promise.resolve()
            .then(loadSaves)
            .then(
                (list) => alive && setSaves({ status: 'ready', local: Array.isArray(list) ? list : [] }),
                () => alive && setSaves({ status: 'ready', local: [] })
            );
        return () => {
            alive = false;
        };
    }, [loadSaves]);

    // Mobil derin bağlantı: yalnızca ilk açılışta.
    useEffect(() => {
        if (jumped.current) return;
        const mode = parseLobbyMode(search);
        if (!mode) return;
        jumped.current = true;
        if (mode === 'slots' && member) return;
        jumpTo(mode === 'slots' ? 'haritalarim' : mode);
    }, [search, member]);

    const onChange = useCallback(({ profile, wallet }) => {
        setOv((o) => ({ ...o, profile: profile || o.profile, wallet: wallet || o.wallet }));
    }, []);

    const cloudSave = useMemo(() => {
        const c = ov.cloud;
        if (!member || !c?.exists) return null;
        const st = ov.stats || {};
        return {
            id: 'cloud',
            name: st.name || 'Bulut kaydı',
            seed: st.seed || null,
            playTime: st.playTime,
            zone: st.zonesUnlocked ? `${st.zonesUnlocked} bölge açık` : null,
            updatedAt: c.saved_at,
        };
    }, [member, ov.cloud, ov.stats]);

    const allSaves = useMemo(() => mergeSaves(saves.local, cloudSave), [saves.local, cloudSave]);

    const go = useCallback(
        (entry) => {
            if (entry && webgl) navigate(PLAY_PATH, { state: { entry } });
        },
        [navigate, webgl]
    );

    const startAdventure = (worldCode) => go(buildEntry({ mode: 'macera', seed: worldCode }));
    const startBuild = () => {
        storageSet(STORAGE_KEYS.base, base);
        go(buildEntry({ mode: 'insa', seed: generateWorldCode(), base }));
    };
    const playMap = (map) => {
        // Oynanma sayacı günde bir kez sayılır (sunucu); sonuç beklenmez, hata oyunu engellemez.
        api.play(map.id).catch(() => {});
        go(buildEntry({ mode: 'harita', mapId: map.id }));
    };
    const editMap = (map) => go(buildEntry({ mode: 'insa', mapId: map.id }));

    const profile = ov.profile;
    const slotsText = member && profile ? slotLabel(profile.maps_used, profile.map_slots) : null;

    const openSlots = () => {
        if (member) setSlotsOpen(true);
        else jumpTo('haritalarim');
    };

    return (
        <>
            <section className="game-hero game-hero-kesif relative min-h-[320px] overflow-hidden rounded-3xl p-5 shadow-2xl game-pop-in sm:p-8" aria-labelledby="kesif-hero-title">
                <KesifHeroArt className="kesif-art-fade" />
                <div className="relative z-10 flex max-w-xl flex-col">
                    <span className="inline-flex w-fit items-center rounded-full bg-gradient-to-r from-teal-200 to-amber-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950">
                        Yeni · 3D
                    </span>
                    <h1 id="kesif-hero-title" className="mt-2 text-3xl font-black leading-tight sm:text-4xl">
                        Herkesler Keşfediyor
                    </h1>
                    <p className="mt-2 text-white/85">
                        Sonsuz bir dünyada yürü, kaz, inşa et. Bulmacaları çöz, mühürleri aç, her bölgenin koruyucusunu yen. Ya da kendi dünyanı yap ve topluluğa göster.
                    </p>

                    {!webgl && (
                        <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-500/25 px-3 py-2 text-sm text-rose-50 ring-1 ring-rose-300/30">
                            <LuMonitorX className="mt-0.5 shrink-0" aria-hidden="true" />
                            Bu tarayıcıda 3D grafik (WebGL 2) kullanılamıyor. Donanım hızlandırmayı açıp ya da güncel bir tarayıcıyla tekrar dene. iOS kullanıyorsan iOS 15 veya üstüne güncelle.
                        </p>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={() => startAdventure(code)}
                            disabled={!webgl}
                            className="inline-flex min-h-[56px] basis-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-gradient-to-r from-teal-300 to-cyan-300 px-7 text-lg font-black text-slate-950 shadow-lg game-press disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:basis-auto"
                        >
                            <LuPlay className="shrink-0" aria-hidden="true" /> Maceraya Başla
                        </button>
                        <button
                            type="button"
                            onClick={() => jumpTo('topluluk')}
                            className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-white/15 px-5 font-bold text-white ring-1 ring-white/25 game-press hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                            <LuUsers aria-hidden="true" /> Topluluk haritaları
                        </button>
                        {member && (
                            <Link
                                to="/oyun/magaza?kategori=kesif"
                                data-testid="kesif-shop-link"
                                className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-white/15 px-5 font-bold text-white ring-1 ring-white/25 game-press hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                            >
                                <LuPalette aria-hidden="true" /> Görünümler
                            </Link>
                        )}
                    </div>

                    {member ? (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            {ov.wallet && <WalletChip balance={ov.wallet.balance} className="!bg-white/15 !text-white" />}
                            {slotsText && (
                                <span className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white/15 px-3.5 text-sm font-bold text-white" aria-label={`Harita hakkı: ${slotsText}`}>
                                    <LuMap aria-hidden="true" /> {slotsText} harita
                                </span>
                            )}
                        </div>
                    ) : (
                        <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/90 ring-1 ring-white/15">
                            Misafir olarak macera ve inşa modunu deneyebilirsin. Kaydetmek, harita paylaşmak ve jeton ödülleri için{' '}
                            <Link to="/login" className="font-bold text-amber-200 underline">
                                giriş yap
                            </Link>
                            .
                        </p>
                    )}
                </div>
            </section>

            {ov.status === 'error' && (
                <div role="status" className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-amber-400/20 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-300/40 dark:text-amber-100">
                    <LuCloudOff className="shrink-0" aria-hidden="true" />
                    <span className="flex-1">{ov.error}</span>
                    <button type="button" onClick={fetchOverview} className="min-h-[44px] font-bold underline">
                        Tekrar dene
                    </button>
                </div>
            )}

            <nav aria-label="Keşif bölümleri" className="mt-5">
                <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <li><Tile cls="kesif-tile-macera" icon={LuCompass} title="Yeni Macera" sub="Rastgele bir dünya" onClick={() => jumpTo('macera')} /></li>
                    <li><Tile cls="kesif-tile-devam" icon={LuSave} title="Devam Et" sub={allSaves.length ? `${allSaves.length} kayıt` : 'Kayıtlı macera'} onClick={() => jumpTo('devam')} /></li>
                    <li><Tile cls="kesif-tile-insa" icon={LuHammer} title="İnşa Modu" sub="Uç, kaz, yarat" onClick={() => jumpTo('insa')} /></li>
                    <li><Tile cls="kesif-tile-topluluk" icon={LuUsers} title="Topluluk Haritaları" sub="Yeni ve popüler" onClick={() => jumpTo('topluluk')} /></li>
                    <li><Tile cls="kesif-tile-harita" icon={LuMap} title="Haritalarım" sub={slotsText ? `${slotsText} hak dolu` : 'Kaydet ve paylaş'} onClick={() => jumpTo('haritalarim')} /></li>
                    <li><Tile cls="kesif-tile-hak" icon={LuPlus} title="Harita Hakkı Al" sub="10.000 jeton = +5 hak" onClick={openSlots} /></li>
                </ul>
            </nav>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Section id="kesif-macera" title="Yeni Macera" icon={LuCompass} tone="text-teal-500">
                    <AdventurePanel code={code} onCode={setCode} onReroll={() => setCode(generateWorldCode())} onStart={startAdventure} disabled={!webgl} />
                </Section>
                <Section id="kesif-devam" title="Devam Et" icon={LuSave} tone="text-slate-500">
                    <ContinuePanel
                        saves={allSaves}
                        status={saves.status === 'loading' || (member && ov.status === 'loading') ? 'loading' : 'ready'}
                        member={member}
                        disabled={!webgl}
                        onContinue={(s) => go(entryForSave(s))}
                    />
                </Section>
            </div>

            <Section id="kesif-insa" title="İnşa Modu" icon={LuHammer} tone="text-amber-500" className="mt-4">
                <BuildPanel base={base} onBase={setBase} onStart={startBuild} disabled={!webgl} member={member} slotsFree={Number(profile?.slots_free) || 0} />
            </Section>

            <Section id="kesif-topluluk" title="Topluluk Haritaları" icon={LuUsers} tone="text-violet-500" className="mt-4">
                <MapBrowser api={api} member={member} onPlay={playMap} />
            </Section>

            <Section id="kesif-haritalarim" title="Haritalarım" icon={LuMap} tone="text-fuchsia-500" className="mt-4">
                <MyMaps
                    api={api}
                    member={member}
                    profile={profile}
                    onProfile={(p) => setOv((o) => ({ ...o, profile: p }))}
                    onBuySlots={openSlots}
                    onPlay={playMap}
                    onEdit={editMap}
                    onBuild={() => jumpTo('insa')}
                />
            </Section>

            <div className="mt-4">
                <HowTo />
            </div>

            <p className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <LuBookOpen aria-hidden="true" /> Dünya, fizik ve savaş tamamen cihazında çalışır; sunucuya yalnızca haritalar, kayıtlar ve ödül talepleri gider.
            </p>

            <SlotShop open={slotsOpen} api={api} profile={profile} wallet={ov.wallet} onClose={() => setSlotsOpen(false)} onChange={onChange} />
        </>
    );
};

/** `api` ve `loadSaves` yalnızca test/gömme için enjekte edilir. */
const KesifLobbyPage = ({ api = kesifApiDefault, loadSaves = loadLocalSaves }) => {
    const { isAuthenticated, user, loading } = useAuth();
    return (
        <GameLayout docTitle="Herkesler Keşfediyor">
            {loading ? <GameLoading /> : <Lobby key={isAuthenticated ? `u:${user?.id ?? ''}` : 'guest'} member={Boolean(isAuthenticated)} api={api} loadSaves={loadSaves} />}
        </GameLayout>
    );
};

export default KesifLobbyPage;
