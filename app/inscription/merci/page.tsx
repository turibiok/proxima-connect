export const metadata = { title: 'Inscription reçue' };

export default async function Merci({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <div className="carte mx-auto mt-6 max-w-lg p-6 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-ok-pale text-2xl text-ok">✓</div>
      <h1 className="text-xl font-bold">Inscription reçue, merci !</h1>
      {ref && /^PX-\d+$/.test(ref) && (
        <p className="mt-3">
          Votre numéro de dossier : <strong className="font-mono">{ref}</strong>
        </p>
      )}
      <p className="mt-3 text-sm text-encre-douce">
        Notre équipe va vous appeler pour vérifier votre profil. Préparez votre pièce d’identité. Une fois votre profil
        vérifié, vous recevrez les propositions de missions par SMS ou WhatsApp.
      </p>
    </div>
  );
}
