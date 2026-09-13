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
 * Les cas marqués « piège » sont ceux où le retrait naïf du pluriel, ou la
 * comparaison naïve de deux chaînes, donne un faux résultat. Ils doivent rester
 * verts : voir .claude/rules/lexique.md.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalize, resolveTerm, type Terme } from "./terms.ts";

describe("normalize", () => {
  const cas: [string, string, string][] = [
    // saisie, forme attendue, ce que le cas démontre
    ["tomate", "tomate", "une saisie déjà canonique ne bouge pas"],
    ["Tomate", "tomate", "la casse"],
    ["TOMATES", "tomate", "la casse et le pluriel ensemble"],
    ["  tomate  ", "tomate", "les espaces de bord"],
    ["Des Tomates ", "tomate", "partitif, casse, pluriel et espace, tout à la fois"],
    ["tomates", "tomate", "le pluriel simple"],
    ["tomates    cerises", "tomate cerise", "les espaces multiples, et le pluriel sur chaque mot"],
    ["les pommes", "pomme", "l'article défini pluriel"],
    ["le pain", "pain", "l'article défini masculin"],
    ["la farine", "farine", "l'article défini féminin"],
    ["un citron", "citron", "l'article indéfini masculin"],
    ["une pomme", "pomme", "l'article indéfini féminin"],
    ["du beurre", "beurre", "le partitif masculin"],
    ["de la crème", "crème", "le partitif féminin, forme longue d'abord"],
    ["de l'huile", "huile", "le partitif devant voyelle"],
    ["d'ail", "ail", "l'élision"],
    ["d’ail", "ail", "l'apostrophe typographique du clavier de téléphone"],
    ["l'oignon", "oignon", "l'article élidé"],
    ["bœuf", "boeuf", "piège : la ligature du lexique"],
    ["boeuf", "boeuf", "piège : et la forme tapée au clavier, qui doit lui répondre"],
    ["œufs", "oeuf", "piège : ligature et pluriel, le mot le plus probable d'une liste"],
    ["oeufs", "oeuf", "piège : sa forme tapée au clavier"],
    ["ananas", "ananas", "piège : singulier en s, le pluriel naïf donnerait « anana »"],
    ["des ananas", "ananas", "piège : le même, précédé d'un partitif"],
    ["riz", "riz", "piège : mot court, aucun retrait ne doit s'appliquer"],
    ["noix", "noix", "piège : singulier en x, le pluriel naïf donnerait « noi »"],
    ["petits pois", "petit pois", "piège : invariable en second mot, pluriel sur le premier"],
    ["jus", "jus", "piège : invariable"],
    ["chips", "chips", "piège : invariable, et toujours écrit au pluriel"],
    ["pain", "pain", "un mot en n, aucun retrait"],
    ["lait", "lait", "un mot en t, aucun retrait"],
    ["", "", "la chaîne vide ne lève pas"],
    ["   ", "", "une saisie d'espaces se réduit à la chaîne vide"],
    ["de la", "de la", "un partitif seul reste tel quel : il n'est un préfixe que s'il y a un mot derrière"],
    ["crème fraîche", "crème fraîche", "les accents sont conservés — voir la note plus bas"],
    ["viande hachée de bœuf", "viande hachée de boeuf", "une expression entière"],
  ];

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
 * Faux client Supabase : il enregistre la forme reçue et renvoie ce qu'on lui a
 * dit de renvoyer. Ce qui est testé ici est le contrat de `resolveTerm` — quelle
 * forme part en base, et ce qui ressort — pas PostgREST, qui a ses propres
 * tests. L'aller-retour réel est vérifié par le test d'intégration plus bas.
 */
function clientFactice(reponse: { data: Terme | null; error: { code: string; message: string } | null }) {
  const vues: string[] = [];

  const client = {
    from() {
      return {
        select() {
          return {
            eq(_colonne: string, valeur: string) {
              vues.push(valeur);
              return { maybeSingle: async () => reponse };
            },
          };
        },
      };
    },
  };

  // Le faux client n'implémente que le chemin emprunté par resolveTerm ; le
  // type complet de SupabaseClient n'a pas à être satisfait pour ça.
  return { client: client as never, vues };
}

const TOMATE: Terme = {
  id: "11111111-1111-1111-1111-111111111111",
  fr: "tomate",
  fi: "tomaatti",
  aisle: "produce",
};

describe("resolveTerm", () => {
  it("interroge la base sur la forme normalisée, pas sur la saisie", async () => {
    const { client, vues } = clientFactice({ data: TOMATE, error: null });
    await resolveTerm(client, "Des Tomates ");
    assert.deepEqual(vues, ["tomate"]);
  });

  it("renvoie le terme trouvé", async () => {
    const { client } = clientFactice({ data: TOMATE, error: null });
    assert.deepEqual(await resolveTerm(client, "tomates"), TOMATE);
  });

  it("renvoie null sur un terme absent, sans lever", async () => {
    const { client } = clientFactice({ data: null, error: null });
    assert.equal(await resolveTerm(client, "mangoustan"), null);
  });

  it("renvoie null sans interroger la base sur une saisie vide", async () => {
    const { client, vues } = clientFactice({ data: null, error: null });
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
