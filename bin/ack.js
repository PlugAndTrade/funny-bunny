#!/usr/bin/env node

const amqp = require('amqplib'),
      meow = require('meow'),
      R = require('ramda'),
      Promise = require('bluebird'),
      RabbitMqClient = require('../rabbitmq');

const cli = meow(`
    Ack all mesasges in a queue

    Usage
      funny-bunny-ack --host URL --queue QUEUE_NAME [--count COUNT] [--routing-key PATTERN | --headers JSON_OBJ]

    Options
      --host URL to rabbitmq, required.
      --queue The queue to look for the message in, required.
      --count The maximum number of messages to fetch. Default 10
      --routing-key Regular expresion the routing key of every message should
                    be tested against. See
                    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
                    for documentation on how to write regular expressions.
      --headers Json list of objects with header exchange binding arguments

    Examples
      funny-bunny-ack --host amqp://localhost --queue myqueue --count 10
      funny-bunny-ack --host amqp://localhost --queue myqueue --routing-key 'foo.bar.*'
      funny-bunny-ack --host amqp://localhost --queue myqueue --headers '[{"foo":"a"}]'
`);

const DEFAULT_CONFIG = {
  count: 10
};

const config = R.merge(DEFAULT_CONFIG, cli.flags);

const rabbitMqClient = new RabbitMqClient();

const REQUIRED_OPTIONS = [ 'host', 'queue' ];
const validateRequired = opts => R.pipe(
  R.reject(R.has(R.__, opts)),
  R.map(o => `Missing '${o}'`)
)(REQUIRED_OPTIONS);

const validateOpts = R.pipe(
  R.juxt([
    validateRequired
  ]),
  R.reduce(R.concat, [])
);

let count = +config.count;
let errs = validateOpts(cli.flags);
if (R.length(errs) > 0) {
  console.error(R.join("\n", errs));
  console.log(cli.help);
  process.exit(1);
}

const ack = (msg) => {
  return rabbitMqClient.ack(msg)
    .then(() => console.log(`Acked ${msg.properties.messageId || msg.fields.deliveryTag}`))
    .then(R.T);
};

const createFilter = ({ routingKey, headers }) => {
  if (routingKey) {
    const regex = new RegExp(routingKey);
    return msg => regex.test(msg.fields.routingKey);
  }

  if (headers) {
    const fn = R.pipe(
      JSON.parse,
      R.map(R.pipe(
        R.toPairs,
        R.map(R.apply(R.propEq)),
        R.allPass
      )),
      R.anyPass
    )(headers);

    return R.pathSatisfies(fn, ['properties', 'headers']);
  }

  return R.T;
};

const forEachMessage = (client, fn, maxCount) => {
  return maxCount > 0
    ? client
      .nextMessage()
      .then(msg => {
        if (!msg)
          return Promise.resolve({});

        return Promise.resolve(fn(msg))
          .then(res => {
            return res && msg.fields.messageCount > 0
            ? forEachMessage(client, fn, --maxCount)
            : Promise.resolve({})
          });
      })
    : Promise.resolve({});
};

const msgFilter = createFilter(config);

rabbitMqClient.connect(config.host, config.queue);
forEachMessage(rabbitMqClient, R.when(msgFilter, ack), count)
  .then(() => console.log("DONE"))
  .then(() => rabbitMqClient.disconnect())
  .catch(err => console.error(err));
