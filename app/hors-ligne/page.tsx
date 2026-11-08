export const metadata = { title: 'Hors connexion' };
// page pre-enregistree par le service worker : servie sans reseau
export const dynamic = 'force-static';

export default function HorsLigne() {
  return (
    <section className="carte mx-auto max-w-md space-y-3 p-6 text-sm">
      <h1 className="text-xl font-bold">Pas de connexion</h1>
      <p>Cette page demande Internet. Vérifiez la connexion du téléphone (données mobiles ou Wi-Fi), puis réessayez.</p>
      <p className="text-encre-douce">Ce que vous avez saisi n’est pas perdu tant que vous ne fermez pas l’application : revenez en arrière une fois reconnecté.</p>
      <a href="/demarrage" className="btn-primaire inline-flex">Réessayer</a>
    </section>
  );
}
