/*
 * Service worker de PROXIMA CONNECT (phase 4 : application installable).
 *
 * Volontairement prudent : aucune page n'est mise en cache. Les pages
 * contiennent des donnees personnelles et un telephone se prete ; on ne met
 * en cache que les fichiers statiques versionnes de Next (_next/static), les
 * icones et la page « hors connexion », servie quand le reseau manque.
 */
const VERSION = 'proxima-v1';
const PRECHARGE = ['/hors-ligne', '/icone-192.png', '/icone-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECHARGE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // anciennes versions du cache supprimees
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // pages : toujours le reseau ; sans reseau, la page « hors connexion »
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/hors-ligne')));
    return;
  }

  // fichiers statiques versionnes (leur nom change a chaque version) : cache d'abord
  if (url.pathname.startsWith('/_next/static/') || /^\/icone-.*\.png$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (trouve) =>
          trouve ||
          fetch(req).then((rep) => {
            if (rep.ok) {
              const copie = rep.clone();
              caches.open(VERSION).then((c) => c.put(req, copie));
            }
            return rep;
          }),
      ),
    );
  }
});
