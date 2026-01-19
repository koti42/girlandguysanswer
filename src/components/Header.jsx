import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaSearch, FaBell, FaHeart } from 'react-icons/fa';
import NotificationDropdown from './NotificationDropdown';
import { notifications } from '../data/mockData';

const Header = ({ onSearch }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (onSearch) {
            onSearch(query);
        }
    };

    return (
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-gray-200 shadow-sm py-3 px-4 md:px-8">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                {/* Logo */}
                <Link to="/" className="flex items-center gap-1 shrink-0 hover:opacity-80 transition-opacity">
                    <span className="font-script text-4xl text-coral font-bold leading-none select-none">
                        Kızilinkalarsoruyor
                    </span>
                    <div className="relative">
                        <FaHeart className="text-gold text-2xl" />
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-bold text-xs">?</span>
                    </div>
                </Link>

                {/* Search Bar */}
                <div className="hidden md:flex flex-1 max-w-xl relative">
                    <input
                        type="text"
                        placeholder="Binlerce soru arasında ara..."
                        value={searchQuery}
                        onChange={handleSearchChange}
                        className="w-full bg-white border border-gray-300 rounded-2xl py-2.5 pl-4 pr-12 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all font-sans text-sm"
                    />
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-coral transition-colors">
                        <FaSearch />
                    </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 shrink-0">
                    <button className="bg-gradient-to-r from-coral to-orange-400 text-white font-semibold py-2 px-6 rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all hidden sm:block">
                        Soru Sor
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                            className="relative p-2 text-gray-500 hover:text-coral bg-white rounded-full shadow-soft hover:shadow-soft-hover transition-all"
                        >
                            <FaBell className="text-xl" />
                            {unreadCount > 0 && (
                                <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 rounded-full border-2 border-white text-white text-xs flex items-center justify-center font-bold">
                                    {unreadCount}
                                </span>
                            )}
                        </button>
                        <NotificationDropdown
                            isOpen={isNotificationsOpen}
                            onClose={() => setIsNotificationsOpen(false)}
                        />
                    </div>

                    <Link to="/profile/Zeynep_Yildiz">
                        <img
                            src="https://i.pravatar.cc/150?u=a042581f4e29026024d"
                            alt="User"
                            className="w-10 h-10 rounded-full border-2 border-white shadow-md cursor-pointer hover:border-coral transition-colors"
                        />
                    </Link>
                </div>
            </div>
        </header>
    );
};

export default Header;
