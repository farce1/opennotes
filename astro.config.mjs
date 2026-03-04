// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://opennotes.app',
  integrations: [
    starlight({
      title: 'openNotes',
      logo: {
        light: './src/assets/logo-dark.svg',
        dark: './src/assets/logo-light.svg',
        replacesTitle: false,
      },
      head: [
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://opennotes.app/og-default.svg',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image:width',
            content: '1200',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image:height',
            content: '630',
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:image',
            content: 'https://opennotes.app/og-default.svg',
          },
        },
      ],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/nicodeforge/opennotes',
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started' },
            { label: 'Installation', slug: 'installation' },
            { label: 'Quick Start', slug: 'quick-start' },
          ],
        },
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' },
        },
      ],
      customCss: ['./src/styles/global.css', './src/styles/custom.css'],
    }),
    react(),
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
