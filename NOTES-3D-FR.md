# WINFUM — visionneuse 3D : ajustements

Le projet conserve son architecture HTML/JS, les clés Supabase, l'API globale `Winfum3D` et la version Three.js r147. Aucun build ni dépendance n'a été ajouté.

## Ajustements inclus
- Fond de studio strictement blanc pour supprimer le vignettage gris/beige autour du canvas.
- Liquide moins lumineux artificiellement et moins spéculaire, en mode photo comme sur les modèles procéduraux.
- Ombre de contact plus légère sur fond blanc.
- Bouchon doré du mode photo plus satiné et moins miroir.
- Conservation des gestes, du défilement vertical, du chargement différé, de la détection photo et du repli déjà présents dans le projet fourni.

## Ajouter un produit
Dans l'admin, choisir le modèle `photo` et fournir une photo de face nette, avec fond blanc et produit entier visible. Le produit utilise `images[0]` et les champs `model3d_depth`, `model3d_label`, `model3d_liquid`, `model3d_cap` et `model3d_glass` déjà prévus. Aucun changement de base de données.

## Réglages visuels
Dans `winfum-3d.js`, `studioEnv()` contrôle les bandes lumineuses de studio; `shadowTex()` contrôle l'ombre; `Ctx().liquid()` et le matériau liquide de `photoModel()` contrôlent la finition du liquide. Garder les valeurs d'émissivité basses pour éviter l'effet lumineux/plastique sur téléphone.

## Limites à connaître
Le mode photo reconstruit une géométrie à partir d'une image 2D : la silhouette et l'étiquette sont approchées, mais la réfraction optique physique d'un vrai flacon ne peut pas être reconstruite parfaitement depuis une seule photo. Les matériaux additifs de verre sont conservés pour éviter le voile blanc et les problèmes de transmission imbriquée sur mobile. Le nombre de triangles dépend du contour détecté; les balayages sont légers (en général quelques milliers à quelques dizaines de milliers de triangles, bien sous 150 000 pour les photos fournies).
