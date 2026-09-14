"use client";

import { startTransition, useOptimistic, useState } from "react";

import { creerJetonConnecteur, revoquerJeton } from "./actions";

export type JetonAffiche = {
  id: string;
  prefix: string;
  libelle: string | null;
  creeLe: string;
  utiliseLe: string | null;
  revoqueLe: string | null;
};

/**
 * Le jeton en clair n'existe que dans cet état, et seulement entre sa création
 * et le prochain rechargement de page. Il n'est écrit ni en base, ni dans
 * `localStorage`, ni dans l'URL : le rendre relisable serait exactement ce que
 * le premier critère du ticket interdit.
 */
type Revele = { clair: string; prefix: string };

export function Jetons({ jetons }: { jetons: JetonAffiche[] }) {
  const [affiches, jouer] = useOptimistic(
    jetons,
    (etat: JetonAffiche[], id: string) =>
      etat.map((j) => (j.id === id ? { ...j, revoqueLe: "à l’instant" } : j)),
  );
  const [revele, setRevele] = useState<Revele | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(donnees: FormData) {
    const libelle = String(donnees.get("libelle") ?? "").trim();

    setErreur(null);
    const resultat = await creerJetonConnecteur(libelle || undefined);

    if (!resultat.ok) {
      setErreur(resultat.message);
      return;
    }

    setRevele(resultat.valeur);
  }

  function revoquer(id: string) {
    startTransition(async () => {
      setErreur(null);
      jouer(id);

      const resultat = await revoquerJeton(id);
      if (!resultat.ok) setErreur(resultat.message);

      // Un jeton révoqué qui serait encore affiché en clair ferait croire qu'il
      // reste utilisable. On ne sait pas lequel est révélé — le clair ne porte
      // pas d'identifiant — donc on ferme la fenêtre dans tous les cas.
      setRevele(null);
    });
  }

  return (
    <>
      {revele && <Nouveau revele={revele} onFerme={() => setRevele(null)} />}

      <form action={creer} className="mt-4 flex gap-2">
        <input
          name="libelle"
          type="text"
          maxLength={40}
          autoComplete="off"
          aria-label="Libellé du jeton"
          placeholder="téléphone, Claude bureau…"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-black/15 bg-transparent px-4 text-base outline-none focus:border-foreground dark:border-white/20"
        />
        <button
          type="submit"
          className="min-h-12 shrink-0 rounded-xl bg-foreground px-4 text-sm font-medium text-background"
        >
          Nouveau jeton
        </button>
      </form>

      {erreur && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {erreur}
        </p>
      )}

      {affiches.length === 0 ? (
        <p className="mt-6 text-balance text-sm text-black/55 dark:text-white/55">
          Aucun jeton. Crées-en un, copie l&apos;adresse affichée, et colle-la
          dans les réglages de Claude, en connecteur personnalisé.
        </p>
      ) : (
        <ul className="mt-6">
          {affiches.map((jeton) => (
            <LigneJeton key={jeton.id} jeton={jeton} onRevoquer={() => revoquer(jeton.id)} />
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * La fenêtre de copie. Elle affiche l'URL complète, pas le jeton seul : c'est
 * l'URL qu'on colle dans Claude, et recomposer « adresse plus jeton » à la main
 * est une occasion de se tromper.
 *
 * L'origine est lue du navigateur plutôt que reconstruite côté serveur. Sur
 * Vercel, l'adresse publique se déduit d'en-têtes de proxy ; ici elle est sous
 * les yeux de l'utilisateur, donc juste par construction, en préversion comme
 * en production comme en local.
 */
function Nouveau({ revele, onFerme }: { revele: Revele; onFerme: () => void }) {
  const [copie, setCopie] = useState(false);
  const [erreurCopie, setErreurCopie] = useState(false);

  const url =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/api/mcp/${revele.clair}`;

  async function copier() {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 3000);
    } catch {
      // Le presse-papiers est refusé hors contexte sécurisé, et sur certains
      // navigateurs sans geste utilisateur. L'adresse reste sélectionnable à la
      // main juste au-dessus : on le dit au lieu d'échouer en silence.
      setCopie(false);
      setErreurCopie(true);
    }
  }

  return (
    <section
      // `alert` plutôt que `status` : c'est la seule et unique fois que cette
      // valeur est lisible, un lecteur d'écran doit l'annoncer tout de suite.
      role="alert"
      className="mt-4 rounded-xl border border-foreground/30 bg-black/[0.03] p-3 dark:bg-white/[0.06]"
    >
      <p className="text-sm font-medium">
        Copie cette adresse maintenant. Elle ne sera plus jamais affichée.
      </p>

      <code className="mt-2 block break-all rounded-lg bg-black/5 p-2 font-mono text-[0.8rem] leading-snug dark:bg-white/10">
        {url}
      </code>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={copier}
          className="min-h-12 flex-1 rounded-xl bg-foreground px-4 text-sm font-medium text-background"
        >
          {copie ? "Copié" : "Copier l’adresse"}
        </button>
        <button
          type="button"
          onClick={onFerme}
          className="min-h-12 rounded-xl border border-black/15 px-4 text-sm dark:border-white/20"
        >
          Fermer
        </button>
      </div>

      {erreurCopie && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          La copie automatique a été refusée par le navigateur. Sélectionne
          l&apos;adresse à la main.
        </p>
      )}
    </section>
  );
}

function LigneJeton({
  jeton,
  onRevoquer,
}: {
  jeton: JetonAffiche;
  onRevoquer: () => void;
}) {
  // Même confirmation légère que le vidage de la liste : le bouton change de
  // texte et attend un second appui. Révoquer par mégarde coupe Claude sans
  // prévenir, et le jeton n'est pas récupérable.
  const [confirme, setConfirme] = useState(false);
  const revoque = jeton.revoqueLe !== null;

  return (
    <li className="flex items-center gap-3 border-b border-black/5 py-2 dark:border-white/10">
      <span className={`min-w-0 flex-1 ${revoque ? "opacity-40" : ""}`}>
        <span className="block truncate text-[0.95rem] font-medium leading-tight">
          {jeton.libelle ?? "Sans libellé"}
        </span>
        <span className="block truncate font-mono text-[0.75rem] leading-tight text-black/50 dark:text-white/50">
          {jeton.prefix}…
        </span>
        <span className="block truncate text-[0.75rem] leading-tight text-black/40 dark:text-white/40">
          {revoque
            ? `révoqué le ${jeton.revoqueLe}`
            : jeton.utiliseLe
              ? `dernier appel le ${jeton.utiliseLe}`
              : `créé le ${jeton.creeLe}, jamais utilisé`}
        </span>
      </span>

      {!revoque && (
        <button
          type="button"
          onClick={() => {
            if (!confirme) {
              setConfirme(true);
              setTimeout(() => setConfirme(false), 3000);
              return;
            }
            setConfirme(false);
            onRevoquer();
          }}
          className={`min-h-12 shrink-0 rounded-xl px-3 text-sm font-medium ${
            confirme
              ? "bg-red-600 text-white"
              : "border border-black/15 dark:border-white/20"
          }`}
        >
          {confirme ? "Confirmer" : "Révoquer"}
        </button>
      )}
    </li>
  );
}
