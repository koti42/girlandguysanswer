import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LuLogIn, LuMap, LuSearch, LuX } from 'react-icons/lu';
import kesifApiDefault from '../../../services/kesifApi';
import { GameEmpty, GameError } from '../GameStates';
import MapCard from './MapCard';
import ReportDialog from './ReportDialog';
import { kesifErrorText, normalizeMap } from './kesifUtils';

const TABS = [
    { key: 'new', label: 'Yeni' },
    { key: 'popular', label: 'Popüler' },
];

const SkeletonGrid = () => (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
            <li key={i} className="game-card overflow-hidden rounded-3xl">
                <div className="kesif-skeleton aspect-video" />
                <div className="space-y-2 p-3.5">
                    <div className="kesif-skeleton h-4 w-2/3 rounded" />
                    <div className="kesif-skeleton h-3 w-1/3 rounded" />
                    <div className="kesif-skeleton h-11 rounded-xl" />
                </div>
            </li>
        ))}
    </ul>
);

const GuestNotice = () => (
    <div className="game-card rounded-3xl p-5 text-center" data-testid="kesif-browser-guest">
        <LuMap className="mx-auto text-3xl text-violet-500" aria-hidden="true" />
        <p className="mt-2 font-extrabold">Topluluk haritalarını görmek için giriş yap</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600 dark:text-slate-300">
            Arkadaşlarının ve diğer oyuncuların yaptığı haritaları gez, beğen ve oyna. Kendi haritanı da paylaşabilirsin.
        </p>
        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <Link to="/login" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-5 font-bold text-white game-press game-glow-coral">
                <LuLogIn aria-hidden="true" /> Giriş yap
            </Link>
            <Link to="/signup" className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-indigo-50 px-5 font-bold text-indigo-700 game-press dark:bg-white/10 dark:text-white">
                Üye ol
            </Link>
        </div>
    </div>
);

/**
 * Topluluk Haritaları: Yeni / Popüler sekmeleri, arama, sayfalama ("Daha fazla
 * göster" düğmesi; IntersectionObserver varsa liste sonuna yaklaşınca da
 * kendiliğinden), beğen, raporla, oyna. Misafirde giriş çağrısı gösterilir
 * (uçlar oturum ister). `onPlay(map)` oyuna geçişi lobi yapar.
 */
