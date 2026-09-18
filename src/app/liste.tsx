"use client";

import { type ReactNode, startTransition, useEffect, useOptimistic, useRef, useState } from "react";

import { ajouterItem, basculerCoche, supprimerItem, viderCoches } from "./actions";
import type { Ligne } from "@/lib/liste";
import { grouperParRayon } from "@/lib/rayons";
import { avecReprise } from "@/lib/reprise";
import { parseEntry } from "@/lib/saisie";

/**
 * Ligne provisoire, affichée le temps de l'aller-retour. Son identifiant est
 * préfixé pour qu'aucune ligne réelle ne puisse porter le même : React s'en
 * sert comme clé, et deux clés identiques feraient clignoter la liste.
 */
function provisoire(texte: string): Ligne {
  // La même analyse que côté serveur, pour que la ligne provisoire montre déjà
  // la quantité à droite et le produit seul à gauche. Sans ça, « 500g de
  // farine » s'afficherait en entier une demi-seconde puis se réorganiserait.
  const { quantite, produit } = parseEntry(texte);

  return {
    id: `provisoire-${texte}-${Date.now()}`,
    raw_fr: produit,
    quantity: quantite === "" ? null : quantite,
    checked: false,
    created_at: new Date().toISOString(),
    terme: null,
  };
}

type Geste =
  | { type: "ajout"; texte: string }
  | { type: "coche"; id: string; valeur: boolean }
  | { type: "suppression"; id: string }
  | { type: "vidage" };

function appliquerGeste(etat: Ligne[], geste: Geste): Ligne[] {
  switch (geste.type) {
    case "ajout":
      return [...etat, provisoire(geste.texte)];
    case "coche":
      return etat.map((l) => (l.id === geste.id ? { ...l, checked: geste.valeur } : l));
    case "suppression":
      return etat.filter((l) => l.id !== geste.id);
    case "vidage":
      return etat.filter((l) => !l.checked);
  }
}

