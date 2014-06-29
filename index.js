var fs = require('fs');
var express = require('express');
var http = require('http');
var path = require('path');
var morgan  = require('morgan');
var basicAuth = require('basic-auth-connect');
var Busboy = require('busboy');

var config = require('./lib/config.js');
var JSONResponse = require('./lib/JSONResponse.js');
var binaryTypes = require('./lib/binaryTypes.js')

// Middleware for HTTP basic auth
var protectedRoute = basicAuth(config.auth.user, config.auth.pass);

// Read in environment variables
config.port = config.port || process.env.PORT || 3000;

// Create the express application
var app = express();

// Add the logger
// app.use(morgan());

// Serve static content
app.use('/', express.static(path.resolve(__dirname, config.clientPath)));
app.use('/results', express.static(path.resolve(__dirname, config.resultPath)));

// Start the server
http.createServer(app).listen(config.port);

console.log('Running on port %d', config.port);

var invalidFilenameCharsRE = /[^a-zA-Z0-9_\-.]+/g;

// @todo handle JSON files
app.route('/storeSession/:session')
.post(
  protectedRoute,
  function validateRequest(req, res, next) {
    if (!req.params.session) {
      return next(new JSONResponse('Invalid session name provided.', 400));
    }

    next();
  },
  function handleRequest(req, res, next) {
    // Get folder name
    var session = req.params.session.replace(invalidFilenameCharsRE, '');

    // Make the session folder
    var folderPath = path.join(config.resultPath, session);

    // Check if the folder exists
    fs.exists(folderPath, handleExists);

    function handleExists(exists) {
      if (exists) {
        handleUpload();
      }
      else {
        // Create the folder
        fs.mkdir(folderPath, 0755, handleMkdir);
      }
    }

    function handleMkdir(err) {
      if (err) {
        // @todo remove sensitive data from error message
        return next(new JSONResponse('Failed to create folder: '+err, 500));
      }

      handleUpload();
    }

    function handleUpload() {
      // Parse the multipart/form-data 
      var busboy = new Busboy({ headers: req.headers });
      busboy.on('file', function(fieldName, file, fileName, encoding, mimeType) {
        console.log('File [' + fieldName + ']: fileName: ' + fileName + ', encoding: ' + encoding + ', mimeType: ' + mimeType);

        if (binaryTypes.indexOf(mimeType) === -1) {
          // Discard contents
          file.resume();

          return next(new JSONResponse('Invalid file type: '+mimeType, 400));
        }

        // Get the file path
        var filePath = path.join(folderPath, fileName);

        // Stream the file to disk
        var writeStream = fs.createWriteStream(filePath);
        file.pipe(writeStream);

        writeStream.on('error', function(err) {
          // @todo test this
          // Discard contents
          file.resume();

          // @todo remove sensitive data from error message
          return next(new JSONResponse('Failed to upload file: '+type, 500));
        });

        writeStream.on('end', function() {
          console.log('Wrote %s...', fileName);
        });
      });

      busboy.on('field', function(fieldName, value, fieldNameTruncated, valTruncated) {
        console.log('Got field %s = %s', fieldName, value);
      });

      busboy.on('finish', function() {
        return next(new JSONResponse({
          message: 'Tracks stored'
        }, 201));
      });

      req.pipe(busboy);
    }
});

// Handle objects passed to next() by any of the above routes
// This is an express "error handler" because the function has an arity of 4
// However, it handles general JSON responses, not just errors
app.use(function(obj, req, res, next) {
  if (obj instanceof JSONResponse) {
    if (!obj.status) {
      // 200 OK by default
      obj.status = 200;
    }
    res.set('Content-Type', 'application/json');
    res.statusCode = obj.status;
    res.send(JSON.stringify(obj));
  }
  else {
    next(obj);
  }
});
