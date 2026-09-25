// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DataTable from './DataTable';
import { emptySelection } from './selection';

const columns = [{ key: 'name', label: 'Ad' }, { key: 'n', label: 'Sayı', align: 'right' }];
const rows = [{ id: '1', name: 'Ayşe', n: 3 }, { id: '2', name: 'Ali', n: 5 }, { id: '3', name: 'Zeynep', n: 1 }];

function Harness(props) {
    const [selection, setSelection] = useState(emptySelection());
    return (
        <>
            <div data-testid="count">{selection.size}</div>
            <DataTable columns={columns} rows={rows} selectable selection={selection} onSelectionChange={setSelection} {...props} />
        </>
    );
}

describe('DataTable', () => {
    it('satırları çizer', () => {
        render(<DataTable columns={columns} rows={rows} />);
        expect(screen.getAllByTestId('table-row')).toHaveLength(3);
        expect(screen.getByText('Zeynep')).toBeInTheDocument();
    });

    it('yüklenirken iskelet, boşken boş durum gösterir', () => {
        const { rerender } = render(<DataTable columns={columns} rows={[]} loading />);
        expect(screen.getByLabelText('Yükleniyor')).toBeInTheDocument();
        rerender(<DataTable columns={columns} rows={[]} />);
        expect(screen.getByText('Kayıt yok')).toBeInTheDocument();
    });

    it('hata durumunda mesaj ve tekrar dene', () => {
        const retry = vi.fn();
        render(<DataTable columns={columns} rows={[]} error="Sunucu hatası" onRetry={retry} />);
        expect(screen.getByText('Sunucu hatası')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Tekrar dene'));
        expect(retry).toHaveBeenCalledOnce();
    });

    it('tekil ve sayfa seçimi çalışır', () => {
        render(<Harness />);
        const boxes = screen.getAllByTestId('select-row');
        fireEvent.click(boxes[0]);
        expect(screen.getByTestId('count')).toHaveTextContent('1');
        fireEvent.click(screen.getByTestId('select-page'));
        expect(screen.getByTestId('count')).toHaveTextContent('3');
        fireEvent.click(screen.getByTestId('select-page'));
        expect(screen.getByTestId('count')).toHaveTextContent('0');
    });

    it('seçim kutusuna tıklamak satır tıklamasını tetiklemez', () => {
        const onRowClick = vi.fn();
        render(<Harness onRowClick={onRowClick} />);
        fireEvent.click(screen.getAllByTestId('select-row')[1]);
        expect(onRowClick).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('Ali'));
        expect(onRowClick).toHaveBeenCalledWith(rows[1]);
    });
});
