// Importar la clase GoogleGenerativeAI del paquete @google/generative-ai
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");

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

module.exports = {
  genAI,
  generationConfig,
  safetySettings,
};