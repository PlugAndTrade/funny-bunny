const R = require('ramda');

const deserialize = R.cond([
  [ R.pathSatisfies(R.equals('application/json'), [ 'properties', 'contentType' ]), R.over(R.lensProp('content'), JSON.parse) ],
  [ R.T, R.identity ]
]);

const serialize = R.cond([
  [ R.pathSatisfies(R.equals('application/json'), [ 'properties', 'contentType' ]), R.over(R.lensProp('content'), R.curryN(1, JSON.stringify)) ],
  [ R.T, R.identity ]
]);

module.exports = { serialize, deserialize };
