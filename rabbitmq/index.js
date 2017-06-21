const amqp = require('amqplib'),
      messageCoding = require('./message-coding'),
      messageSerializing = require('./message-serializing'),
      R = require('ramda');

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
      .then((conn) => conn.createChannel()
        .then(chan => {
          chan.on('close', () => {
            conn.close();
          });
          return chan.checkQueue(this.queue).then(() => chan);
        })
      );
    return this;
  }

  disconnect() {
    return new Promise((resolve, reject) => {
      this.connection
      .then(chan => {
        chan.connection.once('close', resolve);
        chan.connection.once('error', reject);
        chan.close()
      });
    });
  }

  skipMessages(count) {
    return this.connection
      .then(chan => skipMessages(chan, count));
  }

  nextMessage() {
    this.message = this.connection
      .then(chan => chan.get(this.queue))
      .then(R.when(R.complement(R.isNil), R.pipe(messageCoding.decode, messageSerializing.deserialize)));

    return this.message;
  }

  enqueueMessage(msg, queue) {
    return this.connection
      .then(chan => enqueuePromised(chan, queue, R.pipe(messageSerializing.serialize, messageCoding.encode)(msg.content), msg.properties));
  }

  getMessage() {
    return this.message;
  }

  setMessage(msg) {
    this.message = Promise.resolve(msg);
  }

  ack(msg) {
    return this.connection
      .then(chan => chan.ack(msg));
  }
}

module.exports = RabbitMqClient;
