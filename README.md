# funny-bunny
Interactive RabbitMQ queue inspector.

## Getting started
Run `node index.js --help`.

## Commands

All commands that has an optional `id` parameter will default to the last message in the cache.

### next
`next`

Fetch next message from queue and stores it in cache.
### print
`print [id]`

Print the specified message from cache, defaults to the last message.
### list
`list`

List all cached messages.
### skip
`skip [-c | --count <count> ]`

Fetch the next `count` messages but skip cache. The message will be unavailable until program restart.
### enqueue
`enqueue <queue> [id]`

Enqueue the specified message to the specified queue.
### ack
`ack [id]`

Acknowledge the specified message, removes it from its queue.
### retry
`retry [id]`

If the specified message is a dead letter, enqueue it to its last failed queue and acknowledge it.
