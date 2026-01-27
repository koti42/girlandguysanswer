import React, { useEffect, useState } from 'react';
import { FaTrophy, FaStar } from 'react-icons/fa';

const XPToast = ({ points, position = 'top-center' }) => {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setVisible(false);
        }, 3000);
        return () => clearTimeout(timer);
    }, []);

    if (!visible) return null;

    const positionClasses = {
        'top-center': 'top-20 left-1/2 -translate-x-1/2',
        'bottom-center': 'bottom-10 left-1/2 -translate-x-1/2',
        'top-right': 'top-20 right-4',
        'bottom-right': 'bottom-10 right-4',
    };

    return (
        <div className={`fixed ${positionClasses[position]} z-50 animate-bounce-short pointer-events-none`}>
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 transform scale-110">
                <FaStar className="text-yellow-200 text-xl animate-spin-slow" />
                <span className="font-black text-xl tracking-wide">+{points} XP</span>
            </div>
        </div>
    );
};

export default XPToast;
