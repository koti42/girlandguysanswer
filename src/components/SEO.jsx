import React from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CANONICAL_ORIGIN, getCanonicalUrl } from '../config/site';

// Varsayılan paylaşım görseli (1200x630). Edge ön-render katmanı aynı dosyayı kullanır (src/seo/edge/pages.js).
const DEFAULT_OG_IMAGE = `${CANONICAL_ORIGIN.replace(/\/$/, '')}/og-default.jpg`;

const SEO = ({ title, description, name, type, noindex, robots, jsonLd, canonical, image }) => {
    const { pathname } = useLocation();
    const canonicalUrl = canonical || getCanonicalUrl(pathname);
    const ogImage = image || DEFAULT_OG_IMAGE;

    return (
        <Helmet>
            <title>{title}</title>
            <meta name="description" content={description} />
            <link rel="canonical" href={canonicalUrl} />

            {/* `robots` açık değer verir (ör. cevapsız soru: "noindex, follow"); `noindex` eski kısa yol. */}
            {robots ? <meta name="robots" content={robots} /> : noindex && <meta name="robots" content="noindex, nofollow" />}

            <meta property="og:type" content={type} />
            <meta property="og:site_name" content="Herkesler Soruyor" />
            <meta property="og:locale" content="tr_TR" />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta property="og:url" content={canonicalUrl} />
            <meta property="og:image" content={ogImage} />
            {!image && <meta property="og:image:width" content="1200" />}
            {!image && <meta property="og:image:height" content="630" />}

            <meta name="twitter:creator" content={name} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={ogImage} />

            {jsonLd && (
                <script type="application/ld+json">
                    {JSON.stringify(jsonLd)}
                </script>
            )}
        </Helmet>
    );
};

SEO.defaultProps = {
    title: 'Herkesler Soruyor | Kadınlar ve Erkekler Soruyor, Cevaplıyor',
    description: 'Anonim soru sor, kadın ve erkek bakış açısından samimi cevaplar al. İlişkiler, aile, kariyer, sağlık ve daha fazlası: binlerce soru ve cevap seni bekliyor.',
    name: 'Herkesler Soruyor',
    type: 'website'
};

export default SEO;
