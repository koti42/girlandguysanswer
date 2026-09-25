import { useEffect } from 'react';

/**
 * Klavye kısayolları. `map`: { 'j': fn, 'shift+a': fn, 'mod+k': fn }.
 * Yazı alanlarında (input/textarea/contenteditable) tetiklenmez; mod+k
 * gibi komut paleti kısayolları hariç.
 */
export function useHotkeys(map, deps = []) {
    useEffect(() => {
        const handler = (e) => {
            const target = e.target;
            const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            const parts = [];
            if (e.metaKey || e.ctrlKey) parts.push('mod');
            if (e.shiftKey) parts.push('shift');
            if (e.altKey) parts.push('alt');
            parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
            const combo = parts.join('+');
            const fn = map[combo];
            if (!fn) return;
            if (typing && !combo.startsWith('mod+') && combo !== 'Escape') return;
            e.preventDefault();
            fn(e);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
