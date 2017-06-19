const R = require('ramda'),
      zlib = require('zlib');

const gunzip = (data) => zlib.gunzipSync(data);

const parseMessage = R.over(R.lensProp('content'), R.pipe(gunzip, R.toString, JSON.parse));

module.exports = parseMessage;
