import React from 'react';

const OnlineIndicator = ({ isOnline, size = 'sm', className = '' }) => {
    const sizeClasses = {
        xs: 'w-2 h-2',
        sm: 'w-2.5 h-2.5',
        md: 'w-3 h-3',
        lg: 'w-3.5 h-3.5',
    };

    const dotSize = sizeClasses[size] || sizeClasses.sm;

    return (
        <span
            className={`inline-block rounded-full border-2 border-white dark:border-gray-900 ${dotSize} ${className}`}
            style={{
                backgroundColor: isOnline ? '#22c55e' : '#9ca3af',
                boxShadow: isOnline ? '0 0 6px rgba(34, 197, 94, 0.5)' : 'none',
            }}
            title={isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
        />
    );
};

export default OnlineIndicator;
