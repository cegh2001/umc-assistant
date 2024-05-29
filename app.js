// Importa el módulo de base de datos
const { databases } = require("./database");

// Importa las funciones de integración con la IA
const { genAI, generationConfig, safetySettings } = require("./aiIntegration");

// Importa la función de interacción con el usuario
const { getUserInput } = require("./userInteraction");

// Variable para almacenar las respuestas
let respuestas;

 // Variable para saber si es la primera llamada
let firstCall = true; 

// Función para generar un objeto de mensaje del modelo
function createModelMessage(text) {
  if (firstCall) {
    firstCall = false;
    return {
      role: "model",
      parts: [
        { text },
        { text: respuestas },
        {
          text: "No inventes información de la umc, por favor, como maximo puedes actualizar o aportar. Si no sabes la respuesta, dilo.",
        },
        {
          text: "Da información de la umc si la tienes o si está pública en internet.",
        },
        {
          text: "Las url http://www.umc.edu.ve/images/2023calen.jpg y http://www.umc.edu.ve/images/Pasantias2023.pdf actualiza cambiando '2023' por el año que buscas.",
        },
        {
          text: "Toda la informacion que necesitas del velero la tienes en este link: http://www.umc.edu.ve/estudios/velero-de-preparacion. No necesitas mas.",
        },
        {
          text: "Las preguntas de temas universitarios enfocalos a la umc. Eres un asistente virtual especializado en la Universidad Nacional Experimental Marítima del Caribe.",
        },
      ],
    };
  } else {
    return {
      role: "model",
      parts: [{ text }],
    };
  }
}

// Función para obtener las respuestas de la base de datos
async function fetchDatabaseResponses() {
  try {
    const lenguajes = await databases.LeerInfo();
    return respuestas = JSON.stringify(lenguajes);
  } catch (error) {
    console.error("Error al recuperar las respuestas de la base de datos:", error);
    throw error;
  }
}

fetchDatabaseResponses();

// Función para manejar la entrada del usuario y actualizar el historial
async function handleUserInput(history, userInput) {
  history.push(
    
    {
      role: "user",
      parts: [{ text: userInput }],
    },
    
    createModelMessage("")
  );
}

// Función para manejar la respuesta del modelo y actualizar el historial
async function handleModelResponse(history, model, inputText) {

  const chat = model.startChat({
    history: history,
    generationConfig: generationConfig,
    safetySettings: safetySettings,
  });

  const result = await chat.sendMessage(inputText);
  const response = await result.response;
  const text = response.text();

  if (text) {
    console.log("Gemini:", text);
    history[history.length - 1] = createModelMessage(text);
  } else {
    console.log(
      "Gemini: No se encontró respuesta. Por favor, intenta con otra pregunta."
    );
    history[history.length - 1] = createModelMessage("Hazme otra pregunta");
  }
}

// Función para manejar errores de manera centralizada
async function handleError(error) {
  console.error("Error durante la conversación:", error);
  if (
    error.response &&
    (error.response.status === 503 || error.response.status === 429 || error.response.status === 500)
  ) {
    console.log(
      "Gemini: El servicio no está disponible temporalmente por una sobrecarga del servidor. Por favor, inténtalo en unos minutos."
    );
  } else {
    console.log(
      "Gemini: Ocurrió un error o su entrada es sensible. Por favor, intenta con otra."
    );
  }
}

// Función principal asincrónica que ejecuta la conversación
async function run() {
  
  const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });
  
  const history = [];
  let continueChat = true;

  while (continueChat) {
    try {
      const inputText = await getUserInput();

      if (inputText.toLowerCase() === "salir") {
        continueChat = false;
        break;
      }

      await handleUserInput(history, inputText);
      await handleModelResponse(history, model, inputText);
    } catch (error) {
      await handleError(error);
    }
  }
}

// Ejecutar la función principal para iniciar la conversación
run();
