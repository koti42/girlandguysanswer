import React from 'react';
import { LuCheck, LuCloudOff, LuX } from 'react-icons/lu';
import { LANES } from './runnerUtils';

/*
 * Kapıya yaklaşırken üstte beliren soru paneli.
 *
 * Şıklar tıklanmaz: cevap, doğru şıkkın şeridinden koşarak verilir. Bu
 * yüzden tüm panel `pointer-events-none`; üstünden başlayan kaydırma da
 * oyuna gider. Uzun soru metni küçülür ve satır kırar.
 *
 * Güvenlik ağı: sunucu koşuda uzun soru (>150) / şık (>70) kullanmıyor ama
 * veri sonradan değişebilir. Soru mobilde 4 satırda kırpılır (tam metin
 * ekran okuyucu duyurusunda var), panel de ekran yüksekliğinin %45'ini
 * aşmaz: yolu ve gelen engelleri örtmesin. Şıklar kırpılmaz, yalnızca küçülür.
 */

const questionSize = (text) => {
    const len = String(text || '').length;
    if (len > 140) return 'text-[13px] leading-snug';
    if (len > 80) return 'text-sm leading-snug';
    return 'text-base sm:text-lg leading-snug';
};

// Üç şık aynı boyutta yazılsın: en uzun şıkka göre seçilir (yan yana farklı boyut dağınık duruyordu).
const optionSize = (options) => (Math.max(0, ...options.map((o) => String(o ?? '').length)) > 28 ? 'text-[11px]' : 'text-xs sm:text-sm');

const Feedback = ({ gate }) => {
    const correctText = gate.correctLane != null ? gate.question?.options?.[gate.correctLane] : null;
    if (gate.status === 'correct') {
        return (
            <p className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-base font-black text-white game-pop-in">
                <LuCheck aria-hidden="true" /> Doğru! x{gate.multiplier}
            </p>
        );
    }
    if (gate.status === 'wrong') {
        return (
            <p className="rounded-xl bg-rose-600 px-3 py-2 text-center text-sm font-bold text-white game-pop-in break-words">
                <LuX className="mr-1 inline align-[-2px]" aria-hidden="true" />
                Yanlış — doğru cevap:{' '}
                {correctText != null ? `${LANES[gate.correctLane].label} · ${correctText}` : '?'}
            </p>
        );
    }
    if (gate.status === 'unknown') {
        // "?": sonuç bekleniyor. Ağ sorunu ile sunucunun o an karar vermemesi (409/422) ayrı anlatılır.
        const network = gate.reason !== 'pending';
        return (
            <p className="flex items-center justify-center gap-2 rounded-xl bg-amber-500/90 px-3 py-2 text-center text-xs font-bold text-slate-950">
                {network ? (
                    <LuCloudOff className="shrink-0" aria-hidden="true" />
                ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-950/80 text-[11px] font-black text-amber-200" aria-hidden="true">
                        ?
                    </span>
                )}
                {network ? 'Bağlantı yavaş: bu kapı koşu sonunda değerlendirilecek.' : 'Sonuç bekleniyor: bu kapı koşu sonunda değerlendirilecek.'}
            </p>
        );
    }
    if (gate.status === 'sending') {
        return <p className="text-center text-xs font-semibold text-white/70">Kontrol ediliyor…</p>;
    }
    return null;
};

/*
 * frozen: mola ve devam geri sayımında süre çubuğu durur (sim de duruyor);
 *   eleman aynı kaldığı için devam edince kaldığı yerden akar.
 * hidden: molada soru okunamasın. Panel sökülmez (animasyon sıfırlanırdı),
 *   `invisible` metni hem gizler hem ekran okuyucudan çıkarır.
 */
const QuestionPanel = ({ gate, total, frozen = false, hidden = false }) => {
    if (!gate?.question) return null;
    const { question, status, chosenLane, correctLane, seconds } = gate;
    const answered = status !== 'asking';
    const options = question.options || [];
    const optClass = optionSize(options);

    return (
        <div
            className={`pointer-events-none absolute inset-x-0 top-[calc(max(0.5rem,env(safe-area-inset-top))+4.25rem)] z-10 flex justify-center pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] ${hidden ? 'invisible' : ''}`}
            data-testid="runner-qpanel-wrap"
        >
            <section
                className={`runner-qpanel ${answered ? 'runner-qpanel--answered' : ''} max-h-[45vh] supports-[height:1svh]:max-h-[45svh] overflow-hidden w-full max-w-xl rounded-2xl bg-slate-950/70 p-3 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md game-fade-up`}
                aria-label="Soru kapısı"
            >
                <p className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-widest text-white/60">
                    <span className="truncate">
                        Kapı {gate.index + 1}
                        {total ? ` / ${total}` : ''}
                        {question.category?.name ? ` · ${question.category.name}` : ''}
                    </span>
                    {!answered && <span className="shrink-0 text-gold">Şeridini seç!</span>}
                </p>
                <h2 className={`runner-qpanel-q mt-1 line-clamp-4 sm:line-clamp-6 break-words font-extrabold ${questionSize(question.text)}`} data-testid="runner-qpanel-q">
                    {question.text}
                </h2>

                {!answered && seconds > 0 && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
                        <div
                            className="runner-gate-timer h-full rounded-full bg-gradient-to-r from-gold to-coral"
                            style={{ animationDuration: `${seconds}s`, animationPlayState: frozen ? 'paused' : 'running' }}
                            data-testid="runner-gate-timer"
                        />
                    </div>
                )}

                <ul className="runner-qpanel-opts mt-2 grid grid-cols-3 gap-1.5">
                    {options.map((opt, lane) => {
                        const l = LANES[lane];
                        const isCorrect = answered && correctLane === lane;
                        const isChosen = chosenLane === lane;
                        const dim = answered && correctLane != null && !isCorrect && !isChosen;
                        return (
                            <li
                                key={lane}
                                className={`runner-qpanel-opt flex min-w-0 flex-col rounded-xl bg-gradient-to-b px-1.5 py-1.5 text-center shadow ${l.className} ${
                                    isCorrect ? 'ring-2 ring-emerald-300' : isChosen ? `ring-2 ${l.ring}` : ''
                                } ${dim ? 'opacity-40' : ''}`}
                            >
                                <span className="text-[10px] font-black uppercase tracking-wide text-white">
                                    {lane === 2 ? `${l.label} ${l.arrow}` : `${l.arrow} ${l.label}`}
                                </span>
                                <span className={`mt-0.5 break-words font-bold leading-tight ${optClass}`}>{opt}</span>
                                {isChosen && answered && <span className="sr-only">(senin şeridin)</span>}
                                {isCorrect && <span className="sr-only">(doğru cevap)</span>}
                            </li>
                        );
                    })}
                </ul>

                {/*
                  Canlı bölge yalnızca geri bildirim: soru, oyun sayfasının ekran
                  okuyucu duyurusunda okunuyor. Bütün panel canlı olsaydı her durum
                  değişiminde (soruluyor -> kontrol -> doğru) soru ve üç şık
                  baştan okunurdu. Kap her zaman DOM'da ki ilk içerik duyurulsun.
                */}
                <div className={answered ? 'mt-2' : ''} aria-live="polite" aria-atomic="true" data-testid="runner-gate-feedback">
                    {answered && <Feedback gate={gate} />}
                </div>
            </section>
        </div>
    );
};

export default QuestionPanel;
