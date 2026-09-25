import React from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import {
    FaBolt, FaTrophy, FaMedal, FaArrowLeft, FaChevronRight,
    FaQuestionCircle, FaComment, FaHeart, FaStar,
    FaSignInAlt, FaTrash, FaFlag, FaArrowUp,
} from 'react-icons/fa';

const POINT_RULES = [
    { icon: FaQuestionCircle, label: 'Soru Sormak',                          points: +5,   color: '#F97316', desc: 'Her soru sorduğunuzda otomatik olarak kazanılır.' },
    { icon: FaComment,        label: 'Görüş Yazmak',                         points: +7,   color: '#6366F1', desc: 'Bir soruya görüş (cevap) yazdığınızda kazanılır.' },
    { icon: FaTrophy,         label: 'En İyi Görüş (EİG) Seçilmek',          points: +120, color: '#FBBF24', desc: 'Soru sahibi görüşünüzü "En İyi" olarak işaretlediğinde kazanılır.' },
    { icon: FaHeart,          label: 'Görüşüne Artı Oy Almak',               points: +2,   color: '#EC4899', desc: 'Bir görüşünüz her beğenildiğinde +2 XP eklenir.' },
    { icon: FaStar,           label: 'Kendi Sorunu EİG Seçmek',              points: +100, color: '#14B8A6', desc: 'Kendi sorunuza gelen görüşlerden birini EİG seçerseniz kazanılır.' },
    { icon: FaSignInAlt,      label: 'Günlük Giriş',                         points: +10,  color: '#22C55E', desc: 'Her gün platforma giriş yaparak 10 XP kazanabilirsiniz.' },
    { icon: FaTrash,          label: 'İçerik Silinmesi (Moderasyon)',         points: -20,  color: '#EF4444', desc: 'Kural ihlali içeriğiniz moderatörler tarafından silinirse uygulanır.' },
    { icon: FaFlag,           label: 'Şikayet Edilmek (Haklı Bulunursa)',    points: -50,  color: '#DC2626', desc: 'Şikayetiniz haklı bulunursa puanınızdan düşülür.' },
];

const LEVELS = [
    { level: 1,  name: 'Yolcu',          minXp: 0,          color: '#B0BEC5', emoji: '🚶' },
    { level: 2,  name: 'Meraklı',         minXp: 500,        color: '#90A4AE', emoji: '🔍' },
    { level: 3,  name: 'Çırak',           minXp: 1500,       color: '#78909C', emoji: '📖' },
    { level: 4,  name: 'Hevesli',         minXp: 3000,       color: '#81C784', emoji: '🌱' },
    { level: 5,  name: 'Katılımcı',       minXp: 5000,       color: '#66BB6A', emoji: '🙋' },
    { level: 6,  name: 'Sohbet Sever',    minXp: 10000,      color: '#4CAF50', emoji: '💬' },
    { level: 7,  name: 'Yazar',           minXp: 20000,      color: '#43A047', emoji: '✍️' },
    { level: 8,  name: 'Bilgin',          minXp: 35000,      color: '#2E7D32', emoji: '🧠' },
    { level: 9,  name: 'Usta',            minXp: 50000,      color: '#64B5F6', emoji: '⚒️' },
    { level: 10, name: 'Mentör',          minXp: 75000,      color: '#42A5F5', emoji: '🎓' },
    { level: 11, name: 'Fenomen',         minXp: 100000,     color: '#2196F3', emoji: '⭐' },
    { level: 12, name: 'Öncü',            minXp: 150000,     color: '#1E88E5', emoji: '🚀' },
    { level: 13, name: 'Kanaat Önderi',   minXp: 250000,     color: '#BA68C8', emoji: '👑' },
    { level: 14, name: 'Guru',            minXp: 500000,     color: '#AB47BC', emoji: '🔮' },
    { level: 15, name: 'Filozof',         minXp: 1000000,    color: '#9C27B0', emoji: '🧿' },
    { level: 16, name: 'Efsane',          minXp: 2500000,    color: '#FFB74D', emoji: '🏆' },
    { level: 17, name: 'İlah',            minXp: 5000000,    color: '#FF9800', emoji: '⚡' },
    { level: 18, name: 'Evrensel',        minXp: 10000000,   color: '#F44336', emoji: '🌍' },
    { level: 19, name: 'Sonsuzluk',       minXp: 25000000,   color: '#D32F2F', emoji: '♾️' },
    { level: 20, name: 'Admin Gibi',      minXp: 50000000,   color: '#212121', emoji: '🖤' },
];

