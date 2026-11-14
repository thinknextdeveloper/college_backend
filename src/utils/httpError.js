// Throw httpError(409, 'message') anywhere; the error handler turns it into a JSON response
module.exports = (status, message) => Object.assign(new Error(message), { status, expose: true });