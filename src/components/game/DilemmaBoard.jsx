import React, { useEffect, useState } from 'react';
import { LuCheck } from 'react-icons/lu';
import { clampPct, formatNumber } from './gameUtils';

/** Kadın/erkek kırılımı için yan yana A|B dolum çubuğu. */
export const SplitBar = ({ label, data, tone, revealed }) => {
    const a = clampPct(data?.a_pct);
    const b = clampPct(data?.b_pct);
    const total = data?.total ?? 0;
    const colors =
        tone === 'female'
            ? { a: 'from-pink-500 to-rose-400', b: 'bg-pink-200 dark:bg-pink-400/25', text: 'text-pink-600 dark:text-pink-300' }
            : { a: 'from-sky-500 to-blue-500', b: 'bg-sky-200 dark:bg-sky-400/25', text: 'text-sky-600 dark:text-sky-300' };
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-xs font-bold">
                <span className={colors.text}>
                    {label} <span className="font-medium text-slate-400">· {formatNumber(total)} oy</span>
                </span>
                <span className="tabular-nums text-slate-600 dark:text-slate-300" aria-label={`${label}: A yüzde ${a}, B yüzde ${b}`}>
                    A %{a} · B %{b}
                </span>
            </div>
            <div className={`flex h-3 overflow-hidden rounded-full ${colors.b}`} aria-hidden="true">
                <div className={`h-full rounded-full bg-gradient-to-r game-bar-fill ${colors.a}`} style={{ width: revealed ? `${a}%` : '0%' }} />
            </div>
        </div>
    );
};

const OPTION_STYLES = {
    a: 'from-coral via-rose-500 to-pink-500',
    b: 'from-indigo-500 via-violet-500 to-sky-500',
};

const DilemmaOption = ({ side, text, results, myVote, disabled, onVote, revealed, pending }) => {
    const pct = results ? clampPct(results[`${side}_pct`]) : null;
    const chosen = myVote === side;
    const lost = results && myVote && !chosen;

    return (
        <button
            type="button"
            onClick={() => onVote(side)}
            disabled={disabled}
            aria-pressed={chosen}
            aria-label={`${side.toUpperCase()} seçeneği: ${text}${pct != null ? `, yüzde ${pct}` : ''}${chosen ? ', senin seçimin' : ''}`}
            className={`game-press relative flex min-h-[132px] md:min-h-[220px] w-full flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-center text-white shadow-xl disabled:cursor-default ${OPTION_STYLES[side]} ${
                chosen ? 'ring-4 ring-gold ring-offset-2 ring-offset-transparent game-correct' : ''
            } ${lost ? 'opacity-75' : ''} ${pending ? 'animate-pulse' : ''} ${!results && !disabled ? 'hover:scale-[1.015] hover:shadow-2xl' : ''}`}
        >
            {results && (
                <span
                    className="absolute inset-y-0 left-0 bg-black/25 game-bar-fill"
                    style={{ width: revealed ? `${pct}%` : '0%' }}
                    aria-hidden="true"
                />
            )}
            <span className="relative text-[11px] font-extrabold uppercase tracking-[0.25em] text-white/70">{side.toUpperCase()}</span>
            <span className="relative mt-1 text-lg md:text-2xl font-extrabold leading-snug break-words">{text}</span>
            {results && (
                <span className="relative mt-2 text-4xl font-black tabular-nums drop-shadow game-pop-in">%{pct}</span>
            )}
            {chosen && (
                <span className="relative mt-2 inline-flex items-center gap-1 rounded-full bg-white/25 px-3 py-1 text-xs font-bold">
                    <LuCheck aria-hidden="true" /> Senin seçimin
                </span>
            )}
        </button>
    );
};

/**
 * İkilem oylama alanı. Oy verilene kadar sonuç yok (sunucu `results: null`
 * döner); oydan sonra yüzdeler 0'dan dolarak açılır.
 */
const DilemmaBoard = ({ dilemma, onVote, voting }) => {
    const results = dilemma?.results;
    const [revealed, setRevealed] = useState(false);

    useEffect(() => {
        if (!results) return undefined;
        // Bir kare boş çizip sonra genişliği vererek dolum animasyonunu tetikle.
        const raf = requestAnimationFrame(() => setRevealed(true));
        return () => {
            cancelAnimationFrame(raf);
            setRevealed(false);
        };
    }, [results, dilemma?.id]);

    if (!dilemma) return null;
    const myVote = dilemma.my_vote;
    const disabled = Boolean(results || myVote || voting);

    return (
        <div>
            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5">
                <DilemmaOption side="a" text={dilemma.option_a} results={results} myVote={myVote} disabled={disabled} onVote={onVote} revealed={revealed} pending={voting === 'a'} />
                {/* Mobilde kartlar alt alta: VS araya akışta yerleşir, seçim etiketini örtmez. */}
                <span
                    className="md:hidden relative z-10 -my-5 mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-gold shadow-xl ring-4 ring-white dark:ring-[#151038]"
                    aria-hidden="true"
                >
                    VS
                </span>
                <span
                    className="game-vs pointer-events-none absolute left-1/2 top-1/2 z-10 hidden md:flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-black text-gold shadow-xl ring-4 ring-white dark:ring-[#151038]"
                    aria-hidden="true"
                >
                    VS
                </span>
                <DilemmaOption side="b" text={dilemma.option_b} results={results} myVote={myVote} disabled={disabled} onVote={onVote} revealed={revealed} pending={voting === 'b'} />
            </div>

            {results && (
                <div className="mt-5 game-card rounded-3xl p-4 sm:p-5 space-y-4 game-fade-up">
                    <p className="text-center text-sm font-semibold text-slate-600 dark:text-slate-300">
                        Toplam <span className="font-extrabold text-slate-900 dark:text-white">{formatNumber(results.total)}</span> oy
                    </p>
                    <SplitBar label="Kadınlar" tone="female" data={results.by_gender?.female} revealed={revealed} />
                    <SplitBar label="Erkekler" tone="male" data={results.by_gender?.male} revealed={revealed} />
                </div>
            )}
        </div>
    );
};

export default DilemmaBoard;
