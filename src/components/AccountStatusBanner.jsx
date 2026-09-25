import React from 'react';
import { FaSnowflake, FaBan, FaClock, FaExclamationTriangle, FaTimes } from 'react-icons/fa';

const AccountStatusBanner = ({ accountStatus, onDismiss }) => {
    if (!accountStatus || accountStatus.status === 'active') return null;

    const isBanned = accountStatus.status === 'banned';
    const until = accountStatus.until ? new Date(accountStatus.until) : null;
    const now = new Date();
    const timeRemaining = until ? until - now : null;

    const formatTimeRemaining = () => {
        if (!timeRemaining || timeRemaining <= 0) return 'Süresiz';
        
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days} gün ${hours % 24} saat`;
        } else if (hours > 0) {
            return `${hours} saat ${minutes} dakika`;
        } else {
            return `${minutes} dakika`;
        }
    };

    const bgColor = isBanned 
        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    
    const textColor = isBanned 
        ? 'text-red-600 dark:text-red-400' 
        : 'text-blue-600 dark:text-blue-400';
    
    const iconColor = isBanned 
        ? 'text-red-500 dark:text-red-400' 
        : 'text-blue-500 dark:text-blue-400';

    return (
        <div className={`${bgColor} border-l-4 rounded-lg p-4 mb-6 shadow-sm`}>
            <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 ${iconColor}`}>
                    {isBanned ? (
                        <FaBan className="text-2xl" />
                    ) : (
                        <FaSnowflake className="text-2xl" />
                    )}
                </div>
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className={`font-bold text-lg ${textColor}`}>
                            {accountStatus.message || (isBanned ? 'Hesabınız Banlandı' : 'Hesabınız Donduruldu')}
                        </h3>
                        {onDismiss && (
                            <button
                                onClick={onDismiss}
                                className={`${textColor} hover:opacity-70 transition-opacity p-1`}
                            >
                                <FaTimes />
                            </button>
                        )}
                    </div>
                    
                    {accountStatus.reason && (
                        <p className={`${textColor} text-sm mb-2`}>
                            <strong>Sebep:</strong> {accountStatus.reason}
                        </p>
                    )}
                    
                    {until && (
                        <div className={`flex items-center gap-2 ${textColor} text-sm mb-3`}>
                            <FaClock />
                            <span>
                                {timeRemaining > 0 
                                    ? `Kalan süre: ${formatTimeRemaining()}`
                                    : 'Süresiz'
                                }
                            </span>
                        </div>
                    )}
                    
                    {accountStatus.restrictedActions && accountStatus.restrictedActions.length > 0 && (
                        <div className="mt-3">
                            <p className={`${textColor} text-sm font-semibold mb-2`}>
                                {isBanned ? 'Banlıyken yapamayacağınız işlemler:' : 'Dondurulunca yapamayacağınız işlemler:'}
                            </p>
                            <ul className={`${textColor} text-sm space-y-1 ml-4 list-disc`}>
                                {accountStatus.restrictedActions.map((action, index) => (
                                    <li key={index}>{action}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccountStatusBanner;
