import React from 'react';
import { FaBan } from 'react-icons/fa';

const BlockedUserView = ({ type, username, onUnblock, onBack }) => {
    if (type === 'blocked_by') {
        return (
            <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-16 text-center">
                <div className="relative w-24 h-24 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <FaBan className="text-5xl text-red-500 dark:text-red-400" />
                    <div className="absolute inset-0 rounded-full border-4 border-dashed border-red-200 dark:border-red-600 animate-spin" style={{ animationDuration: '3s' }}></div>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    ⛔ Bu Kullanıcı Sizi Engelledi
                </h3>
                <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-8">
                    @{username} sizi engelledi. Profilini ve içeriklerini görüntüleyemezsiniz.
                </p>
                <button
                    onClick={onBack}
                    className="px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg"
                >
                    ← Geri Dön
                </button>
            </div>
        );
    }

    if (type === 'has_blocked') {
        return (
            <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-16 text-center">
                <div className="relative w-24 h-24 bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <FaBan className="text-5xl text-orange-500 dark:text-orange-400" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    🚫 Bu Kullanıcıyı Engellediniz
                </h3>
                <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-8">
                    @{username} kullanıcısını engellediniz. Profil içeriği gizli.
                </p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={onUnblock}
                        className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg"
                    >
                        Engeli Kaldır
                    </button>
                    <button
                        onClick={onBack}
                        className="px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition-all hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                        ← Geri Dön
                    </button>
                </div>
            </div>
        );
    }

    return null;
};

export default BlockedUserView;
