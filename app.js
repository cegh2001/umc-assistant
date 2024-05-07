// Importa el módulo de base de datos
const { databases } = require("./database");

// Importar la clase GoogleGenerativeAI del paquete @google/generative-ai
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");

// Importar readline del módulo readline
const readline = require("readline");

// Cargar las variables de entorno desde el archivo .env
require("dotenv").config();

const generationConfig = {
  temperature: 0.9,
  topK: 0,
  topP: 1,
  maxOutputTokens: 2048,
};

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

// Crear una instancia de GoogleGenerativeAI con la clave de API proporcionada
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

// Función para generar un objeto de mensaje del modelo
function createModelMessage(text) {
  return {
    role: "model",
    parts: [{ text }],
  };
}

// Función para obtener las respuestas de la base de datos
async function fetchDatabaseResponses() {
  try {
    const lenguajes = await databases.LeerInfo();
    return JSON.stringify(lenguajes);
  } catch (error) {
    console.error("Error al recuperar las respuestas de la base de datos:", error);
    throw error;
  }
}

// Función para manejar la entrada del usuario y actualizar el historial
async function handleUserInput(history, userInput, respuestas) {
  history.push(
    {
      role: "user",
      parts: [{ text: userInput, text: respuestas }, ],
    },
    
    createModelMessage("")
  );
}

// Función para manejar la respuesta del modelo y actualizar el historial
async function handleModelResponse(history, model, inputText, respuestas) {
  // Agregar respuestas al historial antes de iniciar el chat
//   history.push(createModelMessage(respuestas));

  const chat = model.startChat({
    history: history,
    generationConfig: generationConfig,
    safetySettings: safetySettings,
  });
  console.log();

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
  let respuestas = null;

  try {
    respuestas = await fetchDatabaseResponses();
  } catch (error) {
    await handleError(error);
    return;
  }
  
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

      await handleUserInput(history, inputText, respuestas);
      await handleModelResponse(history, model, inputText, respuestas);
    } catch (error) {
      await handleError(error);
    }
  }
}

// Función asincrónica para obtener la entrada del usuario desde la consola
const getUserInput = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    // Solicitar la entrada del usuario con un mensaje "Tú: "
    rl.question("Tú: ", (inputText) => {
      // Resolver la promesa con la entrada del usuario y cerrar la interfaz readline
      resolve(inputText);
      rl.close();
    });
  });
};

// Ejecutar la función principal para iniciar la conversación
run();
