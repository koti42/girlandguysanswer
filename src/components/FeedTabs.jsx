import React from 'react';
import { FaFire, FaClock, FaMagic } from 'react-icons/fa';

const FeedTabs = () => {
    return (
        <div className="flex items-center gap-6 border-b border-gray-200 pb-2 mb-2">
            <button className="flex items-center gap-2 text-coral font-bold pb-2 border-b-2 border-coral transition-all">
                <FaFire /> <span>Popüler</span>
            </button>
            <button className="flex items-center gap-2 text-gray-500 hover:text-gray-700 font-medium pb-2 border-b-2 border-transparent hover:border-gray-200 transition-all">
                <FaClock /> <span>Yeni</span>
            </button>
            <button className="flex items-center gap-2 text-gray-500 hover:text-gray-700 font-medium pb-2 border-b-2 border-transparent hover:border-gray-200 transition-all">
                <FaMagic /> <span>Sana Özel</span>
            </button>
        </div>
    );
};

export default FeedTabs;
