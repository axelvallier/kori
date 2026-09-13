import { z } from "zod";

/**
 * Validation des variables d'environnement.
 *
 * La separation entre variables publiques et variables serveur est stricte et
 * volontaire. Next remplace litteralement toute occurrence de
 * `process.env.NEXT_PUBLIC_*` par sa valeur au moment du build, y compris dans
 * le bundle envoye au navigateur. Une variable serveur qui se retrouverait
 * derriere un nom prefixe `NEXT_PUBLIC_`, ou lue depuis un composant client,
 * serait donc publiee.
 *
 * Pour la cle secrete Supabase, la consequence est totale : elle contourne
 * les politiques de securite au niveau des lignes et donne un acces complet a
 * la base. C'est le risque numero un de cette stack, d'ou la garde d'execution
 * de `serverEnv()`.
 */

/**
 * Une variable absente et une variable vide sont le meme probleme pour qui lit
 * le message. Sans ce `error`, zod repondrait "expected string, received
 * undefined", ce qui decrit le type et pas la cause.
 */
function requise(nom: string) {
  const message = `${nom} est manquante ou vide`;
  return z.string({ error: message }).min(1, message);
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(racine)"} : ${issue.message}`)
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Variables publiques                                                        */
/* -------------------------------------------------------------------------- */

/**
 * La pile Supabase locale ecoute en http sur la boucle locale. Exiger https
 * partout rendrait le developpement local impossible ; accepter http partout
 * laisserait passer une URL de production en clair. L'exception est donc bornee
 * a l'hote, pas au mode d'execution : une URL distante en http reste refusee
 * meme en developpement.
 */
function urlSupabaseAcceptable(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol === "https:") return true;

  return (
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]")
  );
}

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: requise("NEXT_PUBLIC_SUPABASE_URL")
    .url("doit etre une URL absolue")
    .refine(urlSupabaseAcceptable, "doit etre en https, sauf sur la boucle locale"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: requise("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
});

/**
 * Lu au chargement du module : une variable publique absente doit faire echouer
 * le demarrage, pas une page au hasard. Les acces a `process.env` sont ecrits
 * en toutes lettres, c'est la seule forme que Next sait remplacer.
 */
const publicParsed = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!publicParsed.success) {
  throw new Error(
    "Variables d'environnement publiques invalides :\n" +
      formatIssues(publicParsed.error) +
      "\nVoir .env.example, puis renseigner .env.local en local et les reglages" +
      " du projet sur Vercel en deploiement.",
  );
}

export const publicEnv = publicParsed.data;

/* -------------------------------------------------------------------------- */
/* Variables serveur                                                          */
/* -------------------------------------------------------------------------- */

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: requise("SUPABASE_SECRET_KEY"),
});

type ServerEnv = z.infer<typeof serverSchema>;

let serverCache: ServerEnv | undefined;

/**
 * Acces aux variables serveur. Volontairement une fonction et non une constante
 * exportee : tant qu'elle n'est pas appelee, rien n'est lu, et un import depuis
 * un module client n'embarque aucune valeur.
 *
 * Leve si le code s'execute dans un navigateur. Cette garde ne remplace pas la
 * discipline d'appel, elle la rend bruyante : elle attrape l'erreur a
 * l'execution, pas a la compilation.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverEnv() a ete appele depuis le navigateur. La cle secrete Supabase" +
        " contourne toutes les politiques de securite : elle ne doit jamais" +
        " sortir du serveur. Deplace cet appel dans un composant serveur, une" +
        " route handler ou une server action.",
    );
  }

  if (serverCache) {
    return serverCache;
  }

  const parsed = serverSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      "Variables d'environnement serveur invalides :\n" + formatIssues(parsed.error),
    );
  }

  serverCache = parsed.data;
  return serverCache;
}
