import Link from 'next/link';
import { exiger } from '@/lib/auth/session';
import { requete, une } from '@/lib/db';
import { consigner } from '@/lib/journal';
import { dateHeure } from '@/lib/format';
import { formaterFCFA } from '@/lib/clients/regles';
import { afficherTelephone } from '@/lib/intervenants/regles';
import {
  DELAI_PAIEMENT,
  delaiPaiement,
  libelleDuree,
  MODES_PAIEMENT,
  modeParDefaut,
  versSaisieDateHeure,
  type ModePaiement,
  type StatutPaiement,
} from '@/lib/finances/regles';
import { PucePaiement } from '@/components/Statut';
import { ActionsPaiement } from './Actions';
import { Envoi } from '@/components/Envoi';
import { messageConfirmationPaiement } from '@/lib/communication/regles';

export const metadata = { title: 'Paiements des intervenants' };

const FILTRES: { code: string; libelle: string; statuts: StatutPaiement[] }[] = [
  { code: 'a_payer', libelle: 'À verser', statuts: ['a_payer'] },
  { code: 'en_litige', libelle: 'En litige', statuts: ['en_litige'] },
  { code: 'paye', libelle: 'Payés', statuts: ['paye'] },
  { code: 'tous', libelle: 'Tous', statuts: ['a_payer', 'en_litige', 'paye'] },
];

interface Ligne {
  id: string;
  statut: StatutPaiement;
  montant_fcfa: number;
  montant_initial_fcfa: number | null;
  du_depuis: Date;
  paye_le: Date | null;
  mode: ModePaiement | null;
  reference_transaction: string | null;
  compte_beneficiaire: string | null;
  operateur: string | null;
  litige_motif: string | null;
  litige_resolution: string | null;
  intervenant_id: string;
  nom: string;
  prenoms: string;
  ref_intervenant: string;
  paiement_mode: string | null;
  paiement_operateur: string | null;
  paiement_compte: string | null;
  mission_id: string;
  reference: string;
  titre: string;
  paye_par: string | null;
  telephone: string;
  whatsapp: string | null;
  confirme_le: Date | null;
}

