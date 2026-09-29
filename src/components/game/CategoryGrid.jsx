import React from 'react';
import { categoryIcon, MixedIcon } from './gameIcons';

/**
 * Kategori seçimi ızgarası. `value` null => Karışık.
 * Seçim radyo grubu mantığında: tek seçili kart.
 */
const CategoryGrid = ({ categories = [], value, onChange, includeMixed = true }) => {
    const items = [
        ...(includeMixed
            ? [{ id: 'mixed', slug: null, name: 'Karışık', icon: null, color: '#FF6B6B', question_count: null, mixed: true }]
            : []),
        ...categories,
    ];

    return (
        <div role="radiogroup" aria-label="Kategori" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map((c) => {
                const Icon = c.mixed ? MixedIcon : categoryIcon(c.icon);
                const selected = (value ?? null) === (c.slug ?? null);
                const color = c.color || '#8B5CF6';
                return (
                    <button
                        key={c.id ?? c.slug}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange?.(c.slug ?? null)}
                        className={`game-press relative flex min-h-[104px] flex-col items-start justify-between overflow-hidden rounded-2xl p-3.5 text-left text-white shadow-md ${
                            selected ? 'ring-4 ring-offset-2 ring-offset-transparent ring-gold scale-[1.02]' : 'opacity-95 hover:opacity-100'
                        }`}
                        style={{
                            background: c.mixed
                                ? 'linear-gradient(135deg, #FF6B6B 0%, #a855f7 55%, #3b82f6 100%)'
                                : `linear-gradient(135deg, ${color} 0%, ${color}cc 55%, #1e1b4b 160%)`,
                        }}
                    >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-xl backdrop-blur-sm">
                            <Icon aria-hidden="true" />
                        </span>
                        <span className="mt-2 w-full">
                            <span className="block truncate font-extrabold drop-shadow-sm">{c.name}</span>
                            <span className="block text-[11px] text-white/80">
                                {c.mixed ? 'Tüm kategorilerden' : c.question_count != null ? `${c.question_count} soru` : ''}
                            </span>
                        </span>
                        {selected && (
                            <span className="absolute right-2 top-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-slate-900">
                                Seçildi
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default CategoryGrid;
