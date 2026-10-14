import React from 'react';
import { LuCheck, LuCloudOff, LuHourglass, LuX } from 'react-icons/lu';
import { CHOICES, CORRECT_POINTS } from './towerUtils';

/*
 * Soru katı paneli (şartname §B.2): kule durur, alttan iki büyük şık
 * butonu gelir. Cevap verilince (ya da süre dolunca) panel küçülüp üstte
 * tek satırlık bir sonuç rozetine döner; oyun bu sırada sürer, alanı
 * kapatmasın.
 *
 * Güvenlik ağı: uzun soru metni küçülür ve en fazla 5 satır gösterilir
 * (tam metin ekran okuyucu duyurusunda); panel ekranın yarısını aşmaz.
 *
 * frozen: mola ve devam geri sayımında süre çubuğu durur (sim de duruyor).
 * hidden: molada soru okunamasın (panel sökülmez, çubuk sıfırlanmasın).
 */

const questionSize = (text) => {
    const len = String(text || '').length;
    if (len > 140) return 'text-sm leading-snug';
    if (len > 80) return 'text-base leading-snug';
    return 'text-lg sm:text-xl leading-snug';
};

const optionSize = (options) => (Math.max(0, ...options.map((o) => String(o ?? '').length)) > 32 ? 'text-sm' : 'text-base sm:text-lg');

const Feedback = ({ q }) => {
    const opts = q.question?.options || [];
    if (q.status === 'correct') {
        return (
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-base font-black text-white shadow-lg game-pop-in">
                <LuCheck aria-hidden="true" /> Doğru! +{CORRECT_POINTS}
            </p>
        );
    }
    if (q.status === 'wrong') {
        const c = q.correctChoice;
        return (
            <p className="rounded-2xl bg-rose-600 px-4 py-2 text-center text-sm font-bold text-white shadow-lg game-pop-in break-words">
                <LuX className="mr-1 inline align-[-2px]" aria-hidden="true" />
                Yanlış — doğru cevap: {c === 0 || c === 1 ? `${CHOICES[c].label} · ${opts[c] ?? ''}` : '?'}
            </p>
        );
    }
    if (q.status === 'timeout') {
        return (
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 shadow-lg game-pop-in">
                <LuHourglass aria-hidden="true" /> Süre doldu
            </p>
        );
    }
    if (q.status === 'unknown') {
        const network = q.reason !== 'pending';
        return (
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/90 px-3 py-2 text-center text-xs font-bold text-slate-950 shadow-lg">
                {network ? <LuCloudOff className="shrink-0" aria-hidden="true" /> : <span aria-hidden="true">?</span>}
                {network ? 'Bağlantı yavaş: bu soru oyun sonunda değerlendirilecek.' : 'Sonuç bekleniyor: bu soru oyun sonunda değerlendirilecek.'}
            </p>
        );
    }
    if (q.status === 'sending' || q.status === 'locking') {
        const c = q.choice;
        return (
            <p className="rounded-2xl bg-slate-950/70 px-4 py-2 text-center text-sm font-semibold text-white/85 shadow-lg ring-1 ring-white/15 backdrop-blur-md break-words">
                {c === 0 || c === 1 ? `${CHOICES[c].label} · ${opts[c] ?? ''} — ` : ''}kontrol ediliyor…
            </p>
        );
    }
    return null;
};

const TowerQuestionPanel = ({ question: q, total, frozen = false, hidden = false, timerPaused = false, onAnswer }) => {
    if (!q?.question) return null;
    const asking = q.status === 'asking';
    const options = q.question.options || [];
    const optClass = optionSize(options);

    return (
        <>
            {asking && (
                <div
                    className={`absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] ${hidden ? 'invisible' : ''}`}
                    data-testid="tower-qpanel-wrap"
                >
                    <section
                        className="tower-qpanel tower-sheet-in max-h-[52vh] supports-[height:1svh]:max-h-[52svh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-3xl bg-slate-950/80 p-4 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md"
                        aria-label="Soru katı"
                        data-no-tap
                    >
                        <p className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-widest text-white/60">
                            <span className="truncate">
                                Soru {q.index + 1}
                                {total ? ` / ${total}` : ''}
                                {q.question.category?.name ? ` · ${q.question.category.name}` : ''}
                            </span>
                            <span className="shrink-0 text-gold">+{CORRECT_POINTS} puan</span>
                        </p>
                        <h2 className={`tower-qpanel-q mt-1.5 line-clamp-5 break-words font-extrabold ${questionSize(q.question.text)}`} data-testid="tower-qpanel-q">
                            {q.question.text}
                        </h2>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
                            <div
                                className="tower-q-timer h-full rounded-full bg-gradient-to-r from-gold to-coral"
                                style={{ animationDuration: `${q.seconds}s`, animationPlayState: frozen || timerPaused ? 'paused' : 'running' }}
                                data-testid="tower-q-timer"
                            />
                        </div>
                        <div className="tower-qpanel-opts mt-3 grid grid-cols-2 gap-2.5">
                            {options.map((opt, i) => {
                                const c = CHOICES[i];
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => onAnswer(i)}
                                        disabled={frozen}
                                        className={`tower-qpanel-opt flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-b px-2 py-2 text-center font-bold text-white shadow-lg ring-1 ring-white/20 game-press disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${c.className}`}
                                        aria-label={`${c.label}: ${opt}`}
                                    >
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-xs font-black" aria-hidden="true">
                                            {c.label}
                                        </span>
                                        <span className={`break-words leading-tight ${optClass}`} aria-hidden="true">
                                            {opt}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-2 hidden text-center text-[11px] text-white/50 sm:block">
                            Klavye: <kbd className="font-sans font-bold">←</kbd> / <kbd className="font-sans font-bold">1</kbd> ilk şık, <kbd className="font-sans font-bold">→</kbd> / <kbd className="font-sans font-bold">2</kbd> ikinci şık
                        </p>
                    </section>
                </div>
            )}

            {/*
              Sonuç rozeti üstte (HUD'un altında), dokunuşları engellemez. Canlı
              bölge her zaman DOM'da: ilk içerik de duyurulsun.
            */}
            <div
                className={`pointer-events-none absolute inset-x-0 top-[calc(max(0.5rem,env(safe-area-inset-top))+4.5rem)] z-20 flex justify-center px-4 ${hidden ? 'invisible' : ''}`}
                aria-live="polite"
                aria-atomic="true"
                data-testid="tower-answer-feedback"
            >
                {!asking && (
                    <div className="max-w-md">
                        <Feedback q={q} />
                    </div>
                )}
            </div>
        </>
    );
};

export default TowerQuestionPanel;
