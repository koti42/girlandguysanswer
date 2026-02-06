import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaHome, FaQuestionCircle, FaPlus, FaSearch, FaUser, FaUsers } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

const BottomNav = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    const navItems = [
        { icon: FaHome, label: 'Vitrin', path: '/' },
        { icon: FaQuestionCircle, label: 'Sorular', path: '/questions' },
        { icon: FaPlus, label: 'Sor Gitsin', path: '/ask' },
        { icon: FaUsers, label: 'Meydan', path: '/communities' },
        { icon: FaSearch, label: 'Bul', path: '/search' },
        { icon: FaUser, label: 'Ben', path: user ? `/profile/${user.username}` : '/login' }
    ];

    return (
        <nav className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
            <div className="flex justify-around items-center py-2">
                {navItems.map((item, index) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path ||
                        (item.label === 'Profil' && location.pathname.startsWith('/profile/'));

                    return (
                        <button
                            key={index}
                            onClick={() => navigate(item.path)}
                            className={`flex flex-col items-center gap-1 px-3 py-2 transition-colors ${isActive
                                ? 'text-coral'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            <Icon className="text-xl" />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

export default BottomNav;
