/**
 * Reprise sur coupure réseau courte.
 *
 * Le terrain est un magasin : le réseau y tombe une seconde et revient. Sans
 * reprise, une coche posée pendant ce trou repartirait en arrière sous les yeux
 * de l'utilisateur, alors que rien de durable n'a échoué.
 *
 * Trois tentatives, espacées de 0, 400 et 1400 millisecondes : la dernière
 * retombe après la coupure d'une seconde que le ticket 09 nomme, sans faire
 * attendre l'utilisateur au-delà de ce qu'une interface optimiste masque déjà.
 *
 * **À n'utiliser que sur des opérations idempotentes.** Une requête peut avoir
 * abouti côté serveur et voir sa réponse perdue : rejouer « coche cet item »
 * est sans effet, rejouer « ajoute cet item » crée un doublon.
 */
const ATTENTES = [0, 400, 1400];

export async function avecReprise<T>(appel: () => Promise<T>): Promise<T> {
  let derniere: unknown;

  for (const attente of ATTENTES) {
    if (attente > 0) await new Promise((r) => setTimeout(r, attente));
    try {
      return await appel();
    } catch (erreur) {
      derniere = erreur;
    }
  }

  throw derniere;
}