export function Liste({
  lignes,
  saisieDirecte = false,
}: {
  lignes: Ligne[];
  saisieDirecte?: boolean;
}) {
  const [affichees, jouer] = useOptimistic(lignes, appliquerGeste);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmeVidage, setConfirmeVidage] = useState(false);
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saisieDirecte) champ.current?.focus();
  }, [saisieDirecte]);

  /**
   * Coalescence des appuis rapides. Tant qu'une écriture est en vol pour un
   * item, la suivante ne part pas : on garde seulement l'état voulu, et on
   * l'envoie au retour si la valeur a changé entre-temps. Cinq appuis de suite
   * font donc au plus deux requêtes, jamais cinq — et la dernière porte
   * toujours l'état final.
   */
  const voulu = useRef(new Map<string, boolean>());
  const enVol = useRef(new Set<string>());

  async function ecrireCoche(id: string, valeur: boolean) {
    voulu.current.set(id, valeur);
    if (enVol.current.has(id)) return;

    enVol.current.add(id);
    try {
      let envoye: boolean | undefined;
      while (voulu.current.get(id) !== envoye) {
        envoye = voulu.current.get(id)!;
        const resultat = await avecReprise(() => basculerCoche(id, envoye!));
        if (!resultat.ok) throw new Error(resultat.message);
      }
    } finally {
      enVol.current.delete(id);
      voulu.current.delete(id);
    }
  }

  async function ajouter(donnees: FormData) {
    const texte = String(donnees.get("texte") ?? "").trim();
    if (texte === "") return;

    // Le champ se vide et garde le focus avant même l'aller-retour : l'ajout
    // suivant peut être tapé pendant que celui-ci part. C'est ce qui permet de
    // saisir une liste entière sans jamais quitter le clavier.
    champ.current?.form?.reset();
    champ.current?.focus();

    setErreur(null);
    jouer({ type: "ajout", texte });

    // Pas de reprise sur l'ajout : il n'est pas idempotent, et le rejouer
    // créerait un doublon. Voir lib/reprise.ts.
    const resultat = await ajouterItem(texte);
    if (!resultat.ok) setErreur(resultat.message);
  }

  function basculer(ligne: Ligne) {
    if (ligne.id.startsWith("provisoire-")) return;

    startTransition(async () => {
      setErreur(null);
      jouer({ type: "coche", id: ligne.id, valeur: !ligne.checked });
      try {
        await ecrireCoche(ligne.id, !ligne.checked);
      } catch {
        // L'état optimiste retombe tout seul quand la transition se termine :
        // la ligne revient visiblement à ce qu'elle était, et le message dit
        // pourquoi. Un échec silencieux ferait croire la course faite.
        setErreur("La coche n'a pas été enregistrée. Elle est revenue en arrière.");
      }
    });
  }

  function supprimer(ligne: Ligne) {
    if (ligne.id.startsWith("provisoire-")) return;

    startTransition(async () => {
      setErreur(null);
      jouer({ type: "suppression", id: ligne.id });
      try {
        const resultat = await avecReprise(() => supprimerItem(ligne.id));
        if (!resultat.ok) throw new Error(resultat.message);
      } catch {
        setErreur("La suppression n'est pas passée. La ligne est revenue.");
      }
    });
  }

  function vider() {
    // Confirmation légère : le bouton change de texte et attend un second
    // appui. Une boîte de dialogue demanderait de viser deux fois, téléphone
    // en main et caddie dans l'autre.
    if (!confirmeVidage) {
      setConfirmeVidage(true);
      setTimeout(() => setConfirmeVidage(false), 3000);
      return;
    }
    setConfirmeVidage(false);

    startTransition(async () => {
      setErreur(null);
      jouer({ type: "vidage" });
      try {
        const resultat = await avecReprise(() => viderCoches());
        if (!resultat.ok) throw new Error(resultat.message);
      } catch {
        setErreur("Le vidage n'est pas passé. Les lignes sont revenues.");
      }
    });
  }

  // Rangée pour le parcours du magasin (ticket 17) : une section par rayon,
  // dans l'ordre de RAYONS, et les cochées à part, tout en bas. Une ligne
  // provisoire n'a pas encore de terme, donc pas de rayon : elle apparaît dans
  // « autre » le temps de l'aller-retour, puis rejoint son rayon.
  const { sections, cochees } = grouperParRayon(affichees);
  const nbCochees = cochees.length;

  return (
    <>
      <form action={ajouter} className="flex gap-2">
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
        <div className="mt-2">
          {sections.map(({ rayon, lignes: groupe }) => (
            <SectionRayon key={rayon.code} fi={rayon.fi} fr={rayon.fr}>
              {groupe.map((ligne) => (
                <LigneItem
                  key={ligne.id}
                  ligne={ligne}
                  onBasculer={() => basculer(ligne)}
                  onSupprimer={() => supprimer(ligne)}
                />
              ))}
            </SectionRayon>
          ))}

          {cochees.length > 0 && (
            <SectionRayon fi="Korissa" fr="Dans le caddie">
              {cochees.map((ligne) => (
                <LigneItem
                  key={ligne.id}
                  ligne={ligne}
                  onBasculer={() => basculer(ligne)}
                  onSupprimer={() => supprimer(ligne)}
                />
              ))}
            </SectionRayon>
          )}
        </div>
      )}

      {nbCochees > 0 && (
        <button
          type="button"
          onClick={vider}
          className={`mt-4 min-h-12 self-start rounded-xl px-4 text-sm font-medium ${
            confirmeVidage
              ? "bg-red-600 text-white"
              : "border border-black/15 dark:border-white/20"
          }`}
        >
          {confirmeVidage
            ? `Confirmer : retirer ${nbCochees} ligne${nbCochees > 1 ? "s" : ""}`
            : `Vider les cochés (${nbCochees})`}
        </button>
      )}
    </>
  );
}

