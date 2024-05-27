// Importa la biblioteca 'dotenv' y carga las variables de entorno del archivo '.env'
require("dotenv").config();

// Define una función 'databases' que configura y exporta una conexión a una base de datos MySQL
const databases = () => {
  // Importa la biblioteca 'knex' y la inicializa con una configuración de conexión a la base de datos
  const knex = require("knex")({
    client: "mysql", // Especifica que se utilizará el cliente MySQL de 'knex'
    connection: {
      host: process.env.DB_HOST, // Usa la variable de entorno DB_HOST
      port: process.env.DB_PORT, // Usa la variable de entorno DB_PORT
      user: process.env.DB_USER, // Usa la variable de entorno DB_USER
      password: process.env.DB_PASSWORD, // Usa la variable de entorno DB_PASSWORD
      database: process.env.DB_NAME, // Usa la variable de entorno DB_NAME
    },
  });

  const table = "respuestas"; // Define una constante 'table' que se refiere a la tabla 'respuestas' en la base de datos

  // Define una función 'LeerInfo' que selecciona solo el campo 'resultados' de todos los registros de la tabla 'respuestas'
  const LeerInfo = () => {
    return knex(table).select("resultados"); // Utiliza 'knex' para generar y ejecutar una consulta SQL que selecciona solo el campo 'resultados' de todos los registros de la tabla 'respuestas'
  };

  // Retorna un objeto con la función 'LeerInfo' como método
  return {
    LeerInfo,
  };
};

// Exporta un objeto con la conexión a la base de datos como método
module.exports = {
  databases: databases(),
};
