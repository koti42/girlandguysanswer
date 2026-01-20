import React from 'react';
import { FaFire, FaClock, FaMagic } from 'react-icons/fa';

const FeedTabs = ({ activeTab, onTabChange }) => {
    return (
        <div className="flex items-center gap-6 border-b border-gray-200 pb-2 mb-2">
            <button
                onClick={() => onTabChange('popular')}
                className={`flex items-center gap-2 font-bold pb-2 border-b-2 transition-all ${activeTab === 'popular'
                    ? 'text-coral border-coral'
                    : 'text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-200'
                    }`}
            >
                <FaFire /> <span>Popüler</span>
            </button>
            <button
                onClick={() => onTabChange('newest')}
                className={`flex items-center gap-2 font-medium pb-2 border-b-2 transition-all ${activeTab === 'newest'
                    ? 'text-coral border-coral'
                    : 'text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-200'
                    }`}
            >
                <FaClock /> <span>Yeni</span>
            </button>
            <button
                onClick={() => onTabChange('forYou')}
                className={`flex items-center gap-2 font-medium pb-2 border-b-2 transition-all ${activeTab === 'forYou'
                    ? 'text-coral border-coral'
                    : 'text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-200'
                    }`}
            >
                <FaMagic /> <span>Sana Özel</span>
            </button>
        </div>
    );
};

export default FeedTabs;
