import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getCanonicalHost, getCanonicalUrl } from '../config/site';

const DomainRedirect = ({ children }) => {
    const { pathname, search } = useLocation();

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const currentHost = window.location.host;
        const hostname = window.location.hostname;

        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return;
        }
        if (hostname === 'pages.dev' || hostname.endsWith('.pages.dev')) {
            return;
        }

        const canonicalHost = getCanonicalHost();
        if (currentHost !== canonicalHost) {
            const target = getCanonicalUrl(pathname, search);
            window.location.replace(target);
        }
    }, [pathname, search]);

    return children;
};

export default DomainRedirect;
