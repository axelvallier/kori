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
    console.error("signInWithOtp", error.status, error.code, error.message);
    return { statut: "erreur", message: messageErreur(error) };
  }

  return { statut: "envoye", email };
}

/**
 * Traduction d'une erreur Supabase en phrase utile.
 *
 * Le détail n'est jamais repris tel quel : un message d'erreur
 * d'authentification raconte surtout si un compte existe. Seul le quota
 * d'envoi mérite une explication, parce que sans elle l'utilisateur redemande
 * un lien toutes les trente secondes et ne fait que s'enfoncer.
 *
 * Il y a deux quotas, et Supabase leur donne le **même** code
 * `over_email_send_rate_limit` : le délai minimum entre deux envois à la même
 * adresse, qui se compte en secondes, et le quota du service d'envoi intégré,
 * qui se compte en poignée d'emails par heure. Seul le texte anglais les
 * distingue, et lui seul porte le décompte.
 *
 * D'où la lecture du décompte, assumée comme une heuristique : si la
 * formulation de Supabase change, la recherche échoue et on retombe sur le cas
 * général. Le pire que ça produise est un message moins précis, jamais faux —
 * contrairement au « réessaie dans quelques minutes » d'avant, qui promettait
 * des minutes là où il fallait parfois attendre une heure.
 */
function messageErreur(error: { status?: number; message: string }): string {
  if (error.status !== 429) {
    return "L'envoi a échoué. Réessaie dans un instant.";
  }

  const secondes = /after (\d+) seconds?/i.exec(error.message)?.[1];
  if (secondes) {
    return `Encore ${secondes} secondes avant de pouvoir redemander un lien.`;
  }

  return (
    "Trop de liens demandés. Si tu en as déjà reçu un sans l'utiliser, il est" +
    " peut-être encore valide. Sinon, l'envoi est limité à quelques emails par heure."
  );
}
