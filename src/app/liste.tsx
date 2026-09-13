"use client";

import { useOptimistic, useRef, useState } from "react";

import { ajouterItem } from "./actions";
import type { Ligne } from "@/lib/liste";

/**
 * Ligne provisoire, affichée le temps de l'aller-retour. Son identifiant est
 * préfixé pour qu'aucune ligne réelle ne puisse porter le même : React s'en
 * sert comme clé, et deux clés identiques feraient clignoter la liste.
 */
function provisoire(texte: string): Ligne {
  return {
    id: `provisoire-${texte}-${Date.now()}`,
    raw_fr: texte,
    quantity: null,
    checked: false,
    created_at: new Date().toISOString(),
    terme: null,
  };
}

export function Liste({ lignes }: { lignes: Ligne[] }) {
  const [affichees, ajouterAffichee] = useOptimistic(lignes, (etat: Ligne[], texte: string) => [
    ...etat,
    provisoire(texte),
  ]);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  async function action(donnees: FormData) {
    const texte = String(donnees.get("texte") ?? "").trim();
    if (texte === "") return;

    // Le champ se vide et garde le focus avant même l'aller-retour : l'ajout
    // suivant peut être tapé pendant que celui-ci part. C'est ce qui permet de
    // saisir une liste entière sans jamais quitter le clavier.
    champ.current?.form?.reset();
    champ.current?.focus();

    setErreur(null);
    ajouterAffichee(texte);

    const resultat = await ajouterItem(texte);
    if (!resultat.ok) setErreur(resultat.message);
  }

  return (
    <>
      <form action={action} className="flex gap-2">
        <input
          ref={champ}
          name="texte"
          type="text"
          required
          maxLength={120}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="done"
          aria-label="Ajouter un produit"
          placeholder="tomates, du lait…"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-black/15 bg-transparent px-4 text-base outline-none focus:border-foreground dark:border-white/20"
        />
        <button
          type="submit"
          aria-label="Ajouter"
          className="min-h-12 min-w-12 rounded-xl bg-foreground px-4 text-xl font-medium text-background"
        >
          +
        </button>
      </form>

      {erreur && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {erreur}
        </p>
      )}

      {affichees.length === 0 ? (
        <p className="mt-8 text-balance text-sm text-black/55 dark:text-white/55">
          Ta liste est vide. Écris « tomates » ou « du lait » : le finnois
          s&apos;affiche à côté, c&apos;est lui que tu liras en rayon.
        </p>
      ) : (
        <ul className="mt-4">
          {affichees.map((ligne) => (
            <LigneItem key={ligne.id} ligne={ligne} />
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Le finnois en grand, le français en dessous (décision D4). C'est l'inverse du
 * sens de saisie, et c'est voulu : en rayon, le mot utile est le finnois.
 *
 * `truncate` sur les deux lignes : un terme long doit couper, jamais pousser la
 * ligne sur deux hauteurs. Dix items doivent tenir sans défilement, et une
 * liste dont les lignes changent de hauteur se relit mal en marchant.
 */
function LigneItem({ ligne }: { ligne: Ligne }) {
  const enCours = ligne.id.startsWith("provisoire-");

  return (
    <li
      className={`flex items-center gap-3 border-b border-black/5 py-1.5 dark:border-white/10 ${
        enCours ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        {ligne.terme ? (
          <>
            <p className="truncate text-[1.35rem] font-semibold leading-tight">
              {ligne.terme.fi}
            </p>
            <p className="truncate text-[0.8rem] leading-tight text-black/50 dark:text-white/50">
              {ligne.raw_fr}
            </p>
          </>
        ) : (
          <>
            {/* Traduction manquante : le gris dit qu'il manque quelque chose, et
                le français reprend la place principale — c'est le seul mot
                lisible qui reste, il ne doit pas être relégué en sous-titre. */}
            <p className="truncate text-[1.1rem] font-medium leading-tight">
              {ligne.raw_fr}
            </p>
            <p className="truncate text-[0.8rem] leading-tight text-black/35 dark:text-white/35">
              {enCours ? "ajout…" : "traduction manquante"}
            </p>
          </>
        )}
      </div>
    </li>
  );
}
