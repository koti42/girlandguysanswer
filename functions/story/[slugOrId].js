// Cloudflare Pages Function: /story/:slugOrId — hikâye sayfası edge ön-render.
import { renderSeoPage } from '../../src/seo/edge/render.js';

export const onRequestGet = (context) => renderSeoPage(context, 'story', context.params.slugOrId);
