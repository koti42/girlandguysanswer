// Cloudflare Pages Function: /opinion/:slugOrId — görüş sayfası edge ön-render.
import { renderSeoPage } from '../../src/seo/edge/render.js';

export const onRequestGet = (context) => renderSeoPage(context, 'opinion', context.params.slugOrId);
