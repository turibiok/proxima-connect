'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { operer } from '@/lib/missions/actions';

export interface VueLigne {
  id: string;
  intervenantId: string;
  nom: string;
  reference: string;
  telephone: string;
  role: 'titulaire' | 'remplacant';
  reponse: 'en_attente' | 'accepte' | 'refuse';
  presence: 'present' | 'retard' | 'absent' | null;
  propose: string | null;
  canal: string | null;
  motifRefus: string | null;
  remplacePar: string | null;
  remplace: string | null;
  score: number | null;
  /** liens prets a l'emploi, message de proposition compris */
  lienWhatsApp: string;
  lienSms: string;
  peutRemplacer: boolean;
  /** phase 3 : choisi par le programme, canal de la reponse, echeance */
  auto: boolean;
  reponseCanal: string | null;
  echeance: string | null;
}

const CANAUX: Record<string, string> = { whatsapp: 'WhatsApp', sms: 'SMS', appel: 'appel' };

/**
 * Une ligne d'equipe et ses actions selon l'etat : proposer, enregistrer la
 * reponse, pointer la presence, remplacer. Chaque bouton est un petit
 * formulaire : tout fonctionne aussi sans JavaScript.
 */
export function LigneEquipe({
  missionId,
  l,
  modifiable,
  pointage,
  reserve,
}: {
  missionId: string;
  l: VueLigne;
  modifiable: boolean;
  pointage: boolean;
  reserve: { id: string; nom: string }[];
}) {
  const [erreur, action, enCours] = useActionState(operer.bind(null, missionId, l.id), null);
  const engage = l.role === 'titulaire' && l.reponse === 'accepte' && !l.remplacePar;

  return (
    <li className={`py-3 ${l.remplacePar ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Link href={`/intervenants/${l.intervenantId}`} className="font-medium text-marque-fonce hover:underline">{l.nom}</Link>
          <div className="text-xs text-encre-douce">
            <span className="font-mono">{l.reference}</span> · {l.telephone}
            {l.score !== null && ` · score ${Math.round(l.score)}`}
            {l.remplace && <> · remplace {l.remplace}</>}
            {l.auto && <> · choisi automatiquement</>}
            {l.reponse === 'en_attente' && l.echeance && <> · réponse attendue avant le {l.echeance}</>}
            {l.reponse !== 'en_attente' && l.reponseCanal && l.reponseCanal !== 'equipe' && (
              <> · {({ sms: 'a répondu par SMS', whatsapp: 'a répondu par WhatsApp', espace: 'a répondu depuis son espace', delai: 'sans réponse dans le délai' } as Record<string, string>)[l.reponseCanal]}</>
            )}
          </div>
        </div>
        <Etat l={l} />
      </div>

      {modifiable && !l.remplacePar && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {l.reponse === 'en_attente' && (
            <>
              <a href={l.lienWhatsApp} target="_blank" rel="noreferrer" className="btn px-3 py-1 text-xs">
                {l.propose ? 'Relancer sur WhatsApp' : 'Écrire sur WhatsApp'}
              </a>
              <a href={l.lienSms} className="btn px-3 py-1 text-xs">SMS</a>
              {!l.propose ? (
                <form action={action} className="flex items-center gap-1">
                  <input type="hidden" name="op" value="proposer" />
                  <select name="canal" defaultValue="whatsapp" aria-label="Canal utilisé" className="champ w-auto py-1 text-xs">
                    <option value="whatsapp">par WhatsApp</option>
                    <option value="sms">par SMS</option>
                    <option value="appel">par appel</option>
                  </select>
                  <button className="btn-primaire px-3 py-1 text-xs" disabled={enCours}>Proposition envoyée</button>
                </form>
              ) : (
                <>
                  <form action={action}>
                    <input type="hidden" name="op" value="accepter" />
                    <button className="btn-primaire px-3 py-1 text-xs" disabled={enCours}>A accepté</button>
                  </form>
                  <form action={action} className="flex items-center gap-1">
                    <input type="hidden" name="op" value="refuser" />
                    <input name="motif" placeholder="motif du refus" aria-label="Motif du refus" className="champ w-36 py-1 text-xs" />
                    <button className="btn px-3 py-1 text-xs" disabled={enCours}>A refusé</button>
                  </form>
                </>
              )}
            </>
          )}

          {engage && pointage && (
            <form action={action} className="flex gap-1" aria-label="Présence">
              <input type="hidden" name="op" value="presence" />
              {(
                [
                  ['present', 'Présent'],
                  ['retard', 'En retard'],
                  ['absent', 'Absent'],
                ] as const
              ).map(([v, lib]) => (
                <button
                  key={v}
                  name="valeur"
                  value={v}
                  disabled={enCours}
                  aria-pressed={l.presence === v}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    l.presence === v
                      ? v === 'absent'
                        ? 'border-danger bg-danger-pale text-danger'
                        : 'border-ok bg-ok-pale text-ok'
                      : 'border-trait bg-white hover:bg-papier'
                  }`}
                >
                  {lib}
                </button>
              ))}
            </form>
          )}

          {l.peutRemplacer && (
            reserve.length ? (
              <form action={action} className="flex items-center gap-1">
                <input type="hidden" name="op" value="remplacer" />
                <select name="remplacant_id" aria-label="Remplaçant" className="champ w-auto py-1 text-xs">
                  {reserve.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                </select>
                <button className="btn-primaire px-3 py-1 text-xs" disabled={enCours}>Remplacer</button>
              </form>
            ) : (
              <span className="text-xs text-alerte">Aucun remplaçant en réserve : ajoutez-en depuis la sélection.</span>
            )
          )}

          {!l.presence && l.reponse !== 'accepte' && (
            <form action={action}>
              <input type="hidden" name="op" value="retirer" />
              <button className="px-2 py-1 text-xs text-encre-douce hover:text-danger hover:underline" disabled={enCours}>Retirer</button>
            </form>
          )}
        </div>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
    </li>
  );
}

function Etat({ l }: { l: VueLigne }) {
  if (l.remplacePar) return <span className="puce bg-trait/60 text-encre-douce">Remplacé par {l.remplacePar}</span>;
  if (l.presence === 'absent') return <span className="puce bg-danger-pale text-danger">Absent</span>;
  if (l.presence === 'retard') return <span className="puce bg-alerte-pale text-alerte">Présent, en retard</span>;
  if (l.presence === 'present') return <span className="puce bg-ok-pale text-ok">Présent</span>;
  if (l.reponse === 'accepte') return <span className="puce bg-ok-pale text-ok">{l.role === 'remplacant' ? 'En réserve' : 'A accepté'}</span>;
  if (l.reponse === 'refuse') return <span className="puce bg-trait/60 text-encre-douce" title={l.motifRefus ?? undefined}>A refusé{l.motifRefus ? ` : ${l.motifRefus}` : ''}</span>;
  if (l.propose) return <span className="puce bg-alerte-pale text-alerte">Proposée {l.propose} ({CANAUX[l.canal ?? ''] ?? l.canal}), en attente</span>;
  return <span className="puce bg-papier text-encre-douce ring-1 ring-trait">À proposer</span>;
}
