/**
 * Applique les migrations SQL de db/migrations, dans l'ordre des noms.
 *
 * Chaque fichier est applique dans sa propre transaction et inscrit dans
 * `schema_migrations` : relancer la commande ne rejoue rien, et une migration
 * qui echoue ne laisse pas la base a moitie modifiee.
 *
 *   npm run migrer
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquant (voir .env.example).');
  process.exit(1);
}

const dossier = path.join(import.meta.dirname, '..', 'db', 'migrations');
const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nom text PRIMARY KEY,
    appliquee_le timestamptz NOT NULL DEFAULT now()
  )`);
  const deja = new Set((await client.query('SELECT nom FROM schema_migrations')).rows.map((r) => r.nom));

  let n = 0;
  for (const f of fichiers) {
    if (deja.has(f)) continue;
    process.stdout.write(`-> ${f} ... `);
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(path.join(dossier, f), 'utf8'));
      await client.query('INSERT INTO schema_migrations (nom) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log('ok');
      n++;
    } catch (e) {
      await client.query('ROLLBACK');
      console.log('ECHEC');
      throw e;
    }
  }
  console.log(n ? `${n} migration(s) appliquee(s).` : 'Base deja a jour.');
} finally {
  await client.end();
}
