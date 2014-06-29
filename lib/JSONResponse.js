var JSONResponse = function(message, status) {
  if (typeof message === 'string') {
    this.message = message;
  }
  else {
    // Copy properties into this object
    for (var prop in message) {
      this[prop] = message[prop];
    }
  }

  this.status = status;
};

JSONResponse.prototype.toString = function() {
  return this.message;
};

module.exports = JSONResponse;
