import React, { useState, useRef, useEffect } from 'react';
import { FaEllipsisV, FaFlag, FaShare } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

const QuestionActionsMenu = ({ questionId, onReport }) => {
    const { isAuthenticated } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleReport = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        if (onReport) {
            onReport();
        }
    };

    const handleShare = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        // TODO: Share functionality
    };

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(!isOpen); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
                <FaEllipsisV />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden animate-in slide-in-from-top-2">
                    {isAuthenticated && (
                        <button
                            onClick={handleReport}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
                        >
                            <FaFlag className="text-red-500 text-sm" />
                            <span className="text-gray-700 dark:text-gray-300 text-sm font-medium">Şikayet Et</span>
                        </button>
                    )}
                    <button
                        onClick={handleShare}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left border-t border-gray-100 dark:border-gray-700"
                    >
                        <FaShare className="text-blue-500 text-sm" />
                        <span className="text-gray-700 dark:text-gray-300 text-sm font-medium">Paylaş</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default QuestionActionsMenu;
