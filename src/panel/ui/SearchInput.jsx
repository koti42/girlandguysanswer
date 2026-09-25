import React, { useEffect, useState } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';

/** Gecikmeli arama kutusu: yazmayı bırakınca (300ms) onChange tetiklenir. */
export default function SearchInput({ value, onChange, placeholder = 'Ara…', delay = 300, className = '', autoFocus = false }) {
    const [local, setLocal] = useState(value || '');
    useEffect(() => { setLocal(value || ''); }, [value]);
    useEffect(() => {
        const t = window.setTimeout(() => { if (local !== (value || '')) onChange(local); }, delay);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [local]);

    return (
        <div className={`relative ${className}`}>
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs p-muted pointer-events-none" aria-hidden />
            <input
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder={placeholder}
                autoFocus={autoFocus}
                className="w-full h-10 rounded-lg p-inset border border-[var(--p-border)] pl-9 pr-8 text-sm text-[var(--p-text)] placeholder:text-[var(--p-muted)] p-ring"
                type="search"
                aria-label={placeholder}
            />
            {local && (
                <button type="button" onClick={() => { setLocal(''); onChange(''); }} aria-label="Temizle" className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded p-muted hover:text-[var(--p-text)]"><FaTimes className="text-xs" /></button>
            )}
        </div>
    );
}
