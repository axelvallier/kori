import Link from "next/link";

import { seDeconnecter } from "@/app/auth/actions";
import { Liste } from "@/app/liste";
import { chargerListe } from "@/lib/liste";

export default async function Page({ searchParams }: PageProps<"/">) {
  const [liste, params] = await Promise.all([chargerListe(), searchParams]);

  // Le raccourci du manifeste ouvre « /?ajout=1 » : l'application s'ouvre avec
  // le champ prêt et le clavier levé, ce qui est tout l'intérêt d'un appui long
  // sur l'icône plutôt que d'ouvrir l'application puis viser le champ.
  const saisieDirecte = params.ajout === "1";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col p-4">
      <header className="flex items-center justify-between gap-3 pb-3">
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {liste?.name ?? "Kori"}
        </h1>
        {/* Les réglages n'ont qu'un sujet, le connecteur, mais une page qu'on
            ne peut pas atteindre n'existe pas. Le lien reste discret : on y va
            une fois, à l'installation du connecteur, jamais en magasin. */}
        <nav className="flex shrink-0 items-center">
          <Link
            href="/lexicon"
            className="flex min-h-12 items-center justify-center px-2 text-sm text-black/55 dark:text-white/55"
          >
            Lexique
          </Link>
          <Link
            href="/settings"
            className="flex min-h-12 min-w-12 items-center justify-center px-2 text-sm text-black/55 dark:text-white/55"
          >
            Réglages
          </Link>
          <form action={seDeconnecter}>
            <button
              type="submit"
              className="-mr-2 flex min-h-12 min-w-12 items-center justify-center px-2 text-sm text-black/55 dark:text-white/55"
            >
              Quitter
            </button>
          </form>
        </nav>
      </header>

      {liste ? (
        <Liste lignes={liste.lignes} saisieDirecte={saisieDirecte} />
      ) : (
        // Le déclencheur du ticket 06 rend ce cas impossible pour un compte
        // neuf. Il reste affiché plutôt que masqué : une liste absente est une
        // anomalie de provisionnement, et la cacher derrière un écran vide
        // ferait chercher le bug du mauvais côté.
        <p role="alert" className="mt-8 text-sm text-black/55 dark:text-white/55">
          Aucune liste n&apos;est rattachée à ce compte. Déconnecte-toi et
          reconnecte-toi ; si le message persiste, c&apos;est le provisionnement
          qu&apos;il faut regarder.
        </p>
      )}
    </main>
  );
}
