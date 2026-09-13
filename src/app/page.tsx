import { seDeconnecter } from "@/app/auth/actions";
import { Liste } from "@/app/liste";
import { chargerListe } from "@/lib/liste";

export default async function Page() {
  const liste = await chargerListe();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col p-4">
      <header className="flex items-center justify-between gap-3 pb-3">
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {liste?.name ?? "Kori"}
        </h1>
        <form action={seDeconnecter}>
          <button
            type="submit"
            className="-mr-2 flex min-h-12 min-w-12 items-center justify-center px-2 text-sm text-black/55 dark:text-white/55"
          >
            Quitter
          </button>
        </form>
      </header>

      {liste ? (
        <Liste lignes={liste.lignes} />
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
