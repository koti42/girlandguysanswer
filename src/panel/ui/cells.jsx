import React from 'react';

/** Tablo hücre yardımcıları - bileşen değil, saf render fonksiyonları. */
export const colorCell = (row, key = 'color') => row[key]
    ? <span className="inline-flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border border-[var(--p-border)]" style={{ background: row[key] }} /><code className="text-xs">{row[key]}</code></span>
    : <span className="p-muted">—</span>;
