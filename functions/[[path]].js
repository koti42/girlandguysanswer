// Cloudflare Pages Function: catch-all — bilinen SPA rotaları 200 kabuk, bilinmeyen yollar gerçek 404.
// Daha özel fonksiyonlar (/question/[slug] vb.) önce eşleşir; statik dosyalar public/_routes.json ile dışarıda.
import { handleCatchAll } from '../src/seo/edge/catchAll.js';

export const onRequestGet = (context) => handleCatchAll(context);
