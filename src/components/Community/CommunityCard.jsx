import React from 'react';
import { FaMicrophone, FaKeyboard, FaUserFriends, FaLock } from 'react-icons/fa';

const CommunityCard = ({ community, onClick }) => {
    const isVoice = community.type === 'voice';

    return (
        <div
            onClick={() => onClick(community)}
            className="group relative overflow-hidden rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all cursor-pointer"
        >
            {/* Background Image Effect */}
            {community.image_url && (
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-10 group-hover:opacity-20 transition-opacity"
                    style={{ backgroundImage: `url(${community.image_url})` }}
                />
            )}

            <div className="relative p-4 flex flex-col h-full">
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                        {/* Live Indicator */}
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-900/30 rounded-full">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            <span className="text-xs font-bold text-red-500">CANLI</span>
                        </div>

                        {/* Type Icon */}
                        <div className={`p-1.5 rounded-full ${isVoice ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                            {isVoice ? <FaMicrophone size={12} /> : <FaKeyboard size={12} />}
                        </div>
                    </div>

                    {community.privacy === 'private' && (
                        <div className="text-gray-400">
                            <FaLock size={12} />
                        </div>
                    )}
                </div>

                {/* Content */}
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 line-clamp-1">
                    {community.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">
                    {community.description}
                </p>

                {/* Footer */}
                <div className="mt-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* Host Avatar */}
                        {community.owner?.avatar ? (
                            <img
                                src={community.owner.avatar}
                                alt={community.owner.username}
                                className="w-6 h-6 rounded-full object-cover border-2 border-white dark:border-gray-800"
                            />
                        ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">
                                {community.owner?.username?.[0]?.toUpperCase()}
                            </div>
                        )}
                        <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                            {community.owner?.username}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                        <FaUserFriends size={14} />
                        <span className="text-xs font-semibold">
                            {community.participants_count || 0}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommunityCard;
