import React from 'react';
import { FaChevronRight } from 'react-icons/fa';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';

const CategoryNav = ({ categories = [], selectedCategory, onSelectCategory }) => {
    return (
        <div className="flex gap-4 overflow-x-auto pb-4 pt-2 pl-2 scrollbar-hide">
            <div
                onClick={() => onSelectCategory({ id: 0, name: 'Tümü' })}
                className={`flex-shrink-0 w-32 h-24 rounded-2xl flex items-center justify-center cursor-pointer hover:scale-105 transition-transform shadow-md ${selectedCategory?.id === 0
                    ? 'bg-gradient-to-br from-gray-700 to-gray-900 text-white ring-2 ring-offset-2 ring-gray-600 dark:ring-offset-gray-900'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
            >
                <span className="font-bold text-lg">Tümü</span>
            </div>

            {categories.map((cat) => {
                const IconComponent = getCategoryIcon(cat.name);
                const hexColor = getCategoryColor(cat.color); // API'den gelen color hex

                return (
                    <div
                        key={cat.id}
                        onClick={() => onSelectCategory(cat)}
                        style={{
                            backgroundColor: hexColor
                        }}
                        className={`flex-shrink-0 w-44 h-24 rounded-2xl p-4 flex items-center justify-between text-white cursor-pointer hover:scale-105 transition-transform shadow-md ${selectedCategory?.id === cat.id ? 'ring-4 ring-offset-2 ring-coral/30 transform scale-105' : ''
                            }`}
                    >
                        <div className="flex flex-col">
                            <span className="font-bold text-lg leading-tight">{cat.name.split(' & ')[0]}</span>
                            <span className="text-sm opacity-90">{cat.name.split(' & ')[1] && `& ${cat.name.split(' & ')[1]}`}</span>
                        </div>
                        <IconComponent className="text-3xl opacity-90" />
                    </div>
                );
            })}
        </div>
    );
};

export default CategoryNav;
