// Cloudflare Pages Function: /sitemap.xml — API'den canlı sitemap; API yoksa statik public/sitemap.xml.
import { serveSitemap } from '../src/seo/edge/sitemap.js';

export const onRequestGet = (context) => serveSitemap(context);
