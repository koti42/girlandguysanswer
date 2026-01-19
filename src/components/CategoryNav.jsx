import React from 'react';
import { categories } from '../data/mockData';
import { FaChevronRight } from 'react-icons/fa';

const CategoryNav = () => {
    return (
        <div className="flex gap-4 overflow-x-auto pb-4 pt-2 scrollbar-hide">
            {categories.map((cat) => (
                <div
                    key={cat.id}
                    className={`flex-shrink-0 w-44 h-24 rounded-2xl bg-gradient-to-br ${cat.color} p-4 flex items-center justify-between text-white cursor-pointer hover:scale-105 transition-transform shadow-md`}
                >
                    <div className="flex flex-col">
                        <span className="font-bold text-lg leading-tight">{cat.title.split(' & ')[0]}</span>
                        <span className="text-sm opacity-90">& {cat.title.split(' & ')[1]}</span>
                    </div>
                    <cat.icon className="text-3xl opacity-80" />
                </div>
            ))}
        </div>
    );
};

export default CategoryNav;
