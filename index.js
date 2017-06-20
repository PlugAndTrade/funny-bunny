const amqp = require('amqplib'),
      meow = require('meow'),
      Vorpal = require('vorpal'),
      R = require('ramda'),
      Promise = require('bluebird'),
      commands = require('./commands'),
      RabbitMqClient = require('./rabbitmq');

const defaultConfig = {
  action: []
};

const REQUIRED_OPTIONS = [ 'host', 'queue' ];
const OPTIONAL_OPTIONS = [ 'action' ];

const OPTIONS_NAMES = R.concat(REQUIRED_OPTIONS, OPTIONAL_OPTIONS);

const rabbitMqClient = new RabbitMqClient();
let state = commands({ rabbitMqClient, vorpal: new Vorpal() });

const cli = meow(`
    Usage
      rabbit-retry [--host URL] [--message MESSAGE_ID] [--queue QUEUE_NAME]

    Options
      --host URL to rabbitmq, required.
      --queue The dead letter queue to look for the message in, required.
      --action The action to take on the specified queue, default ${defaultConfig.action}.
               Multiple actions may be supplied and are executed in order.
               Available actions:
               ${R.pipe(R.map((c) => ` * ${c._name}: ${c._description || ''}`), R.join('\n               '))(state.vorpal.commands)}

    Examples
      rabbit-retry --host amqp://localhost --queue mydeadletterqueue
`);

const config = R.pipe(
  R.pick(OPTIONS_NAMES),
  R.merge(defaultConfig),
  R.over(R.lensProp('action'), R.when(R.complement(R.is(Array)), R.of))
)(cli.flags);

const validateConfig = R.allPass([
  R.complement(R.pipe(R.props(REQUIRED_OPTIONS), R.any(R.isNil)))
]);

if (R.complement(validateConfig)(config)) {
  console.error(`Invalid option\nSupplied options: ${JSON.stringify(config, null, 2)}`);
  console.log(cli.help);
  process.exit(1);
}

console.log(`Using options: ${JSON.stringify(config, null, 2)}`);

rabbitMqClient.connect(config.host, config.queue);

const execAll = (cmds, vorpal) => {
  return R.ifElse(R.complement(R.isEmpty), (cmds) => vorpal.exec(R.head(cmds)).then(() => execAll(R.tail(cmds), vorpal)), R.always(Promise.resolve()))(cmds);
};

state.vorpal.find('exit')
  .action((args, cb) => state.rabbitMqClient
      .disconnect()
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
  );

execAll(config.action, state.vorpal)
  .then(() => state.vorpal
    .delimiter('rabbit')
    .show()
  );
