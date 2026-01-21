import React from 'react';
import { FaQuestionCircle, FaLightbulb, FaComment } from 'react-icons/fa';

const ProfileStats = ({ stats, isVIP = false }) => {
    const statItems = [
        { icon: FaQuestionCircle, label: 'Soru Sordu', value: stats.questions, color: isVIP ? 'text-amber-500' : 'text-blue-600' },
        { icon: FaLightbulb, label: 'Beence Paylaşıı', value: stats.ideas || 0, color: isVIP ? 'text-yellow-500' : 'text-yellow-600' },
        { icon: FaComment, label: 'Cevap Yazdı', value: stats.answers, color: isVIP ? 'text-purple-500' : 'text-green-600' }
    ];

    return (
        <div className={`rounded-2xl shadow-soft p-6 ${isVIP
                ? 'bg-gradient-to-br from-amber-50 via-yellow-50 to-purple-50 dark:from-amber-900/20 dark:via-yellow-900/20 dark:to-purple-900/20 border-2 border-amber-300 dark:border-amber-600'
                : 'bg-white dark:bg-gray-800'
            }`}>
            <div className="grid grid-cols-3 gap-6">
                {statItems.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                        <div key={idx} className={`text-center ${isVIP ? 'transform hover:scale-110 transition-transform duration-300' : ''
                            }`}>
                            <div className="flex justify-center mb-2">
                                <div className={isVIP ? 'relative' : ''}>
                                    <Icon className={`text-3xl ${item.color} ${isVIP ? 'animate-bounce-slow' : ''}`} />
                                    {isVIP && <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-ping"></span>}
                                </div>
                            </div>
                            <div className={`text-2xl font-bold ${isVIP
                                    ? 'bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent'
                                    : 'text-gray-800 dark:text-white'
                                }`}>
                                {item.value.toLocaleString()}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{item.label}</div>
                        </div>
                    );
                })}
            </div>

            <div className={`grid grid-cols-3 gap-6 mt-8 pt-6 border-t ${isVIP ? 'border-amber-200 dark:border-amber-700' : 'border-gray-100 dark:border-gray-700'
                }`}>
                <div className="text-center">
                    <div className={`text-xl font-bold ${isVIP ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-white'
                        }`}>
                        {stats.xperPoints?.toLocaleString() || '133.525'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Xper Puanı</div>
                </div>
                <div className="text-center">
                    <div className={`text-xl font-bold ${isVIP ? 'text-purple-600 dark:text-purple-400' : 'text-gray-800 dark:text-white'
                        }`}>
                        #{stats.generalRank || '162'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Genel Xper sıralaması</div>
                </div>
                <div className="text-center">
                    <div className={`text-xl font-bold ${isVIP ? 'text-pink-600 dark:text-pink-400' : 'text-gray-800 dark:text-white'
                        }`}>
                        #{stats.categoryRank || '114'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Etiketler Xper sıralaması</div>
                </div>
            </div>
        </div>
    );
};

export default ProfileStats;
