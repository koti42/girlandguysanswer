import React from 'react';
import MainLayout from '../layouts/MainLayout';
import { FaShieldAlt, FaDatabase, FaUserLock, FaEye, FaLock, FaTrash } from 'react-icons/fa';

const KVKKPage = () => {
    const sections = [
        {
            title: 'Kişisel Verilerin İşlenmesi',
            content: 'Kişisel verileriniz, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında işlenmektedir. Verileriniz, hizmetlerimizi sunmak, geliştirmek ve yasal yükümlülüklerimizi yerine getirmek amacıyla işlenir.',
            icon: FaDatabase
        },
        {
            title: 'Toplanan Veriler',
            content: 'Platformumuzda toplanan kişisel veriler şunlardır: Ad-soyad, e-posta adresi, kullanıcı adı, profil fotoğrafı, paylaştığınız içerikler, IP adresi, çerez bilgileri ve kullanım verileri.',
            icon: FaEye
        },
        {
            title: 'Verilerin Kullanım Amacı',
            content: 'Kişisel verileriniz; hesap yönetimi, içerik paylaşımı, platform güvenliği, kullanıcı deneyimini iyileştirme, yasal yükümlülüklerin yerine getirilmesi ve iletişim amaçlarıyla kullanılmaktadır.',
            icon: FaShieldAlt
        },
        {
            title: 'Verilerin Paylaşımı',
            content: 'Kişisel verileriniz, yasal yükümlülükler dışında üçüncü taraflarla paylaşılmaz. Sadece hizmet sağlayıcılarımız (hosting, analitik vb.) ile güvenli bir şekilde paylaşılır.',
            icon: FaUserLock
        },
        {
            title: 'Veri Güvenliği',
            content: 'Kişisel verilerinizin güvenliği için teknik ve idari tedbirler alınmaktadır. Verileriniz şifrelenmiş bağlantılar üzerinden iletilir ve güvenli sunucularda saklanır.',
            icon: FaLock
        },
        {
            title: 'Haklarınız',
            content: 'KVKK kapsamında, kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini isteme, silinmesini veya yok edilmesini isteme haklarına sahipsiniz.',
            icon: FaShieldAlt
        },
        {
            title: 'Çerezler',
            content: 'Platformumuz, kullanıcı deneyimini iyileştirmek için çerezler kullanmaktadır. Çerezler hakkında detaylı bilgi için Çerez Politikası sayfamızı ziyaret edebilirsiniz.',
            icon: FaDatabase
        },
        {
            title: 'Veri Silme',
            content: 'Hesabınızı silmek istediğinizde, hesap ayarlarından "Hesabı Sil" seçeneğini kullanabilirsiniz. Hesap silme işlemi sonrasında kişisel verileriniz yasal saklama süreleri dışında silinir.',
            icon: FaTrash
        }
    ];

    return (
        <MainLayout>
            <div className="max-w-4xl mx-auto">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full mb-4">
                            <FaShieldAlt className="text-2xl text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
                            KVKK Aydınlatma Metni
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Kişisel Verilerin Korunması Kanunu kapsamında bilgilendirme
                        </p>
                    </div>

                    <div className="space-y-6">
                        {sections.map((section, index) => {
                            const Icon = section.icon;
                            return (
                                <div
                                    key={index}
                                    className="p-6 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
                                            <Icon className="text-indigo-600 dark:text-indigo-400 text-xl" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                                                {section.title}
                                            </h3>
                                            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                                {section.content}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-8 p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
                        <h3 className="font-bold text-gray-900 dark:text-white mb-3">
                            Veri Sorumlusu
                        </h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                            <strong>Veri Sorumlusu:</strong> Herkesler Soruyor Platformu
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                            <strong>E-posta:</strong> kvkk@herkeslersoruyor.com
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            KVKK kapsamındaki haklarınızı kullanmak için yukarıdaki e-posta adresinden bizimle iletişime geçebilirsiniz.
                        </p>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default KVKKPage;
