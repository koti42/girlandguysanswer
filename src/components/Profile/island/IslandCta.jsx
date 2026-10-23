import React from 'react';
import { Link } from 'react-router-dom';
import { LuSparkles } from 'react-icons/lu';

/*
 * Yalnız kendi profilinde, teması olmayan üyeye: kapak bandının köşesinde
 * küçük, ağır olmayan bir davet. Üç boyutlu hiçbir şey yüklemez (ana pakette
 * bu küçük bileşen dışında Ada koduna dokunulmaz).
 */
const IslandCta = () => (
    <div className="absolute left-3 top-3 z-10">
        <Link
            to="/settings#profil-temasi"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/60 bg-white/85 px-3.5 text-xs font-bold text-gray-800 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral dark:border-white/15 dark:bg-gray-900/75 dark:text-gray-100 dark:hover:bg-gray-900"
        >
            <LuSparkles aria-hidden="true" className="text-coral" />
            Profilini adaya taşı
        </Link>
    </div>
);

export default IslandCta;
