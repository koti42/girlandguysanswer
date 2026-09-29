import React from 'react';
import { LuCheck, LuX } from 'react-icons/lu';

const LETTERS = ['A', 'B', 'C', 'D'];

/*
 * state: idle | pending (gönderiliyor) | correct | wrong | dim
 */
const STYLES = {
    idle: 'bg-white/10 border-white/15 hover:bg-white/20 hover:border-white/30 text-white',
    pending: 'bg-white/20 border-gold ring-2 ring-gold/70 text-white',
    correct: 'bg-emerald-500 border-emerald-300 text-white game-correct shadow-[0_0_24px_-4px_rgba(16,185,129,0.8)]',
    wrong: 'bg-rose-500 border-rose-300 text-white game-shake',
    dim: 'bg-white/5 border-white/10 text-white/50',
};

const OptionButton = ({ index, text, state = 'idle', disabled, onSelect }) => (
    <button
        type="button"
        onClick={() => onSelect(index)}
        disabled={disabled}
        data-state={state}
        aria-label={`${index + 1}. şık: ${text}${state === 'correct' ? ' (doğru cevap)' : ''}${state === 'wrong' ? ' (senin yanlış cevabın)' : ''}`}
        className={`game-press group relative flex w-full items-center gap-3 rounded-2xl border-2 px-3.5 py-3 min-h-[56px] text-left font-semibold disabled:cursor-default ${STYLES[state] || STYLES.idle}`}
    >
        <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${
                state === 'correct' || state === 'wrong' ? 'bg-white/25' : 'bg-white/15 group-hover:bg-white/25'
            }`}
            aria-hidden="true"
        >
            {state === 'correct' ? <LuCheck /> : state === 'wrong' ? <LuX /> : LETTERS[index]}
        </span>
        <span className="flex-1 break-words text-[15px] leading-snug">{text}</span>
        <kbd className="hidden md:inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/20 text-[11px] text-white/60" aria-hidden="true">
            {index + 1}
        </kbd>
    </button>
);

export default OptionButton;
