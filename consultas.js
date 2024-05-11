// Importa el módulo de base de datos
const { databases } = require("./database");
//Con esta parte del programa pueden ver las consultas en un localhost
// Importa el módulo Express.js
const express = require("express");

// Crea una nueva aplicación Express
const app = express();
// Usa el middleware express.json() para analizar el cuerpo de las solicitudes entrantes en un formato JSON
app.use(express.json());
// Define una ruta GET para la ruta raíz ("/") de la aplicación
app.get("/", (req, res) => {
  // Llama a la función LeerInfo del módulo de base de datos
  // Esta función devuelve una promesa que se resuelve con los registros de la tabla 'respuestas' de la base de datos
  databases
    .LeerInfo()
    .then((lenguajes) => {
      // Cuando la promesa se resuelve, envía los registros de la base de datos como una respuesta JSON
      res.json(lenguajes);
    })
    .catch((e) => {
      // Si ocurre un error al recuperar los registros de la base de datos, registra el error y envía una respuesta con un código de estado HTTP 500 y un mensaje de error genérico
      console.error(e);
      res
        .status(500)
        .send(
          "Un error ha ocurrido al recuperar la información de la base de datos"
        );
    });
});

// Comienza a escuchar las conexiones entrantes en el puerto 3000
app.listen(3000, function () {
  // Imprime un mensaje en la consola cuando el servidor comienza a escuchar
  console.log("App en el puerto 3000");
});
