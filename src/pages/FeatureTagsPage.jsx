import React from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import { FaTags, FaArrowLeft, FaShieldAlt, FaChevronRight, FaBolt } from 'react-icons/fa';

const FEATURE_TAGS = [
    {
        name: 'Akımbükücü',
        color: '#FACC15',
        textColor: '#78350F',
        emoji: '🌊',
        description: 'Trendleri sadece takip etmeyip kendi potasında eritip yönünü değiştiren kişi.',
        detail: 'Platform genelinde gündem oluşturan, topluluk tartışmalarının seyrini değiştiren ve özgün içerikleriyle viral etkisi yüksek kullanıcılara verilir.',
    },
    {
        name: 'Algı Mimarı',
        color: '#6366F1',
        textColor: '#fff',
        emoji: '🏛️',
        description: 'İnsanların bir konuya bakış açısını sıfırdan inşa eden, derinliği olan figür.',
        detail: 'Yanıtları ve yorumlarıyla topluluk üyelerinin düşünce biçimini şekillendiren, analitik ve derinlikli içerikleriyle öne çıkan kullanıcılara verilir.',
    },
    {
        name: 'Nadirat',
        color: '#EC4899',
        textColor: '#fff',
        emoji: '💎',
        description: 'Her yerde bulunmayan, sadece özel ve kaliteli içerikle ortaya çıkan nadir kişi.',
        detail: 'Seyrekte de olsa paylaşımları büyük yankı uyandıran, kalite odaklı içerik anlayışına sahip kullanıcılara verilir.',
    },
    {
        name: 'Zihin Tetikleyici',
        color: '#22C55E',
        textColor: '#fff',
        emoji: '🧨',
        description: 'Eğlendirmenin ötesine geçip bir düşünceyi veya aksiyonu başlatan kişi.',
        detail: 'Paylaşımlarının ardından toplulukta uzun soluklu tartışmalar başlatan, insanları düşündüren ve harekete geçiren kullanıcılara verilir.',
    },
    {
        name: 'Kültür Kodlayıcı',
        color: '#F97316',
        textColor: '#fff',
        emoji: '🎨',
        description: 'Toplumun estetik ve kültürel kodlarını çözüp yeniden yazan modern lider.',
        detail: 'Platform kültürüne yön veren, dil, üslup ve içerik anlayışını şekillendiren öncü kullanıcılara verilir.',
    },
    {
        name: 'İmza Karakter',
        color: '#0EA5E9',
        textColor: '#fff',
        emoji: '✒️',
        description: 'Taklit edilemez üslubu olan, ismi geçtiğinde tarzı göz önünde canlanan kişi.',
        detail: 'Kendine özgü bir ses ve üslup geliştirmiş, kullanıcı adı anıldığında hemen tanınan marka değeri yüksek kişilere verilir.',
    },
    {
        name: 'Vizyon Kaşifi',
        color: '#A855F7',
        textColor: '#fff',
        emoji: '🔭',
        description: 'Herkesin baktığı yerde henüz kimsenin görmediği potansiyeli bulan rehber.',
        detail: 'Henüz ana akıma girmemiş konuları önceden fark eden, ileriye dönük içerikleriyle ilham veren kullanıcılara verilir.',
    },
    {
        name: 'Yankı Ustası',
        color: '#E11D48',
        textColor: '#fff',
        emoji: '🔔',
        description: 'Söylediği sözlerin toplulukta uzun süre rezonans yarattığı kişi.',
        detail: 'İçerikleri uzun süre gündemde kalan, alıntılanan ve paylaşılan; kalıcı iz bırakan kullanıcılara verilir.',
    },
    {
        name: 'Modern Bilge',
        color: '#14B8A6',
        textColor: '#fff',
        emoji: '🧘',
        description: 'Teknoloji ve günceli, kadim bir bilgelikle sunan hibrit fenomen.',
        detail: 'Güncel konuları derin bir perspektifle ele alan, bilgi ile deneyimi harmanlayan ve topluluğa rehberlik eden kullanıcılara verilir.',
    },
    {
        name: 'Öncül İzlek',
        color: '#4B5563',
        textColor: '#fff',
        emoji: '🗺️',
        description: 'Kimsenin yürümediği yollarda ilk izi bırakan, arkasından kitleleri sürükleyen kişi.',
        detail: 'Platformda yeni içerik formatları veya tartışma biçimleri başlatan, topluluğa öncülük eden kullanıcılara verilir.',
    },
];

