/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pg` charge des modules optionnels (pg-native) que le bundler ne doit pas suivre.
  serverExternalPackages: ['pg'],

  // Les preuves de terrain arrivent par action serveur, limitee a 1 Mo par
  // defaut. Les photos sont reduites dans le navigateur (quelques centaines
  // de Ko chacune), mais sans JavaScript elles partent telles quelles : la
  // limite couvre quelques photos de telephone. Chaque fichier reste plafonne
  // a 8 Mo par l'action elle-meme.
  experimental: { serverActions: { bodySizeLimit: '20mb' } },
};

export default nextConfig;
