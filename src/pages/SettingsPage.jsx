import React, { useState, useEffect } from 'react';
import { FaUserSecret, FaEnvelope, FaUserFriends, FaLock, FaGlobe, FaToggleOn, FaToggleOff } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../context/AuthContext';
import { usersAPI } from '../services/api';
import { TopUsersWidget } from '../components/Widgets';

const Toggle = ({ enabled, onChange, label, description }) => (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
        <div className="flex-1 pr-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">{label}</h4>
            {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>}
        </div>
        <button
            onClick={() => onChange(!enabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enabled ? 'bg-coral' : 'bg-gray-200 dark:bg-gray-700'
                }`}
        >
            <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
            />
        </button>
    </div>
);

const SettingsPage = () => {
    const { user, updateUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({
        is_private: false,
        allow_messaging: true,
        messaging_mode: 'everyone', // everyone, followers
        allow_following: true
    });
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        const fetchSettings = async () => {
            if (!user?.username) return;
            try {
                // Fetch latest profile data which we assume contains settings for owner
                const response = await usersAPI.getProfile(user.username);
                const profileData = response.data.data;

                // Merge likely settings fields. 
                // Note: If API doesn't return these on public profile, this needs 'me' endpoint adjustment.
                // Assuming /users/{username} returns these for the authenticated owner.
                setSettings({
                    is_private: profileData.is_private || false,
                    allow_messaging: profileData.allow_messaging !== undefined ? profileData.allow_messaging : true,
                    messaging_mode: profileData.messaging_mode || 'everyone',
                    allow_following: profileData.allow_following !== undefined ? profileData.allow_following : true
                });
            } catch (error) {
                console.error("Ayarlar yüklenemedi:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, [user]);

    const showSuccess = (msg) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    const handlePrivacyChange = async (newValue) => {
        try {
            setSettings(prev => ({ ...prev, is_private: newValue }));
            await usersAPI.updatePrivacy(newValue);

            // Update user context
            if (user) {
                updateUser({ is_private: newValue });
            }

            showSuccess(`Hesap ${newValue ? 'gizli' : 'herkese açık'} olarak güncellendi.`);
        } catch (error) {
            console.error("Gizlilik ayarı güncellenemedi:", error);
            setSettings(prev => ({ ...prev, is_private: !newValue })); // Revert
            alert('Gizlilik ayarı güncellenemedi. Lütfen tekrar deneyin.');
        }
    };

    const handleMessagingToggle = async (newValue) => {
        try {
            setSettings(prev => ({ ...prev, allow_messaging: newValue }));
            await usersAPI.updateMessaging({
                allow_messaging: newValue,
                messaging_mode: settings.messaging_mode
            });

            // Update user context
            if (user) {
                updateUser({ allow_messaging: newValue });
            }

            showSuccess(`Mesajlaşma ${newValue ? 'açıldı' : 'kapatıldı'}.`);
        } catch (error) {
            console.error("Mesaj ayarı güncellenemedi:", error);
            setSettings(prev => ({ ...prev, allow_messaging: !newValue }));
            alert('Mesaj ayarı güncellenemedi. Lütfen tekrar deneyin.');
        }
    };

    const handleMessagingModeChange = async (mode) => {
        if (mode === settings.messaging_mode) return;
        try {
            setSettings(prev => ({ ...prev, messaging_mode: mode }));
            await usersAPI.updateMessaging({
                allow_messaging: settings.allow_messaging,
                messaging_mode: mode
            });
            showSuccess(`Mesaj tercihiniz güncellendi.`);
        } catch (error) {
            console.error("Mesaj modu güncellenemedi:", error);
            setSettings(prev => ({ ...prev, messaging_mode: settings.messaging_mode }));
        }
    };

    const handleFollowingToggle = async (newValue) => {
        try {
            setSettings(prev => ({ ...prev, allow_following: newValue }));
            await usersAPI.updateFollowing(newValue);

            // Update user context
            if (user) {
                updateUser({ allow_following: newValue });
            }

            showSuccess(`Takip istekleri ${newValue ? 'kabul ediliyor' : 'kapatıldı'}.`);
        } catch (error) {
            console.error("Takip ayarı güncellenemedi:", error);
            setSettings(prev => ({ ...prev, allow_following: !newValue }));
            alert('Takip ayarı güncellenemedi. Lütfen tekrar deneyin.');
        }
    };

    if (loading) return (
        <MainLayout>
            <div className="flex justify-center p-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
            </div>
        </MainLayout>
    );

    return (
        <MainLayout sidebar={<TopUsersWidget />}>
            <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Hesap Ayarları</h1>

                {successMessage && (
                    <div className="mb-6 p-4 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl animate-bounce-short text-center">
                        {successMessage}
                    </div>
                )}

                {/* Privacy Section */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mb-6">
                    <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                            <FaUserSecret className="text-xl" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Gizlilik</h2>
                            <p className="text-xs text-gray-500">Profilinizin görünürlüğünü yönetin</p>
                        </div>
                    </div>

                    <Toggle
                        label="Gizli Hesap"
                        description="Hesabınız gizli olduğunda, sadece sizi takip edenler paylaşımlarınızı görebilir. Mevcut takipçileriniz etkilenmez."
                        enabled={settings.is_private}
                        onChange={handlePrivacyChange}
                    />
                </div>

                {/* Messaging Section */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mb-6">
                    <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                            <FaEnvelope className="text-xl" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Mesajlaşma</h2>
                            <p className="text-xs text-gray-500">Kimlerin size mesaj atabileceğini seçin</p>
                        </div>
                    </div>

                    <Toggle
                        label="Mesajlara İzin Ver"
                        description="Kullanıcıların size özel mesaj göndermesine izin verin."
                        enabled={settings.allow_messaging}
                        onChange={handleMessagingToggle}
                    />

                    {settings.allow_messaging && (
                        <div className="mt-4 pl-4 border-l-2 border-gray-100 dark:border-gray-700">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Kimler mesaj atabilir?</p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => handleMessagingModeChange('everyone')}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all border ${settings.messaging_mode === 'everyone'
                                        ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                        : 'border-gray-200 dark:border-gray-700 text-gray-600 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <FaGlobe /> Herkes
                                    </div>
                                </button>
                                <button
                                    onClick={() => handleMessagingModeChange('followers')}
                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all border ${settings.messaging_mode === 'followers'
                                        ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                        : 'border-gray-200 dark:border-gray-700 text-gray-600 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <FaUserFriends /> Sadece Takipçiler
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Following Section */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                    <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                        <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-400">
                            <FaUserFriends className="text-xl" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Takip Ayarları</h2>
                            <p className="text-xs text-gray-500">Takip isteklerini yönetin</p>
                        </div>
                    </div>

                    <Toggle
                        label="Takip İsteklerine İzin Ver"
                        description="Kullanıcıların sizi takip etmesine veya takip isteği göndermesine izin verin."
                        enabled={settings.allow_following}
                        onChange={handleFollowingToggle}
                    />
                </div>

            </div>
        </MainLayout>
    );
};

export default SettingsPage;
