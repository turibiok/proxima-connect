'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { ajouterPreuve, type EtatSaisie } from '@/lib/preuves/actions';
import { RESULTATS_CONTRE_APPEL, TYPES_PREUVE, type TypePreuve } from '@/lib/preuves/regles';

/**
 * Saisie d'une preuve d'execution.
 *
 * Pense pour un telephone sur le terrain : appareil photo direct, position
 * GPS en un geste, signature au doigt. Les photos sont reduites ici, avant
 * l'envoi (1600 px, JPEG) : une photo de 4 Mo en pese ~300 Ko, ce qui compte
 * sur une connexion mobile lente.
 */
export function SaisiePreuve({ missionId, equipe }: { missionId: string; equipe: { id: string; nom: string }[] }) {
  const [etat, action, enCours] = useActionState<EtatSaisie, FormData>(ajouterPreuve.bind(null, missionId), null);
  const v = etat?.valeurs ?? {};
  const e = etat?.erreurs ?? {};
  const [type, setType] = useState<TypePreuve>((v.type as TypePreuve) || 'photo');
  const [reduction, setReduction] = useState<string | null>(null);

  // apres un enregistrement reussi, on repart d'un formulaire vide ; apres un
  // refus, on le reconstruit avec la saisie renvoyee (les fichiers, eux, sont
  // a choisir de nouveau : un navigateur ne laisse pas pre-remplir un champ fichier)
  const [envois, setEnvois] = useState(0);
  useEffect(() => {
    if (etat?.ok) {
      setEnvois((n) => n + 1);
      setReduction(null);
    }
  }, [etat]);
  const cle = etat?.ok ? `ok-${envois}` : JSON.stringify(v);

  async function reduirePhotos(input: HTMLInputElement) {
    const fichiers = [...(input.files ?? [])];
    if (!fichiers.some((f) => f.type.startsWith('image/'))) return setReduction(null);
    setReduction('Réduction des photos…');
    const avant = fichiers.reduce((t, f) => t + f.size, 0);
    const reduits = await Promise.all(fichiers.map(reduire));
    const transfert = new DataTransfer();
    reduits.forEach((f) => transfert.items.add(f));
    input.files = transfert.files;
    const apres = reduits.reduce((t, f) => t + f.size, 0);
    setReduction(`${reduits.length} fichier${reduits.length > 1 ? 's' : ''} · ${ko(apres)}${apres < avant ? ` (au lieu de ${ko(avant)})` : ''}`);
  }

  return (
    <form action={action} key={cle} className="space-y-4" encType="multipart/form-data">
      {etat?.ok && <p role="status" className="rounded-lg bg-ok-pale px-3 py-2 text-sm text-ok">{etat.ok}</p>}
      {e.general && <p className="rounded-lg bg-danger-pale px-3 py-2 text-sm text-danger">{e.general}</p>}

      <fieldset>
        <legend className="etiquette">Type de preuve</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(TYPES_PREUVE) as TypePreuve[]).map((t) => (
            <label key={t} className="coche">
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} />
              {TYPES_PREUVE[t].libelle}
            </label>
          ))}
        </div>
        <p className="aide">{TYPES_PREUVE[type].aide}</p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Intervenant concerné</span>
          <select name="intervenant_id" defaultValue={v.intervenant_id ?? ''} className="champ">
            <option value="">Toute l’équipe</option>
            {equipe.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="etiquette">Réalisée le <span className="font-normal text-encre-douce">(facultatif)</span></span>
          <input type="datetime-local" name="realisee_le" defaultValue={v.realisee_le ?? ''} className="champ" />
          {e.realisee_le && <span className="erreur block">{e.realisee_le}</span>}
        </label>
      </div>

      {type === 'photo' && (
        <>
          <label className="block">
            <span className="etiquette">Photos</span>
            <input
              type="file"
              name="fichiers"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(ev) => reduirePhotos(ev.currentTarget)}
              className="champ"
            />
            {reduction && <span className="aide block">{reduction}</span>}
            {e.fichiers && <span className="erreur block">{e.fichiers}</span>}
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consentement_photo" value="oui" defaultChecked={v.consentement_photo === 'oui'} className="mt-1" />
            <span>Les personnes reconnaissables sur ces photos ont donné leur accord (ou aucune personne n’est reconnaissable).</span>
          </label>
          {e.consentement_photo && <p className="erreur">{e.consentement_photo}</p>}
        </>
      )}

      {(type === 'formulaire' || type === 'autre') && (
        <label className="block">
          <span className="etiquette">Fichiers <span className="font-normal text-encre-douce">(CSV, Excel, PDF ou photo de la fiche)</span></span>
          <input type="file" name="fichiers" accept=".csv,.xlsx,.pdf,image/*" multiple onChange={(ev) => reduirePhotos(ev.currentTarget)} className="champ" />
          {reduction && <span className="aide block">{reduction}</span>}
          {e.fichiers && <span className="erreur block">{e.fichiers}</span>}
        </label>
      )}

      {type === 'signature' && <Signature erreur={e.fichiers} v={v} e={e} />}

      {type === 'contre_appel' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="etiquette">Personne appelée</span>
            <input name="appele" defaultValue={v.appele ?? ''} placeholder="Ex. : gérante de la boutique Akpakpa" className="champ" />
            {e.appele && <span className="erreur block">{e.appele}</span>}
          </label>
          <label className="block">
            <span className="etiquette">Téléphone <span className="font-normal text-encre-douce">(facultatif)</span></span>
            <input name="telephone_appele" type="tel" defaultValue={v.telephone_appele ?? ''} className="champ" />
          </label>
          <label className="block">
            <span className="etiquette">Résultat</span>
            <select name="resultat" defaultValue={v.resultat ?? ''} className="champ">
              <option value="">Choisir…</option>
              {Object.entries(RESULTATS_CONTRE_APPEL).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
            </select>
            {e.resultat && <span className="erreur block">{e.resultat}</span>}
          </label>
        </div>
      )}

      <Position obligatoire={type === 'geopoint'} v={v} erreur={e.latitude} />

      <label className="block">
        <span className="etiquette">Description <span className="font-normal text-encre-douce">(facultatif)</span></span>
        <textarea name="description" rows={2} defaultValue={v.description ?? ''} placeholder="Ce que montre la preuve : boutique, quartier, nombre de relevés…" className="champ" />
        {e.description && <span className="erreur block">{e.description}</span>}
      </label>

      <button className="btn-primaire" disabled={enCours}>{enCours ? 'Envoi…' : 'Enregistrer la preuve'}</button>
    </form>
  );
}

