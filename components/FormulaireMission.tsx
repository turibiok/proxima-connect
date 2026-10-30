'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { enregistrerMission, type EtatFormulaire } from '@/lib/missions/actions';
import { CATEGORIES_MISSIONS, COMPETENCES } from '@/lib/referentiel';
import { BandeauErreurs, Champ, Section } from './Champs';

export function FormulaireMission({
  missionId,
  briefId,
  clients,
  responsables,
  initiales = {},
  annuler,
}: {
  missionId: string | null;
  briefId: string | null;
  /** Fourni seulement quand le client est a choisir (creation sans brief). */
  clients?: { id: string; raison_sociale: string }[];
  responsables: { id: string; nom_complet: string }[];
  initiales?: Record<string, string>;
  annuler: string;
}) {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(enregistrerMission.bind(null, missionId, briefId), null);
  const e = etat?.erreurs ?? {};
  const val = (k: string) => {
    const v = etat ? etat.valeurs[k] : initiales[k];
    return typeof v === 'string' ? v : '';
  };

  return (
    <form action={action} key={etat ? JSON.stringify(etat.valeurs) : 'initial'} className="space-y-5" noValidate>
      {/* la cle reconstruit le formulaire apres un refus : React remet les champs texte
          a leur defaultValue, mais pas les listes deroulantes */}
      <BandeauErreurs erreurs={e} />
      {e.general && <p className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{e.general}</p>}

      <Section numero={1} titre="Mission">
        {clients ? (
          <Champ nom="client_id" libelle="Client" erreur={e.client_id}>
            <select id="client_id" name="client_id" defaultValue={val('client_id')} className="champ" required>
              <option value="">Choisir…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.raison_sociale}</option>)}
            </select>
          </Champ>
        ) : (
          <input type="hidden" name="client_id" value={val('client_id')} />
        )}
        <Champ nom="titre" libelle="Titre" erreur={e.titre}>
          <input id="titre" name="titre" defaultValue={val('titre')} className="champ" required />
        </Champ>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="type_mission" libelle="Type de mission" erreur={e.type_mission}>
            <select id="type_mission" name="type_mission" defaultValue={val('type_mission')} className="champ" required>
              <option value="">Choisir dans le catalogue…</option>
              {CATEGORIES_MISSIONS.map((c) => (
                <optgroup key={c.code} label={c.libelle}>
                  {c.types.map((t) => <option key={t} value={`${c.code}::${t}`}>{t}</option>)}
                  <option value={`${c.code}::`}>Autre ({c.libelle.toLowerCase()})</option>
                </optgroup>
              ))}
            </select>
          </Champ>
          <Champ nom="responsable_id" libelle="Chargé(e) de mission" facultatif>
            <select id="responsable_id" name="responsable_id" defaultValue={val('responsable_id')} className="champ">
              <option value="">Non attribué</option>
              {responsables.map((r) => <option key={r.id} value={r.id}>{r.nom_complet}</option>)}
            </select>
          </Champ>
        </div>
        <Champ nom="objectifs" libelle="Objectifs" facultatif>
          <textarea id="objectifs" name="objectifs" rows={3} defaultValue={val('objectifs')} className="champ" />
        </Champ>
        <Champ nom="livrables" libelle="Livrables attendus" facultatif>
          <textarea id="livrables" name="livrables" rows={2} defaultValue={val('livrables')} className="champ" />
        </Champ>
      </Section>

      <Section numero={2} titre="Lieu et calendrier">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="zone" libelle="Zone" aide="Villes ou quartiers, séparés par des virgules : ils servent à trouver les profils proches." facultatif>
            <input id="zone" name="zone" defaultValue={val('zone')} className="champ" />
          </Champ>
          <Champ nom="lieu" libelle="Lieu de rendez-vous" facultatif>
            <input id="lieu" name="lieu" defaultValue={val('lieu')} placeholder="Ex. : devant l’entrée principale du marché Dantokpa" className="champ" />
          </Champ>
          <Champ nom="date_debut" libelle="Début" erreur={e.date_debut} facultatif>
            <input id="date_debut" name="date_debut" type="date" defaultValue={val('date_debut')} className="champ" />
          </Champ>
          <Champ nom="date_fin" libelle="Fin" erreur={e.date_fin} facultatif>
            <input id="date_fin" name="date_fin" type="date" defaultValue={val('date_fin')} className="champ" />
          </Champ>
          <Champ nom="horaires" libelle="Horaires" facultatif>
            <input id="horaires" name="horaires" defaultValue={val('horaires')} placeholder="Ex. : 8 h à 13 h" className="champ" />
          </Champ>
        </div>
      </Section>

      <Section numero={3} titre="Équipe et rémunération">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="nb_profils_requis" libelle="Nombre d’intervenants" erreur={e.nb_profils_requis}>
            <input id="nb_profils_requis" name="nb_profils_requis" type="number" min={1} max={500} defaultValue={val('nb_profils_requis') || '1'} className="champ" />
          </Champ>
          <Champ nom="score_minimum" libelle="PROXIMA SCORE minimum" erreur={e.score_minimum} aide="Les profils jamais notés restent proposés." facultatif>
            <input id="score_minimum" name="score_minimum" type="number" min={0} max={100} defaultValue={val('score_minimum')} className="champ" />
          </Champ>
          <Champ nom="remuneration_agent_fcfa" libelle="Rémunération par intervenant (FCFA)" erreur={e.remuneration_agent_fcfa} aide="Pour toute la mission. Obligatoire avant d’envoyer les propositions.">
            <input id="remuneration_agent_fcfa" name="remuneration_agent_fcfa" inputMode="numeric" defaultValue={val('remuneration_agent_fcfa')} className="champ" />
          </Champ>
          <Champ nom="budget_fcfa" libelle="Budget du client (FCFA)" erreur={e.budget_fcfa} facultatif>
            <input id="budget_fcfa" name="budget_fcfa" inputMode="numeric" defaultValue={val('budget_fcfa')} className="champ" />
          </Champ>
          <Champ nom="competences" libelle="Compétences recherchées" aide="Séparées par des virgules." facultatif className="sm:col-span-2">
            <input id="competences" name="competences" list="competences-liste" defaultValue={val('competences')} className="champ" />
            <datalist id="competences-liste">{COMPETENCES.map((c) => <option key={c} value={c} />)}</datalist>
          </Champ>
        </div>
      </Section>

      <div className="flex gap-2">
        <button className="btn-primaire px-8" disabled={enCours}>
          {enCours ? 'Enregistrement…' : missionId ? 'Enregistrer les modifications' : 'Créer la mission'}
        </button>
        <Link href={annuler} className="btn">Annuler</Link>
      </div>
    </form>
  );
}
