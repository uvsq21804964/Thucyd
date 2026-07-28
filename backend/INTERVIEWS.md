# Entretiens Tavus / IA

Le backend expose le moteur d'entretien et crée désormais automatiquement la salle Tavus :

- `POST /interviews/{audit_id}/sessions` crée la session locale, appelle Tavus, puis renvoie les informations de la salle privée.
- `POST /v1/chat/completions` est la passerelle compatible OpenAI appelée par le LLM personnalisé de la persona Tavus.
- `GET /interviews/{session_id}` restitue l'état, la salle Tavus et les tours enregistrés.

## Enregistrement en direct

À chaque tour de parole, le moteur analyse la transcription et produit une liste structurée des questions couvertes. Il verrouille ensuite la session et l'audit, met à jour toutes ces questions et enregistre le tour dans une seule transaction PostgreSQL.

La question courante est toujours sauvegardée, même si OpenAI est indisponible. Les commentaires contiennent le résumé et les preuves mentionnées. Une note proposée par l'IA n'est enregistrée qu'à partir d'une confiance de `0.7`. Une requête Tavus rejouée est dédupliquée.

## Configuration requise

```dotenv
OPENAI_API_KEY=<clé OpenAI>
TAVUS_API_KEY=<clé API Tavus>
TAVUS_PERSONA_ID=<identifiant de la persona Tavus>
TAVUS_LLM_API_KEY=<clé interne déjà générée>
```

`TAVUS_REPLICA_ID` est facultatif si la persona possède déjà une replica. Les salles sont privées par défaut avec `TAVUS_REQUIRE_AUTH=true` et limitées à une personne en plus de la replica.

La persona Tavus doit utiliser le pipeline complet et cette couche LLM :

```json
{
  "model": "ornisec-interviewer",
  "base_url": "https://api.example.com/v1",
  "api_key": "<TAVUS_LLM_API_KEY>",
  "speculative_inference": false
}
```

`base_url` doit être l'URL HTTPS publique du backend terminée par `/v1`. La clé Tavus principale reste exclusivement dans le backend et n'est jamais envoyée au navigateur.

## Création d'une conversation

Après authentification dans ORNISEC, appelez :

```http
POST /interviews/<audit_id>/sessions
```

La réponse contient `tavus.conversation_id`, `tavus.conversation_url` et, pour la salle privée, `tavus.meeting_token`. Le frontend pourra transmettre séparément l'URL et le jeton au SDK Daily lors de l'étape d'intégration de l'avatar.
## Interface vidéo

La page `/current-audits/<audit_id>/interview` vérifie les autorisations caméra et microphone avant de créer la salle. Elle rejoint ensuite la conversation privée avec Daily, en passant séparément `conversation_url` et `meeting_token`.

Une interruption ou l'action « Reprendre plus tard » appelle `POST /interviews/<session_id>/interrupt`. La session passe à `interrupted`, mais son index, ses relances et tous ses tours restent en base.

`POST /interviews/<session_id>/resume` reprend le même identifiant de session. Le backend rejoint la salle encore active ou en crée une nouvelle si nécessaire, puis fait répéter exactement la dernière question ou relance enregistrée. Seule l'action « Terminer » appelle `POST /interviews/<session_id>/end` et rend la session non reprenable.
