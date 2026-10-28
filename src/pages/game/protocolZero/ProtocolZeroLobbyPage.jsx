import React, { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuLogIn, LuMessageCircleQuestion, LuPlay, LuShieldAlert, LuTrophy } from 'react-icons/lu';
import { useAuth } from '../../../context/AuthContext';
import GameLayout from '../../../components/game/GameLayout';
import { GameLoading } from '../../../components/game/GameStates';
import useAsync from '../../../components/game/useAsync';
import SEO from '../../../components/SEO';
import PzHeroArt from '../../../components/game/protocolZero/PzHeroArt';
import PzLeaderboard from '../../../components/game/protocolZero/PzLeaderboard';
import PzHowTo from '../../../components/game/protocolZero/PzHowTo';
import ArchetypePicker from '../../../components/game/protocolZero/ArchetypePicker';
import GenePicker from '../../../components/game/protocolZero/GenePicker';
import CommanderCard from '../../../components/game/protocolZero/CommanderCard';
import { ARCHETYPES } from '../../../game/protocolZero/archetypes';
import { DIFFICULTIES, DIFFICULTY_KEYS, TECH_TREE } from '../../../game/protocolZero/constants';
import protocolZeroApiDefault from '../../../services/protocolZeroApi';
import {
    PLAY_PATH,
    buildEntry,
    difficultyName,
    fmtNum,
    loadArchetype,
    loadBest,
    loadDifficulty,
    loadGenes,
    loadLocalXp,
    saveArchetype,
    saveDifficulty,
    saveGenes,
    syncXp,
} from '../../../components/game/protocolZero/pzUtils';
import '../../../components/game/protocolZero/protocolZero.css';

const StatTile = ({ label, value, sub }) => (
    <div className="rounded-2xl bg-slate-50 px-3 py-3 dark:bg-white/5">
        <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="mt-0.5 text-lg font-extrabold tabular-nums text-slate-900 dark:text-white">{value}</dd>
        {sub && <dd className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{sub}</dd>}
    </div>
);

const DifficultyPicker = ({ value, onChange }) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Zorluk">
        {DIFFICULTY_KEYS.map((k) => {
            const d = DIFFICULTIES[k];
            const active = value === k;
            return (
                <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-pressed={active}
                    onClick={() => onChange(k)}
                    className="pz-diff-card flex min-h-[88px] flex-col items-start rounded-2xl border border-white/15 bg-white/10 p-3 text-left text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">{d.tag}</span>
                    <span className="text-base font-black">{d.name}</span>
                    <span className="mt-0.5 text-[11px] leading-snug text-white/75">{d.desc}</span>
                </button>
            );
        })}
    </div>
);

