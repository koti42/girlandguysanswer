import React, { useEffect } from 'react';
import ReactConfetti from 'react-confetti';
import { FaCrown, FaTimes } from 'react-icons/fa';

const LevelUpModal = ({ newLevel, onClose }) => {
    const [dimensions, setDimensions] = React.useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });

    useEffect(() => {
        const handleResize = () => {
            setDimensions({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <ReactConfetti
                width={dimensions.width}
                height={dimensions.height}
                recycle={false}
                numberOfPieces={500}
                gravity={0.2}
            />

            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            ></div>

            {/* Modal Content */}
            <div className="relative bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-300 border-4 border-yellow-400">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                    <FaTimes />
                </button>

                <div className="mb-6 relative inline-block">
                    <div className="absolute inset-0 bg-yellow-400 blur-2xl opacity-50 rounded-full animate-pulse"></div>
                    <FaCrown className="text-7xl text-yellow-500 relative z-10 animate-bounce-slow" />
                </div>

                <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2">
                    TEBRİKLER! 🎉
                </h2>

                <p className="text-gray-600 dark:text-gray-300 mb-6">
                    Seviye atladın ve yeni bir rütbeye ulaştın:
                </p>

                <div className="bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 py-3 px-6 rounded-xl border border-yellow-200 dark:border-yellow-700 inline-block mb-8">
                    <span className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                        {newLevel}
                    </span>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-3 bg-gradient-to-r from-coral to-orange-500 hover:from-coral-dark hover:to-orange-600 text-white font-bold rounded-xl shadow-lg transform transition-all hover:scale-105 active:scale-95"
                >
                    Harika! 🚀
                </button>
            </div>
        </div>
    );
};

export default LevelUpModal;
