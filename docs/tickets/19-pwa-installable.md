---
title: "Application installable sur Android et lisible en magasin"
milestone: "M1 Liste utilisable"
labels: "type:feat, size:M, area:front"
---
## Contexte

Le terrain, c'est un téléphone Android tenu d'une main, debout, dans un magasin
éclairé au néon, avec un caddie dans l'autre main. Ce ticket n'est pas de la
finition, c'est ce qui fait passer la liste de la page web ouverte par hasard à
l'application qu'on ouvre par réflexe.

Sur Android, une application web installée n'est pas un raccourci. Chrome génère
une WebAPK, un paquet signé qui place l'application dans le tiroir
d'applications, dans le sélecteur de tâches et dans les paramètres système avec
sa propre entrée. Il n'y a rien à empaqueter et rien à publier sur un magasin
d'applications pour obtenir ce résultat.

## À faire

* Manifeste complet : nom, nom court, `display: standalone`, couleur de thème et
  de fond, orientation portrait, icônes aux tailles requises dont une icône
  maskable de 512 pixels
* Vérifier que Chrome propose réellement l'installation et génère une WebAPK, et
  pas un simple raccourci, ce qui se contrôle dans les informations
  d'application du système
* Raccourcis d'application dans le manifeste, pour ouvrir directement la liste
  depuis un appui long sur l'icône
* Cibles tactiles d'au moins quarante-huit points, atteignables au pouce
* Thème clair et sombre suivant le réglage du système
* Hiérarchie typographique qui garde le finnois lisible à bout de bras

## Critères d'acceptation

* l'installation depuis Chrome produit une WebAPK, l'application apparaît dans le
  tiroir d'applications et dans les paramètres système
* la liste s'affiche en moins d'une seconde après ouverture depuis l'écran
  d'accueil, sans barre d'adresse ni habillage de navigateur
* aucun défilement horizontal sur un écran de trois cent soixante points de large
* toutes les actions de la liste sont atteignables au pouce, téléphone tenu d'une
  seule main

## Note de portée

Rien ici ne dépend d'un magasin d'applications. Si le besoin d'être présent sur
le Play Store apparaît plus tard, Bubblewrap emballe cette même application dans
une Trusted Web Activity en quelques heures, pour vingt-cinq dollars une fois, et
sans changer le rythme de déploiement. Ce n'est pas un ticket de la v1.
