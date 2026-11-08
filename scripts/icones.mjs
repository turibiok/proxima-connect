/**
 * Genere les icones PNG de l'application installable (phase 4) a partir du
 * logo (app/icon.svg) : carre bleu arrondi, anneau blanc, point orange.
 *
 *   node scripts/icones.mjs
 *
 * Sans dependance : dessin par sur-echantillonnage (bords lisses) et
 * encodage PNG avec zlib. Les fichiers produits sont commites dans public/.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const BLEU = [0x1d, 0x4e, 0xd8];
const BLANC = [0xff, 0xff, 0xff];
const ORANGE = [0xf5, 0x9e, 0x0b];

// ------------------------------------------------------------ PNG

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const bloc = (type, donnees) => {
  const t = Buffer.from(type, 'ascii');
  const lg = Buffer.alloc(4);
  lg.writeUInt32BE(donnees.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, donnees])));
  return Buffer.concat([lg, t, donnees, crc]);
};
function png(taille, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RGBA
  const lignes = Buffer.alloc((taille * 4 + 1) * taille);
  for (let y = 0; y < taille; y++) {
    lignes[y * (taille * 4 + 1)] = 0; // filtre « aucun »
    pixels.copy(lignes, y * (taille * 4 + 1) + 1, y * taille * 4, (y + 1) * taille * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(lignes, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------ dessin

/**
 * Couleur du logo au point (u, v) de [0, 32]^2, ou null (transparent).
 * `plein` : fond carre sans arrondi (icone « maskable », que le systeme
 * decoupe lui-meme) ; `echelle` : agrandissement du motif (1 = logo d'origine).
 */
function couleur(u, v, { plein, echelle }) {
  const r = plein ? 0 : 7;
  const dans = (x, y) => {
    const cx = Math.min(Math.max(x, r), 32 - r);
    const cy = Math.min(Math.max(y, r), 32 - r);
    return x >= 0 && x <= 32 && y >= 0 && y <= 32 && (r === 0 || (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
  };
  if (!dans(u, v)) return null;
  // motif centre, mis a l'echelle
  const x = 16 + (u - 16) / echelle;
  const y = 16 + (v - 16) / echelle;
  const d = Math.hypot(x - 16, y - 16);
  if (d <= 2) return ORANGE;
  if (d >= 4.5 && d <= 7.5) return BLANC;
  return BLEU;
}

function icone(taille, options) {
  const ss = 4; // sur-echantillonnage
  const px = Buffer.alloc(taille * taille * 4);
  for (let py = 0; py < taille; py++) {
    for (let pxx = 0; pxx < taille; pxx++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = couleur(((pxx + (sx + 0.5) / ss) / taille) * 32, ((py + (sy + 0.5) / ss) / taille) * 32, options);
          if (c) {
            r += c[0]; g += c[1]; b += c[2]; a += 1;
          }
        }
      }
      const i = (py * taille + pxx) * 4;
      if (a) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return png(taille, px);
}

const dossier = path.join(import.meta.dirname, '..', 'public');
mkdirSync(dossier, { recursive: true });
const sorties = [
  ['icone-192.png', 192, { plein: false, echelle: 1 }],
  ['icone-512.png', 512, { plein: false, echelle: 1 }],
  // maskable : motif agrandi, anneau a 33 % du bord, dans la zone sure (40 %)
  ['icone-maskable-512.png', 512, { plein: true, echelle: 1.4 }],
  ['apple-touch-icon.png', 180, { plein: true, echelle: 1.2 }],
];
for (const [nom, taille, options] of sorties) {
  writeFileSync(path.join(dossier, nom), icone(taille, options));
  console.log(`public/${nom} (${taille} px)`);
}
