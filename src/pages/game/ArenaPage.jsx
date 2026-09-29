import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LuPlay, LuTimer, LuZap, LuFlame } from 'react-icons/lu';
import GameLayout from '../../components/game/GameLayout';
import { GameError, GameLoading } from '../../components/game/GameStates';
import CategoryGrid from '../../components/game/CategoryGrid';
import useAsync from '../../components/game/useAsync';
import { gameApi, gameErrorMessage } from '../../services/gameApi';

const ArenaPage = () => {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { data, error: loadError, reload } = useAsync(gameApi.categories);
    const categories = data ? data.categories || [] : null;
    const error = loadError ? gameErrorMessage(loadError, 'Kategoriler yüklenemedi.') : null;
    const [selected, setSelected] = useState(params.get('kategori') || null);
    const [starting, setStarting] = useState(false);

    const start = async () => {
        if (starting) return;
        setStarting(true);
        try {
            const data = await gameApi.startArena(selected || undefined);
            navigate(`/oyun/oyna/${data.session.id}`);
        } catch (err) {
            toast.error(gameErrorMessage(err, 'Oyun başlatılamadı.'));
            setStarting(false);
        }
    };

    const selectedName = selected ? categories?.find((c) => c.slug === selected)?.name : 'Karışık';

    return (
        <GameLayout
            title="Bilgi Arenası"
            subtitle="Kategorini seç, 10 soruda en yüksek puanı topla."
            back={{ to: '/oyun', label: 'Oyun Merkezi' }}
        >
            <ul className="mb-5 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                <li className="game-card rounded-2xl px-2 py-3">
                    <LuTimer className="mx-auto mb-1 text-lg text-coral" aria-hidden="true" />
                    15 sn / soru
                </li>
                <li className="game-card rounded-2xl px-2 py-3">
                    <LuZap className="mx-auto mb-1 text-lg text-gold" aria-hidden="true" />
                    Hızlı = çok puan
                </li>
                <li className="game-card rounded-2xl px-2 py-3">
                    <LuFlame className="mx-auto mb-1 text-lg text-orange-500" aria-hidden="true" />
                    Seri bonusu
                </li>
            </ul>

            {error ? (
<GameError message={error} onRetry={reload} />
            ) : !categories ? (
                <GameLoading label="Kategoriler yükleniyor" />
            ) : (
                <CategoryGrid categories={categories} value={selected} onChange={setSelected} />
            )}

            {categories && !error && (
                <div className="sticky bottom-3 z-20 mt-6">
                    <button
                        type="button"
                        onClick={start}
                        disabled={starting}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral via-orange-400 to-gold px-6 py-4 min-h-[60px] text-lg font-extrabold text-white shadow-2xl game-press game-glow-coral disabled:opacity-70"
                    >
                        <LuPlay aria-hidden="true" />
                        {starting ? 'Başlıyor…' : `Başlat · ${selectedName || 'Karışık'}`}
                    </button>
                </div>
            )}
        </GameLayout>
    );
};

export default ArenaPage;
