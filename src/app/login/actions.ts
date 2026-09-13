"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type EtatConnexion =
  | { statut: "initial" }
  | { statut: "envoye"; email: string }
  | { statut: "erreur"; message: string };

/**
 * L'adresse est validée ici, côté serveur, et pas seulement par le
 * `type="email"` du champ : une validation côté client n'est pas une validation,
 * elle n'est qu'un confort d'usage. `trim()` avant le format, parce qu'un
 * clavier de téléphone ajoute volontiers une espace en fin de saisie.
 */
const schema = z.object({
  email: z
    .string()
    .trim()
    .max(254, "Adresse email trop longue")
    .pipe(z.email("Cette adresse ne ressemble pas à une adresse email")),
});

/**
 * Origine réelle de la requête, reconstruite depuis les en-têtes.
 *
 * Impossible d'utiliser une constante : le lien doit revenir sur le déploiement
 * d'où il est parti, et une URL de préversion Vercel change à chaque branche.
 *
 * Ce n'est pas une faille d'en-tête `Host` falsifiable : Supabase refuse toute
 * `emailRedirectTo` absente de sa liste d'URL autorisées. C'est cette liste, et
 * elle seule, qui borne où le lien peut atterrir.
 */
async function origine(): Promise<string> {
  const enTetes = await headers();

  const origin = enTetes.get("origin");
  if (origin) return origin;

  const hote = enTetes.get("x-forwarded-host") ?? enTetes.get("host");
  const protocole = enTetes.get("x-forwarded-proto") ?? "https";
  return `${protocole}://${hote}`;
}

export async function envoyerLienMagique(
  _precedent: EtatConnexion,
  donnees: FormData,
): Promise<EtatConnexion> {
  const analyse = schema.safeParse({ email: donnees.get("email") });

  if (!analyse.success) {
    return { statut: "erreur", message: analyse.error.issues[0].message };
  }

  const { email } = analyse.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await origine()}/auth/callback` },
  });

  if (error) {
    // Le message de Supabase est repris tel quel dans un seul cas, celui du
    // quota : « email rate limit exceeded » est une information utile, l'utilisateur
    // doit savoir qu'il faut attendre plutôt que recommencer. Le reste est
    // résumé, parce qu'un message d'erreur d'authentification détaillé raconte
    // surtout si un compte existe.
    const message =
      error.status === 429
        ? "Trop de demandes en peu de temps. Réessaie dans quelques minutes."
        : "L'envoi a échoué. Réessaie dans un instant.";
    console.error("signInWithOtp", error.status, error.code, error.message);
    return { statut: "erreur", message };
  }

  return { statut: "envoye", email };
}
