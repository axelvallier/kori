import Link from "next/link";

import { Jetons, type JetonAffiche } from "@/app/settings/jetons";
import { createClient } from "@/lib/supabase/server";

/**
 * Écran des réglages. Un seul sujet pour l'instant : les jetons du connecteur
 * Claude (décision D3).
 *
 * Les dates sont mises en forme ici, côté serveur, et descendent en chaînes
 * déjà écrites. Les formater dans le composant client donnerait deux rendus
 * différents — le serveur et le navigateur n'ont ni le même fuseau ni forcément
 * la même locale — et React signalerait une divergence d'hydratation.
 */

const jour = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formater(date: string | null): string | null {
  return date ? jour.format(new Date(date)) : null;
}

export default async function Page() {
  const supabase = await createClient();

  // Aucun filtre sur le compte : RLS borne `mcp_tokens` au propriétaire. Et
  // aucune colonne de hachage dans le select — elle n'a rien à faire dans une
  // page, même du bon compte.
  const { data } = await supabase
    .from("mcp_tokens")
    .select("id, prefix, label, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false })
    .returns<
      {
        id: string;
        prefix: string;
        label: string | null;
        created_at: string;
        last_used_at: string | null;
        revoked_at: string | null;
      }[]
    >();

  const jetons: JetonAffiche[] = (data ?? []).map((j) => ({
    id: j.id,
    prefix: j.prefix,
    libelle: j.label,
    creeLe: formater(j.created_at) ?? "",
    utiliseLe: formater(j.last_used_at),
    revoqueLe: formater(j.revoked_at),
  }));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col p-4">
      <header className="flex items-center justify-between gap-3 pb-3">
        <h1 className="truncate text-lg font-semibold tracking-tight">Réglages</h1>
        <Link
          href="/"
          className="-mr-2 flex min-h-12 min-w-12 items-center justify-center px-2 text-sm text-black/55 dark:text-white/55"
        >
          Ma liste
        </Link>
      </header>

      <h2 className="mt-2 text-base font-semibold">Connecteur Claude</h2>
      <p className="mt-1 text-sm text-black/55 dark:text-white/55">
        Un jeton donne à Claude le droit de lire et d&apos;écrire ta liste. Il
        tient dans l&apos;adresse du connecteur : qui l&apos;a, l&apos;a. Ne la
        partage pas, et coupe le jeton si tu as un doute.
      </p>

      <Jetons jetons={jetons} />
    </main>
  );
}
