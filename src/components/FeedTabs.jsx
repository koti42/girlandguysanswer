import React from 'react';
import { FaFire, FaClock, FaMagic, FaUserFriends } from 'react-icons/fa';

/*
 * Akış sekmeleri: Gündem / Yeni / Sana Özel / Takip ettiklerim.
 * Segmentli kontrol (mobil uygulamayla aynı dil); aktif sekme beyaz zemin + pembe ikon.
 * "Sana Özel" ilgi alanlarına, "Takip ettiklerim" takip edilen üyelere göre süzer.
 */
const TABS = [
    { key: 'popular', label: 'Gündem', icon: FaFire },
    { key: 'newest', label: 'Yeni', icon: FaClock },
    { key: 'forYou', label: 'Sana Özel', icon: FaMagic },
    { key: 'following', label: 'Takip ettiklerim', icon: FaUserFriends, authOnly: true },
];

const FeedTabs = ({ activeTab, onTabChange, showFollowing = false }) => (
    <div role="tablist" aria-label="Akış" className="flex bg-[#E9EEF6] dark:bg-gray-800 rounded-2xl p-1 gap-1 overflow-x-auto scrollbar-hide">
        {TABS.filter((t) => !t.authOnly || showFollowing).map((tab) => {
            const active = activeTab === tab.key;
            return (
                <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTabChange(tab.key)}
                    className={`flex-1 min-w-max inline-flex items-center justify-center gap-2 h-10 px-3 rounded-xl text-sm font-semibold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${active
                        ? 'bg-white dark:bg-gray-700 text-ink dark:text-white shadow-sm'
                        : 'text-ink-muted dark:text-gray-400 hover:text-ink dark:hover:text-gray-200'
                        }`}
                >
                    <tab.icon className={active ? 'text-brand-pink' : ''} />
                    <span>{tab.label}</span>
                </button>
            );
        })}
    </div>
);

export default FeedTabs;
