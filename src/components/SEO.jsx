import React from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getCanonicalUrl } from '../config/site';

const SEO = ({ title, description, name, type, noindex, jsonLd, canonical }) => {
    const { pathname } = useLocation();
    const canonicalUrl = canonical || getCanonicalUrl(pathname);

    return (
        <Helmet>
            <title>{title}</title>
            <meta name="description" content={description} />
            <link rel="canonical" href={canonicalUrl} />

            {noindex && <meta name="robots" content="noindex, nofollow" />}

            <meta property="og:type" content={type} />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta property="og:url" content={canonicalUrl} />

            <meta name="twitter:creator" content={name} />
            <meta name="twitter:card" content={type} />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={description} />

            {jsonLd && (
                <script type="application/ld+json">
                    {JSON.stringify(jsonLd)}
                </script>
            )}
        </Helmet>
    );
};

SEO.defaultProps = {
    title: 'Herkesler Soruyor - Anonim Soru Cevap Platformu',
    description: 'Herkesler Soruyor ile anonim olarak soru sor, cevapla ve toplulukla etkileşime geç.',
    name: 'Herkesler Soruyor',
    type: 'website'
};

export default SEO;