const Lobby = ({ member, api }) => {
    const navigate = useNavigate();
    const [difficulty, setDifficulty] = useState(loadDifficulty);
    const [archetype, setArchetype] = useState(loadArchetype);
    const [genes, setGenes] = useState(loadGenes);
    const [localXp] = useState(loadLocalXp);
    const [best] = useState(loadBest);
    const fetcher = useCallback(() => api.overview(), [api]);
    const { data, error, reload } = useAsync(fetcher, member ? 'm' : 'g');
    const me = data?.me || null;
    const discussion = data?.discussion || null;
    const xp = member && me?.xp != null ? syncXp(me.xp) : localXp;

    const start = () => {
        saveDifficulty(difficulty);
        saveArchetype(archetype);
        saveGenes(genes);
        navigate(PLAY_PATH, { state: { entry: buildEntry({ difficulty, archetype, genes, seed: Date.now() }) } });
    };

    return (
        <>
            <SEO
                title="PROTOCOL: ZERO - Yapay Zeka Saldırısını Durdurabilir Misin? | Herkesler Soruyor"
                description="Gerçek ülke sınırlı taktik dünya haritasında 14 veri merkezini kontrolden çıkan yapay zekâya karşı savun. Plague Inc. tarzı, üyeliksiz canlı strateji simülasyonu: güvenlik duvarları, karantina, kuantum şifre çözümü, kriz kararları. Skorunu paylaş, arkadaşlarına meydan oku."
            />
            <section className="game-hero game-hero-pz relative min-h-[340px] overflow-hidden rounded-3xl p-5 shadow-2xl game-pop-in sm:p-8" aria-labelledby="pz-hero-title">
                <PzHeroArt />
                <div className="relative z-10 flex max-w-2xl flex-col">
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-400 to-cyan-300 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950">
                        <LuShieldAlert aria-hidden="true" /> Canlı simülasyon · Üyeliksiz · Taktik dünya haritası
                    </span>
                    <h1 id="pz-hero-title" className="pz-title mt-2 text-3xl leading-tight sm:text-5xl">
                        PROTOCOL: ZERO
                    </h1>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Küresel Yapay Zekâ Karantinası</p>
                    <p className="mt-3 text-white/85">
                        Bir araştırma yapay zekâsı kontrolden çıktı ve dünyadaki 14 veri merkezine sızıyor. Ülkeler kızıla dönmeden haritada müdahale et:
                        güvenlik duvarlarını güçlendir, denizaltı kablolarını kes, baloncukları patlat, paniği yönet ve çekirdek şifresini çöz. Yapay zeka saldırısını durdurabilir misin?
                    </p>

                    <div className="mt-5">
                        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/70">Zorluk seç</p>
                        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={start}
                            data-testid="pz-start"
                            className="inline-flex min-h-[56px] basis-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-gradient-to-r from-cyan-300 to-sky-400 px-7 text-lg font-black text-slate-950 shadow-lg game-press disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:basis-auto"
                        >
                            <LuPlay className="shrink-0" aria-hidden="true" /> Görevi başlat · {ARCHETYPES[archetype]?.name} · {difficultyName(difficulty)}
                        </button>
                        {!member && (
                            <p className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/90 ring-1 ring-white/15">
                                Üyelik gerekmez. Skorunu komutan adınla kaydet; profiline bağlanması için{' '}
                                <Link to="/login" className="font-bold text-amber-200 underline">
                                    giriş yap
                                </Link>
                                .
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* Plague Inc. "tür seç" ekranı: YZ tehdit türü */}
            <section className="pz-arch-section mt-5 rounded-3xl p-4 sm:p-6" aria-labelledby="pz-arch-title">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-300">Senaryo</p>
                        <h2 id="pz-arch-title" className="text-2xl font-black text-white sm:text-3xl">Tehdit Türünü Seç</h2>
                    </div>
                    <p className="text-xs text-white/60">Her tür farklı yayılır, farklı korkutur ve kendi hikâyesini anlatır.</p>
                </div>
                <ArchetypePicker value={archetype} onChange={setArchetype} />
                <button
                    type="button"
                    onClick={start}
                    data-testid="pz-start-arch"
                    className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-400 px-6 text-base font-black text-white shadow-lg game-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
                >
                    <LuPlay aria-hidden="true" /> {ARCHETYPES[archetype]?.icon} {ARCHETYPES[archetype]?.name} senaryosunu başlat
                </button>
            </section>

            {/* Komutan rütbesi + Protokol Genleri (Plague Inc. gen yuvaları) */}
            <section className="pz-arch-section mt-4 rounded-3xl p-4 sm:p-6" aria-labelledby="pz-gene-title">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-300">Kariyer</p>
                        <h2 id="pz-gene-title" className="text-2xl font-black text-white sm:text-3xl">Komutan Profili</h2>
                        <p className="mb-3 text-xs text-white/60">Her görev XP kazandırır; rütbe yükseldikçe yeni Protokol Genleri açılır.</p>
                        <CommanderCard xp={xp} name={member ? undefined : 'Misafir komutan'} />
                        {!member && <p className="mt-2 text-[11px] text-white/60">Misafir XP'si bu cihazda saklanır. Giriş yaparsan ilerlemen hesabına bağlanır.</p>}
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-300">Protokol genleri</p>
                        <h3 className="mb-3 text-lg font-black text-white">Göreve özel yetenekler · {genes.length}/5 yuva</h3>
                        <GenePicker xp={xp} value={genes} onChange={setGenes} />
                    </div>
                </div>
            </section>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section className="game-card rounded-3xl p-4 sm:p-5" aria-labelledby="pz-stats-title">
                    <h2 id="pz-stats-title" className="mb-3 flex items-center gap-2 font-extrabold">
                        <LuTrophy className="text-gold" aria-hidden="true" /> {member ? 'Komutan karnen' : 'Bu cihazdaki rekorun'}
                    </h2>
                    {member ? (
                        error ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Karnen yüklenemedi.{' '}
                                <button type="button" onClick={reload} className="min-h-[44px] font-semibold text-coral underline">
                                    Tekrar dene
                                </button>
                            </p>
                        ) : !data ? (
                            <div className="grid grid-cols-2 gap-2" aria-hidden="true">
                                {[0, 1, 2, 3].map((i) => (
                                    <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
                                ))}
                            </div>
                        ) : (
                            <dl className="grid grid-cols-2 gap-2">
                                <StatTile label="En iyi skor" value={fmtNum(me?.best_score)} sub={me?.best_difficulty ? difficultyName(me.best_difficulty) : 'Henüz oynamadın'} />
                                <StatTile label="Zafer" value={`${fmtNum(me?.victories)} / ${fmtNum(me?.games)}`} sub="kazanılan / toplam görev" />
                                <StatTile label="En hızlı zafer" value={me?.best_days ? `${me.best_days} gün` : '—'} />
                                <StatTile label="En uzun direniş" value={me?.max_days ? `${me.max_days} gün` : '—'} />
                            </dl>
                        )
                    ) : best ? (
                        <dl className="grid grid-cols-2 gap-2">
                            <StatTile label="En iyi skor" value={fmtNum(best.score)} sub={difficultyName(best.difficulty)} />
                            <StatTile label="Sonuç" value={best.outcome === 'victory' ? '🏆 Zafer' : '💀 Yenilgi'} sub={`${best.days} gün`} />
                        </dl>
                    ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400">Henüz görev tamamlamadın. İlk skorun burada görünecek.</p>
                    )}
                    {!member && (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <Link to="/login" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-4 text-sm font-bold text-white game-press">
                                <LuLogIn aria-hidden="true" /> Giriş yap
                            </Link>
                            <Link to="/signup" className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-indigo-50 px-4 text-sm font-bold text-indigo-700 game-press dark:bg-white/10 dark:text-white">
                                Üye ol
                            </Link>
                        </div>
                    )}
                </section>

                <PzLeaderboard api={api} limit={10} />
            </div>

            {discussion?.path && (
                <Link
                    to={discussion.path}
                    className="mt-4 flex items-center gap-3 rounded-3xl bg-gradient-to-r from-fuchsia-500/15 to-cyan-400/15 p-4 ring-1 ring-fuchsia-300/30 transition hover:ring-fuchsia-300/60 game-press"
                >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-2xl text-fuchsia-500" aria-hidden="true">
                        <LuMessageCircleQuestion />
                    </span>
                    <span className="min-w-0">
                        <span className="block font-extrabold">Bu simülasyon hakkında ne düşünüyorsun? Sorulara katıl!</span>
                        <span className="block truncate text-sm text-slate-600 dark:text-slate-300">{discussion.title}</span>
                    </span>
                </Link>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <PzHowTo />
                </div>
                <section className="game-card rounded-3xl p-4 sm:p-5" aria-labelledby="pz-tree-title">
                    <h2 id="pz-tree-title" className="mb-3 font-extrabold">Küresel Savunma Ağacı</h2>
                    <ul className="space-y-3">
                        {TECH_TREE.map((cat) => (
                            <li key={cat.key}>
                                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: cat.color }}>
                                    {cat.name}
                                </p>
                                <ul className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                                    {cat.items.map((t) => (
                                        <li key={t.id} className="flex justify-between gap-2">
                                            <span>{t.name}</span>
                                            <span className="shrink-0 font-bold tabular-nums text-amber-600 dark:text-amber-300">{fmtNum(t.cost)} ₵</span>
                                        </li>
                                    ))}
                                </ul>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>

            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                Simülasyon tamamen cihazında çalışır; sunucuya yalnızca oyun sonu skor özeti gider. Ülke sınırları Natural Earth (world-atlas) verisinden, ses efektleri gerçek zamanlı sentezlenir.
            </p>
        </>
    );
};

/** `api` yalnızca test için enjekte edilir. */
const ProtocolZeroLobbyPage = ({ api = protocolZeroApiDefault }) => {
    const { isAuthenticated, user, loading } = useAuth();
    return (
        <GameLayout docTitle="PROTOCOL: ZERO">
            {loading ? <GameLoading /> : <Lobby key={isAuthenticated ? `u:${user?.id ?? ''}` : 'guest'} member={Boolean(isAuthenticated)} api={api} />}
        </GameLayout>
    );
};

export default ProtocolZeroLobbyPage;
