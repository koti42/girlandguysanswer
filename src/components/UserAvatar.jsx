import React from 'react';

const UserAvatar = ({ user, size = "md", className = "" }) => {
    // Determine size classes
    const sizeClasses = {
        xs: "w-6 h-6 text-xs",
        sm: "w-8 h-8 text-xs",
        md: "w-10 h-10 text-sm",
        lg: "w-12 h-12 text-base",
        xl: "w-16 h-16 text-xl",
        "2xl": "w-24 h-24 text-2xl",
        "3xl": "w-32 h-32 text-4xl"
    };

    const currentSizeClass = sizeClasses[size] || sizeClasses.md;

    // Helper to get initials
    const getInitials = (name) => {
        if (!name) return '?';
        return name
            .split(' ')
            .map(n => n.trim())
            .filter(n => n.length > 0)
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
    };

    // Helper to generate consistent color from string
    const getColor = (name) => {
        if (!name) return 'bg-gray-400';
        const colors = [
            'bg-red-500', 'bg-orange-500', 'bg-amber-500',
            'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
            'bg-cyan-500', 'bg-blue-500', 'bg-indigo-500',
            'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
            'bg-pink-500', 'bg-rose-500'
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    // Check if avatar exists and is not default/broken
    const hasAvatar = user?.avatar &&
        user.avatar !== 'null' &&
        user.avatar !== 'undefined' &&
        !user.avatar.includes('default'); // Assuming 'default' check is loose, adjust if needed

    const displayName = user?.name || user?.username || '?';

    if (hasAvatar) {
        return (
            <img
                src={user.avatar}
                alt={displayName}
                className={`${currentSizeClass} rounded-full object-cover border border-gray-100 dark:border-gray-700 ${className}`}
            />
        );
    }

    return (
        <div
            className={`${currentSizeClass} rounded-full flex items-center justify-center text-white font-bold shadow-sm border border-white/20 ${getColor(displayName)} ${className}`}
            title={displayName}
        >
            {getInitials(displayName)}
        </div>
    );
};

export default UserAvatar;
