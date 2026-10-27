import pg from 'pg';

/**
 * Acces PostgreSQL.
 *
 * Un seul pool par processus, garde sur `globalThis` : en developpement, le
 * rechargement a chaud de Next reevalue les modules et ouvrirait sinon un
 * nouveau pool — et de nouvelles connexions Neon — a chaque modification.
 *
 * Pas d'ORM : les requetes restent du SQL standard, portable vers tout
 * hebergeur PostgreSQL.
 */

type G = typeof globalThis & { __proximaPool?: pg.Pool };
const g = globalThis as G;

// Les colonnes `date` restent des chaines 'AAAA-MM-JJ' : convertie en Date,
// une date de naissance glisserait d'un jour selon le fuseau du serveur.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// numeric -> nombre JS : les scores tiennent largement dans un double.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// bigint (montants FCFA, comptages) -> nombre JS : on reste tres loin de 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

/**
 * Neon met la base en veille apres quelques minutes sans activite et ferme
 * alors les connexions ouvertes. Un pool qui garde des connexions inactives
 * les retrouve mortes au reveil (ECONNRESET). D'ou :
 *   - des connexions inactives liberees vite (idleTimeoutMillis) ;
 *   - un delai de connexion qui laisse a la base le temps de se reveiller ;
 *   - un ecouteur d'erreur, sans lequel la coupure d'une connexion inactive
 *     ferait tomber le processus ;
 *   - une seconde tentative quand la connexion meurt AVANT que la requete
 *     ait pu s'executer (voir `reessayable` et `ouvrir`).
 */
function pool(): pg.Pool {
  if (!g.__proximaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL manquant : voir .env.example.');
    const p = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 20_000, keepAlive: true });
    p.on('error', (e) => console.warn('[db] connexion inactive fermée par le serveur :', e.message));
    g.__proximaPool = p;
  }
  return g.__proximaPool;
}

/** Coupure de connexion (et non erreur SQL) : relancer sur une connexion neuve est sans danger. */
function coupure(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return (
    ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', '57P01'].includes(err?.code ?? '') ||
    /Connection terminated|Authentication timed out|timeout exceeded when trying to connect/i.test(err?.message ?? '')
  );
}

/**
 * Seules les lectures sont relancees apres une coupure : une ecriture dont
 * la connexion tombe a pu etre executee avant la coupure, et la rejouer
 * risquerait de l'appliquer deux fois.
 */
const reessayable = (sql: string) => /^\s*(SELECT|WITH)\b/i.test(sql);

export async function requete<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    return (await pool().query(sql, params)).rows as T[];
  } catch (e) {
    if (!coupure(e) || !reessayable(sql)) throw e;
    return (await pool().query(sql, params)).rows as T[];
  }
}

export async function une<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await requete<T>(sql, params))[0];
}

/** Connexion prete, BEGIN execute. Si BEGIN echoue sur une coupure, rien n'a ete fait : on retente une fois. */
async function ouvrir(): Promise<pg.PoolClient> {
  for (let essai = 1; ; essai++) {
    const c = await pool().connect();
    try {
      await c.query('BEGIN');
      return c;
    } catch (e) {
      c.release(true); // connexion detruite, pas rendue au pool
      if (essai >= 2 || !coupure(e)) throw e;
    }
  }
}

/** Execute `fn` dans une transaction ; tout est annule si elle leve une erreur. */
export async function transaction<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await ouvrir();
  let casse = false;
  try {
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    // sur une connexion coupee, ROLLBACK echouerait aussi et masquerait l'erreur d'origine
    if (coupure(e)) casse = true;
    else await c.query('ROLLBACK').catch(() => (casse = true));
    throw e;
  } finally {
    c.release(casse);
  }
}
