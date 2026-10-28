import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuSiren } from 'react-icons/lu';
import { GRID, MAX_MISSES, advance, createBreachState, tap } from '../../../game/protocolZero/breach';
import { fmtSeconds } from './pzUtils';

/**
 * Tahta: durum nesnesi (mutable, game/protocolZero/breach.js) bağlanışta bir kez kurulur; rAF döngüsü
 * zamanı ilerletir ve yeniden çizim için sayaç artırır. Bitişte 450 ms sonra onDone(success).
 */
const BreachBoard = ({ nodeName, seconds, targets, seed, onDone, onSound }) => {
    // Durum nesnesi ve bitiş geri çağrısı tek bir tutucuda (render'da ref yazmadan, effect'te doldurulur).
    const [st] = useState(() => createBreachState({ seed, targets, seconds }));
    const finishRef = useRef(null);
    const [, force] = useState(0);
    const rerender = useCallback(() => force((n) => n + 1), []);

    useEffect(() => {
        let last = performance.now();
        let lastTick = Math.ceil(seconds);
        let raf = 0;
        let finished = false;
        const finish = (ok) => {
            if (finished) return;
            finished = true;
            cancelAnimationFrame(raf);
            onSound?.(ok ? 'success' : 'fail');
            setTimeout(() => onDone?.(ok), 450);
        };
        finishRef.current = finish;
        const loop = (now) => {
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            const result = advance(st, dt);
            const sec = Math.ceil(st.remaining);
            if (sec !== lastTick && sec <= 5 && sec > 0) {
                lastTick = sec;
                onSound?.('tick');
            }
            rerender();
            if (result) {
                finish(result === 'success');
                return;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => {
            finished = true;
            cancelAnimationFrame(raf);
        };
    }, [st, seconds, onDone, onSound, rerender]);

    const cells = useMemo(() => Array.from({ length: GRID * GRID }, (_, i) => i), []);
    const pct = (st.remaining / st.seconds) * 100;

    const onTap = (idx) => {
        if (st.done) return;
        const kind = tap(st, idx);
        onSound?.(kind === 'hit' ? 'hit' : 'miss');
        rerender();
        if (st.done) finishRef.current?.(st.done === 'success');
    };

    return (
        <div className="pz-modal-backdrop">
            <div className="pz-modal pz-glass pz-glass-red pz-scan max-w-md p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="pz-breach-title">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-rose-100 ring-1 ring-rose-300/40">
                    <LuSiren className="pz-blink" aria-hidden="true" /> Zero-Day Breach Override
                </p>
                <h2 id="pz-breach-title" className="mt-2 text-lg font-black text-white sm:text-xl">
                    {nodeName}: siber matrisi temizle
                </h2>
                <p className="text-xs text-white/75">
                    Kızıl <strong className="text-rose-200">bozuk veri düğümlerine</strong> dokun; mavilere dokunma (en fazla {MAX_MISSES - 1} hata).
                </p>

                <div className="mt-3 flex items-center justify-between text-xs font-bold">
                    <span className="pz-mono text-white">
                        Yakalanan <span className="text-emerald-300">{st.hits}</span>/{st.targets}
                    </span>
                    <span className="pz-mono text-white">
                        Hata <span className={st.misses ? 'text-amber-300' : 'text-white/60'}>{st.misses}</span>/{MAX_MISSES - 1}
                    </span>
                    <span className={`pz-mono text-lg font-black ${st.remaining <= 4 ? 'text-rose-300 pz-blink' : 'text-white'}`} aria-live="polite">
                        {fmtSeconds(st.remaining)} sn
                    </span>
                </div>
                <div className="pz-meter pz-meter-ai mt-1.5" aria-hidden="true">
                    <span style={{ width: `${pct}%`, transition: 'none' }} />
                </div>

                <div className="pz-grid mt-4" style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))` }} role="grid" aria-label="Veri matrisi">
                    {cells.map((i) => {
                        const bad = st.bad.has(i);
                        const flash = st.lastCell === i ? st.lastKind : null;
                        return (
                            <button
                                key={i}
                                type="button"
                                role="gridcell"
                                data-testid={`pz-cell-${i}`}
                                data-bad={bad ? '1' : '0'}
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    onTap(i);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onTap(i);
                                    }
                                }}
                                className={`pz-cell ${bad ? 'pz-cell-bad' : ''} ${flash === 'hit' && !bad ? 'pz-cell-hit' : ''} ${flash === 'miss' ? 'pz-cell-miss' : ''}`}
                                aria-label={bad ? 'Bozuk veri düğümü' : 'Temiz düğüm'}
                            >
                                {bad ? '✕' : '·'}
                            </button>
                        );
                    })}
                </div>

                {st.done && (
                    <p role="status" className={`mt-4 text-center text-base font-black ${st.done === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {st.done === 'success' ? 'Saldırı püskürtüldü! Düğüm temizleniyor…' : 'Müdahale başarısız. Düğüm YZ kontrolünde.'}
                    </p>
                )}
            </div>
        </div>
    );
};

/**
 * "Zero-Day Breach Override" mini oyunu. Kurallar game/protocolZero/breach.js'de.
 * `seconds`/`targets` zorluktan; `onDone(success)`; `onSound(name)`. Açıkken simülasyon durur (üst bileşen).
 * Her açılış (`seed`) tahtayı sıfırdan kurar.
 */
const BreachMiniGame = ({ open, nodeName, seconds = 12, targets = 8, seed, onDone, onSound }) => {
    if (!open) return null;
    return <BreachBoard key={seed ?? 0} nodeName={nodeName} seconds={seconds} targets={targets} seed={seed ?? 1} onDone={onDone} onSound={onSound} />;
};

export default BreachMiniGame;
