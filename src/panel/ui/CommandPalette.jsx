import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FaSearch } from 'react-icons/fa';
import { Kbd } from './PageHeader';

/**
 * Ctrl/⌘+K komut paleti. `commands`: [{ id, label, hint?, to?, run?, group? }].
 * Basit alt dize eşlemesi; ok tuşlarıyla gezinme, Enter ile çalıştırma.
 */
export default function CommandPalette({ open, onClose, commands = [], panel }) {
    const [q, setQ] = useState('');
    const [idx, setIdx] = useState(0);
    const navigate = useNavigate();
    const inputRef = useRef(null);

    const results = useMemo(() => {
        const term = q.trim().toLowerCase();
        const list = term ? commands.filter((c) => (c.label + ' ' + (c.hint || '') + ' ' + (c.keywords || '')).toLowerCase().includes(term)) : commands;
        return list.slice(0, 12);
    }, [q, commands]);

    useEffect(() => { if (open) { setQ(''); setIdx(0); window.setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);
    useEffect(() => { setIdx(0); }, [q]);

    if (!open) return null;

    const run = (c) => {
        onClose();
        if (c.run) c.run();
        else if (c.to) navigate(c.to);
    };

    const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
        else if (e.key === 'Enter' && results[idx]) { e.preventDefault(); run(results[idx]); }
        else if (e.key === 'Escape') onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[950] flex items-start justify-center pt-[12vh] px-4" data-panel={panel} data-theme={document.querySelector('[data-panel]')?.dataset.theme} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div className="relative w-full max-w-xl p-surface rounded-2xl shadow-2xl overflow-hidden p-fade-in" role="dialog" aria-label="Komut paleti">
                <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--p-border)]">
                    <FaSearch className="p-muted" />
                    <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Sayfa, kullanıcı veya işlem ara…" className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--p-muted)]" />
                    <Kbd>esc</Kbd>
                </div>
                <ul className="max-h-[50vh] overflow-y-auto py-2">
                    {results.length === 0 && <li className="px-4 py-6 text-center text-xs p-muted">Sonuç yok</li>}
                    {results.map((c, i) => (
                        <li key={c.id}>
                            <button type="button" onMouseEnter={() => setIdx(i)} onClick={() => run(c)} className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm ${i === idx ? 'p-fill' : ''}`}>
                                {c.icon && <c.icon className="p-muted text-xs" />}
                                <span className="flex-1 truncate">{c.label}</span>
                                {c.group && <span className="text-[10px] uppercase p-muted">{c.group}</span>}
                                {c.hint && <Kbd>{c.hint}</Kbd>}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>,
        document.body
    );
}
