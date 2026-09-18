/**
 * Cas de test de la normalisation et de la résolution.
 *
 *   npm test
 *
 * Le lanceur est celui de Node, sans dépendance ajoutée : Node exécute
 * directement le TypeScript en retirant les types. Une bibliothèque de test de
 * plus dans un projet qui n'en a besoin que pour une poignée de fonctions pures
 * serait une dépendance à maintenir pour rien.
 *
 * Les cas de normalisation vivent dans `terms.cas.ts`, parce qu'ils servent
 * aussi à comparer `normalize()` à son jumeau SQL — voir ce fichier et
 * .claude/rules/lexique.md.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAS } from "./terms.cas.ts";
import { normalize, resolveTerm, resolveTermes, type Terme } from "./terms.ts";

describe("normalize", () => {
  const cas = CAS;

  for (const [saisie, attendu, pourquoi] of cas) {
    it(`« ${saisie} » → « ${attendu} » (${pourquoi})`, () => {
      assert.equal(normalize(saisie), attendu);
    });
  }

  it("est idempotente : renormaliser une forme normalisée ne la change plus", () => {
    for (const [saisie] of cas) {
      const une = normalize(saisie);
      assert.equal(normalize(une), une, `« ${saisie} » bouge encore au second passage`);
    }
  });

  it("fait converger les trois formes que le ticket 07 nomme", () => {
    const attendu = normalize("tomate");
    assert.equal(normalize("Des Tomates "), attendu);
    assert.equal(normalize("tomates"), attendu);
  });
});

/* -------------------------------------------------------------------------- */
/* resolveTerm                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Faux client Supabase : il enregistre les formes reçues et renvoie ce qu'on lui
 * a dit de renvoyer. Ce qui est testé ici est le contrat de la résolution —
 * quelle forme part en base, et ce qui ressort — pas PostgREST, qui a ses
 * propres tests. L'aller-retour réel se vérifie contre la pile Supabase locale,
 * avec le lexique peuplé — c'est là, et nulle part ici, que se voient les
 * divergences entre la règle TypeScript et le contenu réel de la table.
 *
 * La requête est un `in` sur `fr_normalized` : la résolution se fait par lot,
 * même quand le lot ne contient qu'un terme.
 */
function clientFactice(reponse: {
  data: (Terme & { fr_normalized: string })[] | null;
  error: { code: string; message: string } | null;
}) {
  const vues: string[] = [];

  const client = {
    from() {
      return {
        select() {
          return {
            in(_colonne: string, valeurs: string[]) {
              vues.push(...valeurs);
              return { returns: async () => reponse };
            },
          };
        },
      };
    },
  };

  // Le faux client n'implémente que le chemin emprunté par la résolution ; le
  // type complet de SupabaseClient n'a pas à être satisfait pour ça.
  return { client: client as never, vues };
}

/** Le terme tel que la base le rend, forme normalisée comprise. */
function enBase(terme: Terme): Terme & { fr_normalized: string } {
  return { ...terme, fr_normalized: normalize(terme.fr) };
}

const TOMATE: Terme = {
  id: "11111111-1111-1111-1111-111111111111",
  fr: "tomate",
  fi: "tomaatti",
  aisle: "produce",
};

describe("resolveTerm", () => {
  it("interroge la base sur la forme normalisée, pas sur la saisie", async () => {
    const { client, vues } = clientFactice({ data: [enBase(TOMATE)], error: null });
    await resolveTerm(client, "Des Tomates ");
    assert.deepEqual(vues, ["tomate"]);
  });

  it("renvoie le terme trouvé", async () => {
    const { client } = clientFactice({ data: [enBase(TOMATE)], error: null });
    assert.deepEqual(await resolveTerm(client, "tomates"), TOMATE);
  });

  it("renvoie null sur un terme absent, sans lever", async () => {
    const { client } = clientFactice({ data: [], error: null });
    assert.equal(await resolveTerm(client, "mangoustan"), null);
  });

  it("renvoie null sans interroger la base sur une saisie vide", async () => {
    const { client, vues } = clientFactice({ data: [], error: null });
    assert.equal(await resolveTerm(client, "   "), null);
    assert.deepEqual(vues, [], "une saisie vide ne doit pas partir en requête");
  });

  it("renvoie null sur une erreur de base plutôt que de lever", async () => {
    const { client } = clientFactice({
      data: null,
      error: { code: "PGRST000", message: "connexion perdue" },
    });
    // L'ajout doit aboutir même quand la résolution échoue : l'item existe
    // alors sans traduction, état que le modèle prévoit. Lever ici perdrait la
    // saisie, et personne ne retape sa liste debout dans un magasin.
    assert.equal(await resolveTerm(client, "tomates"), null);
  });
});

/* -------------------------------------------------------------------------- */
/* resolveTermes                                                              */
/* -------------------------------------------------------------------------- */

const OEUF: Terme = {
  id: "22222222-2222-2222-2222-222222222222",
  fr: "œuf",
  fi: "kananmuna",
  aisle: "dairy",
};

describe("resolveTermes", () => {
  it("n'envoie qu'une requête pour tout le lot, en formes normalisées", async () => {
    const { client, vues } = clientFactice({ data: [enBase(TOMATE), enBase(OEUF)], error: null });
    await resolveTermes(client, ["Des Tomates ", "oeufs"]);
    assert.deepEqual(vues, ["tomate", "oeuf"]);
  });

  it("dédoublonne les saisies qui convergent vers la même forme", async () => {
    const { client, vues } = clientFactice({ data: [enBase(TOMATE)], error: null });
    await resolveTermes(client, ["tomates", "Tomate", "des tomates"]);
    // Trois saisies, une seule forme demandée : c'est ce qui rend le lot utile
    // sur une recette, où le même ingrédient revient souvent.
    assert.deepEqual(vues, ["tomate"]);
  });

  it("range les termes sous leur forme normalisée, pas sous la saisie", async () => {
    const { client } = clientFactice({ data: [enBase(OEUF)], error: null });
    const trouves = await resolveTermes(client, ["œufs"]);
    assert.deepEqual(trouves.get("oeuf"), OEUF);
    assert.equal(trouves.get("œufs"), undefined, "la saisie n'est pas une clé");
  });

  it("ne rend que ce que la base a répondu, sans inventer les absents", async () => {
    const { client } = clientFactice({ data: [enBase(TOMATE)], error: null });
    const trouves = await resolveTermes(client, ["tomates", "mangoustan"]);
    assert.equal(trouves.size, 1);
    assert.equal(trouves.has("mangoustan"), false);
  });

  it("n'interroge pas la base quand il n'y a rien à chercher", async () => {
    const { client, vues } = clientFactice({ data: [], error: null });
    const trouves = await resolveTermes(client, ["", "   "]);
    assert.equal(trouves.size, 0);
    assert.deepEqual(vues, [], "une liste de saisies vides ne doit pas partir en requête");
  });

  it("rend un dictionnaire vide sur une erreur de base plutôt que de lever", async () => {
    const { client } = clientFactice({
      data: null,
      error: { code: "PGRST000", message: "connexion perdue" },
    });
    // Même raison que pour resolveTerm : le lot doit aboutir en items sans
    // traduction, pas se perdre. Une recette à moitié ajoutée serait pire.
    const trouves = await resolveTermes(client, ["tomates", "oeufs"]);
    assert.equal(trouves.size, 0);
  });
});