// ------------------------------------------------------------ position

function Position({ obligatoire, v, erreur }: { obligatoire: boolean; v: Record<string, string>; erreur?: string }) {
  const lat = useRef<HTMLInputElement>(null);
  const lon = useRef<HTMLInputElement>(null);
  const precision = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  function localiser() {
    if (!navigator.geolocation) return setMessage('Ce navigateur ne donne pas accès à la position.');
    setMessage('Recherche de la position…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lat.current!.value = p.coords.latitude.toFixed(6);
        lon.current!.value = p.coords.longitude.toFixed(6);
        precision.current!.value = String(Math.round(p.coords.accuracy));
        setMessage(`Position relevée, précision ± ${Math.round(p.coords.accuracy)} m.`);
      },
      (err) => setMessage(err.code === err.PERMISSION_DENIED ? 'Accès à la position refusé : autorisez-le dans le navigateur.' : 'Position indisponible : réessayez à découvert.'),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  return (
    <fieldset className="rounded-lg border border-trait p-3">
      <legend className="px-1 text-sm font-medium">
        Position {!obligatoire && <span className="font-normal text-encre-douce">(facultatif)</span>}
      </legend>
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" onClick={localiser} className="btn">Utiliser ma position</button>
        <input ref={lat} name="latitude" inputMode="decimal" defaultValue={v.latitude ?? ''} placeholder="Latitude" aria-label="Latitude" className="champ w-32" />
        <input ref={lon} name="longitude" inputMode="decimal" defaultValue={v.longitude ?? ''} placeholder="Longitude" aria-label="Longitude" className="champ w-32" />
        <input ref={precision} type="hidden" name="precision_m" defaultValue={v.precision_m ?? ''} />
      </div>
      {message && <p className="aide">{message}</p>}
      {erreur && <p className="erreur">{erreur}</p>}
    </fieldset>
  );
}

// ------------------------------------------------------------ signature

function Signature({ erreur, v, e }: { erreur?: string; v: Record<string, string>; e: Record<string, string> }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const sortie = useRef<HTMLInputElement>(null);
  const trace = useRef(false);
  const [vide, setVide] = useState(true);

  useEffect(() => {
    const c = toile.current!;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#14213d';
  }, []);

  const point = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    return [((ev.clientX - r.left) * ev.currentTarget.width) / r.width, ((ev.clientY - r.top) * ev.currentTarget.height) / r.height];
  };

  function effacer() {
    const c = toile.current!;
    const ctx = c.getContext('2d')!;
    ctx.fillRect(0, 0, c.width, c.height);
    sortie.current!.value = '';
    setVide(true);
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="etiquette">Signature</span>
        <canvas
          ref={toile}
          width={600}
          height={200}
          aria-label="Zone de signature : signez avec le doigt ou la souris"
          className="w-full touch-none rounded-lg border border-trait bg-white"
          onPointerDown={(ev) => {
            ev.currentTarget.setPointerCapture(ev.pointerId);
            trace.current = true;
            const ctx = ev.currentTarget.getContext('2d')!;
            const [x, y] = point(ev);
            ctx.beginPath();
            ctx.moveTo(x, y);
          }}
          onPointerMove={(ev) => {
            if (!trace.current) return;
            const ctx = ev.currentTarget.getContext('2d')!;
            const [x, y] = point(ev);
            ctx.lineTo(x, y);
            ctx.stroke();
          }}
          onPointerUp={(ev) => {
            trace.current = false;
            sortie.current!.value = ev.currentTarget.toDataURL('image/png');
            setVide(false);
          }}
        />
        <input ref={sortie} type="hidden" name="signature_png" />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-encre-douce">{vide ? 'Signez dans le cadre.' : 'Signature prête.'}</span>
          <button type="button" onClick={effacer} className="text-marque hover:underline">Effacer</button>
        </div>
        {erreur && <p className="erreur">{erreur}</p>}
        <label className="mt-2 block text-xs text-encre-douce">
          Ou joindre une photo de la signature sur papier :
          <input type="file" name="fichiers" accept="image/*" capture="environment" className="mt-1 block text-xs" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Signataire</span>
          <input name="signataire" defaultValue={v.signataire ?? ''} placeholder="Nom de la personne qui signe" className="champ" />
          {e.signataire && <span className="erreur block">{e.signataire}</span>}
        </label>
        <label className="block">
          <span className="etiquette">Qualité <span className="font-normal text-encre-douce">(facultatif)</span></span>
          <input name="qualite" defaultValue={v.qualite ?? ''} placeholder="Ex. : gérant du point de vente" className="champ" />
        </label>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ outils

async function reduire(f: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type)) return f;
  // createImageBitmap applique l'orientation EXIF : la photo ne se retrouve pas couchee
  const image = await createImageBitmap(f).catch(() => null);
  if (!image) return f;
  const k = Math.min(1, 1600 / Math.max(image.width, image.height));
  const c = document.createElement('canvas');
  c.width = Math.round(image.width * k);
  c.height = Math.round(image.height * k);
  c.getContext('2d')!.drawImage(image, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.8));
  if (!blob || blob.size >= f.size) return f;
  return new File([blob], `${f.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg', lastModified: f.lastModified });
}

const ko = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(n / 1024)} Ko`);
