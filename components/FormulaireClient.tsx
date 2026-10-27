'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { enregistrerClient, type EtatFormulaire } from '@/lib/clients/actions';
import { SECTEURS, STATUTS_COMMERCIAUX } from '@/lib/clients/regles';
import { VILLES } from '@/lib/referentiel';
import { BandeauErreurs, Champ, Section } from './Champs';

/** Valeurs initiales d'une fiche existante, deja mises en forme texte. */
export type ValeursClient = Record<string, string>;

export function FormulaireClient({ id, initiales = {} }: { id: string | null; initiales?: ValeursClient }) {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(enregistrerClient.bind(null, id), null);
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

      <Section numero={1} titre="Entreprise">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="raison_sociale" libelle="Raison sociale" erreur={e.raison_sociale} className="sm:col-span-2">
            <input id="raison_sociale" name="raison_sociale" defaultValue={val('raison_sociale')} className="champ" required />
          </Champ>
          <Champ nom="secteur" libelle="Secteur d’activité" facultatif>
            <input id="secteur" name="secteur" list="secteurs" defaultValue={val('secteur')} className="champ" />
            <datalist id="secteurs">{SECTEURS.map((s) => <option key={s} value={s} />)}</datalist>
          </Champ>
          <Champ nom="ifu" libelle="IFU" erreur={e.ifu} aide="Identifiant fiscal unique, 13 chiffres." facultatif>
            <input id="ifu" name="ifu" defaultValue={val('ifu')} inputMode="numeric" className="champ font-mono" />
          </Champ>
          <Champ nom="ville" libelle="Ville" facultatif>
            <input id="ville" name="ville" list="villes" defaultValue={val('ville')} className="champ" />
            <datalist id="villes">{VILLES.map((v) => <option key={v} value={v} />)}</datalist>
          </Champ>
          <Champ nom="statut_commercial" libelle="Statut commercial">
            <select id="statut_commercial" name="statut_commercial" defaultValue={val('statut_commercial') || 'prospect'} className="champ">
              {Object.entries(STATUTS_COMMERCIAUX).map(([c, s]) => (
                <option key={c} value={c}>{s.libelle} — {s.aide}</option>
              ))}
            </select>
          </Champ>
        </div>
      </Section>

      <Section numero={2} titre="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="contact_nom" libelle="Nom du contact" facultatif>
            <input id="contact_nom" name="contact_nom" defaultValue={val('contact_nom')} className="champ" />
          </Champ>
          <Champ nom="contact_fonction" libelle="Fonction" facultatif>
            <input id="contact_fonction" name="contact_fonction" defaultValue={val('contact_fonction')} placeholder="Ex. : responsable marketing" className="champ" />
          </Champ>
          <Champ nom="contact_telephone" libelle="Téléphone" erreur={e.contact_telephone}>
            <input id="contact_telephone" name="contact_telephone" type="tel" inputMode="tel" defaultValue={val('contact_telephone')} className="champ" />
          </Champ>
          <Champ nom="contact_email" libelle="E-mail" erreur={e.contact_email}>
            <input id="contact_email" name="contact_email" type="email" defaultValue={val('contact_email')} className="champ" />
          </Champ>
        </div>
        <p className="aide -mt-2">Au moins un téléphone ou un e-mail.</p>
      </Section>

      <Section numero={3} titre="Facturation et paiement">
        <div className="grid gap-4 sm:grid-cols-3">
          <Champ nom="adresse_facturation" libelle="Adresse de facturation" facultatif className="sm:col-span-3">
            <textarea id="adresse_facturation" name="adresse_facturation" rows={2} defaultValue={val('adresse_facturation')} className="champ" />
          </Champ>
          <Champ nom="delai_paiement_jours" libelle="Délai de paiement (jours)" erreur={e.delai_paiement_jours}>
            <input id="delai_paiement_jours" name="delai_paiement_jours" type="number" min={0} max={180} defaultValue={val('delai_paiement_jours') || '30'} className="champ" />
          </Champ>
          <Champ nom="acompte_pourcent" libelle="Acompte à la commande (%)" erreur={e.acompte_pourcent}>
            <input id="acompte_pourcent" name="acompte_pourcent" type="number" min={0} max={100} defaultValue={val('acompte_pourcent') || '0'} className="champ" />
          </Champ>
          <Champ nom="limite_credit_fcfa" libelle="Limite de crédit (FCFA)" erreur={e.limite_credit_fcfa} aide="Encours maximal autorisé. 0 : pas de limite.">
            <input id="limite_credit_fcfa" name="limite_credit_fcfa" inputMode="numeric" defaultValue={val('limite_credit_fcfa') || '0'} className="champ" />
          </Champ>
          <Champ nom="conditions_paiement" libelle="Autres conditions" facultatif className="sm:col-span-3">
            <input id="conditions_paiement" name="conditions_paiement" defaultValue={val('conditions_paiement')} placeholder="Ex. : paiement par virement, bon de commande obligatoire" className="champ" />
          </Champ>
        </div>
      </Section>

      <Section titre="Notes internes">
        <textarea name="notes" rows={3} defaultValue={val('notes')} aria-label="Notes internes" className="champ" />
      </Section>

      <div className="flex gap-2">
        <button className="btn-primaire px-8" disabled={enCours}>
          {enCours ? 'Enregistrement…' : id ? 'Enregistrer les modifications' : 'Créer la fiche client'}
        </button>
        <Link href={id ? `/clients/${id}` : '/clients'} className="btn">Annuler</Link>
      </div>
    </form>
  );
}
