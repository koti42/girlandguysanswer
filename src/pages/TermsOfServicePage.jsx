import React from 'react';
import MainLayout from '../layouts/MainLayout';
import { FaFileContract, FaShieldAlt, FaUserShield, FaLock } from 'react-icons/fa';

const TermsOfServicePage = () => {
    const sections = [
        {
            title: '1. Kullanım Şartları',
            content: 'Bu platforma erişim ve kullanım, aşağıdaki şartları kabul ettiğiniz anlamına gelir. Platformu kullanmaya devam ederek bu şartları kabul etmiş sayılırsınız.',
            icon: FaFileContract
        },
        {
            title: '2. Hesap Sorumluluğu',
            content: 'Hesabınızın güvenliğinden siz sorumlusunuz. Şifrenizi kimseyle paylaşmayın ve güçlü bir şifre kullanın. Hesabınız üzerinden yapılan tüm işlemlerden siz sorumlusunuz.',
            icon: FaUserShield
        },
        {
            title: '3. İçerik Politikası',
            content: 'Paylaştığınız içeriklerin telif hakkına sahip olduğunuzdan veya paylaşım izni aldığınızdan emin olun. Yasadışı, zararlı veya uygunsuz içerik paylaşımı yasaktır.',
            icon: FaShieldAlt
        },
        {
            title: '4. Gizlilik',
            content: 'Kişisel bilgileriniz gizlilik politikamız kapsamında korunmaktadır. Detaylı bilgi için KVKK Aydınlatma Metni\'ni inceleyebilirsiniz.',
            icon: FaLock
        },
        {
            title: '5. Hizmet Değişiklikleri',
            content: 'Platform özelliklerini, hizmetlerini veya şartlarını önceden haber vermeksizin değiştirme hakkını saklı tutar. Değişiklikler platform üzerinden duyurulur.',
            icon: FaFileContract
        },
        {
            title: '6. Hesap Askıya Alma',
            content: 'Kurallara uymayan kullanıcıların hesapları geçici veya kalıcı olarak askıya alınabilir. Bu durumda platforma erişim hakkınız kaybolur.',
            icon: FaShieldAlt
        },
        {
            title: '7. Fikri Mülkiyet',
            content: 'Platform üzerindeki tüm içerikler, tasarımlar ve yazılımlar telif hakkı ile korunmaktadır. İzinsiz kullanım yasal işlem gerektirir.',
            icon: FaLock
        },
        {
            title: '8. Sorumluluk Reddi',
            content: 'Platform, kullanıcıların paylaştığı içeriklerden sorumlu değildir. Kullanıcılar kendi içeriklerinden sorumludur ve platform bu içeriklerden kaynaklanan zararlardan sorumlu tutulamaz.',
            icon: FaShieldAlt
        }
    ];

    return (
        <MainLayout>
            <div className="max-w-4xl mx-auto">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full mb-4">
                            <FaFileContract className="text-2xl text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
                            Site Sözleşmesi
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Platform kullanım şartları ve yasal haklarınız
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
                                        <div className="p-3 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                                            <Icon className="text-purple-600 dark:text-purple-400 text-xl" />
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

                    <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                        <p className="text-sm text-gray-700 dark:text-gray-300 text-center">
                            <strong className="font-semibold">Son Güncelleme:</strong> {new Date().toLocaleDateString('tr-TR', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                            })}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-2">
                            Bu sözleşmeyi kabul ederek platformumuzu kullanmaya başlamış sayılırsınız. 
                            Sorularınız için{' '}
                            <a href="/iletisim" className="text-blue-600 dark:text-blue-400 hover:underline">
                                iletişim
                            </a>
                            {' '}sayfamızdan bize ulaşabilirsiniz.
                        </p>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default TermsOfServicePage;
