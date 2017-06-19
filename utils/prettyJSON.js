const R = require('ramda');

const prettyJSON = d => JSON.stringify(d, null, 2);

module.exports = prettyJSON;
