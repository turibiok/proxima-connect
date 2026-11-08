import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exiger } from '@/lib/auth/session';
import { requete, une } from '@/lib/db';
import { consigner, LIBELLES_ACTIONS } from '@/lib/journal';
import {
  afficherTelephone,
  ageRevolu,
  controles,
  lienWhatsApp,
  transitionsPossibles,
  verificationComplete,
} from '@/lib/intervenants/regles';
import {
  CRENEAUX,
  DEPLACEMENTS,
  JOURS,
  NIVEAUX_ETUDES,
  PIECES,
  SITUATIONS,
  STATUTS_PROFIL,
  libelle,
  libelleCategorie,
  type StatutProfil,
} from '@/lib/referentiel';
import { PuceStatut } from '@/components/Statut';
import { ChangementStatut, Controles } from './Verification';
import { SectionScore } from './Score';
import { ConsignerEchange } from './Echange';
import { GestionEspace } from './Espace';
import { etatEspace } from '@/lib/espace/actions';
import { etatLien } from '@/lib/espace/regles';
import { Envoi } from '@/components/Envoi';
import { HistoriqueCommunications, SQL_COMMUNICATIONS, type LigneCommunication } from '@/components/Communications';

export const metadata = { title: 'Fiche intervenant' };

const date = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Porto-Novo' }) : null;
const dateHeure = (d: Date | string) =>
  new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Porto-Novo' });

