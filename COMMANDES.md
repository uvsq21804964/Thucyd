## 2. Démarrer le backend

Terminal PowerShell n° 1 :

```powershell
cd "C:\Users\tomab\OneDrive\Bureau\ALL\Entreprise\ORNISEC\Thucyd\backend"
docker compose up --build
```

Laisse ce terminal ouvert. Le backend doit répondre sur :

```text
http://localhost:8080
```

Dans un autre terminal, teste sa santé :

```powershell
Invoke-RestMethod "http://localhost:8080/api/healthchecker"
```

Résultat attendu :

```text
status database
------ --------
ok     postgresql
```

Documentation FastAPI :

```text
http://localhost:8080/docs
```

Pour consulter les journaux si le conteneur est lancé en arrière-plan :

```powershell
cd "C:\Users\tomab\OneDrive\Bureau\ALL\Entreprise\ORNISEC\Thucyd\backend"
docker compose logs -f backend
```

## 3. Exécuter les tests du backend

Terminal PowerShell séparé :

```powershell
cd "C:\Users\tomab\OneDrive\Bureau\ALL\Entreprise\ORNISEC\Thucyd\backend"

docker compose exec -T backend python -m unittest discover -s tests -v
```

## 4. Démarrer le frontend

Terminal PowerShell n° 2 :

```powershell
cd "C:\Users\tomab\OneDrive\Bureau\ALL\Entreprise\ORNISEC\Thucyd\frontend"

npm ci
npm run dev
```

Ouvre ensuite :

```text
http://localhost:3000/login
```

Le frontend utilise bien :

```env
BACKEND_URL=http://localhost:8080
```

## 5. Tester le frontend

Dans un autre terminal :

```powershell
cd "C:\Users\tomab\OneDrive\Bureau\ALL\Entreprise\ORNISEC\Thucyd\frontend"

npm run lint
npx tsc --noEmit
npm run build
```

Il est préférable d’arrêter temporairement `npm run dev` avant `npm run build` si Next.js signale un conflit sur le dossier `.next`.

## 7. Exposer le backend

Terminal PowerShell n° 3, en laissant le backend actif :

```powershell
ngrok http 8080
```

Ngrok affichera quelque chose comme :

```text
Forwarding  https://abcd-1234.ngrok-free.app -> http://localhost:8080
```

Ne copie pas littéralement `https://xxxxx.ngrok-free.app`. Il faut utiliser l’adresse réellement affichée par ngrok.

Tu peux aussi récupérer automatiquement l’adresse :

```powershell
$tunnels = Invoke-RestMethod "http://127.0.0.1:4040/api/tunnels"
$publicUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
$publicUrl
```

Teste ensuite le backend à travers Internet :

```powershell
Invoke-RestMethod "$publicUrl/api/healthchecker"
```

Tu peux inspecter les requêtes reçues par ngrok ici :

```text
http://127.0.0.1:4040
```

## 8. Configuration dans Tavus

Ouvre [Tavus PAL Maker](https://maker.tavus.io/dev/pals), puis sélectionne ton PAL.

Dans la configuration du PAL :

1. Active le pipeline complet, incluant STT, LLM et TTS.
2. Ouvre la couche **LLM**.
3. Sélectionne **Custom LLM** ou **Bring your own LLM**.
4. Renseigne :

```text
Model: ornisec-interviewer
Base URL: https://abcd-1234.ngrok-free.app/v1
API Key: valeur exacte de TAVUS_LLM_API_KEY
Speculative inference: false
```

La **Base URL** doit se terminer par `/v1`, et non par `/v1/chat/completions`. Tavus ajoutera automatiquement le chemin complet :

```text
POST https://abcd-1234.ngrok-free.app/v1/chat/completions
```

La documentation Tavus confirme qu’un LLM personnalisé nécessite un modèle, une Base URL et une API key dans la couche LLM du PAL : [Custom LLM Tavus](https://docs.tavus.io/sections/conversational-video-interface/faq).

## 9. Vérifier les identifiants Tavus

Dans [backend/.env](C:/Users/tomab/OneDrive/Bureau/ALL/Entreprise/ORNISEC/Thucyd/backend/.env:7) :

```env
TAVUS_API_KEY=clé créée dans Tavus
TAVUS_LLM_API_KEY=même clé que le champ API Key du Custom LLM
TAVUS_PERSONA_ID=identifiant du PAL ou de la Persona
TAVUS_REPLICA_ID=
TAVUS_REQUIRE_AUTH=true
```

Correspondances dans la nouvelle interface Tavus :

- Persona → PAL
- Replica → Face
- `TAVUS_API_KEY` : [API Keys Tavus](https://maker.tavus.io/dev/api-keys)
- `TAVUS_PERSONA_ID` : [PALs Tavus](https://maker.tavus.io/dev/pals)
- `TAVUS_REPLICA_ID` : [Faces Tavus](https://maker.tavus.io/dev/faces)

Si ton PAL possède déjà une Face par défaut, laisse `TAVUS_REPLICA_ID` vide.

Après toute modification du `.env`, redémarre le backend :

```powershell
cd "C:\Users\tomab\OneDrive\Bureau\ALL\Entreprise\ORNISEC\Thucyd\backend"

docker compose down
docker compose up --build
```

## 10. Lancer un test d’entretien

Lorsque les trois services sont actifs :

```text
Frontend : http://localhost:3000
Backend  : http://localhost:8080
Ngrok    : https://adresse-affichée-par-ngrok
```

Dans le frontend :

1. Connecte-toi.
2. Crée ou sélectionne un audit en cours.
3. Ouvre sa page d’entretien.
4. Autorise la caméra et le microphone.
5. Lance l’entretien.
6. Réponds à une première question.

Dans l’inspecteur ngrok, tu dois voir des requêtes :

```text
POST /v1/chat/completions
```

avec un statut HTTP `200`.

Erreurs courantes :

- `401` : la clé Tavus ne correspond pas à `TAVUS_LLM_API_KEY`.
- `404` : Base URL incorrecte ; utilise bien `https://...ngrok-free.app/v1`.
- `400 Jeton de session absent` : Tavus n’a pas transmis le contexte de conversation créé par le backend.
- `502` ou `503` : backend arrêté, OpenAI indisponible ou variable manquante.
- Aucune requête dans ngrok : mauvaise Base URL dans Tavus ou tunnel arrêté.

Laisse ouverts pendant tout le test : Docker/backend, `npm run dev` et `ngrok http 8080`. L’adresse gratuite ngrok peut changer à chaque redémarrage ; dans ce cas, mets à jour la **Base URL** dans Tavus.

Tu peux surveiller l’arrivée des appels Tavus ici :
http://localhost:4040
