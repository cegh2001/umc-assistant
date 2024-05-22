// Importar readline del módulo readline
const readline = require("readline");

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

module.exports = {
  getUserInput,
};