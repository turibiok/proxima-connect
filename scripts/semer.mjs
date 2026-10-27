/**
 * Prepare une base neuve.
 *
 *   npm run semer            -> cree le premier administrateur (ADMIN_EMAIL / ADMIN_MOT_DE_PASSE)
 *   npm run semer -- --demo  -> ajoute en plus des profils FICTIFS pour essayer les ecrans
 *
 * Sans effet si l'administrateur existe deja ; les profils de demonstration
 * ne sont ajoutes que si la table des intervenants est vide.
 */
import pg from 'pg';
import { hacher, robustesse } from '../lib/auth/mot-de-passe.ts';

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_MOT_DE_PASSE } = process.env;
if (!DATABASE_URL) {
  console.error('DATABASE_URL manquant (voir .env.example).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  // ------------------------------------------------------------ administrateur
  const email = (ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!email || !ADMIN_MOT_DE_PASSE) {
    console.log('ADMIN_EMAIL / ADMIN_MOT_DE_PASSE absents : aucun administrateur cree.');
  } else if ((await client.query('SELECT 1 FROM utilisateur WHERE email = $1', [email])).rowCount) {
    console.log(`Administrateur ${email} deja present.`);
  } else {
    const problemes = robustesse(ADMIN_MOT_DE_PASSE);
    if (problemes.length) {
      console.error(`Mot de passe administrateur trop faible : ${problemes.join(' ')}`);
      process.exit(1);
    }
    const { hash, sel } = hacher(ADMIN_MOT_DE_PASSE);
    await client.query(
      `INSERT INTO utilisateur (email, nom_complet, role, mot_de_passe, sel) VALUES ($1, 'Administrateur', 'admin', $2, $3)`,
      [email, hash, sel],
    );
    console.log(`Administrateur ${email} cree.`);
  }

  // ------------------------------------------------------------ demonstration
  if (process.argv.includes('--demo')) {
    const n = (await client.query('SELECT count(*)::int n FROM intervenant')).rows[0].n;
    if (n > 0) {
      console.log(`${n} intervenant(s) deja en base : profils de demonstration non ajoutes.`);
    } else {
      // Noms, numeros et comptes inventes. Les numeros sont dans une plage
      // (01 00 00 ..) qui n'est attribuee a aucun abonne.
      const demo = [
        ['HOUNGBO', 'Afi Mireille', 'F', '2002-03-14', 'Cotonou', 'Akpakpa', ['Akpakpa', 'Cadjèhoun'], ['distribution', 'promotion'], ['sam', 'dim'], 'actif', 78],
        ['AGOSSOU', 'Koffi Serge', 'M', '1998-11-02', 'Cotonou', 'Fidjrossè', ['Fidjrossè', 'Agla'], ['commercial', 'enquetes'], ['lun', 'mar', 'mer'], 'actif', 85],
        ['DOSSOU', 'Rachida', 'F', '2004-06-21', 'Abomey-Calavi', 'Godomey', ['Godomey', 'Calavi'], ['enquetes'], ['sam'], 'verifie', null],
        ['SOGLO', 'Mathieu', 'M', '2000-01-30', 'Porto-Novo', 'Ouando', ['Porto-Novo'], ['controle', 'enquetes'], ['jeu', 'ven'], 'en_attente', null],
        ['ADJOVI', 'Prisca', 'F', '2003-09-09', 'Cotonou', 'Gbégamey', ['Gbégamey', 'Zogbo'], ['promotion'], ['ven', 'sam', 'dim'], 'en_attente', null],
        ['KPADONOU', 'Éric', 'M', '1995-04-17', 'Parakou', 'Banikanni', ['Parakou'], ['distribution', 'speciales'], ['lun', 'sam'], 'actif', 64],
        ['ZINSOU', 'Laure', 'F', '2001-12-05', 'Cotonou', 'Cadjèhoun', ['Cadjèhoun', 'Haie Vive'], ['commercial'], ['mar', 'jeu'], 'suspendu', 41],
        ['TOSSOU', 'Gildas', 'M', '1999-07-28', 'Sèmè-Podji', 'Ekpè', ['Ekpè', 'Akpakpa'], ['distribution'], ['sam', 'dim'], 'en_attente', null],
        ['HOUNKPATIN', 'Nadège', 'F', '2005-02-11', 'Abomey-Calavi', 'Akassato', ['Calavi'], ['enquetes', 'speciales'], ['mer', 'sam'], 'en_attente', null],
        ['GANDONOU', 'Brice', 'M', '1997-10-03', 'Bohicon', 'Centre', ['Bohicon', 'Abomey'], ['controle'], ['lun', 'mar', 'mer', 'jeu', 'ven'], 'verifie', null],
      ];
      let i = 0;
      for (const [nom, prenoms, sexe, naissance, ville, quartier, zones, categories, jours, statut, score] of demo) {
        i++;
        const tel = `+229010000${String(i).padStart(4, '0')}`;
        const verifie = statut !== 'en_attente';
        await client.query(
          `INSERT INTO intervenant (nom, prenoms, sexe, date_naissance, telephone, ville, quartier, zones,
             categories_missions, jours_disponibles, creneaux, langues, competences, situation, niveau_etudes,
             paiement_mode, paiement_operateur, paiement_compte,
             identite_verifiee_le, telephone_verifie_le, paiement_verifie_le,
             consentement_le, consentement_version, statut, statut_motif, score, cree_le)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{matin,apres_midi}','{Français,Fon}','{Vente,Animation}',
             'etudiant','licence','mobile_money','MTN MoMo',$5,
             $11,$11,$11, now() - make_interval(days => $12), 'demo', $13, $14, $15, now() - make_interval(days => $12))`,
          [nom, prenoms, sexe, naissance, tel, ville, quartier, zones, categories, jours,
           verifie ? new Date() : null, 40 - i * 3, statut, statut === 'suspendu' ? 'Absence non justifiée (démo)' : null, score],
        );
      }
      console.log(`${demo.length} profils de demonstration ajoutes.`);
    }
  }
} finally {
  await client.end();
}