/**
 * Une section de la liste : l'en-tête du rayon, puis ses lignes.
 *
 * L'en-tête reprend la hiérarchie des lignes, finnois d'abord, français en
 * dessous (D4) — c'est le mot du panneau qu'on cherche des yeux — mais plus
 * petit et en capitales espacées, pour qu'on ne le confonde pas avec un
 * article. Un `h2` pour que la structure existe aussi pour un lecteur d'écran.
 */
function SectionRayon({
  fi,
  fr,
  children,
}: {
  fi: string;
  fr: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-3">
      <h2 className="flex items-baseline gap-2 border-b border-black/10 pb-1 dark:border-white/15">
        <span className="truncate text-[0.8rem] font-semibold uppercase tracking-wider">
          {fi}
        </span>
        <span className="truncate text-[0.7rem] text-black/45 dark:text-white/45">{fr}</span>
      </h2>
      <ul>{children}</ul>
    </section>
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
function LigneItem({
  ligne,
  onBasculer,
  onSupprimer,
}: {
  ligne: Ligne;
  onBasculer: () => void;
  onSupprimer: () => void;
}) {
  const enCours = ligne.id.startsWith("provisoire-");

  return (
    <li
      className={`flex items-center border-b border-black/5 dark:border-white/10 ${
        enCours ? "opacity-50" : ""
      }`}
    >
      {/* La ligne entière est la cible : c'est le geste le plus courant, et le
          seul qu'on fasse en marchant. Un bouton et non un `onClick` sur le
          `li`, pour que le clavier et les lecteurs d'écran l'atteignent. */}
      <button
        type="button"
        onClick={onBasculer}
        aria-pressed={ligne.checked}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-1.5 text-left"
      >
        <span
          aria-hidden
          className={`grid size-5 shrink-0 place-items-center rounded border text-xs ${
            ligne.checked
              ? "border-transparent bg-foreground text-background"
              : "border-black/25 dark:border-white/30"
          }`}
        >
          {ligne.checked ? "✓" : ""}
        </span>

        <span className={`min-w-0 flex-1 ${ligne.checked ? "opacity-40" : ""}`}>
          {ligne.terme ? (
            <>
              <span
                className={`block truncate text-[1.35rem] font-semibold leading-tight ${
                  ligne.checked ? "line-through" : ""
                }`}
              >
                {ligne.terme.fi}
              </span>
              <span className="block truncate text-[0.8rem] leading-tight text-black/50 dark:text-white/50">
                {ligne.raw_fr}
              </span>
            </>
          ) : (
            <>
              {/* Traduction manquante : le gris dit qu'il manque quelque chose,
                  et le français reprend la place principale — c'est le seul mot
                  lisible qui reste, il ne doit pas être relégué en sous-titre. */}
              <span
                className={`block truncate text-[1.1rem] font-medium leading-tight ${
                  ligne.checked ? "line-through" : ""
                }`}
              >
                {ligne.raw_fr}
              </span>
              <span className="block truncate text-[0.8rem] leading-tight text-black/35 dark:text-white/35">
                {enCours ? "ajout…" : "traduction manquante"}
              </span>
            </>
          )}
        </span>

        {/* La quantité à droite, en chiffres tabulaires pour que les nombres
            s'alignent d'une ligne à l'autre. Rien n'est affiché quand elle est
            absente — surtout pas un « null » ni un tiret. */}
        {ligne.quantity && (
          <span
            className={`shrink-0 text-[0.95rem] tabular-nums text-black/45 dark:text-white/45 ${
              ligne.checked ? "line-through opacity-60" : ""
            }`}
          >
            {ligne.quantity}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onSupprimer}
        aria-label={`Supprimer ${ligne.raw_fr}`}
        className="grid min-h-12 min-w-12 shrink-0 place-items-center text-lg text-black/35 dark:text-white/35"
      >
        ✕
      </button>
    </li>
  );
}
