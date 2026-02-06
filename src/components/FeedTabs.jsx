import React from 'react';
import { FaFire, FaClock, FaMagic } from 'react-icons/fa';

const FeedTabs = ({ activeTab, onTabChange }) => {
    return (
        <div className="flex items-center gap-6 border-b border-gray-200 dark:border-gray-800 pb-2 mb-2">
            <button
                onClick={() => onTabChange('popular')}
                className={`flex items-center gap-2 font-bold pb-2 border-b-2 transition-all ${activeTab === 'popular'
                    ? 'text-coral border-coral'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                    }`}
            >
                <FaFire /> <span>Gündem</span>
            </button>
            <button
                onClick={() => onTabChange('newest')}
                className={`flex items-center gap-2 font-medium pb-2 border-b-2 transition-all ${activeTab === 'newest'
                    ? 'text-coral border-coral'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                    }`}
            >
                <FaClock /> <span>Yeni</span>
            </button>
            <button
                onClick={() => onTabChange('forYou')}
                className={`flex items-center gap-2 font-medium pb-2 border-b-2 transition-all ${activeTab === 'forYou'
                    ? 'text-coral border-coral'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                    }`}
            >
                <FaMagic /> <span>Sana Özel</span>
            </button>
        </div>
    );
};

export default FeedTabs;
