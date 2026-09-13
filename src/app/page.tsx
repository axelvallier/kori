import { seDeconnecter } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Écran de contrôle temporaire. Le ticket 08 le remplace par la liste.
 *
 * Il sert pour l'instant à prouver deux choses d'un coup d'œil : que la session
 * arrive bien jusqu'au composant serveur, et que le lexique devient visible dès
 * qu'il y a une session — la politique de lecture de `terms` est `to
 * authenticated`, donc un visiteur sans session compte zéro terme sur une table
 * qui en contient des centaines.
 */
export default async function Home() {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const email = claims?.claims.email as string | undefined;

  const { count } = await supabase.from("terms").select("id", { count: "exact" }).limit(1);

  // Aucun appel de création ici : la liste est provisionnée par le déclencheur
  // sur `auth.users` (ticket 06). Si l'application la créait aussi de son côté,
  // il y aurait deux chemins d'écriture pour la même chose, et un jour deux
  // listes. Une liste absente est donc une anomalie à voir, pas à rattraper.
  const { data: listes } = await supabase.from("lists").select("id, name");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Kori</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Session ouverte{email ? ` pour ${email}` : ""}.
        </p>
      </div>

      <div className="rounded-xl border border-black/10 px-4 py-3 text-sm dark:border-white/15">
        <p>
          Lexique : <strong>{count ?? 0}</strong> {count === 1 ? "terme" : "termes"}.
        </p>
        <p className="mt-1">
          {listes?.length === 1 ? (
            <>
              Liste : <strong>{listes[0].name}</strong>, vide et prête.
            </>
          ) : (
            <>Listes : <strong>{listes?.length ?? 0}</strong>, attendu 1.</>
          )}
        </p>
      </div>

      <form action={seDeconnecter}>
        <button
          type="submit"
          className="min-h-12 w-full rounded-xl border border-black/15 px-4 text-base font-medium dark:border-white/20"
        >
          Se déconnecter
        </button>
      </form>
    </main>
  );
}
