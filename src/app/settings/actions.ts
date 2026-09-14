"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { creerJeton } from "@/lib/jetons";
import { createClient } from "@/lib/supabase/server";

/**
 * Création et révocation des jetons du connecteur.
 *
 * Comme partout dans l'application, ces actions utilisent le client à clé
 * publiable : les politiques RLS de `mcp_tokens` bornent la lecture, l'écriture
 * et la révocation au compte connecté. Aucun filtre applicatif n'est écrit ici.
 * La règle s'inverse dans la route du connecteur, qui travaille avec la clé
 * secrète — voir .claude/rules/route-mcp.md.
 */

export type Resultat<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { valeur: T }))
  | { ok: false; message: string };

/**
 * Le libellé sert à reconnaître un jeton six mois plus tard — « téléphone »,
 * « Claude bureau ». Facultatif, court, et sans autre contrainte : c'est une
 * note personnelle, pas un identifiant.
 */
const libelleSchema = z.object({
  libelle: z
    .string()
    .trim()
    .max(40, "Libellé trop long : 40 caractères au maximum")
    .optional(),
});

const identifiant = z.uuid("Identifiant invalide");

/**
 * Crée un jeton et renvoie sa valeur en clair, **une seule fois**.
 *
 * Le clair ne repart ni en base, ni dans un journal, ni dans un cookie : il
 * traverse cette réponse et vit ensuite dans l'état d'un composant client,
 * jusqu'au premier rechargement de page. C'est ce qui rend le premier critère
 * du ticket vrai par construction plutôt que par discipline — il n'existe nulle
 * part d'où on pourrait le relire.
 */
export async function creerJetonConnecteur(
  libelle: string | undefined,
): Promise<Resultat<{ clair: string; prefix: string }>> {
  const analyse = libelleSchema.safeParse({ libelle });
  if (!analyse.success) {
    return { ok: false, message: analyse.error.issues[0].message };
  }

  const supabase = await createClient();

  // L'identifiant du compte est relu de la session, jamais reçu du client.
  // `getClaims()` vérifie la signature du jeton d'accès ; `getSession()` se
  // contenterait de lire un cookie que le navigateur peut écrire.
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) {
    return { ok: false, message: "Session expirée. Reconnecte-toi." };
  }

  const jeton = creerJeton();

  const { error } = await supabase.from("mcp_tokens").insert({
    user_id: userId,
    token_hash: jeton.hash,
    prefix: jeton.prefix,
    label: analyse.data.libelle || null,
  });

  if (error) {
    console.error("creerJetonConnecteur", error.code, error.message);
    return { ok: false, message: "La création n'est pas passée. Réessaie." };
  }

  revalidatePath("/settings");
  return { ok: true, valeur: { clair: jeton.clair, prefix: jeton.prefix } };
}

/**
 * Révoque un jeton. La ligne est conservée avec `revoked_at` renseignée plutôt
 * que supprimée : un jeton révoqué reste une trace utile — il raconte qu'il a
 * existé, quand il a servi la dernière fois, et pourquoi il ne marche plus. Une
 * ligne effacée laisserait croire à un jeton jamais créé.
 *
 * Idempotente : révoquer deux fois ne change rien, la date de la première
 * révocation est conservée par le filtre `is("revoked_at", null)`.
 */
export async function revoquerJeton(id: string): Promise<Resultat> {
  const analyse = identifiant.safeParse(id);
  if (!analyse.success) return { ok: false, message: "Identifiant invalide" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("mcp_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", analyse.data)
    .is("revoked_at", null);

  if (error) {
    console.error("revoquerJeton", error.code, error.message);
    return { ok: false, message: "La révocation n'est pas passée. Réessaie." };
  }

  revalidatePath("/settings");
  return { ok: true };
}
