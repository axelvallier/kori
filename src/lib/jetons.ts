import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Jetons du connecteur MCP (décision D3).
 *
 * Ce module est importé des deux côtés de la barrière : l'écran des réglages,
 * qui crée les jetons avec l'identité de l'utilisateur, et la route du
 * connecteur, qui les vérifie avec la clé secrète. Une règle de hachage qui
 * divergerait d'un caractère entre les deux rendrait tous les jetons
 * inutilisables sans qu'aucun test unitaire ne le voie.
 *
 * Réservé au serveur : `node:crypto` n'existe pas dans le navigateur, et un
 * jeton fabriqué côté client serait un jeton connu du client.
 */

/**
 * 32 octets, soit 256 bits d'entropie. Ce jeton vaut à lui seul l'accès à la
 * liste — il n'y a pas de second facteur, pas de mot de passe, rien d'autre à
 * savoir. Il doit donc être hors de portée d'une recherche exhaustive pour
 * toujours, pas seulement pour la durée d'une session.
 *
 * `base64url` et non `hex` : même entropie en 43 caractères au lieu de 64, et
 * surtout un alphabet qui traverse une URL sans encodage. Un jeton qui contient
 * un `+` ou un `/` se fait mutiler au copier-coller.
 */
const OCTETS = 32;

/**
 * Longueur du préfixe conservé en clair, pour que l'utilisateur reconnaisse un
 * jeton dans la liste. Huit caractères suffisent à distinguer deux jetons d'un
 * même compte, et ne racourcissent pas utilement une attaque : il en resterait
 * trente-cinq, soit 210 bits.
 */
const PREFIXE = 8;

/**
 * Un jeton n'est complet qu'à l'instant de sa création. Le clair part vers
 * l'écran et n'est jamais écrit nulle part ; seuls le hachage et le préfixe
 * vont en base.
 */
export type JetonNeuf = {
  clair: string;
  hash: string;
  prefix: string;
};

export function creerJeton(): JetonNeuf {
  const clair = randomBytes(OCTETS).toString("base64url");
  return { clair, hash: hacher(clair), prefix: clair.slice(0, PREFIXE) };
}

/**
 * SHA-256, sans sel et sans étirement, et c'est volontaire : ce n'est pas un
 * mot de passe. Un mot de passe est court, choisi par un humain et deviné par
 * dictionnaire, d'où bcrypt et ses itérations. Un jeton de 256 bits tirés au
 * hasard n'a pas de dictionnaire, et un hachage lent coûterait ici à chaque
 * appel du connecteur, pas à chaque connexion.
 *
 * Ce qui compte est que la base ne contienne jamais le clair : quelqu'un qui
 * lirait la table ne pourrait pas s'en servir pour appeler le connecteur.
 */
export function hacher(clair: string): string {
  return createHash("sha256").update(clair).digest("hex");
}

/**
 * Forme attendue d'un jeton reçu dans une URL. Sert à rejeter ce qui ne peut
 * pas être un jeton avant d'aller le chercher en base — un segment d'URL est
 * une entrée utilisateur comme une autre.
 *
 * La longueur est fixe : 32 octets en base64url donnent exactement 43
 * caractères, sans remplissage.
 */
export const jetonSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "jeton mal formé");