export default async function FicheIntervenant({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exiger('profil:lire');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const p = await une<Record<string, any>>(
    `SELECT i.*, ui.nom_complet AS identite_par, ut.nom_complet AS telephone_par, up.nom_complet AS paiement_par
       FROM intervenant i
       LEFT JOIN utilisateur ui ON ui.id = i.identite_verifiee_par
       LEFT JOIN utilisateur ut ON ut.id = i.telephone_verifie_par
       LEFT JOIN utilisateur up ON up.id = i.paiement_verifie_par
      WHERE i.id = $1`,
    [id],
  );
  if (!p) notFound();

  const sensible = ctx.peut('profil:sensible');
  if (sensible) {
    // Une ligne par personne et par quart d'heure : assez pour savoir qui a
    // consulte quoi, sans noyer le journal a chaque rechargement.
    const recente = await une(
      `SELECT 1 FROM journal WHERE utilisateur_id = $1 AND entite_id = $2 AND action = 'consultation_sensible'
          AND cree_le > now() - interval '15 minutes'`,
      [ctx.utilisateur.id, id],
    );
    if (!recente) await consigner({ utilisateurId: ctx.utilisateur.id, action: 'consultation_sensible', entite: 'intervenant', entiteId: id });
  }

  const [missions, historique, communications, espace] = await Promise.all([
    requete<{ id: string; reference: string; titre: string; statut: string; role: string; reponse: string; presence: string | null; date_debut: string | null }>(
      `SELECT m.id, m.reference, m.titre, m.statut, a.role, a.reponse, a.presence, m.date_debut
         FROM affectation a JOIN mission m ON m.id = a.mission_id
        WHERE a.intervenant_id = $1 ORDER BY m.date_debut DESC NULLS LAST`,
      [id],
    ),
    requete<{ action: string; details: any; cree_le: Date; auteur: string | null }>(
      `SELECT j.action, j.details, j.cree_le, u.nom_complet AS auteur
         FROM journal j LEFT JOIN utilisateur u ON u.id = j.utilisateur_id
        WHERE j.entite = 'intervenant' AND j.entite_id = $1 AND j.action <> 'consultation_sensible'
        ORDER BY j.cree_le DESC LIMIT 30`,
      [id],
    ),
    requete<LigneCommunication>(SQL_COMMUNICATIONS('intervenant'), [id]),
    etatEspace(id),
  ]);
  const lienEspace = espace?.dernier_lien
    ? etatLien({ expire_le: espace.lien_expire!, utilise_le: espace.lien_utilise, revoque_le: espace.lien_revoque, echecs: espace.echecs ?? 0 })
    : null;
  const ecrire = ctx.peut('mission:modifier') || ctx.peut('profil:modifier');

  const maintenant = new Date();
  const liste = controles(p as any, maintenant).map((c) => ({
    ...c,
    par: c.code === 'identite' ? p.identite_par : c.code === 'telephone' ? p.telephone_par : c.code === 'paiement' ? p.paiement_par : null,
    le: date(c.code === 'identite' ? p.identite_verifiee_le : c.code === 'telephone' ? p.telephone_verifie_le : c.code === 'paiement' ? p.paiement_verifie_le : null),
  }));
  const complet = verificationComplete(p as any, maintenant);
  const statut = p.statut as StatutProfil;

  return (
    <div className="space-y-5">
      <Link href="/intervenants" className="text-sm text-marque hover:underline">← Intervenants</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{p.nom} {p.prenoms}</h1>
            <PuceStatut statut={statut} />
          </div>
          <p className="mt-1 text-sm text-encre-douce">
            <span className="font-mono">{p.reference}</span> · {ageRevolu(p.date_naissance, maintenant)} ans · inscrit le {date(p.cree_le)}
            {p.source === 'saisie_interne' ? ' (saisie par l’équipe)' : ' (formulaire en ligne)'}
          </p>
          {p.statut_motif && (statut === 'suspendu' || statut === 'inactif' || statut === 'en_attente') && (
            <p className="mt-2 rounded-lg bg-alerte-pale px-3 py-1.5 text-sm text-alerte">Motif : {p.statut_motif}</p>
          )}
        </div>
        <div className="flex gap-2">
          <a href={`tel:${p.telephone}`} className="btn">Appeler</a>
          <a href={lienWhatsApp(p.whatsapp ?? p.telephone)} target="_blank" rel="noreferrer" className="btn">WhatsApp</a>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Bloc titre="Coordonnées et localisation">
            <Infos
              lignes={[
                ['Téléphone', afficherTelephone(p.telephone)],
                ['WhatsApp', p.whatsapp ? afficherTelephone(p.whatsapp) : 'Même numéro'],
                ['E-mail', p.email],
                ['Ville', [p.ville, p.quartier].filter(Boolean).join(' · ')],
                ['Département', p.departement ? `${p.departement}${p.commune && p.commune !== p.ville ? ` (commune de ${p.commune})` : ''}` : 'Ville non reconnue : vérifiez l’orthographe'],
                ['Zones acceptées', p.zones.join(', ')],
                ['Déplacement', p.deplacements.map((d: string) => libelle(DEPLACEMENTS, d)).join(', ')],
              ]}
            />
          </Bloc>

          <Bloc titre="Profil">
            <Infos
              lignes={[
                ['Situation', libelle(SITUATIONS, p.situation)],
                ['Niveau d’études', libelle(NIVEAUX_ETUDES, p.niveau_etudes)],
                ['Formation', p.formation],
                ['Compétences', p.competences.join(', ')],
                ['Langues', p.langues.join(', ')],
                ['Expériences', p.experiences],
              ]}
            />
          </Bloc>

          <Bloc titre="Disponibilités et missions">
            <Infos
              lignes={[
                ['Jours', p.jours_disponibles.map((j: string) => libelle(JOURS, j)).join(', ')],
                ['Créneaux', p.creneaux.map((c: string) => libelle(CRENEAUX, c)).join(', ')],
                ['Types de missions', p.categories_missions.map(libelleCategorie).join(', ')],
              ]}
            />
          </Bloc>

          <Bloc titre={`Historique des missions (${missions.length})`}>
            {missions.length === 0 ? (
              <p className="text-sm text-encre-douce">Aucune mission pour le moment.</p>
            ) : (
              <ul className="divide-y divide-trait text-sm">
                {missions.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 py-2">
                    <Link href={`/missions/${m.id}`} className="hover:underline">
                      <span className="font-mono text-xs">{m.reference}</span> {m.titre}
                      {m.role === 'remplacant' && <span className="text-encre-douce"> (réserve)</span>}
                    </Link>
                    <span className="whitespace-nowrap text-encre-douce">
                      {m.presence
                        ? { present: 'Présent', retard: 'En retard', absent: 'Absent' }[m.presence]
                        : { en_attente: 'Proposée', accepte: 'Acceptée', refuse: 'Refusée' }[m.reponse]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Bloc>

          <Bloc titre={`Communications (${communications.length})`}>
            {ecrire && (
              <div className="mb-4 grid gap-3 border-b border-trait pb-4">
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-marque">Écrire à {p.prenoms.split(/\s+/)[0]}</summary>
                  <Envoi
                    cible={{ intervenantId: id }}
                    modele="libre"
                    telephone={p.telephone}
                    whatsapp={p.whatsapp}
                    texte={`Bonjour ${p.prenoms.split(/\s+/)[0]},\n\n\nPROXIMA CONNECT`}
                  />
                </details>
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-marque">Consigner un appel ou un message reçu</summary>
                  <ConsignerEchange intervenantId={id} missions={missions.map((m) => ({ id: m.id, reference: m.reference, titre: m.titre }))} />
                </details>
              </div>
            )}
            <HistoriqueCommunications lignes={communications} vue="intervenant" />
          </Bloc>

          <SectionScore intervenantId={id} score={p.score} ctx={ctx} />
        </div>

        <div className="space-y-5">
          <Bloc titre="Vérification">
            <Controles id={id} controles={liste} modifiable={ctx.peut('profil:verifier')} />
          </Bloc>

          {ctx.peut('profil:verifier') && (
            <Bloc titre="Statut du profil">
              <p className="mb-3 text-sm text-encre-douce">
                Actuellement <strong>{STATUTS_PROFIL[statut].libelle.toLowerCase()}</strong> depuis le {date(p.statut_change_le)}.
              </p>
              <ChangementStatut id={id} possibles={transitionsPossibles(statut)} verificationComplete={complet} />
            </Bloc>
          )}

          <Bloc titre="Pièce et paiement">
            {sensible ? (
              <Infos
                lignes={[
                  ['Pièce', p.piece_type ? `${libelle(PIECES, p.piece_type)}${p.piece_numero ? ` n° ${p.piece_numero}` : ''}` : null],
                  ['Paiement', p.paiement_mode === 'banque' ? 'Virement bancaire' : p.paiement_mode === 'mobile_money' ? 'Mobile Money' : null],
                  [p.paiement_mode === 'banque' ? 'Banque' : 'Opérateur', p.paiement_operateur],
                  ['Compte', p.paiement_mode === 'mobile_money' ? afficherTelephone(p.paiement_compte) : p.paiement_compte],
                ]}
              />
            ) : (
              <p className="text-sm text-encre-douce">Données réservées aux rôles habilités.</p>
            )}
          </Bloc>

          <Bloc titre="Espace intervenant">
            <p className="mb-3 text-sm">
              {statut === 'inactif'
                ? 'Profil inactif : pas d’accès à l’espace.'
                : espace?.sessions
                  ? `Connecté sur ${espace.sessions} téléphone${espace.sessions > 1 ? 's' : ''}${espace.derniere_visite ? `, dernière visite le ${dateHeure(espace.derniere_visite)}` : ''}.`
                  : 'Aucun téléphone connecté.'}
              {espace?.dernier_lien && (
                <span className="block text-xs text-encre-douce">
                  Dernier lien préparé le {dateHeure(espace.dernier_lien)} :{' '}
                  {{ valide: 'pas encore utilisé', utilise: `utilisé le ${dateHeure(espace.lien_utilise!)}`, expire: 'expiré', revoque: 'annulé' }[lienEspace!]}.
                </span>
              )}
            </p>
            {statut !== 'inactif' && (ctx.peut('profil:modifier') || ctx.peut('mission:modifier')) && (
              <GestionEspace intervenantId={id} telephone={p.telephone} whatsapp={p.whatsapp} sessions={espace?.sessions ?? 0} />
            )}
            <p className="mt-2 text-xs text-encre-douce">L’intervenant y consulte ses missions, ses paiements, son score et son profil, sans rien pouvoir modifier.</p>
          </Bloc>

          <Bloc titre="PROXIMA SCORE">
            <p className="text-3xl font-bold tabular-nums">{p.score === null ? '-' : Math.round(p.score)}</p>
            <a href="#score" className="text-xs text-marque hover:underline">Détail, évolution et évaluations</a>
          </Bloc>

          <Bloc titre="Consentement">
            <p className="text-sm">
              Donné le {dateHeure(p.consentement_le)}
              <span className="block text-xs text-encre-douce">Version du texte : {p.consentement_version}</span>
            </p>
          </Bloc>

          <Bloc titre="Historique">
            <ol className="space-y-2 text-sm">
              {historique.map((h, i) => (
                <li key={i}>
                  <div className="font-medium">
                    {LIBELLES_ACTIONS[h.action] ?? h.action}
                    {h.action === 'statut' && h.details && ` : ${STATUTS_PROFIL[h.details.vers as StatutProfil]?.libelle}`}
                    {h.action === 'controle' && h.details &&
                      ` : ${liste.find((c) => c.code === h.details.controle)?.libelle.toLowerCase() ?? h.details.controle} ${h.details.valide ? 'validé' : 'annulé'}`}
                  </div>
                  <div className="text-xs text-encre-douce">
                    {dateHeure(h.cree_le)} · {h.auteur ?? 'Intervenant (en ligne)'}
                    {h.details?.motif && ` · « ${h.details.motif} »`}
                  </div>
                </li>
              ))}
            </ol>
          </Bloc>
        </div>
      </div>
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="carte p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-encre-douce">{titre}</h2>
      {children}
    </section>
  );
}

function Infos({ lignes }: { lignes: [string, string | null | undefined][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
      {lignes.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-encre-douce">{k}</dt>
          <dd className="mb-1 whitespace-pre-line sm:mb-0">{v || '-'}</dd>
        </div>
      ))}
    </dl>
  );
}
