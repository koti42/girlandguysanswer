// Cloudflare Pages Function: /question/:slug — soru sayfasını edge'de ön-render eder.
// Mantık src/seo/edge/ altında (testli); bu dosya yalnızca yönlendirme.
import { renderSeoPage } from '../../src/seo/edge/render.js';

export const onRequestGet = (context) => renderSeoPage(context, 'question', context.params.slug);
