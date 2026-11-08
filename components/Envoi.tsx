'use client';

import { startTransition, useActionState, useState } from 'react';
import { enregistrerEnvoi, type EtatEnvoi } from '@/lib/communication/actions';
import { lienEnvoi, segmentsSms, versSms, type CanalEnvoi, type ModeleEnvoi } from '@/lib/communication/regles';

/**
 * Envoi assiste d'un message a un intervenant : le texte propose est
 * modifiable ; le bouton ouvre WhatsApp ou l'application SMS du telephone,
 * message pre-rempli, et consigne l'envoi dans l'historique.
 */
export function Envoi({
  cible,
  modele,
  texte,
  telephone,
  whatsapp,
  libelle,
}: {
  cible: { intervenantId: string; missionId?: string | null; paiementId?: string | null };
  modele: ModeleEnvoi;
  texte: string;
  telephone: string;
  whatsapp: string | null;
  libelle?: string;
}) {
  const [etat, action, enCours] = useActionState<EtatEnvoi, FormData>(enregistrerEnvoi.bind(null, cible), null);
  const [canal, setCanal] = useState<CanalEnvoi>('whatsapp');
  const [contenu, setContenu] = useState(texte);
  const final = canal === 'sms' ? versSms(contenu) : contenu;
  const sms = segmentsSms(final);
  const numero = canal === 'whatsapp' ? (whatsapp ?? telephone) : telephone;
  const vide = contenu.trim().length < 3;

  // le lien s'ouvre normalement ; l'envoi est consigne en parallele
  const consigner = () => {
    const f = new FormData();
    f.set('canal', canal);
    f.set('modele', modele);
    f.set('contenu', contenu);
    startTransition(() => action(f));
  };

  return (
    <div className="mt-2 space-y-2">
      <textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={Math.min(8, contenu.split('\n').length + 1)} maxLength={1000} aria-label="Message" className="champ text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-trait p-0.5 text-xs" role="radiogroup" aria-label="Canal">
          {(['whatsapp', 'sms'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={canal === c}
              onClick={() => setCanal(c)}
              className={`rounded-md px-2.5 py-1 font-semibold ${canal === c ? 'bg-marque text-white' : 'text-encre-douce'}`}
            >
              {c === 'whatsapp' ? 'WhatsApp' : 'SMS'}
            </button>
          ))}
        </div>
        <a
          href={vide ? undefined : lienEnvoi(canal, numero, final)}
          target={canal === 'whatsapp' ? '_blank' : undefined}
          rel="noreferrer"
          onClick={vide ? undefined : consigner}
          aria-disabled={vide || enCours}
          className={`btn-primaire px-3 py-1.5 text-xs ${vide ? 'pointer-events-none opacity-50' : ''}`}
        >
          {libelle ?? (canal === 'whatsapp' ? 'Ouvrir dans WhatsApp' : 'Ouvrir dans les SMS')}
        </a>
        {canal === 'sms' && (
          <span className={`text-xs ${sms.segments > 2 ? 'text-alerte' : 'text-encre-douce'}`}>
            {sms.caracteres} caractères · {sms.segments} SMS facturé{sms.segments > 1 ? 's' : ''}
            {sms.encodage === 'Unicode' && ' (caractères spéciaux : 70 par SMS)'}
          </span>
        )}
      </div>
      <p className="aide">
        {canal === 'sms'
          ? 'En SMS, les caractères absents de l’alphabet SMS (ê, ç, « ») sont remplacés pour rester à 160 caractères par message. '
          : ''}
        Le message s’ouvre sur ce téléphone ou cet ordinateur, prêt à envoyer ; il est inscrit dans l’historique de l’intervenant.
      </p>
      {etat?.ok && <p role="status" className="text-xs font-medium text-ok">{etat.ok}</p>}
      {etat?.erreurs && <p role="alert" className="erreur">{Object.values(etat.erreurs)[0]}</p>}
    </div>
  );
}
