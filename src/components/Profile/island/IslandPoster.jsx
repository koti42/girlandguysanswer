import React from 'react';

/*
 * Sahne yüklenirken (ve yüklenemezse) görünen sabit afiş: gün batımı gökyüzü,
 * deniz ve küçük bir ada silueti. Tamamen süs (aria-hidden); aynı yükseklikte
 * olduğu için sahne gelince düzen kaymaz. Kendi çizimimiz, dış görsel yok.
 */
const IslandPoster = ({ hidden = false }) => (
    <div className="ih-poster" data-hidden={hidden ? 'true' : 'false'} aria-hidden="true" data-testid="island-poster">
        <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice" focusable="false">
            <defs>
                <linearGradient id="ihp-sky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#7cc4ec" />
                    <stop offset="0.62" stopColor="#ffd2a4" />
                    <stop offset="1" stopColor="#ffb487" />
                </linearGradient>
                <linearGradient id="ihp-sea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#4fb3d6" />
                    <stop offset="1" stopColor="#2b7fb0" />
                </linearGradient>
                <radialGradient id="ihp-sun" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0" stopColor="#fff3c4" stopOpacity="0.95" />
                    <stop offset="1" stopColor="#fff3c4" stopOpacity="0" />
                </radialGradient>
            </defs>
            <rect width="400" height="240" fill="url(#ihp-sky)" />
            <circle cx="296" cy="112" r="64" fill="url(#ihp-sun)" />
            <circle cx="296" cy="112" r="17" fill="#fff0b8" />
            <g fill="#fff" opacity="0.85">
                <ellipse cx="78" cy="58" rx="30" ry="9" />
                <ellipse cx="98" cy="52" rx="20" ry="8" />
                <ellipse cx="320" cy="42" rx="26" ry="8" />
            </g>
            <rect y="150" width="400" height="90" fill="url(#ihp-sea)" />
            <g fill="#fff" opacity="0.25">
                <rect x="40" y="176" width="70" height="3" rx="1.5" />
                <rect x="270" y="190" width="90" height="3" rx="1.5" />
                <rect x="130" y="206" width="60" height="3" rx="1.5" />
            </g>
            <polygon points="130,164 270,164 244,206 156,206" fill="#7a5a44" />
            <ellipse cx="200" cy="164" rx="76" ry="16" fill="#8fcf7a" />
            <ellipse cx="200" cy="161" rx="62" ry="12" fill="#a6dd8b" />
            <rect x="230" y="128" width="5" height="32" rx="2" fill="#8a5d3b" />
            <g fill="#3f9d57">
                <polygon points="232,126 206,134 220,126 204,120" />
                <polygon points="233,126 258,134 246,126 262,120" />
                <polygon points="233,126 226,108 240,108" />
            </g>
            <rect x="178" y="138" width="22" height="20" fill="#f4e3c1" />
            <polygon points="174,139 189,126 204,139" fill="#d9543f" />
        </svg>
    </div>
);

export default IslandPoster;
