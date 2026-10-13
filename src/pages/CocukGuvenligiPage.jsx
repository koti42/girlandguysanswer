import React from 'react';
import MainLayout from '../layouts/MainLayout';
import { FaShieldAlt, FaExternalLinkAlt, FaExclamationTriangle, FaPhone, FaEnvelope, FaChild, FaLock, FaBan } from 'react-icons/fa';
import { Link } from 'react-router-dom';

const CocukGuvenligiPage = () => {
    return (
        <MainLayout showMobileFooter={true}>
            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-teal-500 rounded-full mb-4 shadow-lg">
                        <FaShieldAlt className="text-white text-2xl" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
                        Çocuk Güvenliği Politikası
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                        Son güncelleme: Şubat 2026
                    </p>
                </div>

                {/* Alert Banner */}
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5 mb-8 flex gap-4">
                    <FaExclamationTriangle className="text-red-500 text-xl flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-bold text-red-700 dark:text-red-400 mb-1">Acil Durum Bildirimi</h3>
                        <p className="text-sm text-red-600 dark:text-red-300">
                            Çocuklara yönelik cinsel istismar veya sömürü içeriği gördüğünüzde lütfen hemen{' '}
                            <strong>155</strong> (Emniyet) veya{' '}
                            <strong>183</strong> (ALO Sosyal Destek Hattı)'i arayın.
                            Ayrıca aşağıdaki uluslararası kuruluşlara bildirim yapabilirsiniz.
                        </p>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Taahhüdümüz */}
                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                                <FaChild className="text-green-600 dark:text-green-400" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Taahhüdümüz</h2>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                            Herkesler Soruyor olarak, çocukların her türlü cinsel istismar ve sömürüden (CSAE - Child Sexual Abuse and Exploitation) korunması konusunda sıfır tolerans politikası benimsiyoruz. Platformumuz:
                        </p>
                        <ul className="space-y-2">
                            {[
                                'Çocukların cinsel istismarını tasvir eden, yücelten veya kolaylaştıran hiçbir içeriğe izin vermez.',
                                'Küçükleri hedef alan cinsel taciz, grooming (çevrimiçi istismar hazırlığı) veya sömürücü davranışlara karşı aktif önlemler alır.',
                                'Şüpheli içerikleri ulusal ve uluslararası yetkili kuruluşlara bildirir.',
                                'Kullanıcıların zararlı içerikleri kolayca ihbar etmesini sağlayan araçlar sunar.',
                                'Periyodik denetimler ve moderasyon süreçleri uygular.',
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 mt-1.5" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* Yasaklı İçerikler */}
                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                                <FaBan className="text-red-600 dark:text-red-400" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Kesinlikle Yasak İçerikler</h2>
                        </div>
                        <ul className="space-y-2">
                            {[
                                'Çocukların cinsel içerikli görüntü, video veya yazılı betimlemeleri (CSAM)',
                                'Küçükleri cinsel istismara yönlendiren veya teşvik eden içerikler',
                                'Çocukları cinsel amaçla hedef alan iletişim (grooming)',
                                'Küçüklerin kişisel bilgilerini ifşa eden içerikler',
                                'Çocukları tehdit eden veya onlara zarar vermeyi amaçlayan her türlü içerik',
                                '18 yaşından küçük bireyleri cinsel açıdan nesneleştiren içerikler',
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                    <span className="text-red-500 font-bold flex-shrink-0">✕</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* Güvenlik Önlemleri */}
                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                                <FaLock className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Güvenlik Önlemlerimiz</h2>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            {[
                                { title: 'İçerik Moderasyonu', desc: 'Yapay zeka destekli ve insan moderatörlerden oluşan 7/24 içerik denetim sistemi.' },
                                { title: 'Yaş Doğrulama', desc: 'Kayıt sürecinde yaş doğrulama mekanizmaları uygulanmaktadır.' },
                                { title: 'Hızlı Kaldırma', desc: 'Bildirilen zararlı içerikler 24 saat içinde incelenerek kaldırılır.' },
                                { title: 'Otomatik Tespit', desc: 'PhotoDNA ve benzeri teknolojilerle bilinen CSAM içerikleri tespit edilir.' },
                                { title: 'Hesap Askıya Alma', desc: 'İhlal tespit edilen hesaplar derhal askıya alınır, ilgili birimlerle paylaşılır.' },
                                { title: 'Şifreli İletişim', desc: 'Kullanıcı mesajları AES-256 şifreleme ile korunmaktadır.' },
                            ].map((item, i) => (
                                <div key={i} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                    <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm mb-1">{item.title}</h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Uluslararası Standartlar */}
                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                                <FaShieldAlt className="text-purple-600 dark:text-purple-400" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Uyduğumuz Uluslararası Standartlar</h2>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                            Platformumuz aşağıdaki kuruluşların yayımladığı çocuk güvenliği standart ve yönergelerine uymaktadır:
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4">
                            {[
                                {
                                    name: 'NCMEC – National Center for Missing & Exploited Children',
                                    desc: 'Kayıp ve istismar edilen çocuklar için ABD merkezli önde gelen kuruluş. CyberTipline bildirimi kabul eder.',
                                    url: 'https://www.missingkids.org/gethelpnow/cybertipline',
                                    tag: 'ABD',
                                    color: 'blue',
                                },
                                {
                                    name: 'IWF – Internet Watch Foundation',
                                    desc: 'Çevrimiçi çocuk cinsel istismar materyallerini tespit eden ve kaldırılmasını sağlayan uluslararası kuruluş.',
                                    url: 'https://www.iwf.org.uk',
                                    tag: 'UK',
                                    color: 'green',
                                },
                                {
                                    name: "Tech Coalition – PROTECT Children's Pledge",
                                    desc: 'Teknoloji şirketlerinin çocukları çevrimiçi ortamda cinsel sömürüye karşı korumak için imzaladığı uluslararası taahhüt belgesi.',
                                    url: 'https://www.technologycoalition.org/knowledge-hub/protect-children-pledge',
                                    tag: 'Uluslararası',
                                    color: 'orange',
                                },
                                {
                                    name: 'InHope – Uluslararası İhbar Hatları Birliği',
                                    desc: '50\'den fazla ülkede çocuk cinsel istismar materyallerini bildirmek için ulusal ihbar hatlarını koordine eden ağ.',
                                    url: 'https://inhope.org/TR',
                                    tag: 'Uluslararası',
                                    color: 'teal',
                                },
                                {
                                    name: 'ECPAT International',
                                    desc: 'Çocukların cinsel sömürüsüne son vermeyi hedefleyen küresel sivil toplum ağı.',
                                    url: 'https://ecpat.org',
                                    tag: 'Uluslararası',
                                    color: 'pink',
                                },
                                {
                                    name: 'Türkiye – BTK İhbar Hattı',
                                    desc: 'Türkiye\'de zararlı internet içeriklerini (çocuk istismarı dahil) ihbar etmek için resmi hat: ihbarweb.org.tr',
                                    url: 'https://www.ihbarweb.org.tr',
                                    tag: 'Türkiye',
                                    color: 'red',
                                },
                            ].map((org, i) => (
                                <a
                                    key={i}
                                    href={org.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex flex-col gap-2 p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-md transition-all"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors leading-snug">
                                            {org.name}
                                        </h4>
                                        <FaExternalLinkAlt className="text-gray-400 group-hover:text-purple-500 flex-shrink-0 text-xs mt-0.5 transition-colors" />
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{org.desc}</p>
                                    <span className="self-start text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                        {org.tag}
                                    </span>
                                </a>
                            ))}
                        </div>
                    </section>

                    {/* Bildirme */}
                    <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                                <FaExclamationTriangle className="text-yellow-600 dark:text-yellow-400" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Nasıl Bildirim Yapılır?</h2>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm mb-2">Uygulama İçi</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Her içerik ve profilde "Şikayet Et" butonuna tıklayın. Ekibimiz bildirimi 24 saat içinde inceler.
                                </p>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm mb-2">E-posta Bildirimi</h4>
                                <a href="mailto:42mehmetkucuk@gmail.com" className="text-xs text-purple-600 dark:text-purple-400 hover:underline break-all">
                                    42mehmetkucuk@gmail.com
                                </a>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm mb-2">NCMEC CyberTipline</h4>
                                <a href="https://www.missingkids.org/gethelpnow/cybertipline" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                                    cybertipline.org <FaExternalLinkAlt className="text-[10px]" />
                                </a>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm mb-2">BTK İhbar Hattı (Türkiye)</h4>
                                <a href="https://www.ihbarweb.org.tr" target="_blank" rel="noopener noreferrer" className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1">
                                    ihbarweb.org.tr <FaExternalLinkAlt className="text-[10px]" />
                                </a>
                            </div>
                        </div>
                    </section>

                    {/* İletişim */}
                    <section className="bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-6">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Güvenlik Ekibi İletişim</h2>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <a href="mailto:42mehmetkucuk@gmail.com" className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 transition-colors">
                                <FaEnvelope className="text-green-500 flex-shrink-0" />
                                42mehmetkucuk@gmail.com
                            </a>
                            <Link to="/iletisim" className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 transition-colors">
                                <FaPhone className="text-green-500 flex-shrink-0" />
                                İletişim Formu
                            </Link>
                        </div>
                        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                            Çocuk güvenliği bildirimleri en yüksek öncelik olarak ele alınır. 
                            Gerekli durumlarda ilgili yasal makamlarla derhal iş birliği yapılır.
                        </p>
                    </section>
                </div>
            </div>
        </MainLayout>
    );
};

export default CocukGuvenligiPage;
