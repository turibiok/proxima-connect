import { une } from '@/lib/db';
import { date, dateHeure } from '@/lib/format';
import { exigerIntervenant } from '@/lib/espace/session';
import { afficherTelephone } from '@/lib/intervenants/regles';
import { finDeCompte } from '@/lib/communication/regles';
import { CRENEAUX, DEPLACEMENTS, JOURS, NIVEAUX_ETUDES, SITUATIONS, STATUTS_PROFIL, libelle, libelleCategorie, type StatutProfil } from '@/lib/referentiel';

export const metadata = { title: 'Mon profil' };

/**
 * Ce que PROXIMA sait de l'intervenant, en lecture (droit d'acces a ses
 * donnees). Le numero de piece et le compte de paiement ne sont montres
 * qu'en partie : un telephone se prete ou se perd.
 */
export default async function ProfilEspace() {
  const i = await exigerIntervenant();
  const p = (await une<Record<string, any>>('SELECT * FROM intervenant WHERE id = $1', [i.id]))!;
  const fin = finDeCompte(p.paiement_compte);

  const blocs: [string, [string, string | null][]][] = [
    ['Identité et coordonnées', [
      ['Nom', `${p.nom} ${p.prenoms}`],
      ['Date de naissance', date(p.date_naissance)],
      ['Téléphone', afficherTelephone(p.telephone)],
      ['WhatsApp', p.whatsapp ? afficherTelephone(p.whatsapp) : 'Même numéro'],
      ['E-mail', p.email],
    ]],
    ['Localisation', [
      ['Ville', [p.ville, p.quartier].filter(Boolean).join(' · ')],
      ['Zones acceptées', p.zones.join(', ')],
      ['Déplacement', p.deplacements.map((d: string) => libelle(DEPLACEMENTS, d)).join(', ')],
    ]],
    ['Profil', [
      ['Niveau d’études', p.niveau_etudes ? libelle(NIVEAUX_ETUDES, p.niveau_etudes) : null],
      ['Situation', p.situation ? libelle(SITUATIONS, p.situation) : null],
      ['Compétences', p.competences.join(', ')],
      ['Langues', p.langues.join(', ')],
    ]],
    ['Disponibilités et missions', [
      ['Jours', p.jours_disponibles.map((j: string) => libelle(JOURS, j)).join(', ')],
      ['Créneaux', p.creneaux.map((c: string) => libelle(CRENEAUX, c)).join(', ')],
      ['Types de missions', p.categories_missions.map(libelleCategorie).join(', ')],
    ]],
    ['Paiement', [
      ['Moyen', p.paiement_mode === 'banque' ? 'Virement bancaire' : p.paiement_mode === 'mobile_money' ? 'Mobile Money' : null],
      [p.paiement_mode === 'banque' ? 'Banque' : 'Opérateur', p.paiement_operateur],
      ['Compte', fin ? `se terminant par ${fin}` : null],
    ]],
  ];

  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-marque-pale px-3 py-2 text-sm text-marque-fonce">
        Une information est inexacte ou a changé (numéro, zone, disponibilités, compte de paiement) ? Prévenez l’équipe PROXIMA, qui la corrigera.
      </p>
      {blocs.map(([titre, lignes]) => (
        <section key={titre} className="carte p-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-encre-douce">{titre}</h2>
          <dl className="space-y-1.5 text-sm">
            {lignes.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-encre-douce">{k}</dt>
                <dd className="text-right">{v || '-'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <section className="carte p-5 text-sm">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-encre-douce">Statut et consentement</h2>
        <p>Statut du profil : <strong>{STATUTS_PROFIL[p.statut as StatutProfil].libelle}</strong></p>
        <p className="mt-1 text-encre-douce">
          Inscrit le {date(p.cree_le)}. Consentement au traitement de vos données donné le {dateHeure(p.consentement_le)} (version {p.consentement_version}).
        </p>
      </section>
    </div>
  );
}
