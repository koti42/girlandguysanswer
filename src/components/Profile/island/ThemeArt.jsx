import React, { useId } from 'react';
import './themeSettings.css';

/*
 * Ada Profili küçük resmi: tamamen özgün, satır içi SVG (düz renkli alçak
 * çokgen ada, palmiye, güneş, bulut). Süs olduğu için ekran okuyucudan
 * gizlidir; hareket (`theme-art-float`) azaltılmış harekette ve erişilebilirlik
 * modunda CSS'ten kapanır.
 */
const ThemeArt = ({ className = '', animate = true }) => {
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const sky = `${uid}-sky`;
    const sea = `${uid}-sea`;
    return (
        <svg
            viewBox="0 0 160 120"
            className={`theme-art ${className}`}
            role="presentation"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ffb07a" />
                    <stop offset="0.55" stopColor="#ffd9a8" />
                    <stop offset="1" stopColor="#bfe3f0" />
                </linearGradient>
                <linearGradient id={sea} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#3aa6c9" />
                    <stop offset="1" stopColor="#1d6f9a" />
                </linearGradient>
            </defs>
            <rect width="160" height="120" fill={`url(#${sky})`} />
            <circle cx="122" cy="32" r="14" fill="#fff3c4" opacity="0.9" />
            <circle cx="122" cy="32" r="9" fill="#ffe08a" />
            <g fill="#fff" opacity="0.92">
                <ellipse cx="34" cy="26" rx="14" ry="5" />
                <ellipse cx="44" cy="22" rx="9" ry="5" />
                <ellipse cx="96" cy="16" rx="11" ry="4" />
            </g>
            <rect y="84" width="160" height="36" fill={`url(#${sea})`} />
            <path d="M0 96 Q20 92 40 96 T80 96 T120 96 T160 96" fill="none" stroke="#7cd0e6" strokeWidth="1.5" opacity="0.7" />
            <g className={animate ? 'theme-art-float' : undefined}>
                <polygon points="38,78 122,78 104,104 80,116 58,104" fill="#8a6a4a" />
                <polygon points="38,78 80,116 58,104" fill="#6f5238" />
                <polygon points="30,76 46,64 78,60 112,62 130,74 122,80 40,80" fill="#7dc15a" />
                <polygon points="46,64 78,60 70,72 40,78" fill="#93d26b" />
                <rect x="94" y="46" width="3.5" height="20" fill="#7a5230" />
                <polygon points="95.7,44 80,52 86,54 95.7,50 105,54 111,52" fill="#2f9d57" />
                <polygon points="95.7,42 84,40 90,46 95.7,46 101,46 107,40" fill="#3cb56a" />
                <polygon points="52,66 60,54 68,66" fill="#e8d6b0" />
                <polygon points="52,66 60,60 68,66" fill="#d9674e" />
                <rect x="55" y="66" width="10" height="7" fill="#f3e6c8" />
            </g>
        </svg>
    );
};

export default ThemeArt;
