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

import { normalize, resolveTerm, resolveTermes, type Terme } from "./terms.ts";

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
