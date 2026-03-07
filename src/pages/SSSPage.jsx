import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import {
    FaChevronDown, FaChevronUp,
    FaQuestionCircle, FaBolt, FaTags,
    FaShieldAlt, FaChevronRight,
} from 'react-icons/fa';

// ─── Veri ─────────────────────────────────────────────────────────────────────

const FAQS = [
    {
        q: 'Xper Puanı nedir?',
        a: 'Xper Puanı, platformdaki katkılarınız karşılığında kazandığınız puanlardır. Soru sormak, görüş yazmak, beğeni almak ve günlük giriş gibi aktivitelerle puan kazanabilirsiniz. Birikimli Xper Puanınız seviyenizi belirler.',
    },
    {
        q: 'Seviyem nasıl belirlenir?',
        a: 'Toplam Xper Puanınıza göre otomatik olarak belirlenir. Seviye tablosunda hangi seviyeye ulaşmak için kaç puana ihtiyaç duyduğunuzu görebilirsiniz.',
    },
    {
        q: 'En İyi Görüş (EİG) nedir?',
        a: 'Bir soru sahibi, beğendiği görüşü "En İyi Görüş" olarak işaretleyebilir. EİG seçilen kullanıcı 120 Xper kazanır; soru sahibi kendi görüşünü seçerse 100 Xper kazanır.',
    },
    {
        q: 'Özel Etiketler (Feature Tags) nasıl verilir?',
        a: 'Özel etiketler, platform yöneticileri tarafından toplulukta öne çıkan, özgün içerik üreten ve kaliteli katkıları olan kullanıcılara özel olarak atanır. Satın alınamaz veya talep edilemez.',
    },
    {
        q: 'Gizli (Anonim) soru sormak güvenli mi?',
        a: 'Evet. Anonim olarak sorduğunuz veya yanıtladığınız içeriklerde kullanıcı adınız "Gizli Üye" olarak görünür. Ancak kural ihlali durumunda moderatörler gerekli işlemleri yapabilir.',
    },
    {
        q: 'İçeriğim neden silindi?',
        a: 'Platform kurallarını ihlal eden (hakaret, spam, zararlı içerik vb.) içerikler moderatörler tarafından silinir ve -20 Xper Puanı uygulanır. Haklı bulunan şikayetlerde ek -50 Xper Puanı uygulanır.',
    },
    {
        q: 'Hesabım neden kısıtlandı?',
        a: 'Tekrarlayan kural ihlalleri, spam davranışı veya ciddi topluluk ihlalleri hesabınızın geçici ya da kalıcı olarak kısıtlanmasına neden olabilir. Yardım için iletisim sayfamızdan bize ulaşabilirsiniz.',
    },
    {
        q: 'Rozet nasıl kazanılır?',
        a: 'Belirli aktivite eşiklerine (örn. 50k Xper = Bronz Üye, 10 EİG = Uzman) ulaştığınızda rozetler otomatik olarak hesabınıza eklenir. Profilinizden kazandığınız rozetleri görebilirsiniz.',
    },
];

// ─── Bileşenler ────────────────────────────────────────────────────────────────

const FaqItem = ({ q, a }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className={`border rounded-2xl overflow-hidden transition-all duration-200 ${open ? 'border-coral/40 dark:border-coral/30 shadow-sm' : 'border-gray-200 dark:border-gray-700'}`}>
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
                <span className="font-semibold text-gray-800 dark:text-white text-sm leading-snug">{q}</span>
                {open ? <FaChevronUp className="text-coral flex-shrink-0 text-xs" /> : <FaChevronDown className="text-gray-400 flex-shrink-0 text-xs" />}
            </button>
            {open && (
                <div className="px-5 py-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    {a}
                </div>
            )}
        </div>
    );
};

// ─── Sayfa ─────────────────────────────────────────────────────────────────────

