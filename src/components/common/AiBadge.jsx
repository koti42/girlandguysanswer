import React from 'react';
import { FaRobot } from 'react-icons/fa';

const AiBadge = () => {
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 text-white shadow-sm">
            <FaRobot className="text-[10px]" />
            <span>AI(HS)</span>
        </span>
    );
};

export default AiBadge;

