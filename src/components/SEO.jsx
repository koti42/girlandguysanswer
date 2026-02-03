import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEO = ({ title, description, name, type, noindex, jsonLd, canonical }) => {
    const canonicalUrl = canonical || (typeof window !== 'undefined' ? window.location.href.split('?')[0] : '');

    return (
        <Helmet>
            { /* Standard metadata tags */}
            <title>{title}</title>
            <meta name='description' content={description} />
            {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

            {noindex && <meta name="robots" content="noindex, nofollow" />}

            { /* End standard metadata tags */}

            { /* Facebook tags */}
            <meta property="og:type" content={type} />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            { /* End Facebook tags */}

            { /* Twitter tags */}
            <meta name="twitter:creator" content={name} />
            <meta name="twitter:card" content={type} />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={description} />
            { /* End Twitter tags */}

            {jsonLd && (
                <script type="application/ld+json">
                    {JSON.stringify(jsonLd)}
                </script>
            )}
        </Helmet>
    )
}

SEO.defaultProps = {
    title: 'Herkesler Soruyor - Anonim Soru Cevap Platformu',
    description: 'Herkesler Soruyor ile anonim olarak soru sor, cevapla ve toplulukla etkileşime geç.',
    name: 'Herkesler Soruyor',
    type: 'website'
};

export default SEO;