const MapBrowser = ({ api = kesifApiDefault, member = false, onPlay }) => {
    const [sort, setSort] = useState('new');
    const [draft, setDraft] = useState('');
    const [query, setQuery] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [state, setState] = useState({ status: 'loading', items: [], page: 0, lastPage: 1, total: 0, error: '' });
    const [moreBusy, setMoreBusy] = useState(false);
    const [likeBusy, setLikeBusy] = useState({});
    const [reporting, setReporting] = useState(null);
    const sentinel = useRef(null);
    const reqId = useRef(0);
    const moreLock = useRef(false);
    const likeLocks = useRef(new Set());

    // İlk sayfa: sekme/arama değişince baştan.
    useEffect(() => {
        if (!member) return undefined;
        const id = ++reqId.current;
        moreLock.current = false;
        setState((s) => ({ ...s, status: 'loading', error: '' }));
        api.maps({ sort, q: query, page: 1 }).then(
            (data) => {
                if (id !== reqId.current) return;
                const items = (data?.maps || []).map(normalizeMap).filter(Boolean);
                const p = data?.pagination || {};
                setState({ status: 'ready', items, page: Number(p.current_page) || 1, lastPage: Number(p.last_page) || 1, total: Number(p.total) || items.length, error: '' });
            },
            (err) => {
                if (id !== reqId.current) return;
                setState({ status: 'error', items: [], page: 0, lastPage: 1, total: 0, error: kesifErrorText(err, 'Haritalar yüklenemedi.') });
            }
        );
        return () => {
            reqId.current += 1;
        };
    }, [api, member, sort, query, reloadKey]);

    const hasMore = state.status === 'ready' && state.page < state.lastPage;

    const loadMore = useCallback(async () => {
        if (moreLock.current || !hasMore) return;
        moreLock.current = true;
        setMoreBusy(true);
        const id = reqId.current;
        try {
            const data = await api.maps({ sort, q: query, page: state.page + 1 });
            if (id !== reqId.current) return;
            const fresh = (data?.maps || []).map(normalizeMap).filter(Boolean);
            const p = data?.pagination || {};
            setState((s) => {
                const seen = new Set(s.items.map((m) => m.id));
                return {
                    ...s,
                    items: s.items.concat(fresh.filter((m) => !seen.has(m.id))),
                    page: Number(p.current_page) || s.page + 1,
                    lastPage: Number(p.last_page) || s.lastPage,
                    total: Number(p.total) || s.total,
                };
            });
        } catch (err) {
            if (id === reqId.current) toast.error(kesifErrorText(err, 'Daha fazla harita yüklenemedi.'));
        } finally {
            moreLock.current = false;
            setMoreBusy(false);
        }
    }, [api, hasMore, sort, query, state.page]);

    // Liste sonuna yaklaşınca otomatik yükle (destek yoksa düğme yeterli).
    useEffect(() => {
        const el = sentinel.current;
        if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return undefined;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) loadMore();
            },
            { rootMargin: '320px 0px' }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [hasMore, loadMore]);

    const patch = (mapId, fn) => setState((s) => ({ ...s, items: s.items.map((m) => (m.id === mapId ? fn(m) : m)) }));

    const like = async (map) => {
        if (likeLocks.current.has(map.id)) return;
        likeLocks.current.add(map.id);
        setLikeBusy((b) => ({ ...b, [map.id]: true }));
        // İyimser güncelleme; sunucu yanıtı doğrusunu getirir.
        patch(map.id, (m) => ({ ...m, liked: !m.liked, likes: Math.max(0, m.likes + (m.liked ? -1 : 1)) }));
        try {
            const res = await api.like(map.id);
            patch(map.id, (m) => ({ ...m, liked: Boolean(res?.liked), likes: Number.isFinite(Number(res?.likes)) ? Number(res.likes) : m.likes }));
        } catch (err) {
            patch(map.id, (m) => ({ ...m, liked: map.liked, likes: map.likes }));
            toast.error(kesifErrorText(err, 'Beğeni kaydedilemedi.'));
        } finally {
            likeLocks.current.delete(map.id);
            setLikeBusy((b) => ({ ...b, [map.id]: false }));
        }
    };

    const onReported = ({ hidden, mapId }) => {
        // Eşiği aşıp gizlenen harita listeden hemen kalksın.
        if (hidden) setState((s) => ({ ...s, items: s.items.filter((m) => m.id !== mapId), total: Math.max(0, s.total - 1) }));
    };

    const submitSearch = (e) => {
        e.preventDefault();
        setQuery(draft.trim());
    };

    const clearSearch = () => {
        setDraft('');
        setQuery('');
    };

    if (!member) return <GuestNotice />;

    const tabKey = (e, i) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
        setSort(next.key);
        e.currentTarget.parentElement?.querySelector(`[data-tab="${next.key}"]`)?.focus();
    };

    return (
        <div data-testid="kesif-browser">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div role="tablist" aria-label="Harita sıralaması" className="flex shrink-0 rounded-2xl bg-slate-100 p-1 dark:bg-white/10">
                    {TABS.map((t, i) => (
                        <button
                            key={t.key}
                            type="button"
                            role="tab"
                            id={`kesif-tab-${t.key}`}
                            data-tab={t.key}
                            aria-selected={sort === t.key}
                            aria-controls="kesif-browser-panel"
                            tabIndex={sort === t.key ? 0 : -1}
                            onClick={() => setSort(t.key)}
                            onKeyDown={(e) => tabKey(e, i)}
                            className={`min-h-[44px] min-w-[88px] rounded-xl px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral ${
                                sort === t.key ? 'bg-white text-slate-900 shadow dark:bg-violet-500 dark:text-white' : 'text-slate-600 dark:text-slate-300'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <form onSubmit={submitSearch} role="search" className="flex min-w-0 flex-1 gap-2">
                    <div className="relative min-w-0 flex-1">
                        <label htmlFor="kesif-search" className="sr-only">
                            Harita ya da oyuncu ara
                        </label>
                        <LuSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                            id="kesif-search"
                            type="search"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value.slice(0, 60))}
                            placeholder="Harita adı ya da oyuncu"
                            autoComplete="off"
                            enterKeyHint="search"
                            className="min-h-[44px] w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900 dark:border-white/15 dark:bg-white/5 dark:text-white"
                        />
                        {(draft || query) && (
                            <button type="button" onClick={clearSearch} aria-label="Aramayı temizle" className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-slate-500">
                                <LuX aria-hidden="true" />
                            </button>
                        )}
                    </div>
                    <button type="submit" className="min-h-[44px] rounded-2xl bg-violet-600 px-4 text-sm font-bold text-white game-press hover:bg-violet-700">
                        Ara
                    </button>
                </form>
            </div>

            <div id="kesif-browser-panel" role="tabpanel" aria-labelledby={`kesif-tab-${sort}`} className="mt-4" aria-busy={state.status === 'loading'}>
                {state.status === 'loading' && <SkeletonGrid />}
                {state.status === 'error' && <GameError message={state.error} onRetry={() => setReloadKey((k) => k + 1)} />}
                {state.status === 'ready' && state.items.length === 0 && (
                    <GameEmpty icon={LuMap} title={query ? 'Aramana uyan harita bulunamadı' : 'Henüz yayınlanmış harita yok'}>
                        {query ? 'Başka bir sözcük dene ya da aramayı temizle.' : 'İlk haritayı sen yayınla; Haritalarım bölümünden paylaşabilirsin.'}
                    </GameEmpty>
                )}
                {state.status === 'ready' && state.items.length > 0 && (
                    <>
                        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {state.items.map((m) => (
                                <li key={m.id} className="h-full">
                                    <MapCard map={m} variant="browse" busy={Boolean(likeBusy[m.id])} onPlay={onPlay} onLike={like} onReport={setReporting} />
                                </li>
                            ))}
                        </ul>
                        <div ref={sentinel} className="mt-4 flex justify-center">
                            {hasMore && (
                                <button
                                    type="button"
                                    onClick={loadMore}
                                    disabled={moreBusy}
                                    className="min-h-[48px] rounded-2xl bg-indigo-50 px-6 font-bold text-indigo-700 game-press disabled:opacity-60 dark:bg-white/10 dark:text-white"
                                >
                                    {moreBusy ? 'Yükleniyor…' : 'Daha fazla göster'}
                                </button>
                            )}
                        </div>
                    </>
                )}
                <p className="sr-only" role="status" aria-live="polite">
                    {state.status === 'ready' ? `${state.total} harita listeleniyor` : ''}
                </p>
            </div>

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Haritalar oyuncular tarafından yapılır ve yayınlanmadan süzülür. Uygunsuz bir şey görürsen bayrak simgesiyle raporla.
            </p>

            <ReportDialog open={Boolean(reporting)} map={reporting} api={api} onClose={() => setReporting(null)} onDone={onReported} />
        </div>
    );
};

export default MapBrowser;
