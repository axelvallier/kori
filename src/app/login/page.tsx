import type { Metadata } from "next";

import { Formulaire } from "./formulaire";

export const metadata: Metadata = { title: "Connexion — Kori" };

/**
 * Le cas « déjà connecté » est traité par le proxy, qui renvoie vers la liste
 * avant que cette page ne soit rendue. Le vérifier une seconde fois ici ne
 * ferait que payer un aller-retour de plus.
 */
export default async function Login({ searchParams }: PageProps<"/login">) {
  const { erreur } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Kori</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Ta liste de courses, en français et en finnois.
        </p>
      </div>

      {erreur === "lien" && (
        <p
          role="alert"
          className="rounded-xl border border-red-600/30 px-4 py-3 text-sm text-red-700 dark:text-red-400"
        >
          Ce lien n&apos;a pas fonctionné. Il a peut-être déjà servi, ou expiré,
          ou été ouvert dans un autre navigateur que celui qui l&apos;a demandé.
          Demandes-en un nouveau.
        </p>
      )}

      <Formulaire />
    </main>
  );
}
