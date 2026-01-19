import React from 'react';

const ProfileBadges = ({ badges }) => {
    return (
        <div className="flex flex-wrap gap-2">
            {badges.map(badge => {
                const Icon = badge.icon;
                return (
                    <div
                        key={badge.id}
                        className="flex items-center gap-1 bg-gray-50 dark:bg-gray-700 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-600"
                        title={badge.name}
                    >
                        <Icon className={`${badge.color} text-sm`} />
                        <span className="text-xs text-gray-700 dark:text-gray-200">{badge.name}</span>
                    </div>
                );
            })}
        </div>
    );
};

export default ProfileBadges;
