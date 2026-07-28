# Thucyd

Plateforme d'audit de conformité avec questionnaire et plan d'action
autosauvegardés, backend FastAPI sur Neon PostgreSQL et entretiens vidéo
assistés par IA avec Tavus et OpenAI.

## Organisation

```text
Thucyd/
├── frontend/   # Next.js — déploiement Vercel
├── backend/    # FastAPI + Docker — Render ou autre hébergeur
└── .github/
    └── workflows/ci.yml
```

## Développement local

Backend :

```powershell
Copy-Item backend/.env.example backend/.env
cd backend
docker compose up -d --build
docker compose exec -T backend python -m unittest discover -s tests -v
```

Frontend :

```powershell
Copy-Item frontend/.env.example frontend/.env
cd frontend
npm ci
npm run dev
```

L'interface est disponible sur `http://localhost:3000` et l'API sur
`http://localhost:8080`.

## Questionnaires conditionnels

Ajoutez `display_if` à une question pour ne l'afficher que selon la note d'une
question précédente :

```json
"display_if": { "question_ref": 1, "operator": "lte", "value": 2 }
```

Opérateurs disponibles : `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in`,
`not_in`, `answered` et `unanswered`. Les branches masquées sont ignorées dans
la progression, le score, les preuves et l'entretien IA.

## Suivi des entretiens IA

La vue **Suivi IA** agrège la dernière session de chaque audit accessible :
durée moyenne des entretiens terminés, couverture, réponses à contrôler et
latence backend par étape. Les temps détaillés sont collectés sur les nouveaux
tours de parole et stockés avec chaque décision, sans migration de schéma.

## Plan d’action

Depuis le rapport d’un audit, les écarts notés sous 3 peuvent produire des
propositions chiffrées (priorité, coût, charge, responsable et échéance). Ces
estimations restent « à valider » jusqu’à une décision humaine tracée. Toute
modification d’un champ structurant remet automatiquement l’action en revue.

## Déploiement

### Vercel

- importer ce dépôt ;
- définir **Root Directory** sur `frontend` ;
- définir `BACKEND_URL` avec l'URL HTTPS publique du backend ;
- conserver `main` comme branche de production.

### Backend

- créer un service Docker depuis ce dépôt ;
- définir le répertoire racine sur `backend` ;
- utiliser `/api/healthchecker` comme health check ;
- injecter les variables de `backend/.env.example` depuis le gestionnaire de
  secrets de l'hébergeur ;
- ne jamais copier `backend/.env` dans l'image ou dans Git.

Le LLM personnalisé de la persona Tavus doit utiliser l'URL publique du backend
terminée par `/v1`.

## Intégration continue

La CI vérifie à chaque push et Pull Request :

- lint, types et build du frontend ;
- tests Python et build Docker du backend.
