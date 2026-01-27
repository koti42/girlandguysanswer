import React from 'react';

const ProfileBadges = ({ badges }) => {
    return (
        <div className="flex flex-wrap gap-2">
            {badges?.map((badge, index) => {
                // If ID is missing, use index as key fallback (though ID is preferred)
                const key = badge.id || badge.slug || index;

                return (
                    <div
                        key={key}
                        className="flex items-center gap-1 bg-gray-50 dark:bg-gray-700 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-600"
                        title={badge.description || badge.name}
                    >
                        {badge.icon_url ? (
                            <img src={badge.icon_url} alt={badge.name} className="w-4 h-4 object-contain" />
                        ) : badge.icon ? (
                            <badge.icon className={`${badge.color || 'text-gray-500'} text-sm`} />
                        ) : null}
                        <span className="text-xs text-gray-700 dark:text-gray-200">{badge.name}</span>
                    </div>
                );
            })}
        </div>
    );
};

export default ProfileBadges;
