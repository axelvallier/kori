import type { Ligne } from "@/lib/liste";

/**
 * Les rayons, dans l'ordre du parcours d'un S-market type (ticket 17).
 *
 * L'ordre est figé ici, en dur, et **pas** lu depuis l'ordre de déclaration de
 * l'énuméré `aisle` en base : les deux se ressemblent mais ne coïncident pas
 * (l'énuméré met la viande avant les produits laitiers, le ticket l'inverse),
 * et un ordre de parcours est une donnée d'écran, pas de schéma. Le changer
 * quand on change de magasin ne doit pas demander de migration.
 *
 * Le finnois d'abord (D4) : en rayon, c'est l'en-tête qu'on cherche des yeux
 * sur les panneaux du magasin. Le français en dessous dit à quoi il correspond.
 *
 * `other` ferme la marche : c'est là que tombent les items sans rayon, et ceux
 * dont la traduction manque — on ne sait pas où ils sont, donc à la fin.
 */
export const RAYONS = [
  { code: "produce", fi: "Hedelmät ja vihannekset", fr: "Fruits et légumes" },
  { code: "bakery", fi: "Leipä", fr: "Boulangerie" },
  { code: "dairy", fi: "Maitotuotteet", fr: "Produits laitiers" },
  { code: "meat", fi: "Liha", fr: "Viande" },
  { code: "fish", fi: "Kala", fr: "Poisson" },
  { code: "pantry", fi: "Kuivatuotteet", fr: "Épicerie sèche" },
  { code: "frozen", fi: "Pakasteet", fr: "Surgelés" },
  { code: "snacks", fi: "Naposteltavat", fr: "Apéritif et snacks" },
  { code: "drinks", fi: "Juomat", fr: "Boissons" },
  { code: "household", fi: "Puhdistusaineet", fr: "Entretien" },
  { code: "hygiene", fi: "Hygienia", fr: "Hygiène" },
  { code: "other", fi: "Muut", fr: "Autre" },
] as const;

export type Rayon = (typeof RAYONS)[number];
export type CodeRayon = Rayon["code"];

const PAR_CODE = new Map<string, Rayon>(RAYONS.map((r) => [r.code, r]));
const AUTRE = PAR_CODE.get("other")!;

/** Le rayon d'une ligne. Sans terme, ou avec un rayon inconnu : « autre ». */
export function rayonDe(ligne: Pick<Ligne, "terme">): Rayon {
  return (ligne.terme && PAR_CODE.get(ligne.terme.aisle)) || AUTRE;
}

export type Section = { rayon: Rayon; lignes: Ligne[] };

/**
 * Range la liste pour le parcours du magasin.
 *
 * Les lignes à prendre sont groupées par rayon, dans l'ordre de `RAYONS`, et
 * un rayon sans ligne n'apparaît pas. À l'intérieur d'un rayon, l'ordre reçu
 * est conservé — c'est l'ordre d'ajout, celui de la recette.
 *
 * Les lignes cochées sortent de leur rayon et sont rendues à part, dans leur
 * ordre reçu : une fois dans le caddie, un article n'a plus de rayon qui
 * compte, et le garder dans sa section ferait relire des lignes barrées au
 * milieu de celles qui restent.
 */
export function grouperParRayon(lignes: readonly Ligne[]): {
  sections: Section[];
  cochees: Ligne[];
} {
  const parRayon = new Map<CodeRayon, Ligne[]>();
  const cochees: Ligne[] = [];

  for (const ligne of lignes) {
    if (ligne.checked) {
      cochees.push(ligne);
      continue;
    }
    const { code } = rayonDe(ligne);
    const groupe = parRayon.get(code);
    if (groupe) groupe.push(ligne);
    else parRayon.set(code, [ligne]);
  }

  const sections: Section[] = [];
  for (const rayon of RAYONS) {
    const groupe = parRayon.get(rayon.code);
    if (groupe) sections.push({ rayon, lignes: groupe });
  }

  return { sections, cochees };
}
