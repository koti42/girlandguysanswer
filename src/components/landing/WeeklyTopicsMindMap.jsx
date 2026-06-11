import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { categoriesAPI } from '../../services/api';
import { getCategoryIcon, getCategoryColor, getCategoryHexColor } from '../../utils/categoryIcons';

// Desktop slot positions (percentages within the container) arranged around the central title
const SLOTS = [
    { left: '4%', top: '8%' },
    { left: '22%', top: '38%' },
    { left: '8%', top: '70%' },
    { left: '30%', top: '85%' },
    { left: '52%', top: '78%' },
    { left: '72%', top: '88%' },
    { right: '4%', top: '64%' },
    { right: '10%', top: '10%' },
    { right: '26%', top: '34%' },
    { left: '38%', top: '6%' },
];

// Curved connector lines from center (50,38) to each slot, in a 100x100 viewBox
const LINE_COLORS = ['#F9A8D4', '#93C5FD', '#FDBA74', '#86EFAC', '#C4B5FD', '#F9A8D4', '#93C5FD', '#FDBA74', '#86EFAC', '#C4B5FD'];

const slotToPoint = (slot) => {
    const x = slot.left != null ? parseFloat(slot.left) + 8 : 100 - parseFloat(slot.right) - 8;
    const y = parseFloat(slot.top) + 5;
    return { x, y };
};

const CategoryChip = ({ category, className = '', style }) => {
    const Icon = getCategoryIcon(category.name);
    const apiColor = getCategoryColor(category.color);
    const color = apiColor !== '#9E9E9E' ? apiColor : getCategoryHexColor(category.name);
    return (
        <Link
            to={`/questions/${category.slug}`}
            className={`flex items-center gap-2.5 bg-white dark:bg-gray-800 rounded-2xl pl-2 pr-4 py-2 shadow-soft hover:shadow-lg border border-gray-100 dark:border-gray-700 hover:scale-105 transition-all ${className}`}
            style={style}
        >
            <span
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: color }}
            >
                <Icon className="text-sm" />
            </span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[150px]" title={category.name}>
                {category.name}
            </span>
        </Link>
    );
};

const ChipSkeleton = ({ className = '', style }) => (
    <div className={`flex items-center gap-2.5 bg-white dark:bg-gray-800 rounded-2xl pl-2 pr-4 py-2 shadow-soft border border-gray-100 dark:border-gray-700 animate-pulse ${className}`} style={style}>
        <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700 shrink-0"></div>
        <div className="h-3.5 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
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

    return (
        <section className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-14">
            {/* Desktop: hub & spoke mind-map */}
            <div className="hidden md:block relative" style={{ height: '380px' }}>
                {/* Curved connector lines */}
                <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    {SLOTS.slice(0, Math.max(visible.length, loading ? SLOTS.length : 0)).map((slot, i) => {
                        const p = slotToPoint(slot);
                        const cx = (50 + p.x) / 2 + (p.y < 38 ? -4 : 4);
                        const cy = (38 + p.y) / 2 + (p.x < 50 ? 6 : -6);
                        return (
                            <path
                                key={i}
                                d={`M 50 38 Q ${cx} ${cy} ${p.x} ${p.y}`}
                                fill="none"
                                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                strokeWidth="0.35"
                                strokeDasharray="1.4 1"
                                opacity="0.8"
                            />
                        );
                    })}
                </svg>

                {/* Center title */}
                <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-center z-10">
                    <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white bg-background/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 py-2 rounded-2xl">
                        Haftanın Gündem Konuları
                    </h2>
                </div>

                {/* Category chips on slots */}
                {loading
                    ? SLOTS.map((slot, i) => (
                        <ChipSkeleton key={i} className="absolute z-10" style={slot} />
                    ))
                    : visible.map((cat, i) => (
                        <CategoryChip key={cat.id} category={cat} className="absolute z-10" style={SLOTS[i]} />
                    ))}
            </div>

            {/* Mobile/tablet: title + 2-column grid */}
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
