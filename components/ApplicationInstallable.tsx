'use client';

import { useEffect, useState } from 'react';

/** Enregistre le service worker (en production seulement : en developpement il genait le rechargement a chaud). */
export function EnregistrementServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // pas de service worker : le site reste utilisable normalement
    });
  }, []);
  return null;
}

type InvitationInstallation = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Proposition d'installer l'application sur l'ecran d'accueil : bouton sur
 * Android (evenement du navigateur), explication sur iPhone (pas d'invite
 * automatique sur Safari). Rien si l'application est deja installee.
 */
export function InviterInstallation() {
  const [invitation, setInvitation] = useState<InvitationInstallation | null>(null);
  const [iphone, setIphone] = useState(false);
  const [installee, setInstallee] = useState(true);

  useEffect(() => {
    const autonome = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    setInstallee(autonome);
    setIphone(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const garder = (e: Event) => {
      e.preventDefault();
      setInvitation(e as InvitationInstallation);
    };
    window.addEventListener('beforeinstallprompt', garder);
    return () => window.removeEventListener('beforeinstallprompt', garder);
  }, []);

  if (installee || (!invitation && !iphone)) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-marque/30 bg-marque-pale px-4 py-3 text-sm text-marque-fonce">
      <span>Ajoutez PROXIMA sur l’écran d’accueil de votre téléphone pour l’ouvrir comme une application.</span>
      {invitation ? (
        <button
          className="btn-primaire px-3 py-1.5 text-xs"
          onClick={async () => {
            await invitation.prompt();
            await invitation.userChoice;
            setInvitation(null);
          }}
        >
          Installer
        </button>
      ) : (
        <span className="text-xs">Sur iPhone : bouton Partager, puis « Sur l’écran d’accueil ».</span>
      )}
    </div>
  );
}