export default async function Paiements({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const ctx = await exiger('finance:lire');
  const { statut = 'a_payer' } = await searchParams;
  const actif = FILTRES.find((f) => f.code === statut) ?? FILTRES[0];
  const sensible = ctx.peut('profil:sensible');
  const gestion = ctx.peut('paiement:gerer');

  const [lignes, comptes] = await Promise.all([
    requete<Ligne>(
      `SELECT p.id, p.statut, p.montant_fcfa, p.montant_initial_fcfa, p.du_depuis, p.paye_le, p.mode, p.reference_transaction,
              p.compte_beneficiaire, p.operateur, p.litige_motif, p.litige_resolution,
              i.id AS intervenant_id, i.nom, i.prenoms, i.reference AS ref_intervenant,
              i.paiement_mode, i.paiement_operateur, i.paiement_compte,
              m.id AS mission_id, m.reference, m.titre, u.nom_complet AS paye_par, i.telephone, i.whatsapp,
              (SELECT max(c.cree_le) FROM communication c WHERE c.paiement_id = p.id AND c.modele = 'paiement') AS confirme_le
         FROM paiement_intervenant p
         JOIN intervenant i ON i.id = p.intervenant_id
         JOIN mission m ON m.id = p.mission_id
         LEFT JOIN utilisateur u ON u.id = p.paye_par
        WHERE p.statut = ANY ($1)
        ORDER BY CASE WHEN p.statut = 'paye' THEN 1 ELSE 0 END, (CASE WHEN p.statut = 'paye' THEN p.paye_le END) DESC, p.du_depuis
        LIMIT 300`,
      [actif.statuts],
    ),
    requete<{ statut: StatutPaiement; n: number; total: number }>(
      'SELECT statut, count(*)::int AS n, sum(montant_fcfa)::bigint AS total FROM paiement_intervenant GROUP BY statut',
    ),
  ]);

  // les comptes de paiement sont des donnees sensibles (8.1) : leur consultation est tracee, une fois par heure au plus
  if (sensible && lignes.length) {
    const recente = await une(
      `SELECT 1 FROM journal WHERE utilisateur_id = $1 AND action = 'consultation_paiements' AND cree_le > now() - interval '1 hour' LIMIT 1`,
      [ctx.utilisateur.id],
    );
    if (!recente) await consigner({ utilisateurId: ctx.utilisateur.id, action: 'consultation_paiements', entite: 'paiement', details: { filtre: actif.code } });
  }

  const nombre = (statuts: StatutPaiement[]) => comptes.filter((c) => statuts.includes(c.statut)).reduce((t, c) => t + c.n, 0);
  const totalAVerser = comptes.filter((c) => c.statut !== 'paye').reduce((t, c) => t + c.total, 0);
  const maintenant = versSaisieDateHeure(new Date());

  const compte = (l: Ligne) => {
    if (!sensible) return 'Masqué';
    const mode = l.statut === 'paye' ? l.mode : l.paiement_mode === 'banque' ? 'virement' : l.paiement_mode ? 'mobile_money' : null;
    const numero = l.statut === 'paye' ? l.compte_beneficiaire : l.paiement_compte;
    const op = l.statut === 'paye' ? l.operateur : l.paiement_operateur;
    if (l.statut === 'paye' && l.mode === 'especes') return 'Espèces, contre reçu';
    if (!numero) return 'Aucun compte sur la fiche';
    return `${op ? `${op} · ` : ''}${mode === 'mobile_money' ? afficherTelephone(numero) : numero}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {FILTRES.map((f) => (
            <Link
              key={f.code}
              href={`/finances/paiements?statut=${f.code}`}
              className={`rounded-full border px-3 py-1 ${actif.code === f.code ? 'border-marque bg-marque-pale font-semibold' : 'border-trait bg-white'}`}
            >
              {f.libelle} <span className="text-encre-douce">{nombre(f.statuts)}</span>
            </Link>
          ))}
        </div>
        <p className="text-sm text-encre-douce">
          Reste à verser : <strong className="text-encre">{formaterFCFA(totalAVerser)}</strong> · objectif : payer sous {DELAI_PAIEMENT.cible} à {DELAI_PAIEMENT.limite} h après la validation de la mission
        </p>
      </div>

      {lignes.length === 0 ? (
        <div className="carte p-10 text-center text-sm text-encre-douce">
          {actif.code === 'a_payer'
            ? 'Aucun paiement à verser. Les paiements naissent quand une mission passe à l’étape « Contrôlée ».'
            : 'Aucun paiement dans cette catégorie.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {lignes.map((l) => {
            const d = delaiPaiement(l.du_depuis, l.paye_le);
            const tonDelai = d.niveau === 'retard' ? 'text-danger' : d.niveau === 'attention' ? 'text-alerte' : 'text-ok';
            return (
              <li key={l.id} className="carte p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/intervenants/${l.intervenant_id}`} className="font-semibold text-marque-fonce hover:underline">{l.nom} {l.prenoms}</Link>
                    <span className="ml-2 font-mono text-xs text-encre-douce">{l.ref_intervenant}</span>
                    <div className="text-sm text-encre-douce">
                      <Link href={`/missions/${l.mission_id}`} className="hover:underline"><span className="font-mono text-xs">{l.reference}</span> {l.titre}</Link>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold tabular-nums">{formaterFCFA(l.montant_fcfa)}</div>
                    {l.montant_initial_fcfa !== null && l.montant_initial_fcfa !== l.montant_fcfa && (
                      <div className="text-xs text-encre-douce line-through">{formaterFCFA(l.montant_initial_fcfa)}</div>
                    )}
                    <PucePaiement statut={l.statut} />
                  </div>
                </div>

                <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-encre-douce">Mission validée</dt>
                    <dd>{dateHeure(l.du_depuis)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-encre-douce">{l.statut === 'paye' ? 'Payé en' : 'En attente depuis'}</dt>
                    <dd className={`font-semibold ${tonDelai}`}>{libelleDuree(d.heures)}{d.niveau === 'retard' && ' (au-delà de 72 h)'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-encre-douce">{l.statut === 'paye' ? 'Compte crédité' : 'Compte à créditer'}</dt>
                    <dd className={sensible ? '' : 'text-encre-douce'}>{compte(l)}</dd>
                  </div>
                </dl>

                {l.statut === 'paye' && (
                  <p className="mt-2 text-xs text-encre-douce">
                    {l.mode && MODES_PAIEMENT[l.mode]} le {dateHeure(l.paye_le!)} · réf. <span className="font-mono">{l.reference_transaction}</span>
                    {l.paye_par && ` · par ${l.paye_par}`}
                  </p>
                )}
                {l.statut === 'paye' && (l.confirme_le ? (
                  <p className="mt-1 text-xs text-ok">Confirmation envoyée à l’intervenant le {dateHeure(l.confirme_le)}.</p>
                ) : gestion ? (
                  <details className="mt-2 border-t border-trait pt-2 text-sm">
                    <summary className="cursor-pointer text-xs font-medium text-marque">Confirmer le paiement à l’intervenant</summary>
                    <Envoi
                      cible={{ intervenantId: l.intervenant_id, paiementId: l.id }}
                      modele="paiement"
                      telephone={l.telephone}
                      whatsapp={l.whatsapp}
                      texte={messageConfirmationPaiement({
                        prenoms: l.prenoms, montant: l.montant_fcfa, titre: l.titre, reference: l.reference,
                        mode: l.mode ?? 'mobile_money', referenceTransaction: l.reference_transaction ?? '', compte: l.compte_beneficiaire,
                      })}
                    />
                  </details>
                ) : (
                  <p className="mt-1 text-xs text-alerte">Confirmation pas encore envoyée à l’intervenant.</p>
                ))}
                {l.statut === 'en_litige' && <p className="mt-2 rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">Litige : {l.litige_motif}</p>}
                {l.statut !== 'en_litige' && l.litige_resolution && <p className="mt-2 text-xs text-encre-douce">Litige levé : {l.litige_resolution}</p>}

                {gestion && l.statut !== 'paye' && (
                  <ActionsPaiement
                    id={l.id}
                    statut={l.statut}
                    modeDefaut={modeParDefaut(l.paiement_mode)}
                    maintenant={maintenant}
                    montant={l.montant_fcfa}
                    sansCompte={!l.paiement_compte}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
