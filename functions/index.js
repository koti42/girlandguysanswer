// Cloudflare Pages Function: / — ana sayfa edge ön-render (son sorular, kategoriler, Organization + WebSite şeması).
import { renderSeoPage } from '../src/seo/edge/render.js';

export const onRequestGet = (context) => renderSeoPage(context, 'home', '');