const BADGES = [
    { group: 'XP Rozetleri', items: [
        { name: 'Bronz Üye',  req: '50.000 XP',    emoji: '🥉' },
        { name: 'Gümüş Üye', req: '250.000 XP',   emoji: '🥈' },
        { name: 'Altın Üye', req: '1.000.000 XP',  emoji: '🥇' },
        { name: 'Platin Üye',req: '5.000.000 XP',  emoji: '💎' },
        { name: 'Elmas Üye', req: '25.000.000 XP', emoji: '💠' },
    ]},
    { group: 'Soru Rozetleri', items: [
        { name: 'İlk Soru',      req: '1 soru',   emoji: '❓' },
        { name: 'Soru Meraklısı',req: '10 soru',  emoji: '🔍' },
        { name: 'Sorgulayan',    req: '50 soru',  emoji: '🤔' },
        { name: 'Aydınlatıcı',  req: '100 soru', emoji: '💡' },
    ]},
    { group: 'Görüş Rozetleri', items: [
        { name: 'İlk Adım',      req: '1 görüş',    emoji: '👣' },
        { name: 'Yardımsever',   req: '50 görüş',   emoji: '🤝' },
        { name: 'Fikir İşçisi',  req: '100 görüş',  emoji: '⚙️' },
        { name: 'Kanaat Önderi', req: '1.000 görüş',emoji: '👑' },
    ]},
    { group: 'Beğeni Rozetleri', items: [
        { name: 'Sevilen Yüz', req: '10 beğeni',   emoji: '❤️' },
        { name: 'Fenomen',     req: '100 beğeni',  emoji: '🌟' },
        { name: 'Star',        req: '1.000 beğeni',emoji: '🌠' },
    ]},
    { group: 'EİG Rozetleri', items: [
        { name: 'Çözüm Ortağı', req: '1 EİG',  emoji: '✅' },
        { name: 'Uzman',         req: '10 EİG', emoji: '🎯' },
        { name: 'Üstat',         req: '50 EİG', emoji: '🏅' },
    ]},
    { group: 'Sadakat Rozetleri', items: [
        { name: 'Sadık Üye', req: '10 gün giriş',  emoji: '📅' },
        { name: 'Bağımlı',   req: '100 gün giriş', emoji: '🔥' },
    ]},
];

const fmt = (n) => n.toLocaleString('tr-TR');

