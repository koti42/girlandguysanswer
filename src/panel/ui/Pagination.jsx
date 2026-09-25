import React from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { formatNumber } from '../lib/format';

export default function Pagination({ pagination, onPage, perPage, onPerPage }) {
    const { current_page: page = 1, total_pages: pages = 1, total = 0 } = pagination || {};
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[var(--p-border)] text-xs p-muted">
            <span>Toplam <b className="text-[var(--p-text)]">{formatNumber(total)}</b> kayıt · sayfa {page}/{Math.max(pages, 1)}</span>
            <div className="flex items-center gap-2">
                {onPerPage && (
                    <select value={perPage} onChange={(e) => onPerPage(Number(e.target.value))} aria-label="Sayfa boyutu" className="h-8 rounded-lg p-inset border border-[var(--p-border)] px-2 text-xs text-[var(--p-text)]">
                        {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}/sayfa</option>)}
                    </select>
                )}
                <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Önceki" className="h-8 w-8 rounded-lg grid place-items-center border border-[var(--p-border)] p-hover disabled:opacity-40 p-ring"><FaChevronLeft /></button>
                <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Sonraki" className="h-8 w-8 rounded-lg grid place-items-center border border-[var(--p-border)] p-hover disabled:opacity-40 p-ring"><FaChevronRight /></button>
            </div>
        </div>
    );
}
