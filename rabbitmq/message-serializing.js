const R = require('ramda');

function tryParseJson(json) {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

const deserialize = R.cond([
  [ R.pathSatisfies(R.equals('application/json'), [ 'properties', 'contentType' ]), R.over(R.lensProp('content'), tryParseJson) ],
  [ R.T, R.identity ]
]);

const serialize = R.cond([
  [ R.pathSatisfies(R.equals('application/json'), [ 'properties', 'contentType' ]), R.over(R.lensProp('content'), R.curryN(1, JSON.stringify)) ],
  [ R.T, R.identity ]
]);

module.exports = { serialize, deserialize };
