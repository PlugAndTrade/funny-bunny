#!/usr/bin/env node

const amqp = require('amqplib'),
      meow = require('meow'),
      R = require('ramda'),
      Promise = require('bluebird'),
      RabbitMqClient = require('../rabbitmq');

const cli = meow(`
    Move mesasges in a queue to another

    Usage
      funny-bunny-ack --from-host URL --from-queue QUEUE_NAME --to-host URL --to-queue QUEUE_NAME [--count COUNT]

    Options
      --from-host URL to fetch messages from, required.
      --from-queue The queue to fetch messages from, required.
      --to-host URL to push messages to, required.
      --to-queue The queue to push messages to, required.
      --count The maximum number of messages to fetch. Default 10

    Examples
      funny-bunny-ack --host amqp://localhost --queue myqueue --count 10
      funny-bunny-ack --host amqp://localhost --queue myqueue --routing-key 'foo.bar.*'
      funny-bunny-ack --host amqp://localhost --queue myqueue --headers '[{"foo":"a"}]'
`);

const DEFAULT_CONFIG = {
  count: 10
};

const config = R.merge(DEFAULT_CONFIG, cli.flags);


const REQUIRED_OPTIONS = [ 'fromHost', 'fromQueue', 'toHost', 'toQueue' ];
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

const { fromHost, fromQueue, toHost, toQueue } = config;

function enqueuePromised(chan) {
  return new Promise((resolve, reject) => {
    try {
      chan.sendToQueue.apply(chan, R.tail(arguments))
        ? resolve()
        : chan.once('drain', () => resolve());
    } catch (err) {
      reject(err);
    }
  }
  );
};

const moveAll = (fromChan, fromQueue, toChan, toQueue) => {
  return fromChan
    .get(fromQueue)
    .then(msg => {
      return msg
        ? enqueuePromised(toChan, toQueue, msg.content, msg.properties)
            .then(() => fromChan.ack(msg))
            .then(() => moveAll(fromChan, fromQueue, toChan, toQueue))
        : Promise.resolve();
    });
};

Promise.all([
  amqp.connect(fromHost),
  amqp.connect(toHost),
])
.then(([fromC, toC]) => Promise.all([
    fromC
      .createChannel()
      .then(chan => {
        //chan.on('close', () => {
          //fromC.close();
        //});
        return chan.checkQueue(fromQueue).then(() => chan);
      }),
    toC
      .createChannel()
      .then(chan => {
        //chan.on('close', () => {
          //toC.close();
        //});
        return chan.checkQueue(toQueue).then(() => chan);
      }),
  ])
  .then(([fromCh, toCh]) => {
    return moveAll(fromCh, fromQueue, toCh, toQueue);
  })
  .then(() => Promise.all([fromC.close(), toC.close()]))
);
