const prettyJSON = require('../utils/prettyJSON'),
      Promise = require('bluebird'),
      fs = Promise.promisifyAll(require('fs')),
      child_process = require('child_process'),
      R = require('ramda');

module.exports = ({ rabbitMqClient, vorpal }) => {
  vorpal
    .command('next')
    .description('Fetch next message in queue')
    .action((args, cb) => {
      return rabbitMqClient
        .nextMessage()
        .then(msg => {
          if (msg) {
            console.log(msg.fields);
          } else {
            console.log('Queue empty');
          }
        });
   });

  vorpal
    .command('print [id]')
    .description('Print current message')
    .action((args, cb) => {
      return rabbitMqClient
        .getMessage(args.id)
        .then(R.pipe(prettyJSON, console.log));
    });

  vorpal
    .command('props [id]')
    .option('-n, --name <name>', 'Print only specified property')
    .description('Print message properties')
    .action((args, cb) => {
      return rabbitMqClient
        .getMessage(args.id)
        .then(R.pipe(args.options.name ? R.path([ 'properties', args.options.name ]) : R.prop('properties'), prettyJSON, console.log));
    });

  vorpal
    .command('headers [id]')
    .description('Print message headers')
    .action((args, cb) => {
      return rabbitMqClient
        .getMessage(args.id)
        .then(R.pipe(R.path([ 'properties', 'headers' ]), prettyJSON, console.log));
    });

  vorpal
    .command('list')
    .description('List all messages')
    .action((args, cb) => {
      return rabbitMqClient
        .getMessages()
        .then(R.pipe(R.map(R.pipe(R.pick([ 'id', 'queue' ]), prettyJSON)), R.values, R.join('\n'), console.log));
    });

  vorpal
    .command('skip')
    .option('-c, --count <count>', 'Number of messages to skip')
    .description('Skip messages')
    .action((args, cb) => {
      return rabbitMqClient
        .skipMessages(args.options.count || 1)
        .then(() => rabbitMqClient.nextMessage())
        .then(msg => {
          if (msg) {
            console.log(msg.fields);
          } else {
            console.log('Queue empty');
          }
        });
    });

  vorpal
    .command('enqueue <queue> [id]')
    .description('Enqueue a message on specified queue')
    .action((args, cb) => {
      return rabbitMqClient
        .getMessage(args.id)
        .then(msg => rabbitMqClient.enqueueMessage(msg, args.queue));
    });

  vorpal
    .command('ack [id]')
    .description('Ack message, dequeues it')
    .action((args, cb) => {
      return rabbitMqClient
        .getMessage(args.id)
        .then(msg => rabbitMqClient.ack(msg));
    });

  vorpal
    .command('retry [id]')
    .option('-n, --next <count>', 'Get next message(s) from queue and retry it(them)')
    .description('Retry current message')
    .action((args, cb) => {
      const retry = (msg) => {
        if (!msg) {
          console.log("No messages in queue");
          return Promise.reject();
        }

        if (R.complement(R.pathSatisfies(R.has('x-death'), [ 'properties', 'headers' ]))(msg)) {
          console.log('Not dead letter');
          return Promise.reject();
        }

        return rabbitMqClient
          .enqueueMessage(
            msg,
            R.path([ 'properties', 'headers', 'x-death', 0, 'queue' ])(msg)
          )
          .then(() => rabbitMqClient.ack(msg))
          .then(() => vorpal.log(`Retried ${msg.fields.deliveryTag}`));
      };

      if (args.options.next > 0) {
        return R.reduce(
          (promise) => promise.then(() => rabbitMqClient.nextMessage().then(retry)),
          Promise.resolve(),
          R.repeat(0, args.options.next)
        );
      } else {
        return rabbitMqClient.getMessage(args.id).then(retry);
      }
    });

  vorpal
    .command('edit [id]')
    .option('-e, --editor <editor>', 'Your master editor')
    .description('Edit current message')
    .action((args, cb) => {
      let editor = R.pathOr(process.env.EDITOR || 'vi', [ 'options', 'editor' ], args);

      return rabbitMqClient
        .getMessage(args.id)
        .then(msg => {
          let messageId = msg.properties.messageId || 'nomessageid';
          let fileName = `funny-bunny-tempedit-${messageId}.json`;

          return fs.writeFileAsync(fileName, prettyJSON(msg))
            .then(() => {
              return new Promise((resolve, reject) => {
                let proc = child_process.spawn(editor, [ fileName ], { stdio: 'inherit' });
                proc.on('exit', (code, signal) => code === 0 ? resolve() : reject(code));
                proc.on('error', reject);
              });
            })
            .then(() => fs.readFileAsync(fileName))
            .then(buf => {
              rabbitMqClient.addMessage(JSON.parse(buf.toString()));
              return fs.unlinkAsync(fileName);
            });
        })
    });

  vorpal
    .command('load <path>')
    .description('Load a JSON file as a message')
    .action((args, cb) => {
      return fs.readFileAsync(args.path)
        .then(buf => {
          rabbitMqClient.addMessage(JSON.parse(buf.toString()));
        });
    });
  return { rabbitMqClient, vorpal };
};
