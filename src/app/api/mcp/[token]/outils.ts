import type { McpServer } from "@modelcontextprotocol/server";

import type { Contexte } from "./contexte";
import { enregistrerOutilsLexique } from "./_outils/lexique";
import { enregistrerOutilsListe } from "./_outils/liste";
import { enregistrerPing } from "./_outils/ping";

/**
 * Le catalogue d'outils exposé à Claude, assemblé pour une requête et un compte.
 *
 * Deux règles, valables pour tout ce qui s'ajoute ici :
 *
 * 1. **Chaque requête porte son filtre de compte, écrit sur place.** Le client
 *    du contexte utilise la clé secrète et contourne RLS. Ne jamais s'en
 *    remettre à un filtre appliqué plus haut, ni à un identifiant reçu dans les
 *    arguments d'un outil.
 * 2. **Tout argument est une entrée utilisateur**, validée par un schéma zod.
 *    Ce que Claude envoie n'est pas plus digne de confiance qu'un formulaire.
 *
 * Le dossier `_outils/` porte un tiret bas : c'est la convention Next pour un
 * dossier qui ne doit pas devenir un segment de route.
 */
export function enregistrerOutils(server: McpServer, ctx: Contexte) {
  enregistrerPing(server, ctx);
  enregistrerOutilsListe(server, ctx);
  enregistrerOutilsLexique(server, ctx);
}
