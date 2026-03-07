import React from 'react';
import { FaLock } from 'react-icons/fa';

const ProfileTabs = ({ activeTab, setActiveTab, stats, isVIP, privacy, isOwnProfile }) => {
    const isUnlocked = isOwnProfile || !privacy.isPrivate || privacy.isFollowing;

    const TabButton = ({ id, label, count, colorClass, borderClass, vipColorClass, vipBorderClass }) => {
        const isActive = activeTab === id;

        let buttonClass = `text-center rounded-lg p-2 transition-all `;

        if (isUnlocked) {
            if (isActive) {
                if (isVIP) {
                    buttonClass += `bg-gradient-to-br ${vipColorClass || 'from-amber-100 to-yellow-100'} dark:from-amber-900/40 dark:to-yellow-900/40 border-2 ${vipBorderClass || 'border-amber-400'} shadow-lg`;
                } else {
                    buttonClass += `bg-coral/10 border ${borderClass || 'border-coral'}`;
                }
            } else {
                if (isVIP) {
                    buttonClass += `hover:bg-amber-50 dark:hover:bg-amber-900/20`;
                } else {
                    buttonClass += `hover:bg-gray-50 dark:bg-gray-700`;
                }
            }
        } else {
            buttonClass += `opacity-50 cursor-not-allowed`;
        }

        const countClass = `font-bold text-lg ${isActive && isVIP ? 'text-amber-600 dark:text-amber-400' : ''}`;

        return (
            <button
                onClick={() => isUnlocked && setActiveTab(id)}
                disabled={!isUnlocked}
                className={buttonClass}
            >
                <div className={countClass}>
                    {isUnlocked ? count : <FaLock className="text-sm mx-auto" />}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
            </button>
        );
    };

    return (
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mt-6">
            <TabButton
                id="questions"
                label="Sorular"
                count={stats.questions}
            />
            <TabButton
                id="answers"
                label="Cevaplar"
                count={stats.answers}
                vipColorClass="from-purple-100 to-pink-100"
                vipBorderClass="border-purple-400"
            />
            <TabButton
                id="opinions"
                label="Benceler"
                count={stats.opinions ?? 0}
                vipColorClass="from-indigo-100 to-blue-100"
                vipBorderClass="border-indigo-400"
            />
            <TabButton
                id="followers"
                label="Takipçi"
                count={stats.followers}
                vipColorClass="from-pink-100 to-rose-100"
                vipBorderClass="border-pink-400"
            />
            <TabButton
                id="following"
                label="Takip"
                count={stats.following}
                vipColorClass="from-blue-100 to-cyan-100"
                vipBorderClass="border-blue-400"
            />
            <TabButton
                id="liked"
                label="Beğeni"
                count={stats.likes}
                vipColorClass="from-red-100 to-orange-100"
                vipBorderClass="border-red-400"
            />
            <TabButton
                id="badges"
                label="Rozetler"
                count={stats.badges || 0}
                vipColorClass="from-green-100 to-emerald-100"
                vipBorderClass="border-green-400"
            />
        </div>
    );
};

export default ProfileTabs;
