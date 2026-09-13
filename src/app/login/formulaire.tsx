"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { envoyerLienMagique, type EtatConnexion } from "./actions";

const INITIAL: EtatConnexion = { statut: "initial" };

/**
 * `useFormStatus` doit vivre dans un composant enfant du formulaire : il lit
 * l'état du `<form>` parent le plus proche. Placé dans le même composant que le
 * `<form>`, il renverrait toujours `pending: false`.
 */
function Bouton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 rounded-xl bg-foreground px-4 text-base font-medium text-background transition-opacity disabled:opacity-50"
    >
      {pending ? "Envoi…" : "Recevoir un lien de connexion"}
    </button>
  );
}

export function Formulaire() {
  const [etat, action] = useActionState(envoyerLienMagique, INITIAL);

  if (etat.statut === "envoye") {
    return (
      <div
        role="status"
        className="rounded-xl border border-black/10 p-4 text-sm dark:border-white/15"
      >
        <p className="font-medium">Lien envoyé.</p>
        <p className="mt-1 text-black/60 dark:text-white/60">
          Ouvre le message reçu à <strong>{etat.email}</strong> depuis ce
          téléphone, le lien connecte ce navigateur.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Adresse email
      </label>

      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="email"
        placeholder="prenom@exemple.fi"
        aria-describedby={etat.statut === "erreur" ? "erreur-email" : undefined}
        aria-invalid={etat.statut === "erreur"}
        className="min-h-12 rounded-xl border border-black/15 bg-transparent px-4 text-base outline-none focus:border-foreground dark:border-white/20"
      />

      {etat.statut === "erreur" && (
        <p id="erreur-email" role="alert" className="text-sm text-red-600 dark:text-red-400">
          {etat.message}
        </p>
      )}

      <Bouton />

      <p className="text-sm text-black/55 dark:text-white/55">
        Pas de mot de passe : un lien arrive par email et ouvre la session.
      </p>
    </form>
  );
}
