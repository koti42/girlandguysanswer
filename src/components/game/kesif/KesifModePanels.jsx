import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCheck, LuCloud, LuCopy, LuDices, LuHammer, LuHardDrive, LuPlay, LuSparkles } from 'react-icons/lu';
import { BASES, cleanWorldCode, copyText, formatPlayTime, prettyWorldCode, relativeTime } from './kesifUtils';

const primaryBtn =
    'inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-6 text-base font-black game-press disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral';
const iconBtn =
    'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-800 game-press hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15';

/**
 * Yeni Macera: paylaşılabilir Dünya Kodu (8 hane). Alan düzenlenebilir: bir
 * arkadaşın kodunu yapıştırınca aynı dünya açılır. Geçersiz kodla başlanmaz.
 */
export const AdventurePanel = ({ code, onCode, onReroll, onStart, disabled }) => {
    const [copied, setCopied] = useState(false);
    const timer = useRef(null);
    const clean = cleanWorldCode(code);

    useEffect(() => () => clearTimeout(timer.current), []);

    const copy = async () => {
        if (!clean) return;
        const ok = await copyText(clean);
        setCopied(ok);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2200);
    };

    return (
        <div data-testid="kesif-adventure">
            <p className="text-sm text-slate-600 dark:text-slate-300">
                Her yeni macera rastgele bir dünyada başlar. Aynı Dünya Kodu ile başlayan herkes aynı dünyayı keşfeder; kodu arkadaşınla paylaş ya da onunkini yapıştır.
            </p>
            <label htmlFor="kesif-world-code" className="mt-3 block text-sm font-semibold">
                Dünya Kodu
            </label>
            <div className="mt-1 flex flex-wrap items-stretch gap-2">
                <input
                    id="kesif-world-code"
                    type="text"
                    value={code}
                    onChange={(e) => onCode(e.target.value.toUpperCase().slice(0, 12))}
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!clean}
                    aria-describedby="kesif-world-code-hint"
                    className="min-h-[52px] w-44 rounded-2xl border border-slate-200 bg-white px-4 font-mono text-xl font-black tracking-[0.18em] text-slate-900 dark:border-white/15 dark:bg-white/5 dark:text-white"
                />
                <button type="button" onClick={copy} disabled={!clean} className={iconBtn} aria-label="Dünya Kodunu kopyala">
                    {copied ? <LuCheck className="text-emerald-500" aria-hidden="true" /> : <LuCopy aria-hidden="true" />}
                    {copied ? 'Kopyalandı' : 'Kopyala'}
                </button>
                <button type="button" onClick={onReroll} className={iconBtn} aria-label="Yeni rastgele kod üret">
                    <LuDices aria-hidden="true" /> Yeni kod
                </button>
            </div>
            <p id="kesif-world-code-hint" className={`mt-1.5 text-xs ${clean ? 'text-slate-500 dark:text-slate-400' : 'font-semibold text-rose-600 dark:text-rose-300'}`}>
                {clean ? `Dünya: ${prettyWorldCode(clean)}` : 'Dünya Kodu 8 harf ya da rakamdan oluşmalı (ör. K3F9A2XQ).'}
            </p>
            <p className="sr-only" role="status" aria-live="polite">
                {copied ? 'Dünya Kodu panoya kopyalandı' : ''}
            </p>
            <button
                type="button"
                onClick={() => clean && onStart(clean)}
                disabled={disabled || !clean}
                className={`${primaryBtn} mt-4 w-full bg-gradient-to-r from-teal-400 to-cyan-400 text-slate-950 shadow-lg sm:w-auto`}
            >
                <LuPlay aria-hidden="true" /> Maceraya başla
            </button>
        </div>
    );
};

