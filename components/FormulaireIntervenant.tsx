'use client';

import { useActionState, useState } from 'react';
import { enregistrerIntervenant, type EtatFormulaire } from '@/lib/intervenants/actions';
import {
  CATEGORIES_MISSIONS,
  COMPETENCES,
  CRENEAUX,
  DEPLACEMENTS,
  JOURS,
  LANGUES,
  NIVEAUX_ETUDES,
  OPERATEURS_MOBILE_MONEY,
  PIECES,
  SITUATIONS,
  VILLES,
} from '@/lib/referentiel';
import { BandeauErreurs, Champ, Section } from './Champs';

/**
 * Formulaire de profil intervenant, partage entre l'inscription publique et
 * la saisie par l'equipe.
 *
 * Il fonctionne sans JavaScript (action serveur en amelioration progressive) :
 * sur un telephone d'entree de gamme ou une connexion qui coupe le chargement
 * des scripts, l'envoi reste possible. Le JavaScript n'ajoute que le confort
 * (champs de paiement qui s'adaptent, bouton desactive pendant l'envoi).
 */
export function FormulaireIntervenant({ mode }: { mode: 'public' | 'interne' }) {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(
    enregistrerIntervenant.bind(null, mode),
    null,
  );
  const v = etat?.valeurs ?? {};
  const e = etat?.erreurs ?? {};
  const val = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
  const coche = (k: string, code: string) => [v[k]].flat().includes(code);
  const [paiement, setPaiement] = useState(val('paiement_mode') || 'mobile_money');

  return (
    <form action={action} key={etat ? JSON.stringify(etat.valeurs) : 'initial'} className="space-y-5" noValidate>
      {/* la cle reconstruit le formulaire apres un refus : React remet les champs texte
          a leur defaultValue, mais pas les listes deroulantes */}
      <BandeauErreurs erreurs={e} />

      {/* piege a robots : invisible et ignore par les lecteurs d'ecran */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Site web <input name="site_web" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Section numero={1} titre="Identité">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="nom" libelle="Nom" erreur={e.nom}>
            <input id="nom" name="nom" defaultValue={val('nom')} autoComplete="family-name" className="champ uppercase" required />
          </Champ>
          <Champ nom="prenoms" libelle="Prénom(s)" erreur={e.prenoms}>
            <input id="prenoms" name="prenoms" defaultValue={val('prenoms')} autoComplete="given-name" className="champ" required />
          </Champ>
          <Champ nom="date_naissance" libelle="Date de naissance" erreur={e.date_naissance} aide="Il faut avoir au moins 18 ans.">
            <input id="date_naissance" name="date_naissance" type="date" defaultValue={val('date_naissance')} className="champ" required />
          </Champ>
          <fieldset>
            <legend className="etiquette">Sexe</legend>
            <div className="flex gap-2">
              {[['F', 'Femme'], ['M', 'Homme']].map(([c, l]) => (
                <label key={c} className="coche flex-1">
                  <input type="radio" name="sexe" value={c} defaultChecked={val('sexe') === c} /> {l}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Section>

      <Section numero={2} titre="Comment vous joindre">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="telephone" libelle="Téléphone" erreur={e.telephone} aide="Exemple : 01 97 12 34 56. Nous vous appellerons pour le vérifier.">
            <input id="telephone" name="telephone" type="tel" inputMode="tel" defaultValue={val('telephone')} autoComplete="tel" className="champ" required />
          </Champ>
          <Champ nom="whatsapp" libelle="WhatsApp (si différent)" erreur={e.whatsapp} facultatif>
            <input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" defaultValue={val('whatsapp')} className="champ" />
          </Champ>
          <Champ nom="email" libelle="E-mail" erreur={e.email} facultatif>
            <input id="email" name="email" type="email" defaultValue={val('email')} autoComplete="email" className="champ" />
          </Champ>
        </div>
      </Section>

      <Section numero={3} titre="Où vous trouver">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="ville" libelle="Ville de résidence" erreur={e.ville}>
            <input id="ville" name="ville" list="villes" defaultValue={val('ville')} className="champ" required />
            <datalist id="villes">{VILLES.map((x) => <option key={x} value={x} />)}</datalist>
          </Champ>
          <Champ nom="quartier" libelle="Quartier" facultatif>
            <input id="quartier" name="quartier" defaultValue={val('quartier')} className="champ" />
          </Champ>
          <Champ nom="zones" libelle="Zones où vous acceptez de travailler" aide="Quartiers ou villes, séparés par des virgules." facultatif>
            <input id="zones" name="zones" defaultValue={val('zones')} placeholder="Akpakpa, Cadjèhoun, Abomey-Calavi" className="champ" />
          </Champ>
        </div>
        <Cases titre="Moyens de déplacement" nom="deplacements" options={DEPLACEMENTS} coche={coche} />
      </Section>

      <Section numero={4} titre="Votre profil">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="situation" libelle="Situation actuelle" facultatif>
            <select id="situation" name="situation" defaultValue={val('situation')} className="champ">
              <option value="">—</option>
              {SITUATIONS.map((o) => <option key={o.code} value={o.code}>{o.libelle}</option>)}
            </select>
          </Champ>
          <Champ nom="niveau_etudes" libelle="Niveau d’études" facultatif>
            <select id="niveau_etudes" name="niveau_etudes" defaultValue={val('niveau_etudes')} className="champ">
              <option value="">—</option>
              {NIVEAUX_ETUDES.map((o) => <option key={o.code} value={o.code}>{o.libelle}</option>)}
            </select>
          </Champ>
          <Champ nom="formation" libelle="Formation / filière" facultatif>
            <input id="formation" name="formation" defaultValue={val('formation')} placeholder="Ex. : Licence en marketing, UAC" className="champ" />
          </Champ>
          <Champ nom="competences" libelle="Compétences" aide="Séparées par des virgules." facultatif>
            <input id="competences" name="competences" list="competences-liste" defaultValue={val('competences')} placeholder="Vente, Animation, Saisie sur smartphone" className="champ" />
            <datalist id="competences-liste">{COMPETENCES.map((x) => <option key={x} value={x} />)}</datalist>
          </Champ>
        </div>
        <Champ nom="experiences" libelle="Expériences" aide="Missions déjà réalisées, emplois, stages." facultatif>
          <textarea id="experiences" name="experiences" rows={3} defaultValue={val('experiences')} className="champ" />
        </Champ>
        <Cases titre="Langues parlées" nom="langues" options={LANGUES.map((l) => ({ code: l, libelle: l }))} coche={coche} />
      </Section>

      <Section numero={5} titre="Disponibilités et missions">
        <Cases titre="Jours disponibles" nom="jours" options={JOURS} coche={coche} erreur={e.jours} />
        <Cases titre="Créneaux" nom="creneaux" options={CRENEAUX} coche={coche} />
        <Cases
          titre="Types de missions qui vous intéressent"
          nom="categories"
          options={CATEGORIES_MISSIONS.map((c) => ({ code: c.code, libelle: c.libelle, detail: c.types.slice(0, 3).join(', ') + '…' }))}
          coche={coche}
          erreur={e.categories}
          large
        />
      </Section>

      <Section numero={6} titre="Paiement et pièce d’identité">
        <p className="-mt-1 text-sm text-encre-douce">
          Les missions sont payées par Mobile Money ou virement, sur un compte à votre nom. Votre pièce d’identité vous sera
          demandée lors de la vérification de votre profil.
        </p>
        <fieldset>
          <legend className="etiquette">Moyen de paiement</legend>
          <div className="flex flex-wrap gap-2">
            {[['mobile_money', 'Mobile Money'], ['banque', 'Compte bancaire']].map(([c, l]) => (
              <label key={c} className="coche">
                <input type="radio" name="paiement_mode" value={c} defaultChecked={paiement === c} onChange={() => setPaiement(c)} /> {l}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ nom="paiement_operateur" libelle={paiement === 'banque' ? 'Banque' : 'Opérateur Mobile Money'} erreur={e.paiement_operateur}>
            <input id="paiement_operateur" name="paiement_operateur" list={paiement === 'banque' ? undefined : 'operateurs'} defaultValue={val('paiement_operateur')} className="champ" />
            <datalist id="operateurs">{OPERATEURS_MOBILE_MONEY.map((x) => <option key={x} value={x} />)}</datalist>
          </Champ>
          <Champ nom="paiement_compte" libelle={paiement === 'banque' ? 'Numéro de compte (RIB)' : 'Numéro Mobile Money'} erreur={e.paiement_compte}>
            <input id="paiement_compte" name="paiement_compte" defaultValue={val('paiement_compte')} inputMode={paiement === 'banque' ? 'text' : 'tel'} className="champ" />
          </Champ>
          <Champ nom="piece_type" libelle="Type de pièce d’identité" facultatif>
            <select id="piece_type" name="piece_type" defaultValue={val('piece_type')} className="champ">
              <option value="">—</option>
              {PIECES.map((o) => <option key={o.code} value={o.code}>{o.libelle}</option>)}
            </select>
          </Champ>
          <Champ nom="piece_numero" libelle="Numéro de la pièce" facultatif>
            <input id="piece_numero" name="piece_numero" defaultValue={val('piece_numero')} className="champ" />
          </Champ>
        </div>
      </Section>

      <section className="carte p-5">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="consentement" value="oui" defaultChecked={val('consentement') === 'oui'} className="mt-1 h-4 w-4 shrink-0" />
          <span>
            {mode === 'public' ? (
              <>J’accepte que PROXIMA CONNECT enregistre ces informations</>
            ) : (
              <>L’intervenant a accepté, devant moi, que PROXIMA CONNECT enregistre ces informations</>
            )}{' '}
            pour me proposer des missions, vérifier mon identité et me payer. Elles ne sont accessibles qu’aux équipes
            PROXIMA CONNECT habilitées et ne sont ni vendues ni cédées. Je peux demander à tout moment à les consulter,
            les corriger ou les supprimer.
          </span>
        </label>
        {e.consentement && <p className="erreur ml-7">{e.consentement}</p>}
      </section>

      <button className="btn-primaire w-full py-3 text-base sm:w-auto sm:px-8" disabled={enCours}>
        {enCours ? 'Enregistrement…' : mode === 'public' ? 'Envoyer mon inscription' : 'Enregistrer le profil'}
      </button>
    </form>
  );
}

function Cases(p: {
  titre: string;
  nom: string;
  options: { code: string; libelle: string; detail?: string }[];
  coche: (k: string, c: string) => boolean;
  erreur?: string;
  large?: boolean;
}) {
  return (
    <fieldset>
      <legend className="etiquette">{p.titre}</legend>
      <div className={p.large ? 'grid gap-2 sm:grid-cols-2' : 'flex flex-wrap gap-2'}>
        {p.options.map((o) => (
          <label key={o.code} className="coche">
            <input type="checkbox" name={p.nom} value={o.code} defaultChecked={p.coche(p.nom, o.code)} />
            <span>
              {o.libelle}
              {o.detail && <span className="block text-xs text-encre-douce">{o.detail}</span>}
            </span>
          </label>
        ))}
      </div>
      {p.erreur && <p className="erreur">{p.erreur}</p>}
    </fieldset>
  );
}
