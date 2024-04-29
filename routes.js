const { response } = require("express");

module.exports = function(app, database){


    app.get('/',(req, res)=>{

        database.LeerInfo()
        .then(respuestas =>{
            response.json(respuestas);
        }).catch(e => response.status(500).json(e));
    });

};

