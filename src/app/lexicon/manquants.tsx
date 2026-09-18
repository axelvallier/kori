"use client";

import { useState, useTransition } from "react";

import { ajouterTraduction } from "./actions";
import type { Manquant } from "@/lib/lexique";
import { RAYONS } from "@/lib/rayons";

/**
 * Les termes en attente de traduction, chacun avec sa saisie sur une ligne :
 * le finnois, le rayon, et un seul bouton. Le critère du ticket est quinze
 * secondes depuis un téléphone ; tout ce qui n'est pas ces trois choses est de
 * trop.
 *
 * Un terme traduit ne disparaît pas d'un coup : sa ligne se replie sur le
 * résultat, pour qu'on voie ce qu'on vient d'écrire dans un lexique partagé —
 * et qu'on repère une faute avant de passer au suivant.
 */
export function Manquants({ manquants, cible }: { manquants: Manquant[]; cible: string | null }) {
  if (manquants.length === 0) {
    return (
      <p className="text-sm text-black/55 dark:text-white/55">
        Toutes les lignes de ta liste ont leur finnois.
      </p>
    );
  }

  return (
    <section>
      <h2 className="border-b border-black/10 pb-1 text-[0.8rem] font-semibold uppercase tracking-wider dark:border-white/15">
        En attente de traduction
        <span className="ml-2 font-normal normal-case tracking-normal text-black/45 dark:text-white/45">
          {manquants.length}
        </span>
      </h2>
      <ul>
        {manquants.map((m) => (
          <Saisie key={m.forme} manquant={m} focus={m.forme === cible} />
        ))}
      </ul>
    </section>
  );
}

type Fait = { fi: string; rattachees: number; cree: boolean; rattachementOk: boolean };

function Saisie({ manquant, focus }: { manquant: Manquant; focus: boolean }) {
  const [enCours, lancer] = useTransition();
  const [fait, setFait] = useState<Fait | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function envoyer(donnees: FormData) {
    const fi = String(donnees.get("fi") ?? "");
    const aisle = String(donnees.get("aisle") ?? "");

    lancer(async () => {
      setErreur(null);
      const resultat = await ajouterTraduction({ fr: manquant.fr, fi, aisle });
      if (resultat.ok) setFait(resultat);
      else setErreur(resultat.message);
    });
  }

  if (fait) {
    return (
      <li className="border-b border-black/5 py-2 dark:border-white/10">
        <span className="block truncate text-[1.2rem] font-semibold leading-tight">{fait.fi}</span>
        <span className="block truncate text-[0.8rem] leading-tight text-black/50 dark:text-white/50">
          {manquant.fr}
          {" · "}
          {!fait.cree
            ? "déjà dans le lexique, rien n'a été écrasé"
            : !fait.rattachementOk
              ? "ajouté, mais la liste n'a pas pu être mise à jour — réessaie l'ajout du produit"
              : fait.rattachees === 0
                ? "ajouté au lexique"
                : `ajouté, ${fait.rattachees} ligne${fait.rattachees > 1 ? "s" : ""} de ta liste`}
        </span>
      </li>
    );
  }

  return (
    <li className="border-b border-black/5 py-2 dark:border-white/10">
      <form action={envoyer} className="flex flex-col gap-2">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[1.1rem] font-medium leading-tight">
            {manquant.fr}
          </span>
          {manquant.lignes > 0 && (
            <span className="shrink-0 text-[0.75rem] text-black/45 dark:text-white/45">
              {manquant.lignes} ligne{manquant.lignes > 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span className="flex gap-2">
          <input
            name="fi"
            type="text"
            required
            maxLength={80}
            autoFocus={focus}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="done"
            aria-label={`Finnois pour ${manquant.fr}`}
            placeholder="finnois, comme sur l'étiquette"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-black/15 bg-transparent px-3 text-base outline-none focus:border-foreground dark:border-white/20"
          />
          <select
            name="aisle"
            defaultValue="other"
            aria-label={`Rayon de ${manquant.fr}`}
            className="min-h-12 max-w-[9rem] rounded-xl border border-black/15 bg-transparent px-2 text-sm dark:border-white/20"
          >
            {RAYONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.fi}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={enCours}
            aria-label={`Enregistrer la traduction de ${manquant.fr}`}
            className="min-h-12 min-w-12 rounded-xl bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50"
          >
            OK
          </button>
        </span>
        {erreur && (
          <span role="alert" className="text-sm text-red-600 dark:text-red-400">
            {erreur}
          </span>
        )}
      </form>
    </li>
  );
}
