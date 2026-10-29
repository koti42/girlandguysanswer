// Cloudflare Pages middleware: fonksiyon yanıtlarına güvenlik başlıkları.
// Statik dosyalar için aynı başlıklar public/_headers'ta (o dosya fonksiyon yanıtlarına uygulanmaz).
import { SECURITY_HEADERS } from '../src/seo/edge/securityHeaders.js';

export async function onRequest(context) {
    const response = await context.next();
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        if (!headers.has(name)) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
