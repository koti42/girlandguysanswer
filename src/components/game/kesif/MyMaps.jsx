import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LuHammer, LuLogIn, LuMap, LuPlus, LuTrash2 } from 'react-icons/lu';
import GameDialog from '../avatar/GameDialog';
import { GameEmpty, GameError } from '../GameStates';
import kesifApiDefault from '../../../services/kesifApi';
import MapCard from './MapCard';
import PublishDialog from './PublishDialog';
import { kesifErrorText, normalizeMap, slotLabel, slotPercent, slotSpeech } from './kesifUtils';

const METER_CELLS = 20;

/** Hak sayacı: "3/5" + parçalı çubuk (çok hakta yüzdeye ölçeklenir). */
export const SlotMeter = ({ used, total }) => {
    const cells = Math.min(METER_CELLS, Math.max(0, total));
    const filled = total <= METER_CELLS ? Math.min(used, total) : Math.round((slotPercent(used, total) / 100) * METER_CELLS);
    return (
        <div>
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-2xl font-black tabular-nums" aria-label={slotSpeech(used, total)} data-testid="kesif-slot-label">
                    {slotLabel(used, total)}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400" aria-hidden="true">
                    dolu / toplam hak
                </span>
            </div>
            <div className="kesif-meter mt-2" role="img" aria-label={slotSpeech(used, total)}>
                {cells === 0 ? <span /> : Array.from({ length: cells }, (_, i) => <span key={i} data-on={i < filled} />)}
            </div>
        </div>
    );
};

