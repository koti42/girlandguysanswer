import React, { useState } from 'react';
import { FaTimes, FaHeart, FaComment, FaUserPlus, FaTrophy } from 'react-icons/fa';
import { notifications } from '../data/mockData';

const NotificationDropdown = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const getIcon = (type) => {
        switch (type) {
            case 'like': return <FaHeart className="text-coral" />;
            case 'comment': return <FaComment className="text-blue-500" />;
            case 'follow': return <FaUserPlus className="text-green-500" />;
            case 'badge': return <FaTrophy className="text-gold" />;
            default: return null;
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={onClose}></div>

            {/* Dropdown */}
            <div className="absolute right-0 top-full mt-2 w-80 md:w-96 bg-white rounded-2xl shadow-2xl z-50 border border-gray-100 max-h-[500px] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="font-bold text-lg">Bildirimler</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <FaTimes className="text-gray-400" />
                    </button>
                </div>

                {/* Notifications List */}
                <div className="flex-1 overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            Henüz bildirim yok
                        </div>
                    ) : (
                        notifications.map((notif) => (
                            <div
                                key={notif.id}
                                className={`p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${!notif.read ? 'bg-blue-50/30' : ''}`}
                            >
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                                        {getIcon(notif.type)}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-800">
                                            <span className="font-semibold">{notif.user}</span> {notif.message}
                                        </p>
                                        <span className="text-xs text-gray-400 mt-1 block">{notif.time}</span>
                                    </div>
                                    {!notif.read && (
                                        <div className="flex-shrink-0 w-2 h-2 bg-coral rounded-full mt-2"></div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-gray-100">
                    <button className="w-full text-center text-coral text-sm font-semibold hover:underline">
                        Tümünü Gör
                    </button>
                </div>
            </div>
        </>
    );
};

export default NotificationDropdown;
