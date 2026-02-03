import { writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import https from 'https';

// Backend Sitemap URL
const SITEMAP_URL = 'https://herkeslersoruyor.panalix.com.tr/api/sitemap.xml';

async function fetchAndSaveSitemap() {
    console.log(`⏳ Fetching sitemap from backend: ${SITEMAP_URL}...`);

    // Using a promise wrapper for https.get since standard fetch might depend on node version/env
    const fetchSitemap = (url) => {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`Status Code: ${res.statusCode}`));
                }
                const data = [];
                res.on('data', (chunk) => data.push(chunk));
                res.on('end', () => resolve(Buffer.concat(data).toString()));
            }).on('error', reject);
        });
    };

    try {
        const xmlContent = await fetchSitemap(SITEMAP_URL);

        // Basic validation
        if (!xmlContent.includes('<urlset') && !xmlContent.includes('<sitemapindex')) {
            console.warn('⚠️  Warning: Response does not look like a valid XML sitemap.');
            // Proceeding anyway but logging warning
        }

        const __dirname = dirname(fileURLToPath(import.meta.url));
        const outputPath = join(__dirname, '../public/sitemap.xml');

        await writeFile(outputPath, xmlContent);
        console.log(`🎉 Sitemap successfully fetched and saved to ${outputPath}`);
        console.log(`📦 Size: ${xmlContent.length} bytes`);

    } catch (error) {
        console.error('❌ Error fetching backend sitemap:', error.message);
        console.error('➡️  Ideally, ensure the backend sitemap is deploy/accessible.');
        // We do not exit(1) to avoid breaking builds if the backend currently returns 404
    }
}

fetchAndSaveSitemap();