const GuestNotice = () => (
    <div className="game-card rounded-3xl p-5 text-center" data-testid="kesif-mymaps-guest">
        <LuMap className="mx-auto text-3xl text-fuchsia-500" aria-hidden="true" />
        <p className="mt-2 font-extrabold">Haritalarını kaydetmek için giriş yap</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600 dark:text-slate-300">
            İnşa Modu&apos;nu girişsiz deneyebilirsin. Yaptığın haritayı kaydetmek, yayınlamak ve harita hakkı almak için üye olman gerekir.
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
 * Haritalarım: hak sayacı, kendi haritaların (özel/yayında/gizlenmiş), düzenle,
 * yayınla / gizle, sil (onaylı) ve hak alma girişi.
 *  - `profile` lobinin güncel hak özeti; liste yüklenince/silinince `onProfile` ile tazelenir.
 *  - `onBuySlots()` Harita Hakkı Al penceresini açar; `refreshKey` değişince liste yeniden çekilir.
 *  - `onEdit(map)` İnşa Modu'nda açar, `onPlay(map)` haritayı oynar.
 */
const MyMaps = ({ api = kesifApiDefault, member = false, profile, onProfile, onBuySlots, onEdit, onPlay, onBuild, refreshKey = 0 }) => {
    const [state, setState] = useState({ status: 'loading', maps: [], error: '' });
    const [reload, setReload] = useState(0);
    const [busyId, setBusyId] = useState(null);
    const [dialog, setDialog] = useState(null); // { type:'publish'|'edit'|'delete', map }
    const [deleting, setDeleting] = useState(false);
    const onProfileRef = useRef(onProfile);
    const lock = useRef(false);

    useEffect(() => {
        onProfileRef.current = onProfile;
    }, [onProfile]);

    useEffect(() => {
        if (!member) return undefined;
        let alive = true;
        setState((s) => ({ ...s, status: 'loading', error: '' }));
        api.mine().then(
            (data) => {
                if (!alive) return;
                setState({ status: 'ready', maps: (data?.maps || []).map(normalizeMap).filter(Boolean), error: '' });
                if (data?.profile) onProfileRef.current?.(data.profile);
            },
            (err) => alive && setState({ status: 'error', maps: [], error: kesifErrorText(err, 'Haritaların yüklenemedi.') })
        );
        return () => {
            alive = false;
        };
    }, [api, member, reload, refreshKey]);

    if (!member) return <GuestNotice />;

    const replace = (next) => setState((s) => ({ ...s, maps: s.maps.map((m) => (m.id === next.id ? { ...m, ...next } : m)) }));
    const merged = (raw, fallback) => normalizeMap(raw) || fallback;

    const unpublish = async (map) => {
        if (lock.current) return;
        lock.current = true;
        setBusyId(map.id);
        try {
            const res = await api.unpublish(map.id);
            replace(merged(res?.map, { ...map, visibility: 'private' }));
            toast.success('Harita yayından kaldırıldı.');
        } catch (err) {
            toast.error(kesifErrorText(err, 'Harita gizlenemedi.'));
        } finally {
            lock.current = false;
            setBusyId(null);
        }
    };

    const confirmDelete = async () => {
        const map = dialog?.map;
        if (!map || lock.current) return;
        lock.current = true;
        setDeleting(true);
        try {
            const res = await api.deleteMap(map.id);
            setState((s) => ({ ...s, maps: s.maps.filter((m) => m.id !== map.id) }));
            if (res?.profile) onProfileRef.current?.(res.profile);
            toast.success('Harita silindi, hakkın geri açıldı.');
            setDialog(null);
        } catch (err) {
            toast.error(kesifErrorText(err, 'Harita silinemedi.'));
        } finally {
            lock.current = false;
            setDeleting(false);
        }
    };

    const onSaved = (raw, { published }) => {
        const map = normalizeMap(raw);
        if (map) replace(map);
        setDialog(null);
        toast.success(published ? 'Haritan yayında!' : 'Harita bilgileri kaydedildi.');
    };

    const total = Number(profile?.map_slots) || 0;
    const used = Number(profile?.maps_used ?? state.maps.length) || 0;
    const free = Math.max(0, total - used);

    return (
        <div data-testid="kesif-mymaps">
            <div className="game-card flex flex-col gap-4 rounded-3xl p-4 sm:flex-row sm:items-center sm:p-5">
                <div className="min-w-0 flex-1">
                    <SlotMeter used={used} total={total} />
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        {total === 0
                            ? 'Henüz harita hakkın yok. Bir hak, kendi yaptığın bir haritayı kaydetmeni sağlar.'
                            : free === 0
                              ? 'Boş hakkın kalmadı. Yeni hak alabilir ya da eski bir haritanı silebilirsin.'
                              : `${free} boş hakkın var; yeni bir dünya yapıp kaydedebilirsin.`}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onBuySlots}
                    className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-300 to-amber-400 px-5 font-black text-slate-950 shadow-lg game-press"
                >
                    <LuPlus aria-hidden="true" /> Harita hakkı al
                </button>
            </div>

            <div className="mt-4" aria-busy={state.status === 'loading'}>
                {state.status === 'loading' && (
                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
                        {[0, 1].map((i) => (
                            <li key={i} className="game-card overflow-hidden rounded-3xl">
                                <div className="kesif-skeleton aspect-video" />
                                <div className="space-y-2 p-3.5">
                                    <div className="kesif-skeleton h-4 w-2/3 rounded" />
                                    <div className="kesif-skeleton h-11 rounded-xl" />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                {state.status === 'error' && <GameError message={state.error} onRetry={() => setReload((k) => k + 1)} />}
                {state.status === 'ready' && state.maps.length === 0 && (
                    <GameEmpty icon={LuHammer} title="Henüz haritan yok">
                        İnşa Modu&apos;nda bir dünya yap, oyun içinden &quot;Haritayı kaydet&quot;i seç; burada görünür.
                        {onBuild && (
                            <span className="mt-3 block">
                                <button type="button" onClick={onBuild} className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-amber-500 px-5 font-bold text-slate-950 game-press">
                                    <LuHammer aria-hidden="true" /> İnşa Modu&apos;na git
                                </button>
                            </span>
                        )}
                    </GameEmpty>
                )}
                {state.status === 'ready' && state.maps.length > 0 && (
                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {state.maps.map((m) => (
                            <li key={m.id} className="h-full">
                                <MapCard
                                    map={m}
                                    variant="mine"
                                    busy={busyId === m.id}
                                    onPlay={onPlay}
                                    onEdit={onEdit}
                                    onRename={(map) => setDialog({ type: 'edit', map })}
                                    onPublish={(map) => setDialog({ type: 'publish', map })}
                                    onUnpublish={unpublish}
                                    onDelete={(map) => setDialog({ type: 'delete', map })}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <PublishDialog
                open={dialog?.type === 'publish' || dialog?.type === 'edit'}
                map={dialog?.map}
                mode={dialog?.type === 'edit' ? 'edit' : 'publish'}
                api={api}
                onClose={() => setDialog(null)}
                onDone={onSaved}
            />

            <GameDialog open={dialog?.type === 'delete'} title="Haritayı sil" onClose={() => setDialog(null)} dismissable={!deleting}>
                <p className="text-sm text-slate-700 dark:text-slate-200">
                    <strong>{dialog?.map?.title}</strong> haritasını silmek istediğine emin misin? Bu işlem geri alınamaz; yayındaysa topluluktan da kalkar. Harita hakkın geri açılır.
                </p>
                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={() => setDialog(null)}
                        disabled={deleting}
                        data-autofocus
                        className="min-h-[48px] rounded-2xl px-5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                        Vazgeç
                    </button>
                    <button
                        type="button"
                        onClick={confirmDelete}
                        disabled={deleting}
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-rose-600 px-6 font-bold text-white game-press disabled:opacity-60"
                    >
                        <LuTrash2 aria-hidden="true" /> {deleting ? 'Siliniyor…' : 'Evet, sil'}
                    </button>
                </div>
            </GameDialog>
        </div>
    );
};

export default MyMaps;
