# ORNISEC Frontend

Interface Next.js de la plateforme d'audits ORNISEC.

## Architecture

- Frontend : Next.js 13, React, TypeScript et Tailwind CSS
- API unique : FastAPI
- Base de données : PostgreSQL sur Neon

Le frontend ne contient plus de routes API métier. Les appels `/backend/*` sont transmis à FastAPI par une règle `rewrites` dans `next.config.js`.

## Démarrage

1. Lancer FastAPI et Neon PostgreSQL depuis le dossier `Back-end` :

```bash
docker compose up --build
```

2. Préparer le frontend :

```bash
copy .env.example .env
npm install
npm run dev
```

3. Ouvrir http://localhost:3000/login.

`BACKEND_URL` vaut `http://localhost:8080` par défaut. En production, il doit pointer vers l'adresse interne du service FastAPI.

## Validation

```bash
npx tsc --noEmit
npm run lint
npm run build
```