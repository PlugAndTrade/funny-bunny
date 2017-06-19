const amqp = require('amqplib'),
      parseMessage = require('../utils/parse-message'),
      R = require('ramda');

const skipMessages = (chan, count) => {
  if (count <= 0) {
    return Promise.resolve(true);
  }

  return chan.get()
    .then(R.ifElse(R.identity, () => skipMessages(chan, --count), Promise.resolve));
};

class RabbitMqClient {
  constructor() { }

  connect(host, queue) {
    this.host = host;
    this.queue = queue;

    this.connection = amqp.connect(this.host)
      .then(conn => {
        conn.on('close', () => console.log('connection closed'));
        return conn;
      })
      .then((conn) => conn.createChannel()
        .then(chan => {
          chan.on('close', () => {
            console.log('channel closed');
            conn.close();
          });
          return chan.checkQueue(this.queue).then(() => chan);
        })
      );
    return this;
  }

  disconnect() {
    return this.connection
      .then(chan => chan.close());
  }

  skipMessages(count) {
    return this.connection
      .then(chan => skipMessages(chan, count));
  }

  nextMessage() {
    this.message = this.connection
      .then(chan => chan.get(this.queue))
      .then(R.when(R.complement(R.isNil), parseMessage));

    return this.message;
  }

  getMessage() {
    return this.message;
  }
}

module.exports = RabbitMqClient;
