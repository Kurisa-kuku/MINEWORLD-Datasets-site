import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const rawBase = process.env.BASE_PATH ?? '';
const base = rawBase === '/' ? '/' : rawBase.replace(/\/+$/, '');
const site = (process.env.SITE_URL || 'https://kurisa-kuku.github.io').replace(/\/+$/, '');

export default defineConfig({
  site,
  ...(base && base !== '/' ? { base } : {}),
  trailingSlash: 'always',
  output: 'static',
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          zh: 'zh-CN',
        },
      },
      filter: (page) => !page.includes('/admin/') && !page.includes('/edit/'),
    }),
  ],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
