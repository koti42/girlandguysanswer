import React from 'react';
import { FaQuestionCircle, FaLightbulb, FaComment } from 'react-icons/fa';

const ProfileStats = ({ stats }) => {
    const statItems = [
        { icon: FaQuestionCircle, label: 'Soru Sordu', value: stats.questions, color: 'text-blue-600' },
        { icon: FaLightbulb, label: 'Beence Paylaşıı', value: stats.ideas || 0, color: 'text-yellow-600' },
        { icon: FaComment, label: 'Cevap Yazdı', value: stats.answers, color: 'text-green-600' }
    ];

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
            <div className="grid grid-cols-3 gap-6">
                {statItems.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                        <div key={idx} className="text-center">
                            <div className="flex justify-center mb-2">
                                <Icon className={`text-3xl ${item.color}`} />
                            </div>
                            <div className="text-2xl font-bold text-gray-800">{item.value.toLocaleString()}</div>
                            <div className="text-sm text-gray-500 mt-1">{item.label}</div>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-3 gap-6 mt-8 pt-6 border-t border-gray-100">
                <div className="text-center">
                    <div className="text-xl font-bold text-gray-800">{stats.xperPoints?.toLocaleString() || '133.525'}</div>
                    <div className="text-xs text-gray-500">Xper Puanı</div>
                </div>
                <div className="text-center">
                    <div className="text-xl font-bold text-gray-800">#{stats.generalRank || '162'}</div>
                    <div className="text-xs text-gray-500">Genel Xper sıralaması</div>
                </div>
                <div className="text-center">
                    <div className="text-xl font-bold text-gray-800">#{stats.categoryRank || '114'}</div>
                    <div className="text-xs text-gray-500">Etiketler Xper sıralaması</div>
                </div>
            </div>
        </div>
    );
};

export default ProfileStats;
