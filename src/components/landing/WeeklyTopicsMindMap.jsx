import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { categoriesAPI } from '../../services/api';
import { getCategoryIcon, getCategoryColor, getCategoryHexColor } from '../../utils/categoryIcons';

const HUB = { x: 50, y: 42 };

const SLOTS = [
    { left: '2%', top: '2%' },
    { left: '18%', top: '0%' },
    { right: '18%', top: '0%' },
    { right: '2%', top: '2%' },
    { left: '0%', top: '58%' },
    { right: '0%', top: '58%' },
    { left: '4%', top: '84%' },
    { left: '28%', top: '92%' },
    { right: '28%', top: '92%' },
    { right: '4%', top: '84%' },
];

const LINE_COLORS = ['#F9A8D4', '#93C5FD', '#FDBA74', '#86EFAC', '#C4B5FD', '#F9A8D4', '#93C5FD', '#FDBA74', '#86EFAC', '#C4B5FD'];

const slotToPoint = (slot) => {
    const x = slot.left != null ? parseFloat(slot.left) + 10 : 100 - parseFloat(slot.right) - 10;
    const y = parseFloat(slot.top) + 4;
    return { x, y };
};

const CategoryChip = ({ category, className = '', style }) => {
    const Icon = getCategoryIcon(category.name);
    const apiColor = getCategoryColor(category.color);
    const color = apiColor !== '#9E9E9E' ? apiColor : getCategoryHexColor(category.name);
    return (
        <Link
            to={`/questions/${category.slug}`}
            className={`flex items-center gap-2.5 bg-white dark:bg-gray-800 rounded-2xl pl-2 pr-4 py-2 shadow-soft hover:shadow-lg border border-gray-100 dark:border-gray-700 hover:scale-105 transition-all max-w-[220px] ${className}`}
            style={style}
        >
            <span
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: color }}
            >
                {/*
                  * Kural burada yanılıyor: getCategoryIcon yeni bir bileşen
                  * ÜRETMİYOR, sabit bir eşleme tablosundan hazır react-icons
                  * bileşenini döndürüyor. Aynı kategori adı her zaman aynı
                  * referansı verir, yani yeniden kurulma olmaz.
                  */}
                {/* eslint-disable-next-line react-hooks/static-components */}
                <Icon className="text-sm" />
            </span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[140px]" title={category.name}>
                {category.name}
            </span>
        </Link>
    );
};

const ChipSkeleton = ({ className = '', style }) => (
    <div className={`flex items-center gap-2.5 bg-white dark:bg-gray-800 rounded-2xl pl-2 pr-4 py-2 shadow-soft border border-gray-100 dark:border-gray-700 animate-pulse max-w-[220px] ${className}`} style={style}>
        <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700 shrink-0" />
        <div className="h-3.5 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
);

const WeeklyTopicsMindMap = () => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const response = await categoriesAPI.getAll();
                setCategories(response.data?.data?.categories || []);
            } catch (err) {
                console.error('Kategoriler yüklenirken hata:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchCategories();
    }, []);

    const visible = categories.slice(0, SLOTS.length);

    if (!loading && visible.length === 0) return null;

    const slotCount = Math.max(visible.length, loading ? SLOTS.length : 0);

    return (
        <section className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-14">
            <div className="hidden md:block relative" style={{ minHeight: '440px' }}>
                <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    {SLOTS.slice(0, slotCount).map((slot, i) => {
                        const p = slotToPoint(slot);
                        const cx = (HUB.x + p.x) / 2 + (p.y < HUB.y ? -5 : 5);
                        const cy = (HUB.y + p.y) / 2 + (p.x < HUB.x ? 8 : -8);
                        return (
                            <path
                                key={i}
                                d={`M ${HUB.x} ${HUB.y} Q ${cx} ${cy} ${p.x} ${p.y}`}
                                fill="none"
                                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                strokeWidth="0.35"
                                strokeDasharray="1.4 1"
                                opacity="0.75"
                            />
                        );
                    })}
                </svg>

                {/* Merkez başlık — chip'lerden üstte, geniş güvenli alan */}
                <div
                    className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
                    style={{ width: 'min(420px, 46%)' }}
                >
                    <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white text-center bg-white dark:bg-gray-900 px-6 py-3 rounded-2xl shadow-sm border border-gray-100/80 dark:border-gray-700/80 leading-snug">
                        Haftanın Gündem Konuları
                    </h2>
                </div>

                {loading
                    ? SLOTS.map((slot, i) => (
                        <ChipSkeleton key={i} className="absolute z-10" style={slot} />
                    ))
                    : visible.map((cat, i) => (
                        <CategoryChip key={cat.id} category={cat} className="absolute z-10" style={SLOTS[i]} />
                    ))}
            </div>

            <div className="md:hidden">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-6">
                    Haftanın Gündem Konuları
                </h2>
                <div className="grid grid-cols-2 gap-3">
                    {loading
                        ? [...Array(6)].map((_, i) => <ChipSkeleton key={i} />)
                        : visible.map((cat) => <CategoryChip key={cat.id} category={cat} />)}
                </div>
            </div>
        </section>
    );
};

export default WeeklyTopicsMindMap;