export default function XperPuanPage() {
    return (
        <MainLayout showMobileFooter>
            <SEO
                title="Xper Puan Sistemi | Herkesler Soruyor"
                description="Xper puanları nasıl kazanılır? Seviyeler, rozetler ve puan tablosu."
            />

            {/* Hero */}
            <div className="relative overflow-hidden rounded-3xl mb-10">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700" />
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
                />
                <div className="relative px-6 py-10 md:px-12 md:py-14">
                    <Link to="/sss" className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-semibold mb-5 transition-colors">
                        <FaArrowLeft className="text-[10px]" /> SSS'e Dön
                    </Link>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shadow-lg">
                            <FaBolt className="text-white text-2xl" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-4xl font-extrabold text-white leading-tight">Xper Puan Sistemi</h1>
                            <p className="text-white/70 text-sm mt-1">Platformdaki katkılarınız karşılığında puan kazanın</p>
                        </div>
                    </div>
                    {/* mini stats */}
                    <div className="flex flex-wrap gap-3 mt-2">
                        {[
                            { v: '8', l: 'Aktivite' },
                            { v: '20', l: 'Seviye' },
                            { v: '+120', l: 'Maks. Tek Kazanım' },
                            { v: '+10', l: 'Günlük Giriş' },
                        ].map(({ v, l }) => (
                            <div key={l} className="bg-white/15 rounded-2xl px-4 py-2 text-center">
                                <div className="text-xl font-extrabold text-white">{v}</div>
                                <div className="text-[10px] text-white/70 font-semibold">{l}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-14">

                {/* ─ Puan Kazanma Tablosu ─ */}
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-9 h-9 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                            <FaBolt className="text-indigo-500 text-base" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Puan Kazanma / Kaybetme Tablosu</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Her aktivitenin karşılığındaki XP miktarı</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {POINT_RULES.map(({ icon: _Icon, label, points, color, desc }) => (
                            <div key={label} className="flex items-start gap-4 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${color}18` }}>
                                    <Icon style={{ color }} className="text-lg" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-gray-800 dark:text-white text-sm">{label}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{desc}</div>
                                </div>
                                <span
                                    className="text-sm font-extrabold px-3 py-1.5 rounded-xl flex-shrink-0"
                                    style={{
                                        color: points > 0 ? '#16A34A' : '#DC2626',
                                        backgroundColor: points > 0 ? '#16A34A15' : '#DC262615',
                                    }}
                                >
                                    {points > 0 ? `+${points}` : points} XP
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ─ Seviyeler ─ */}
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-9 h-9 rounded-2xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                            <FaTrophy className="text-yellow-500 text-base" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Seviyeler</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Toplam XP'nize göre otomatik olarak belirlenir — 20 seviye</p>
                        </div>
                    </div>
                    <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="grid grid-cols-4 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700">
                            <span>Lv.</span>
                            <span>Unvan</span>
                            <span className="text-right col-span-2">Gereken Min. XP</span>
                        </div>
                        {LEVELS.map((lvl, i) => (
                            <div
                                key={lvl.level}
                                className={`grid grid-cols-4 items-center px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 last:border-0 ${i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/50'}`}
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className="inline-flex w-5 h-5 rounded-full border-2 border-white dark:border-gray-700 shadow-sm flex-shrink-0" style={{ backgroundColor: lvl.color }} />
                                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500">{lvl.level}</span>
                                </div>
                                <div className="flex items-center gap-2 col-span-2">
                                    <span className="text-base">{lvl.emoji}</span>
                                    <span className="font-semibold text-gray-800 dark:text-white text-sm">{lvl.name}</span>
                                </div>
                                <span className="text-right font-mono text-xs font-bold" style={{ color: lvl.color }}>
                                    {fmt(lvl.minXp)}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ─ Rozetler ─ */}
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-9 h-9 rounded-2xl bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                            <FaMedal className="text-pink-500 text-base" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Rozetler</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Aktivite eşiklerine ulaşınca otomatik kazanılır</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {BADGES.map(({ group, items }) => (
                            <div key={group} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                                <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{group}</h3>
                                </div>
                                <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                    {items.map(({ name, req, emoji }) => (
                                        <div key={name} className="flex items-center gap-3 px-4 py-2.5">
                                            <span className="text-xl flex-shrink-0">{emoji}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-gray-800 dark:text-white">{name}</div>
                                                <div className="text-xs text-gray-400 dark:text-gray-500">{req}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* CTA */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800 rounded-3xl p-6 border border-blue-100 dark:border-gray-700">
                    <div className="flex-1">
                        <h3 className="font-bold text-gray-900 dark:text-white text-base mb-1">Özel Etiketleri de merak ediyor musunuz?</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Feature Tags nedir, kimler alır? Tüm detaylar için sayfamıza göz atın.</p>
                    </div>
                    <Link
                        to="/feature-tags"
                        className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold text-sm hover:shadow-lg hover:scale-[1.02] transition-all flex-shrink-0 whitespace-nowrap"
                    >
                        Özel Etiketler <FaChevronRight className="text-xs" />
                    </Link>
                </div>

            </div>
        </MainLayout>
    );
}
