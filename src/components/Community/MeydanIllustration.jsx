import React from 'react';

/**
 * Boş Meydan çizimi: saat kulesi, etrafında sohbet eden insanlar, havada
 * konuşma balonları ve bir mikrofon. Renkler Tailwind fill/stroke sınıflarıyla
 * verildiği için koyu temaya kendiliğinden uyar. Balonların süzülmesi
 * `.meydan-float` (index.css) ile; hareketi azaltma tercihinde durur.
 */
const MeydanIllustration = ({ className = '' }) => (
    <svg
        viewBox="0 0 320 200"
        className={className}
        role="img"
        aria-label="Saat kulesi olan bir meydanda konuşma balonlarıyla sohbet eden insanlar"
        xmlns="http://www.w3.org/2000/svg"
    >
        <defs>
            <radialGradient id="meydan-glow" cx="50%" cy="55%" r="50%">
                <stop offset="0%" stopColor="#FF6B6B" stopOpacity="0.22" />
                <stop offset="60%" stopColor="#A78BFA" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#A78BFA" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="meydan-roof" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF8A80" />
                <stop offset="100%" stopColor="#FF6B6B" />
            </linearGradient>
        </defs>

        {/* Arka ışık ve zemin */}
        <ellipse cx="160" cy="112" rx="150" ry="96" fill="url(#meydan-glow)" />
        <ellipse cx="160" cy="182" rx="134" ry="13" className="fill-gold/25 dark:fill-gold/15" />
        <ellipse cx="160" cy="182" rx="86" ry="7" className="fill-gold/30 dark:fill-gold/20" />

        {/* Yıldızcıklar */}
        <g className="fill-gold">
            <path d="M34 58 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" opacity="0.9" />
            <path d="M288 50 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" opacity="0.8" />
            <path d="M290 142 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" opacity="0.6" />
        </g>

        {/* Saat kulesi */}
        <g>
            <path d="M160 34 v-12" className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="2" strokeLinecap="round" />
            <path d="M160 22 l12 4 -12 4z" className="fill-gold" />
            <path d="M132 86 L160 44 L188 86 Z" fill="url(#meydan-roof)" />
            <rect x="130" y="82" width="60" height="8" rx="4" className="fill-rose-400 dark:fill-rose-500" />
            <rect x="138" y="88" width="44" height="84" rx="6" className="fill-white dark:fill-gray-700" />
            <rect x="138" y="88" width="44" height="84" rx="6" fill="none" className="stroke-rose-200 dark:stroke-gray-600" strokeWidth="2" />
            <circle cx="160" cy="114" r="13" className="fill-white dark:fill-gray-800 stroke-gold" strokeWidth="3" />
            <path d="M160 114 v-8 M160 114 l6 3" className="stroke-gray-700 dark:stroke-gray-200" strokeWidth="2" strokeLinecap="round" />
            <circle cx="160" cy="114" r="1.6" className="fill-coral" />
            <path d="M152 172 v-14 a8 8 0 0 1 16 0 v14z" className="fill-violet-300 dark:fill-violet-500/70" />
            <rect x="126" y="170" width="68" height="10" rx="4" className="fill-gray-200 dark:fill-gray-600" />
        </g>

        {/* Mikrofon */}
        <g>
            <path d="M40 180 v-26" className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M32 180 h16" className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="33" y="132" width="14" height="22" rx="7" className="fill-gray-700 dark:fill-gray-200" />
            <path d="M36 140 h8 M36 145 h8" className="stroke-gray-500 dark:stroke-gray-400" strokeWidth="1.5" strokeLinecap="round" />
        </g>

        {/* Sol grup */}
        <g>
            <path d="M58 180 v-16 a13 13 0 0 1 26 0 v16z" className="fill-violet-500" />
            <circle cx="71" cy="142" r="9" className="fill-amber-200 dark:fill-amber-300" />
            <path d="M88 180 v-13 a11 11 0 0 1 22 0 v13z" className="fill-coral" />
            <circle cx="99" cy="149" r="8" className="fill-orange-200 dark:fill-orange-300" />
        </g>

        {/* Sağ grup */}
        <g>
            <path d="M210 180 v-13 a11 11 0 0 1 22 0 v13z" className="fill-gold" />
            <circle cx="221" cy="149" r="8" className="fill-amber-100 dark:fill-amber-200" />
            <path d="M238 180 v-16 a13 13 0 0 1 26 0 v16z" className="fill-sky-500 dark:fill-sky-400" />
            <circle cx="251" cy="142" r="9" className="fill-orange-200 dark:fill-orange-300" />
        </g>

        {/* Konuşma balonları */}
        <g className="meydan-float">
            <path d="M58 92 h46 a14 14 0 0 1 0 28 h-26 l-10 9 1 -9 h-11 a14 14 0 0 1 0 -28z" className="fill-coral" />
            <circle cx="70" cy="106" r="3" className="fill-white" />
            <circle cx="81" cy="106" r="3" className="fill-white" />
            <circle cx="92" cy="106" r="3" className="fill-white" />
        </g>
        <g className="meydan-float meydan-float-delay-1">
            <path d="M104 46 h22 a12 12 0 0 1 0 24 h-14 l-8 7 1 -7 a12 12 0 0 1 -1 -24z" className="fill-gold" />
            <text x="115" y="64" textAnchor="middle" fontSize="17" fontWeight="800" fontFamily="Inter, sans-serif" className="fill-white">?</text>
        </g>
        <g className="meydan-float meydan-float-delay-2">
            <path d="M214 86 h40 a15 15 0 0 1 0 30 h-14 l-8 9 -1 -9 h-17 a15 15 0 0 1 0 -30z" className="fill-violet-500" />
            <g className="stroke-white" strokeWidth="3" strokeLinecap="round">
                <path d="M219 101 v0" />
                <path d="M226 96 v10" />
                <path d="M233 93 v16" />
                <path d="M240 97 v8" />
                <path d="M247 99 v4" />
            </g>
        </g>
        <g className="meydan-float meydan-float-delay-3">
            <path d="M198 40 h20 a11 11 0 0 1 0 22 h-6 l-7 6 0 -6 h-7 a11 11 0 0 1 0 -22z" className="fill-white dark:fill-gray-700" />
            <path d="M208 56 c-6 -4 -8 -7 -6 -10 1.6 -2.4 4.6 -2 6 0.4 1.4 -2.4 4.4 -2.8 6 -0.4 2 3 0 6 -6 10z" className="fill-coral" />
        </g>
    </svg>
);

export default MeydanIllustration;
