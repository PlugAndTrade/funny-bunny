#!/usr/bin/env node

const amqp = require('amqplib'),
      meow = require('meow'),
      R = require('ramda'),
      Promise = require('bluebird'),
      RabbitMqClient = require('../rabbitmq');

const cli = meow(`
    Retries all mesasges in a dlq

    Usage
      funny-bunny-retry --host URL --queue QUEUE_NAME --count COUNT

    Options
      --host URL to rabbitmq, required.
      --queue The dead letter queue to look for the message in, required.
      --count The number of messages to retry.

    Examples
      funny-bunny-retry --host amqp://localhost --queue mydeadletterqueue --count 10
`);

const config = cli.flags;

const rabbitMqClient = new RabbitMqClient();

const REQUIRED_OPTIONS = [ 'host', 'queue', 'count' ];
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

let count = +cli.flags.count;
let errs = validateOpts(cli.flags);
if (R.length(errs) > 0) {
  console.error(R.join("\n", errs));
  console.log(cli.help);
  process.exit(1);
}

const retry = (msg) => {
  if (R.complement(R.pathSatisfies(R.has('x-death'), [ 'properties', 'headers' ]))(msg)) {
    return Promise.reject(`Not dead letter: ${msg.properties.messageId}`);
  }

  return rabbitMqClient
    .enqueueMessage(
      msg,
      R.path([ 'properties', 'headers', 'x-death', 0, 'queue' ])(msg)
    )
    .then(() => rabbitMqClient.ack(msg))
    .then(() => console.log(`Retried ${msg.properties.messageId}`))
    .then(R.T);
};

const logMessage = msg => {
    if (msg) {
      console.log(msg);
    } else {
      console.log('Queue empty');
    }
  return msg;
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

rabbitMqClient.connect(config.host, config.queue);
forEachMessage(rabbitMqClient, retry, count)
  .then(() => console.log("DONE"))
  .then(() => rabbitMqClient.disconnect())
  .catch(err => console.error(err));