/** Devam Et: yerel + bulut kayıtlar (en yeni üstte). */
export const ContinuePanel = ({ saves, status, member, onContinue, disabled }) => (
    <div data-testid="kesif-continue" aria-busy={status === 'loading'}>
        {status === 'loading' ? (
            <div className="space-y-2" aria-hidden="true">
                <div className="kesif-skeleton h-14 rounded-2xl" />
                <div className="kesif-skeleton h-14 rounded-2xl" />
            </div>
        ) : saves.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-3 py-4 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
                Henüz kayıtlı macera yok. Yeni bir maceraya başladığında ilerlemen otomatik kaydedilir.
            </p>
        ) : (
            <ul className="space-y-2">
                {saves.slice(0, 6).map((s) => {
                    const when = relativeTime(s.updatedAt);
                    return (
                        <li key={`${s.source}:${s.id}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200" aria-hidden="true">
                                {s.source === 'cloud' ? <LuCloud /> : <LuHardDrive />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-extrabold">{s.name}</span>
                                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                                    {s.source === 'cloud' ? 'Bulut' : 'Bu cihaz'}
                                    {s.worldCode ? ` · ${prettyWorldCode(s.worldCode)}` : ''}
                                    {s.zone ? ` · ${s.zone}` : ''}
                                    {s.playTime ? ` · ${formatPlayTime(s.playTime)}` : ''}
                                    {when ? ` · ${when}` : ''}
                                </span>
                            </span>
                            <button
                                type="button"
                                onClick={() => onContinue(s)}
                                disabled={disabled}
                                aria-label={`Devam et: ${s.name}${s.source === 'cloud' ? ' (bulut kaydı)' : ''}`}
                                className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white game-press disabled:opacity-50 dark:bg-white dark:text-slate-900"
                            >
                                <LuPlay aria-hidden="true" /> Devam
                            </button>
                        </li>
                    );
                })}
            </ul>
        )}
        {!member && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Misafir kayıtların yalnızca bu tarayıcıda saklanır.{' '}
                <Link to="/login" className="font-bold text-coral underline">
                    Giriş yaparsan
                </Link>{' '}
                ilerlemen buluta da kaydedilir ve her cihazdan devam edersin.
            </p>
        )}
    </div>
);

/**
 * İnşa Modu: başlangıç zeminini seç, uç ve sınırsız blokla yarat. Kaydetmek
 * (Haritalarım) için harita hakkı gerekir; misafir denemeyi girişsiz yapar.
 */
export const BuildPanel = ({ base, onBase, onStart, disabled, member, slotsFree }) => (
    <div data-testid="kesif-build">
        <p className="text-sm text-slate-600 dark:text-slate-300">
            Hasarsız, sınırsız bloklu yaratıcı mod: uç, kaz, inşa et. Bitirdiğin dünyayı harita olarak kaydedip toplulukla paylaşabilirsin.
        </p>
        <fieldset className="mt-3">
            <legend className="text-sm font-semibold">Başlangıç zemini</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BASES.map((b) => (
                    <label
                        key={b.key}
                        className={`flex min-h-[48px] cursor-pointer items-center justify-center rounded-2xl border px-3 text-sm font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-coral ${
                            base === b.key ? 'border-amber-500 bg-amber-400/20' : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5'
                        }`}
                    >
                        <input type="radio" name="kesif-base" value={b.key} checked={base === b.key} onChange={() => onBase(b.key)} className="sr-only" />
                        {b.label}
                    </label>
                ))}
            </div>
        </fieldset>
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-400/10 dark:text-amber-100">
            <LuSparkles className="mt-0.5 shrink-0" aria-hidden="true" />
            {member ? (
                slotsFree > 0 ? (
                    <span>{slotsFree} boş harita hakkın var; yaptığın dünyayı kaydedebilirsin.</span>
                ) : (
                    <span>Kaydetmek için boş harita hakkı gerekir. Hakkın yoksa aşağıdan hak alabilirsin.</span>
                )
            ) : (
                <span>
                    Denemek serbest! Kaydetmek ve paylaşmak için{' '}
                    <Link to="/login" className="font-bold underline">
                        giriş yap
                    </Link>{' '}
                    ve harita hakkı al.
                </span>
            )}
        </p>
        <button
            type="button"
            onClick={onStart}
            disabled={disabled}
            className={`${primaryBtn} mt-4 w-full bg-gradient-to-r from-amber-300 to-amber-400 text-slate-950 shadow-lg sm:w-auto`}
        >
            <LuHammer aria-hidden="true" /> İnşa etmeye başla
        </button>
    </div>
);
