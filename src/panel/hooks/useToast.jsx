import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const Ctx = createContext(null);

export function useToast() {
    const v = useContext(Ctx);
    if (!v) throw new Error('useToast, ToastProvider içinde kullanılmalı');
    return v;
}

const TONES = {
    success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
    error: 'border-rose-500/40 bg-rose-500/10 text-rose-100',
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-100',
    warning: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
};

export function ToastProvider({ children }) {
    const [items, setItems] = useState([]);
    const counter = useRef(0);

    const push = useCallback((message, tone = 'info', ttl = 4000) => {
        const id = ++counter.current;
        setItems((list) => [...list, { id, message, tone }]);
        window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), ttl);
    }, []);

    const api = useMemo(() => ({
        push,
        success: (m) => push(m, 'success'),
        error: (m) => push(m, 'error', 6000),
        info: (m) => push(m, 'info'),
        warning: (m) => push(m, 'warning'),
    }), [push]);

    return (
        <Ctx.Provider value={api}>
            {children}
            <div className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2 w-[min(92vw,380px)]" role="status" aria-live="polite">
                {items.map((t) => (
                    <div key={t.id} className={`rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur bg-slate-900/90 ${TONES[t.tone] || TONES.info}`}>
                        {t.message}
                    </div>
                ))}
            </div>
        </Ctx.Provider>
    );
}
