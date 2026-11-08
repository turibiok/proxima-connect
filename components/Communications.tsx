import Link from 'next/link';
import { dateHeure } from '@/lib/format';
import { afficherTelephone } from '@/lib/intervenants/regles';
import { CANAUX, MODELES, type Canal, type Modele } from '@/lib/communication/regles';

export interface LigneCommunication {
  id: string;
  canal: Canal;
  objet: string;
  contenu: string | null;
  modele: Modele | null;
  sens: 'sortant' | 'entrant';
  mode: 'manuel' | 'automatique';
  numero: string | null;
  statut: string;
  cree_le: Date;
  auteur: string | null;
  mission_id: string | null;
  reference: string | null;
  intervenant_id: string;
  intervenant: string | null;
  erreur: string | null;
  fournisseur_ref: string | null;
}

/** Requete commune : historique d'un intervenant ou d'une mission. */
export const SQL_COMMUNICATIONS = (filtre: 'intervenant' | 'mission') => `
  SELECT c.id, c.canal, c.objet, c.contenu, c.modele, c.sens, c.mode, c.numero, c.statut, c.cree_le, c.erreur, c.fournisseur_ref,
         u.nom_complet AS auteur, c.mission_id, m.reference, c.intervenant_id, i.nom || ' ' || i.prenoms AS intervenant
    FROM communication c
    LEFT JOIN utilisateur u ON u.id = c.auteur_id
    LEFT JOIN mission m ON m.id = c.mission_id
    LEFT JOIN intervenant i ON i.id = c.intervenant_id
   WHERE c.${filtre}_id = $1
   ORDER BY c.cree_le DESC
   LIMIT 100`;

/**
 * Historique des communications (cahier des charges 5.8), le plus recent
 * en tete. `vue` : depuis la fiche intervenant on montre la mission, depuis
 * la mission on montre l'intervenant.
 */
export function HistoriqueCommunications({ lignes, vue }: { lignes: LigneCommunication[]; vue: 'intervenant' | 'mission' }) {
  if (lignes.length === 0) return <p className="text-sm text-encre-douce">Aucun échange pour le moment.</p>;
  return (
    <ol className="space-y-3 text-sm">
      {lignes.map((l) => (
        <li key={l.id} className={`border-l-2 pl-3 ${l.sens === 'entrant' ? 'border-accent' : 'border-marque'}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">
              {l.sens === 'entrant' ? '← ' : '→ '}
              {l.sens === 'entrant' && l.mode === 'automatique' ? l.objet : l.modele ? MODELES[l.modele] : l.objet}
              <span className="font-normal text-encre-douce">
                {' · '}{CANAUX[l.canal] ?? l.canal}
                {vue === 'intervenant' && l.reference && <> · <Link href={`/missions/${l.mission_id}`} className="font-mono text-xs hover:underline">{l.reference}</Link></>}
                {vue === 'mission' && l.intervenant && <> · <Link href={`/intervenants/${l.intervenant_id}`} className="hover:underline">{l.intervenant}</Link></>}
              </span>
            </span>
            <span className="text-xs text-encre-douce">
              {dateHeure(l.cree_le)}
              {l.auteur && ` · ${l.auteur}`}
            </span>
          </div>
          {l.contenu && (
            <details className="mt-0.5">
              <summary className="cursor-pointer truncate text-xs text-encre-douce">{l.contenu.split('\n').slice(0, 2).join(' ')}</summary>
              <p className="mt-1 whitespace-pre-line rounded-lg bg-papier p-2 text-xs">{l.contenu}</p>
            </details>
          )}
          <p className={`text-xs ${l.statut === 'echec' ? 'font-medium text-danger' : 'text-encre-douce'}`}>
            {l.sens === 'entrant'
              ? 'Reçu de l’intervenant'
              : l.modele === 'echange'
                ? 'Échange à l’initiative de PROXIMA'
                : l.mode === 'automatique'
                  ? l.statut === 'echec'
                    ? `Échec de l’envoi automatique : ${l.erreur ?? 'motif inconnu'}`
                    : l.fournisseur_ref?.startsWith('SIMULATION')
                      ? 'Envoi automatique simulé : rien n’est parti'
                      : 'Envoyé automatiquement'
                  : 'Envoyé depuis le téléphone de l’équipe'}
            {l.numero && ` · ${afficherTelephone(l.numero)}`}
          </p>
        </li>
      ))}
    </ol>
  );
}
