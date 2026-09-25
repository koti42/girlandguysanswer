import React from 'react';
import { FaInbox, FaExclamationTriangle } from 'react-icons/fa';
import Button from './Button';

export function EmptyState({ icon: Icon = FaInbox, title = 'Kayıt yok', description, action }) {
    return (
        <div className="py-12 text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-white/[0.06] grid place-items-center p-muted"><Icon className="text-lg" /></div>
            <h4 className="mt-3 text-sm font-semibold">{title}</h4>
            {description && <p className="text-xs p-muted mt-1 max-w-sm mx-auto">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export function ErrorState({ message, onRetry }) {
    return (
        <div className="py-10 text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-rose-500/15 grid place-items-center text-rose-300"><FaExclamationTriangle /></div>
            <p className="mt-3 text-sm">{message || 'Veri alınamadı.'}</p>
            {onRetry && <Button className="mt-4" onClick={onRetry} size="sm">Tekrar dene</Button>}
        </div>
    );
}

export function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg bg-white/[0.07] ${className}`} aria-hidden />;
}

export function SkeletonRows({ rows = 6, cols = 4 }) {
    return (
        <div className="space-y-2 p-4" aria-busy="true" aria-label="Yükleniyor">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
                    {Array.from({ length: cols }).map((__, j) => <Skeleton key={j} className="h-5" />)}
                </div>
            ))}
        </div>
    );
}
