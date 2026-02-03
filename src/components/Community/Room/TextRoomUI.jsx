import React from 'react';
import { FaSignOutAlt } from 'react-icons/fa';

const TextRoomUI = ({ community, onLeave, participantsCount }) => {
    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-xl border border-gray-100 dark:border-gray-700">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                <div>
                    <h2 className="font-bold text-lg text-gray-900 dark:text-white">{community.title || community.name}</h2>
                    <p className="text-xs text-gray-500">
                        {typeof participantsCount === 'number' ? `${participantsCount} kişi bu odada · Yazılı Sohbet` : 'Yazılı Sohbet Odası'}
                    </p>
                </div>
                <button
                    onClick={onLeave}
                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                >
                    <FaSignOutAlt />
                </button>
            </div>

            {/* Chat Area - We can reuse existing ChatWindow or build custom */}
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center text-gray-400">
                    <p>Yazılı Sohbet Modülü Entegre Ediliyor...</p>
                    <p className="text-sm">Bu özellik yakında aktif olacak.</p>
                </div>
            </div>
        </div>
    );
};

export default TextRoomUI;
