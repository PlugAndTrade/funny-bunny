const prettyJSON = require('../utils/prettyJSON'),
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
    .command('print')
    .description('Print current message')
    .action((args, cb) => {
      return rabbitMqClient
        .getMessage()
        .then(R.pipe(prettyJSON, console.log));
    });

  vorpal
    .command('skip [count]')
    .description('Skip the next [count] messages')
    .action((args, cb) => {
      return rabbitMqClient
        .skipMessages(args.count || 1)
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
    .command('retry')
    .description('Retry current message')
    .action((args, cb) => {
      return rabbitMqClient
        .getMessage()
        .then(msg => {
          if (R.complement(R.pathSatisfies(R.has('x-death'), [ 'properties', 'headers' ]))(msg)) {
            console.log('Not dead letter');
            return Promise.resolve();
          }

          return rabbitMqClient
            .enqueueMessage(
              msg,
              R.path([ 'properties', 'headers', 'x-death', 0, 'queue' ])(msg)
            )
            .then(() => rabbitMqClient.ack(msg));
        });
    });

  return { rabbitMqClient, vorpal };
};
