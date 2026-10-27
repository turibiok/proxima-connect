/**
 * Cree le premier administrateur d'une base (ou reinitialise son mot de passe).
 *
 *   npm run creer-admin -- --email direction@proxima.bj --nom "Prénom Nom"
 *   npm run creer-admin:prod -- --email ... --nom ...        (base de production)
 *   ... --reinitialiser                                       (compte existant)
 *
 * Le mot de passe est genere ici, affiche une seule fois dans le terminal, et
 * marque provisoire : l'application exige de le remplacer a la premiere
 * connexion. Il n'est ecrit nulle part ailleurs — ni fichier, ni variable
 * d'environnement de l'hebergeur.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { hacher } from '../lib/auth/mot-de-passe.ts';

const { values: o } = parseArgs({
  options: {
    email: { type: 'string' },
    nom: { type: 'string', default: 'Administrateur' },
    reinitialiser: { type: 'boolean', default: false },
  },
});

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquant.');
  process.exit(1);
}
const email = (o.email ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Indiquez une adresse valide : --email prenom.nom@proxima.bj');
  process.exit(1);
}

// lisible au telephone : ni 0/O ni 1/l ; les trois classes exigees y figurent
const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const brut = [...randomBytes(14)].map((b) => alphabet[b % alphabet.length]).join('');
const motDePasse = `${brut.slice(0, 5)}-${brut.slice(5, 10)}-${brut.slice(10)}7Qa`;
const { hash, sel } = hacher(motDePasse);

const hote = new URL(url).hostname;
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const colonne = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'utilisateur' AND column_name = 'mdp_provisoire'`);
  if (!colonne.rowCount) {
    console.error('Base pas a jour : lancez d’abord les migrations (npm run migrer ou migrer:prod).');
    process.exit(1);
  }

  const existant = await client.query('SELECT id FROM utilisateur WHERE email = $1', [email]);
  if (existant.rowCount && !o.reinitialiser) {
    console.error(`Le compte ${email} existe deja. Ajoutez --reinitialiser pour lui donner un nouveau mot de passe provisoire.`);
    process.exit(1);
  }
  if (!existant.rowCount && o.reinitialiser) {
    console.error(`Aucun compte ${email} a reinitialiser.`);
    process.exit(1);
  }

  if (existant.rowCount) {
    await client.query('UPDATE utilisateur SET mot_de_passe = $2, sel = $3, mdp_provisoire = true, actif = true WHERE email = $1', [email, hash, sel]);
    await client.query('DELETE FROM session WHERE utilisateur_id = $1', [existant.rows[0].id]);
  } else {
    await client.query(
      `INSERT INTO utilisateur (email, nom_complet, role, mot_de_passe, sel, mdp_provisoire) VALUES ($1, $2, 'admin', $3, $4, true)`,
      [email, o.nom, hash, sel],
    );
  }
  await client.query(
    `INSERT INTO journal (action, entite, details) VALUES ($1, 'utilisateur', $2)`,
    [existant.rowCount ? 'compte_reinitialisation' : 'compte_creation', JSON.stringify({ email, role: 'admin', origine: 'script creer-admin' })],
  );

  console.log('');
  console.log(`  Base        : ${hote}`);
  console.log(`  Compte      : ${email} (administrateur)${existant.rowCount ? ' — mot de passe reinitialise' : ''}`);
  console.log(`  Provisoire  : ${motDePasse}`);
  console.log('');
  console.log('  Ce mot de passe ne sera plus affiche. Il devra etre remplace a la premiere connexion.');
  console.log('');
} finally {
  await client.end();
}
