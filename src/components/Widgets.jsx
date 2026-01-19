import React from 'react';
import { trends, topUsers } from '../data/mockData';
import { FaArrowUp, FaMedal, FaBullhorn } from 'react-icons/fa';

export const TrendsWidget = () => (
    <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-coral rounded-full"></span>
            Trendler
        </h3>
        <div className="flex flex-col gap-4">
            {trends.map(trend => (
                <div key={trend.id} className="flex items-center justify-between group cursor-pointer">
                    <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium group-hover:bg-coral/10 group-hover:text-coral transition-colors">
                        {trend.tag}
                    </span>
                    <div className="flex items-center gap-1 text-gray-400 text-xs">
                        <FaArrowUp className="text-green-500" />
                        <span>{trend.count}</span>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

export const TopUsersWidget = () => (
    <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
        <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
            <span className="w-1 h-6 bg-gold rounded-full"></span>
            Topluluk Liderleri
        </h3>
        <div className="flex justify-around items-end">
            {/* 2nd Place */}
            <div className="flex flex-col items-center gap-2 relative">
                <img src={topUsers[1].avatar} className="w-14 h-14 rounded-full border-2 border-gray-300" alt={topUsers[1].name} />
                <span className="text-xs font-bold text-gray-600 dark:text-gray-400 text-center">{topUsers[1].name}</span>
                <FaMedal className="text-gray-400 text-xl absolute -top-3 right-0" />
            </div>

            {/* 1st Place */}
            <div className="flex flex-col items-center gap-2 relative -mt-4">
                <img src={topUsers[0].avatar} className="w-20 h-20 rounded-full border-4 border-gold shadow-md" alt={topUsers[0].name} />
                <span className="text-sm font-bold text-gray-800 dark:text-white text-center">{topUsers[0].name}</span>
                <FaMedal className="text-gold text-3xl absolute -top-4 right-0" />
            </div>

            {/* 3rd Place */}
            <div className="flex flex-col items-center gap-2 relative">
                <img src={topUsers[2].avatar} className="w-14 h-14 rounded-full border-2 border-orange-300" alt={topUsers[2].name} />
                <span className="text-xs font-bold text-gray-600 dark:text-gray-400 text-center">{topUsers[2].name}</span>
                <FaMedal className="text-orange-400 text-xl absolute -top-3 right-0" />
            </div>
        </div>
    </div>
);

export const AnnouncementsWidget = () => (
    <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-6 shadow-none border border-gray-200">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2 text-gray-700">
            <FaBullhorn className="text-coral" />
            Duyurular
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
            Binlerce soru yanıtını bekliyor! Sen de aramıza katıl, puanları topla fenomen ol.
        </p>
    </div>
);
