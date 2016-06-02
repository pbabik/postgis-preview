//postgis-preview
//A super simple node app + leaflet frontend for quickly viewing PostGIS query results

var Promise = require('bluebird');
//dependencies
var express = require('express'),
    pgp = require('pg-promise')({promiseLib: Promise}),
    dbgeo = require('dbgeo'),
    jsonexport = require('jsonexport');

//create express app and prepare db connection
var app = express(),
    port = process.env.PORT || 4000,
    config = require('./config.js'),
    db = pgp(config);

//use express static to serve up the frontend
app.use(express.static(__dirname + '/public'));

//expose sql endpoint, grab query as URL parameter and send it to the database
app.get('/sql', function (req, res) {
    var sql = req.query.q;
    var format = req.query.format || 'topojson';
    console.log('Executing SQL: ' + sql, format);

    //query using pg-promise
    db.any(sql)
        .then(function (data) { //use dbgeo to convert WKB from PostGIS into topojson
            switch (format) {
                case 'csv':
                    return jsonExport(data).then(function (data) {
                        res.setHeader('Content-disposition', 'attachment; filename=query.csv');
                        res.setHeader('Content-Type', 'text/csv');
                        return data;
                    });
                case 'geojson':
                    return dbGeoParse(data, format).then(function (data) {
                        res.setHeader('Content-disposition', 'attachment; filename=query.geojson');
                        res.setHeader('Content-Type', 'application/json');
                        return data;
                    });
                default:
                    return dbGeoParse(data, format);
            }
        })
        .then(function (data) {
            res.send(data);
        })
        .catch(function (err) { //send the error message if the query didn't work
            var msg = err.message || err;
            console.log("ERROR:", msg);
            res.send({
                error: msg
            });
        });
});

function dbGeoParse(data, format) {
    //check the raw data for geom, inject nulls if there is none
    if(!data[0].geom) {
       data.forEach(function(row) {
        row.geom='010100000000000000000000000000000000000000';
       })
    }



    return new Promise(function (resolve, reject) {
        dbgeo.parse({
            data: data,
            outputFormat: format,
            geometryColumn: 'geom',
            geometryType: 'wkb'
        }, function (err, result) {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}


function jsonExport(data) {
    //remove geom
    data.forEach(function (row) {
        delete row.geom;
    });

    return new Promise(function (resolve, reject) {
        jsonexport(data, function (err, csv) {
            if (err) {
                reject(err);
            } else {
                resolve(csv);
            }
        });
    });
}

//start the server
app.listen(port);
console.log('postgis-preview is listening on port ' + port + '...');
