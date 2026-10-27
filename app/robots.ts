import type { MetadataRoute } from 'next';

/**
 * Seul le formulaire d'inscription a vocation a etre trouve par un moteur de
 * recherche. Le back-office est de toute facon derriere la connexion ; on
 * evite simplement que ses adresses soient listees.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/inscription', disallow: '/' }],
  };
}
