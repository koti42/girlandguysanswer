import React from 'react';
import { FaThLarge } from 'react-icons/fa';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';

/*
 * Kategori rayı: büyük renkli kartlar yerine yatay kaydırılan kompakt chip'ler.
 * Seçili kategori dolu renkli; diğerleri kategori renginin yumuşak tonu.
 * Soru kartları ekranda daha yukarı gelir, kontrol hiyerarşisi netleşir.
 */
const CategoryNav = ({ categories = [], selectedCategory, onSelectCategory }) => {
    const allActive = !selectedCategory || selectedCategory.id === 0;
    return (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="list" aria-label="Kategoriler">
            <button
                type="button"
                onClick={() => onSelectCategory({ id: 0, name: 'Tümü' })}
                aria-pressed={allActive}
                className={`shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[13px] font-semibold border transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${allActive
                    ? 'bg-ink text-white border-ink'
                    : 'bg-white dark:bg-gray-800 text-ink dark:text-gray-200 border-line dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
            >
                <FaThLarge className="text-xs" /> Tümü
            </button>
            {categories.map((cat) => {
                const IconComponent = getCategoryIcon(cat.name);
                const color = getCategoryColor(cat.color);
                const active = selectedCategory?.id === cat.id;
                return (
                    <button
                        key={cat.id}
                        type="button"
                        onClick={() => onSelectCategory(active ? { id: 0, name: 'Tümü' } : cat)}
                        aria-pressed={active}
                        title={cat.name}
                        style={active ? { backgroundColor: color, borderColor: color } : { backgroundColor: `${color}14`, borderColor: `${color}26`, color }}
                        className={`shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[13px] font-semibold border max-w-[240px] transition-transform motion-reduce:transition-none hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${active ? 'text-white' : ''}`}
                    >
                        <IconComponent className="text-sm shrink-0" />
                        <span className="truncate">{cat.name}</span>
                    </button>
                );
            })}
        </div>
    );
};

export default CategoryNav;
