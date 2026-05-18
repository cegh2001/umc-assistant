# UMC Assistant

Asistente de consola para preguntas y respuestas sobre la Universidad Nacional Experimental Maritima del Caribe.

El proyecto usa TypeScript, `@google/genai`, una base de conocimiento local en Markdown y Google Search grounding para responder preguntas que no esten en la base o que requieran verificar informacion vigente.

## Como funciona

- La base local esta en `preguntas-base-conocimiento.md`.
- Esa base se carga una vez al iniciar el programa.
- El modelo responde con esa base como contexto principal.
- Si la pregunta requiere informacion actual, enlaces vigentes o datos no presentes en la base, el modelo puede usar Google Search.
- El modelo por defecto es `gemma-4-26b-a4b-it`.
- El nivel de razonamiento se ajusta entre `low` y `high` segun el tipo de pregunta.

## Requisitos

- Node.js 24 o superior.
- Una API key de Gemini.

## Variables de entorno

Usa `.env.example` como plantilla.

Variables disponibles:

- `GEMINI_API_KEY`: API key para usar el SDK actual de Google.
- `GEMINI_MODEL`: modelo a usar. Por defecto `gemma-4-26b-a4b-it`.
- `KNOWLEDGE_BASE_PATH`: ruta al archivo Markdown con la base local.

Ejemplo:

```dotenv
GEMINI_API_KEY="tu_api_key"
GEMINI_MODEL="gemma-4-26b-a4b-it"
KNOWLEDGE_BASE_PATH="preguntas-base-conocimiento.md"
```

## Instalacion

```bash
npm install
```

## Uso

```bash
npm start
```

Comandos en la consola:

- Escribe cualquier pregunta sobre la UMC.
- Escribe `salir` para cerrar el programa.

## Verificacion

Para comprobar tipos:

```bash
npm run typecheck
```

## Estructura principal

- `app.ts`: ciclo principal del chat por consola.
- `aiIntegration.ts`: integracion con Gemini, bootstrap del contexto y uso de Google Search.
- `knowledgeBase.ts`: carga de la base local en Markdown.
- `userInteraction.ts`: entrada interactiva por consola.
- `preguntas-base-conocimiento.md`: conocimiento local exportado de la version antigua.

## Notas

- El proyecto ya no depende de MySQL ni SQLite.
- `.env` ya no se versiona.
- `node_modules` ya no forma parte del repositorio.
- La base en Markdown contiene informacion publica, pensada como contexto base para el asistente.