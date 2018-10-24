const zlib = require('zlib'),
      R = require('ramda');

const gunzip = (data) => zlib.gunzipSync(data);
const gzip = (data) => zlib.gzipSync(data);

const decode = R.cond([
  [ R.pathSatisfies(R.equals('gzip'), [ 'properties', 'headers', 'Content-Encoding' ]), R.over(R.lensProp('content'), R.pipe(gunzip, R.toString)) ],
  [ R.T, R.over(R.lensProp('content'), R.toString) ]
]);

const encode = R.cond([
  [ R.pathSatisfies(R.equals('gzip'), [ 'properties', 'headers', 'Content-Encoding' ]), R.over(R.lensProp('content'), R.pipe(R.curryN(1, Buffer.from), gzip)) ],
  [ R.T, R.over(R.lensProp('content'), R.curryN(1, Buffer.from)) ]
]);

module.exports = { decode, encode };
