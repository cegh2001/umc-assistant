const express = require('express');
const app = express();
const { database } = require('./database')

app.use(express.json());

require('./routes')(app, database);

app.listen(3000, function(){

    console.log('app listening port 3000');

});