const SSSPage = () => (
    <MainLayout showMobileFooter>
        <SEO
            title="SSS – Sıkça Sorulan Sorular | Herkesler Soruyor"
            description="Xper puanları, seviyeler, özel etiketler ve daha fazlası hakkında merak ettiklerinizin cevapları."
        />

        {/* ── Hero ── */}
        <div className="bg-gradient-to-br from-coral/10 via-orange-50 to-pink-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 rounded-3xl p-6 md:p-10 mb-10 border border-coral/20 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
                <FaShieldAlt className="text-coral text-sm" />
                <span className="text-xs font-semibold text-coral uppercase tracking-widest">Yardım Merkezi</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-3">
                Sıkça Sorulan Sorular
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base max-w-xl">
                Platform hakkında merak ettiğiniz her şey burada. Xper puanları veya özel etiketler için aşağıdaki bağlantıları kullanın.
            </p>

            {/* Quick stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                {[
                    { label: 'Seviye',          value: '20',   sub: 'Yolcu → Admin Gibi', to: '/xper-puan',    bg: 'from-yellow-400 to-orange-400' },
                    { label: 'Xper Aktivitesi', value: '8',    sub: 'puan kazanma yolu',  to: '/xper-puan',    bg: 'from-blue-400 to-indigo-500' },
                    { label: 'Özel Etiket',     value: '10',   sub: 'Feature Tag',         to: '/feature-tags', bg: 'from-pink-400 to-rose-500' },
                    { label: 'Maks. Kazanım',   value: '+120', sub: 'EİG seçilmek',       to: '/xper-puan',    bg: 'from-green-400 to-emerald-500' },
                ].map(({ label, value, sub, to, bg }) => (
                    <Link key={label} to={to} className={`bg-gradient-to-br ${bg} rounded-2xl p-3 text-white hover:scale-[1.04] transition-transform shadow-md`}>
                        <div className="text-2xl font-extrabold leading-none">{value}</div>
                        <div className="text-[11px] font-bold mt-0.5 opacity-90">{label}</div>
                        <div className="text-[10px] opacity-75 mt-0.5">{sub}</div>
                    </Link>
                ))}
            </div>
        </div>

        <div className="space-y-14">

            {/* ── SSS Accordion ── */}
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl bg-coral/10 dark:bg-coral/20 flex items-center justify-center flex-shrink-0">
                        <FaQuestionCircle className="text-coral text-lg" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sıkça Sorulan Sorular</h2>
                </div>
                <div className="space-y-2.5">
                    {FAQS.map((item) => (
                        <FaqItem key={item.q} q={item.q} a={item.a} />
                    ))}
                </div>
            </section>

            {/* ── Detay Sayfaları Linkleri ── */}
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl bg-coral/10 dark:bg-coral/20 flex items-center justify-center flex-shrink-0">
                        <FaChevronRight className="text-coral text-lg" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detaylı Bilgi</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Tüm tablo ve açıklamalar için ilgili sayfaları ziyaret edin</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Xper Puan Kart */}
                    <Link
                        to="/xper-puan"
                        className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-700 p-6 hover:shadow-2xl hover:scale-[1.02] transition-all"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
                        <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-white/5 translate-y-6 -translate-x-6" />
                        <div className="relative">
                            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-4 shadow-lg">
                                <FaBolt className="text-white text-xl" />
                            </div>
                            <h3 className="text-white font-extrabold text-xl leading-tight mb-1">Xper Puan Sistemi</h3>
                            <p className="text-white/70 text-sm mb-4 leading-snug">
                                Kaç puan kazanırsınız? 20 seviye, rozetler ve tam aktivite tablosu.
                            </p>
                            <div className="flex flex-wrap gap-1.5 mb-5">
                                {['8 Aktivite', '20 Seviye', 'Rozetler'].map(t => (
                                    <span key={t} className="px-2.5 py-1 rounded-full bg-white/20 text-white text-[11px] font-semibold">{t}</span>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-white font-bold text-sm group-hover:gap-3 transition-all">
                                İncele <FaChevronRight className="text-xs" />
                            </div>
                        </div>
                    </Link>

                    {/* Feature Tags Kart */}
                    <Link
                        to="/feature-tags"
                        className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 p-6 hover:shadow-2xl hover:scale-[1.02] transition-all"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
                        <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-white/5 translate-y-6 -translate-x-6" />
                        <div className="relative">
                            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-4 shadow-lg">
                                <FaTags className="text-white text-xl" />
                            </div>
                            <h3 className="text-white font-extrabold text-xl leading-tight mb-1">Özel Etiketler</h3>
                            <p className="text-white/70 text-sm mb-4 leading-snug">
                                Feature Tags nedir? 10 özel etiketin tam açıklaması ve anlamı.
                            </p>
                            <div className="flex flex-wrap gap-1.5 mb-5">
                                {['Akımbükücü', 'Nadirat', '+8 daha'].map(t => (
                                    <span key={t} className="px-2.5 py-1 rounded-full bg-white/20 text-white text-[11px] font-semibold">{t}</span>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-white font-bold text-sm group-hover:gap-3 transition-all">
                                İncele <FaChevronRight className="text-xs" />
                            </div>
                        </div>
                    </Link>
                </div>
            </section>

            {/* ── İletişim CTA ── */}
            <div className="bg-gradient-to-r from-coral/10 to-orange-50 dark:from-gray-800 dark:to-gray-800 rounded-3xl p-6 md:p-8 border border-coral/20 dark:border-gray-700 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1">
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-1">Hâlâ sorunuz mu var?</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Destek ekibimiz size yardımcı olmaktan mutluluk duyar.</p>
                </div>
                <Link
                    to="/iletisim"
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-coral to-orange-400 text-white font-semibold text-sm hover:shadow-lg hover:scale-[1.02] transition-all flex-shrink-0"
                >
                    Bize Ulaşın <FaChevronRight className="text-xs" />
                </Link>
            </div>

        </div>
    </MainLayout>
);

export default SSSPage;