export default function FeatureTagsPage() {
    return (
        <MainLayout showMobileFooter>
            <SEO
                title="Özel Etiketler (Feature Tags) | Herkesler Soruyor"
                description="Feature Tags nedir? Kimler alır? Tüm özel etiketlerin açıklamaları."
            />

            {/* Hero */}
            <div className="relative overflow-hidden rounded-3xl mb-10">
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500" />
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: 'radial-gradient(circle at 80% 30%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }}
                />
                <div className="relative px-6 py-10 md:px-12 md:py-14">
                    <Link to="/sss" className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-semibold mb-5 transition-colors">
                        <FaArrowLeft className="text-[10px]" /> SSS'e Dön
                    </Link>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shadow-lg">
                            <FaTags className="text-white text-2xl" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-4xl font-extrabold text-white leading-tight">Özel Etiketler</h1>
                            <p className="text-white/70 text-sm mt-1">Feature Tags — Topluluğun öne çıkan isimlerine verilen unvanlar</p>
                        </div>
                    </div>
                    {/* pills */}
                    <div className="flex flex-wrap gap-2 mt-4">
                        {FEATURE_TAGS.slice(0, 5).map(t => (
                            <span key={t.name} className="px-3 py-1 rounded-full text-xs font-bold text-white/90 border border-white/30 bg-white/10">
                                {t.emoji} {t.name}
                            </span>
                        ))}
                        <span className="px-3 py-1 rounded-full text-xs font-bold text-white/70 border border-white/20 bg-white/5">+{FEATURE_TAGS.length - 5} daha</span>
                    </div>
                </div>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 mb-8">
                <FaShieldAlt className="text-amber-500 text-base flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                    <span className="font-bold">Özel etiketler satın alınamaz.</span>{' '}
                    Yalnızca platform ekibinin değerlendirmesiyle, topluluğa katkısı ve özgünlüğü yüksek kullanıcılara atanır.
                </div>
            </div>

            {/* Tags grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-14">
                {FEATURE_TAGS.map((tag) => (
                    <div
                        key={tag.name}
                        className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all overflow-hidden"
                    >
                        {/* Colored top bar */}
                        <div className="h-1.5 w-full" style={{ backgroundColor: tag.color }} />
                        <div className="p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">{tag.emoji}</span>
                                <span
                                    className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold shadow-sm"
                                    style={{ backgroundColor: tag.color, color: tag.textColor }}
                                >
                                    {tag.name}
                                </span>
                            </div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-white mb-2 leading-snug">
                                "{tag.description}"
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                {tag.detail}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-gray-800 dark:to-gray-800 rounded-3xl p-6 border border-indigo-100 dark:border-gray-700">
                <div className="flex-1">
                    <h3 className="font-bold text-gray-900 dark:text-white text-base mb-1">Xper Puan Sistemini de merak ediyor musunuz?</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Seviyeler, rozetler ve her aktivite için kaç puan kazanacağınızı öğrenin.</p>
                </div>
                <Link
                    to="/xper-puan"
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold text-sm hover:shadow-lg hover:scale-[1.02] transition-all flex-shrink-0 whitespace-nowrap"
                >
                    <FaBolt className="text-xs" /> Xper Puanları <FaChevronRight className="text-xs" />
                </Link>
            </div>
        </MainLayout>
    );
}
