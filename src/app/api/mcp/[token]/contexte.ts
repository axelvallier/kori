import type { SupabaseClient } from "@supabase/supabase-js";

import { hacher, jetonSchema } from "@/lib/jetons";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Résolution du jeton d'URL en contexte de requête.
 *
 * C'est la frontière d'authentification du connecteur, et la seule. Tout ce qui
 * se trouve derrière suppose que `userId` est établi — d'où la règle : résoudre
 * **avant** d'exécuter le moindre outil, et n'exécuter aucun outil sur un
 * contexte partiel.
 */

export type Contexte = {
  /** Le compte auquel le jeton donne accès. Jamais reçu d'un argument d'outil. */
  userId: string;
  /**
   * La liste de ce compte. `null` est une anomalie de provisionnement, pas un
   * cas normal : le déclencheur du ticket 06 en crée une à l'inscription. Les
   * outils qui touchent à la liste doivent le dire au lieu d'échouer sur une
   * requête vide.
   */
  listId: string | null;
  /** Client à clé secrète, qui contourne RLS. Chaque requête filtre à la main. */
  supabase: SupabaseClient;
};

/**
 * Rend un contexte, ou `null`. Un seul `null` pour trois causes — jeton mal
 * formé, jeton inconnu, jeton révoqué — parce que la route doit répondre la
 * même chose aux trois. Distinguer les cas transformerait le connecteur en
 * oracle qui confirme qu'un jeton a existé.
 *
 * Le détail part dans les journaux du serveur, où il sert au débogage sans être
 * visible de l'appelant.
 */
export async function resoudreJeton(jetonBrut: string): Promise<Contexte | null> {
  // Le format se vérifie avant la base. Ce n'est pas une optimisation : c'est
  // la règle « toute entrée utilisateur est validée côté serveur », et un
  // segment d'URL en est une. Le raccourci ne révèle rien — l'appelant sait
  // déjà si la chaîne qu'il a envoyée a la bonne forme.
  const forme = jetonSchema.safeParse(jetonBrut);
  if (!forme.success) {
    console.warn("mcp: jeton mal formé");
    return null;
  }

  const supabase = createServiceClient();

  // Comparaison sur le haché, jamais sur le clair : la base ne contient pas le
  // clair, et c'est tout l'intérêt. `token_hash` est unique et indexé.
  const { data: jeton, error } = await supabase
    .from("mcp_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hacher(forme.data))
    .maybeSingle<{ id: string; user_id: string; revoked_at: string | null }>();

  if (error) {
    console.error("mcp: lecture du jeton", error.code, error.message);
    return null;
  }

  // Inconnu et révoqué prennent volontairement le même chemin, au même coût :
  // une requête, puis un refus. Un jeton révoqué qui coûterait un aller-retour
  // de plus se signalerait au chronomètre.
  if (!jeton || jeton.revoked_at !== null) {
    console.warn("mcp: jeton refusé", jeton ? "révoqué" : "inconnu");
    return null;
  }

  // Trace de dernière utilisation. Écrite à chaque appel et non à la première
  // fois : c'est ce qui permet de reconnaître un jeton qui ne sert plus, et
  // donc de le couper sans crainte. Une erreur ici n'empêche rien — la trace
  // est un confort, pas une autorisation.
  const { error: erreurTrace } = await supabase
    .from("mcp_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", jeton.id);

  if (erreurTrace) {
    console.error("mcp: trace d'utilisation", erreurTrace.code, erreurTrace.message);
  }

  // La liste est relue du compte, jamais reçue de l'appelant. Un identifiant de
  // liste venu des arguments d'un outil serait une donnée à vérifier, pas une
  // autorisation — et la vérification, on l'a déjà en relisant.
  const { data: liste } = await supabase
    .from("lists")
    .select("id")
    .eq("owner_id", jeton.user_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  return { userId: jeton.user_id, listId: liste?.id ?? null, supabase };
}
