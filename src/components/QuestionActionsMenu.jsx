import React, { useState } from 'react';
import { FaEllipsisV, FaFlag, FaShare, FaEyeSlash, FaBan } from 'react-icons/fa';

const QuestionActionsMenu = () => {
    const [isOpen, setIsOpen] = useState(false);

    const actions = [
        { id: 'report', label: 'Şikayet Et', icon: FaFlag, color: 'text-red-600' },
        { id: 'share', label: 'Paylaş', icon: FaShare, color: 'text-blue-600' },
        { id: 'hide', label: 'Gizle', icon: FaEyeSlash, color: 'text-gray-600' },
        { id: 'block', label: 'Kullanıcıyı Engelle', icon: FaBan, color: 'text-gray-700' }
    ];

    const handleAction = (actionId) => {
        console.log('Action:', actionId);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
                <FaEllipsisV />
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    ></div>

                    {/* Dropdown Menu */}
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                        {actions.map((action) => {
                            const Icon = action.icon;
                            return (
                                <button
                                    key={action.id}
                                    onClick={() => handleAction(action.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                                >
                                    <Icon className={`${action.color} text-sm`} />
                                    <span className="text-gray-700 text-sm">{action.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

export default QuestionActionsMenu;
