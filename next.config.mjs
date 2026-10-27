/**
 * En-tetes de securite appliques a toutes les reponses.
 *
 * Pas de Content-Security-Policy complete : Next injecte des scripts en ligne
 * qui demanderaient des nonces par requete. On se limite a interdire
 * l'affichage dans un cadre (clickjacking), ce qui est l'essentiel pour une
 * application de gestion.
 */
const ENTETES = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // appareil photo et position : utilises par la saisie des preuves, sur ce site uniquement
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pg` charge des modules optionnels (pg-native) que le bundler ne doit pas suivre.
  serverExternalPackages: ['pg'],
  poweredByHeader: false,

  // Repertoire de construction surchargeable : construire pendant que le
  // serveur de developpement tourne, sans que les deux se marchent dessus
  // dans `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // Les preuves de terrain arrivent par action serveur, limitee a 1 Mo par
  // defaut. Les photos sont reduites dans le navigateur (quelques centaines
  // de Ko chacune), mais sans JavaScript elles partent telles quelles : la
  // limite couvre quelques photos de telephone. Chaque fichier reste plafonne
  // a 8 Mo par l'action elle-meme.
  // Attention : sur Vercel, le corps d'une requete est de toute facon limite a
  // 4,5 Mo par la plateforme (voir docs/mise-en-ligne.md).
  experimental: { serverActions: { bodySizeLimit: '20mb' } },

  async headers() {
    return [{ source: '/:chemin*', headers: ENTETES }];
  },
};

export default nextConfig;
