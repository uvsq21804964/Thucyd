# ORNISEC Backend

API FastAPI avec PostgreSQL hébergé sur Neon.

## Configuration Neon

1. Créez un projet sur Neon.
2. Copiez la chaîne de connexion PostgreSQL du projet.
3. Copiez `.env.example` vers `.env`.
4. Placez la chaîne Neon dans `DATABASE_URL` en conservant `sslmode=require`.
5. Définissez le mot de passe du premier administrateur et les clés JWT.

Les tables `users` et `audits` sont créées automatiquement au premier démarrage. Le questionnaire d'audit est stocké en JSONB et les identifiants utilisent des UUID PostgreSQL.

## Démarrage

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose logs -f backend
```

API : http://localhost:8080

Documentation : http://localhost:8080/docs

Santé : http://localhost:8080/api/healthchecker

## Développement sans Docker

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

## Tests

```powershell
python -m unittest discover -s tests -v
```