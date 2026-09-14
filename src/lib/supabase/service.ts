import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Client Supabase à **clé secrète**. Il contourne toutes les politiques RLS.
 *
 * Une seule partie de l'application a le droit de s'en servir : la route du
 * connecteur MCP, qui s'authentifie par un jeton d'URL et n'a donc aucune
 * session Supabase à présenter à la base. Partout ailleurs, le client de
 * `server.ts` porte l'identité de l'utilisateur et RLS fait le filtrage.
 *
 * Ce que ça implique, et c'est l'inversion complète de la règle du lot M1 :
 * **toute requête faite avec ce client doit porter son filtre de compte, écrit
 * sur place**. Le filet de la base ne joue plus. Voir
 * `.claude/rules/route-mcp.md`.
 *
 * `serverEnv()` lève si ce module est appelé depuis le navigateur. La garde ne
 * remplace pas la discipline, elle la rend bruyante.
 */
export function createServiceClient() {
  return createSupabaseClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SECRET_KEY,
    {
      auth: {
        // Rien à persister ni à rafraîchir : il n'y a pas d'utilisateur
        // derrière ce client, et pas de stockage où écrire. Laisser les
        // valeurs par défaut ferait chercher un `localStorage` inexistant.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
