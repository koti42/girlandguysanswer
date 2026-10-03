import { useEffect, useRef, useState } from 'react';

/*
 * Öğe ekranda mı? Izgaradaki animasyonlu tasarımlar yalnız görünürken
 * oynasın (uzun listede gereksiz boyama yok). IntersectionObserver yoksa
 * (eski tarayıcı / test) hep görünür sayılır.
 */
export default function useInView({ rootMargin = '120px' } = {}) {
    const ref = useRef(null);
    const [inView, setInView] = useState(() => typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function');

    useEffect(() => {
        const el = ref.current;
        if (!el || typeof window.IntersectionObserver !== 'function') return undefined;
        const io = new window.IntersectionObserver(
            (entries) => {
                for (const e of entries) setInView(e.isIntersecting);
            },
            { rootMargin }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [rootMargin]);

    return [ref, inView];
}
