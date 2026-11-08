import type { MetadataRoute } from 'next';

/**
 * Manifeste de l'application installable (phase 4 : application mobile).
 * Une meme application pour l'equipe, les intervenants et les clients :
 * /demarrage oriente chacun vers son espace.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PROXIMA CONNECT',
    short_name: 'PROXIMA',
    description: 'Missions terrain, paiements et suivi pour les intervenants, les clients et l’équipe PROXIMA.',
    lang: 'fr',
    start_url: '/demarrage',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f7fb',
    theme_color: '#1d4ed8',
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
