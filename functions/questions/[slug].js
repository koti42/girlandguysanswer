// Cloudflare Pages Function: /questions/:slug — kategori sayfası (soru bağlantı listesi) edge ön-render.
import { renderSeoPage } from '../../src/seo/edge/render.js';

export const onRequestGet = (context) => renderSeoPage(context, 'category', context.params.slug);
