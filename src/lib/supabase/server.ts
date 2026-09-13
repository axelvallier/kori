import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env";

/**
 * Client Supabase pour le contexte serveur : composants serveur, route
 * handlers, server actions.
 *
 * Un client par requête, jamais partagé. La bibliothèque est explicite là-dessus
 * et la raison est sérieuse en multi-utilisateur : un client réutilisé entre
 * deux requêtes porterait la session du premier visiteur dans la réponse du
 * second. D'où la fabrique, et non une constante exportée.
 *
 * Ce client utilise la clé publiable, pas la clé secrète : les requêtes passent
 * donc par les politiques RLS avec l'identité de l'utilisateur connecté. C'est
 * voulu. Le client à clé secrète, qui les contourne, appartient à la route du
 * connecteur (ticket 12) et n'existe pas encore.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Next interdit d'écrire un cookie pendant le rendu d'un composant
            // serveur. Ce n'est pas une erreur : le middleware, posé au ticket
            // 05, rafraîchit la session en amont et écrit les cookies sur la
            // réponse. Sans ce middleware, les sessions expireront en silence.
          }
        },
      },
    },
  );
}
