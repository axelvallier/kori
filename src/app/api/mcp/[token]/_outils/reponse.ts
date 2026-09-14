import { z } from "zod";

/**
 * Ce que tout outil du connecteur renvoie, et comment.
 *
 * Deux formes de réponse, et une seule règle pour choisir : `repondre` quand
 * l'outil a fait son travail, `echouer` quand il ne l'a pas fait. Claude traite
 * les deux différemment — une réponse d'erreur n'est pas une donnée, elle se
 * raconte à l'utilisateur.
 */

/**
 * « Ce champ ou rien », en `anyOf` plutôt qu'en `z.nullable()`.
 *
 * `z.nullable()` produit `"type": ["string", "null"]`, une forme légale de JSON
 * Schema que plusieurs clients MCP lisent mal : ils attendent un `type` simple,
 * et selon les cas rejettent l'outil ou laissent tomber la contrainte.
 * L'inspecteur le signale en `--strict`. `anyOf` dit la même chose partout.
 */
export function ouRien<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.null()]);
}

/**
 * Réponse normale. Le texte et la structure portent la **même** information :
 * le texte pour que Claude sache quoi dire, la structure pour qu'il sache quoi
 * faire ensuite — l'identifiant d'un item, par exemple, se lit mal dans une
 * phrase.
 */
export function repondre(texte: string, structure?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: texte }],
    ...(structure ? { structuredContent: structure } : {}),
  };
}

/**
 * Réponse d'échec. `isError` dispense de renvoyer une structure : le SDK ne
 * valide pas la sortie d'un résultat en erreur, ce qui évite d'avoir à inventer
 * des champs vides pour satisfaire un schéma qui décrit un succès.
 */
export function echouer(texte: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: texte }],
  };
}

/**
 * Le jeton est bon, c'est le provisionnement qui manque. Le dire plutôt que de
 * rendre une liste vide : une liste vide se lit « tu n'as rien à acheter », ce
 * qui enverrait chercher le problème du mauvais côté.
 */
export const SANS_LISTE =
  "Le jeton est valide, mais aucune liste n'est rattachée à ce compte. " +
  "C'est une anomalie de provisionnement, pas une liste vide.";
