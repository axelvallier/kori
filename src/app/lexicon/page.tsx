import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { Manquants } from "@/app/lexicon/manquants";
import { type Manquant, regrouperManquants } from "@/lib/lexique";
import { RAYONS } from "@/lib/rayons";
import { createClient } from "@/lib/supabase/server";
import { normalize } from "@/lib/terms";

/**
 * Écran de lexique (ticket 16). En tête, les termes de la liste qui attendent
 * une traduction, chacun avec sa saisie sur une ligne ; en dessous, la
 * recherche dans le lexique partagé.
 *
 * C'est le raccourci manuel du chemin que le connecteur automatise : devant le
 * produit, l'étiquette sous les yeux, taper le finnois prend moins de temps
 * que d'ouvrir Claude.
 */

/**
 * Les paramètres d'URL sont une entrée comme une autre. `q` borné comme un
 * terme du lexique ; `fr` est le terme d'où l'on vient depuis la liste, borné
 * à la longueur d'une ligne de liste.
 */
const parametres = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  fr: z.string().trim().min(1).max(120).optional().catch(undefined),
});

type Trouve = { id: string; fr: string; fi: string; aisle: string };

/**
 * Recherche dans le lexique, insensible à la casse, sur le français et sur le
 * finnois : en rayon on lit un mot finnois sur une étiquette sans savoir ce
 * que c'est, et l'écran doit répondre à ce sens-là aussi.
 *
 * Deux requêtes plutôt qu'un `or()` : la syntaxe des filtres composés de
 * PostgREST demande d'échapper virgules, parenthèses et guillemets dans la
 * valeur, et une recherche mal échappée est une recherche qui trouve n'importe
 * quoi. Les jokers de `like`, eux, sont échappés — « 100 % » ne doit pas tout
 * renvoyer.
 */
async function chercher(supabase: SupabaseClient, q: string): Promise<Trouve[]> {
  const motif = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const colonnes = "id, fr, fi, aisle";

  const [parFr, parFi] = await Promise.all([
    supabase.from("terms").select(colonnes).ilike("fr", motif).order("fr").limit(30).returns<Trouve[]>(),
    supabase.from("terms").select(colonnes).ilike("fi", motif).order("fi").limit(30).returns<Trouve[]>(),
  ]);

  const vus = new Map<string, Trouve>();
  for (const t of [...(parFr.data ?? []), ...(parFi.data ?? [])]) vus.set(t.id, t);
  return [...vus.values()].sort((a, b) => a.fr.localeCompare(b.fr, "fr"));
}

const LIBELLE_RAYON = new Map(RAYONS.map((r) => [r.code, r.fi]));

export default async function Page({ searchParams }: PageProps<"/lexicon">) {
  const params = parametres.parse(await searchParams);
  const supabase = await createClient();

  // Aucun filtre sur le compte : RLS borne `list_items` aux listes du compte.
  const [{ data: lignes }, trouves] = await Promise.all([
    supabase
      .from("list_items")
      .select("raw_fr")
      .is("term_id", null)
      .order("position", { ascending: true })
      .returns<{ raw_fr: string }[]>(),
    params.q ? chercher(supabase, params.q) : Promise.resolve([]),
  ]);

  const manquants: Manquant[] = regrouperManquants(lignes ?? []);

  // Le terme d'où l'on vient est mis en tête, et c'est lui qui reçoit le
  // focus. S'il n'est plus en attente — rattaché entre-temps par le
  // connecteur — il est proposé quand même : on est devant le produit, et le
  // lexique peut toujours prendre une entrée de plus.
  const cible = params.fr ? normalize(params.fr) : null;
  if (params.fr && cible && !manquants.some((m) => m.forme === cible)) {
    manquants.unshift({ fr: params.fr, forme: cible, lignes: 0 });
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col p-4">
      <header className="flex items-center justify-between gap-3 pb-3">
        <h1 className="truncate text-lg font-semibold tracking-tight">Lexique</h1>
        <Link
          href="/"
          className="-mr-2 flex min-h-12 items-center px-2 text-sm text-black/55 dark:text-white/55"
        >
          Liste
        </Link>
      </header>

      <Manquants manquants={manquants} cible={cible} />

      <form action="/lexicon" method="get" className="mt-6 flex gap-2">
        <input
          name="q"
          type="search"
          defaultValue={params.q ?? ""}
          maxLength={80}
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="search"
          aria-label="Chercher dans le lexique"
          placeholder="Chercher : tomate, maito…"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-black/15 bg-transparent px-4 text-base outline-none focus:border-foreground dark:border-white/20"
        />
        <button
          type="submit"
          className="min-h-12 rounded-xl border border-black/15 px-4 text-sm font-medium dark:border-white/20"
        >
          Chercher
        </button>
      </form>

      {params.q &&
        (trouves.length === 0 ? (
          <p className="mt-4 text-sm text-black/55 dark:text-white/55">
            Rien pour « {params.q} ». Ajoute le produit à ta liste : il apparaîtra
            ici, en attente de traduction.
          </p>
        ) : (
          <ul className="mt-2">
            {trouves.map((t) => (
              <li
                key={t.id}
                className="flex min-h-12 items-center gap-3 border-b border-black/5 py-1.5 dark:border-white/10"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1.2rem] font-semibold leading-tight">{t.fi}</span>
                  <span className="block truncate text-[0.8rem] leading-tight text-black/50 dark:text-white/50">
                    {t.fr}
                  </span>
                </span>
                <span className="shrink-0 text-[0.75rem] uppercase tracking-wider text-black/40 dark:text-white/40">
                  {LIBELLE_RAYON.get(t.aisle as (typeof RAYONS)[number]["code"]) ?? t.aisle}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </main>
  );
}
