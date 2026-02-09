import React from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import { FaShieldAlt, FaLock, FaDatabase } from 'react-icons/fa';

const GizlilikPolitikasiPage = () => {
    const sections = [
        { title: 'Topladığımız bilgiler', content: 'Hesap oluştururken ve platformu kullanırken e-posta, kullanıcı adı, profil bilgileri ve içerikleriniz toplanır. Bu veriler hizmet sunumu ve güvenlik amacıyla kullanılır.', icon: FaDatabase },
        { title: 'Verilerin kullanımı', content: 'Kişisel verileriniz yalnızca hizmeti sunmak, geliştirmek ve yasal yükümlülükleri yerine getirmek amacıyla işlenir. Üçüncü taraflarla izniniz olmadan paylaşılmaz.', icon: FaShieldAlt },
        { title: 'Güvenlik', content: 'Verileriniz şifreli bağlantılar ve güvenli sunucular üzerinde saklanır. Teknik ve idari tedbirlerle korunmaktadır.', icon: FaLock },
    ];

    return (
        <MainLayout>
            <SEO title="Gizlilik Politikası - Herkesler Soruyor" description="Kişisel verilerinizin korunması ve gizlilik politikamız." />
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full mb-4">
                            <FaShieldAlt className="text-2xl text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">Gizlilik Politikası</h1>
                        <p className="text-gray-600 dark:text-gray-400">Kişisel verilerinizin korunması</p>
                    </div>
                    <div className="space-y-6">
                        {sections.map((s, i) => {
                            const Icon = s.icon;
                            return (
                                <div key={i} className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 flex gap-4">
                                    <Icon className="text-emerald-500 text-xl flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white">{s.title}</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{s.content}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
                        6698 sayılı KVKK kapsamındaki aydınlatma metni için <Link to="/kvkk-aydinlatma" className="text-coral hover:underline">KVKK Aydınlatma Metni</Link> sayfamızı inceleyebilirsiniz.
                    </p>
                </div>
            </div>
        </MainLayout>
    );
};

export default GizlilikPolitikasiPage;
