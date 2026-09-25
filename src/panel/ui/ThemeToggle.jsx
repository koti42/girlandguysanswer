import React from 'react';
import { FaMoon, FaSun } from 'react-icons/fa';
import { usePanelTheme } from '../hooks/usePanelTheme';

export default function ThemeToggle({ size = 'md', className = '' }) {
    const { resolved, toggle } = usePanelTheme();
    const dims = size === 'sm' ? 'h-9 w-9 rounded-lg' : 'h-10 w-10 rounded-xl';
    return (
        <button type="button" onClick={toggle} className={`${dims} grid place-items-center p-muted hover:text-[var(--p-text)] p-hover p-ring ${className}`} aria-label={resolved === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'} title={resolved === 'dark' ? 'Açık tema' : 'Koyu tema'}>
            {resolved === 'dark' ? <FaSun /> : <FaMoon />}
        </button>
    );
}
