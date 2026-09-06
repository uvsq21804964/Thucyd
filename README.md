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

### Exposer le backend local a Tavus avec ngrok

Apres avoir lance le backend sur le port `8080`, ouvrez un second terminal
PowerShell et demarrez le tunnel :

```powershell
ngrok http 8080
```

Au premier usage, associez auparavant le CLI a votre compte avec l'authtoken
fourni sur <https://dashboard.ngrok.com/get-started/your-authtoken> :

```powershell
ngrok config add-authtoken VOTRE_AUTHTOKEN_NGROK
```

Copiez l'URL HTTPS affichee par ngrok (par exemple
`https://abc123.ngrok-free.app`). Dans la configuration **Custom LLM** de
Tavus, utilisez :

```text
Base URL: https://abc123.ngrok-free.app/v1
Model: ornisec-interviewer
API Key: la valeur de TAVUS_LLM_API_KEY
```

Laissez le backend et ngrok actifs pendant tout l'entretien. Avec une URL
ngrok gratuite non reservee, mettez a jour la Base URL dans Tavus apres chaque
redemarrage du tunnel.

Si Windows Defender bloque l'executable ngrok local, utilisez le service Docker
integre. Il reutilise en lecture seule l'authtoken deja enregistre dans
`%LOCALAPPDATA%\ngrok\ngrok.yml` :

```powershell
cd backend
docker compose --profile tunnel up --build
```

Le service ngrok transmet alors le trafic vers `backend:8000`. L'URL publique
est visible sur <http://localhost:4040> et la Base URL Tavus reste l'URL HTTPS
affichee suivie de `/v1`.

## Questionnaires conditionnels

Ajoutez `display_if` à une question pour ne l'afficher que selon la note d'une
question précédente :

```json
"display_if": { "question_ref": 1, "operator": "lte", "value": 2 }
```

Opérateurs disponibles : `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in`,
`not_in`, `answered` et `unanswered`. Les branches masquées sont ignorées dans
la progression, le score, les preuves et l'entretien IA.

## Versionnement des questionnaires

Chaque audit est lié à un instantané immuable du référentiel utilisé (nom,
numéro de version et empreinte SHA-256). Un JSON modifié sous le même nom crée
la version suivante ; une version antérieure peut être sélectionnée lors de la
création d’un audit. Au démarrage, les audits historiques sont rattachés sans
modifier leurs réponses.

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
