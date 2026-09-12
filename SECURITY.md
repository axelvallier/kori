# Signaler une faille

Merci de ne pas ouvrir d'issue publique pour une faille de sécurité : une issue
est visible de tous, et décrit le problème à quiconque voudrait l'exploiter
avant qu'il soit corrigé.

## Comment signaler

Passe par le signalement privé de GitHub : onglet **Security** du dépôt, puis
**Report a vulnerability**. Le fil reste privé jusqu'à la publication du
correctif.

Ce qui aide, dans l'ordre : ce qu'on obtient en exploitant la faille, les étapes
pour la reproduire, et la version ou le commit concerné.

## Ce à quoi tu peux t'attendre

Kori est un projet personnel, maintenu sur du temps libre. Je réponds sous une
semaine, et je préviens si la correction doit prendre plus longtemps. Tu es
crédité dans le correctif si tu le souhaites.

## Périmètre

Seule la branche `main` est maintenue ; il n'y a pas de versions antérieures à
corriger.

Intéressant à signaler : un accès aux données d'un autre compte, un contournement
des politiques de sécurité au niveau des lignes, une faiblesse dans les jetons du
connecteur MCP, une clé exposée dans le dépôt ou dans un bundle client.

Hors périmètre : les rapports produits par un scanner sans démonstration d'impact,
et les failles des services sous-jacents — à signaler directement à Supabase,
Vercel ou GitHub, qui ont chacun leur programme.

## Une clé qui a fuité

Si tu trouves une clé dans l'historique du dépôt, signale-la par le même canal.
Une clé commitée est considérée comme brûlée : elle est révoquée puis
remplacée, l'historique n'est pas réécrit.
