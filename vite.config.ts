import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/** Where the game will live. Override at build time: `SITE_URL=https://example.com npm run build`. */
const SITE_URL = (process.env.SITE_URL ?? 'https://lazi-trail.pages.dev').replace(/\/$/, '');

/**
 * Release plumbing that needs the final URL or a build id:
 *  - fills the absolute URLs in index.html (canonical, Open Graph, structured data)
 *  - writes robots.txt and sitemap.xml
 *  - stamps the service worker with a build id so each release gets a fresh cache
 */
function release(): Plugin {
  let outDir = 'dist';
  return {
    name: 'lazi-trail-release',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', SITE_URL),
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
      });
    },
    closeBundle() {
      const sw = path.join(outDir, 'sw.js');
      if (!fs.existsSync(sw)) return;
      const build = Date.now().toString(36);
      fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replaceAll('__BUILD_ID__', build));
    },
  };
}

export default defineConfig({
  plugins: [release()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Three.js is the bulk of the bundle and rarely changes: its own cacheable file.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
