import React from 'react';
import { EmptyState, ErrorState, SkeletonRows } from './States';
import Pagination from './Pagination';
import { pageState, toggleOne, togglePage } from './selection';

/**
 * Veri tablosu.
 *
 * columns: [{ key, label, render?(row), width?, align?, sortable? }]
 * selectable: seçim kutuları; selection Set, onSelectionChange(Set)
 * onRowClick(row): satıra tıklama (seçim kutusu hariç)
 * rowTone(row): 'danger' | 'warning' | 'muted' ile satır vurgusu
 */
export default function DataTable({
    columns, rows = [], rowKey = 'id', loading, error, onRetry,
    selectable = false, selection, onSelectionChange,
    onRowClick, rowTone, empty, pagination, onPage, perPage, onPerPage,
    sort, onSort, dense = false,
}) {
    const ids = rows.map((r) => r[rowKey]);
    const state = selectable && selection ? pageState(selection, ids) : 'none';
    const cellPad = dense ? 'px-3 py-2' : 'px-4 py-3';

    const TONES = { danger: 'bg-rose-500/[0.06]', warning: 'bg-amber-500/[0.05]', muted: 'opacity-60' };

    return (
        <div className="overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wide p-muted">
                        <tr className="border-b border-[var(--p-border)]">
                            {selectable && (
                                <th className={`${cellPad} w-10`}>
                                    <input
                                        type="checkbox"
                                        aria-label="Sayfayı seç"
                                        checked={state === 'all'}
                                        ref={(el) => { if (el) el.indeterminate = state === 'some'; }}
                                        onChange={() => onSelectionChange(togglePage(selection, ids))}
                                        className="accent-[var(--p-accent)] h-4 w-4"
                                        data-testid="select-page"
                                    />
                                </th>
                            )}
                            {columns.map((c) => (
                                <th key={c.key} style={{ width: c.width }} className={`${cellPad} font-semibold text-left ${c.align === 'right' ? 'text-right' : ''} ${c.sortable ? 'cursor-pointer select-none hover:text-[var(--p-text)]' : ''}`} onClick={c.sortable && onSort ? () => onSort(c.key) : undefined} aria-sort={sort === c.key ? 'descending' : undefined}>
                                    {c.label}{c.sortable && sort === c.key ? ' ↓' : ''}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {!loading && !error && rows.map((row) => {
                            const id = row[rowKey];
                            const checked = selectable && selection?.has(id);
                            const tone = rowTone?.(row);
                            return (
                                <tr
                                    key={id}
                                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                                    className={`border-b border-[var(--p-border)] last:border-0 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-white/[0.04]' : ''} ${checked ? 'bg-[var(--p-accent)]/10' : ''} ${tone ? TONES[tone] || '' : ''}`}
                                    data-testid="table-row"
                                >
                                    {selectable && (
                                        <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                                            <input type="checkbox" aria-label="Seç" checked={!!checked} onChange={() => onSelectionChange(toggleOne(selection, id))} className="accent-[var(--p-accent)] h-4 w-4" data-testid="select-row" />
                                        </td>
                                    )}
                                    {columns.map((c) => (
                                        <td key={c.key} className={`${cellPad} align-middle ${c.align === 'right' ? 'text-right' : ''} ${c.nowrap ? 'whitespace-nowrap' : ''}`}>
                                            {c.render ? c.render(row) : row[c.key]}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {loading && <SkeletonRows cols={Math.min(columns.length, 5)} />}
            {!loading && error && <ErrorState message={error} onRetry={onRetry} />}
            {!loading && !error && rows.length === 0 && (empty || <EmptyState />)}
            {pagination && !loading && rows.length > 0 && <Pagination pagination={pagination} onPage={onPage} perPage={perPage} onPerPage={onPerPage} />}
        </div>
    );
}
