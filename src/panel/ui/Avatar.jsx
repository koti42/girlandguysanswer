import React from 'react';
import { normalizeAvatarUrl } from '../../utils/avatarUrl';

export default function Avatar({ user, size = 32, className = '' }) {
    const src = normalizeAvatarUrl(user?.avatar);
    const initial = (user?.username || '?').slice(0, 1).toUpperCase();
    const tone = user?.gender === 'female' ? 'from-pink-500 to-rose-500' : user?.gender === 'male' ? 'from-sky-500 to-indigo-500' : 'from-slate-500 to-slate-600';
    const style = { width: size, height: size, fontSize: Math.max(10, size * 0.42) };

    return src ? (
        <img src={src} alt="" width={size} height={size} loading="lazy" className={`rounded-full object-cover bg-slate-800 shrink-0 ${className}`} style={style} />
    ) : (
        <span className={`rounded-full bg-gradient-to-br ${tone} text-white font-bold grid place-items-center shrink-0 ${className}`} style={style} aria-hidden>
            {initial}
        </span>
    );
}
