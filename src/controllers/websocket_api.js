(function () {
  module.exports = (app) => {
    const Data = app.models.Data
    const logger = app.helpers.winston

    return app.io.on('connection', (socket) => {
      logger.socket(' Client %s has connected ', socket.id)

      let subscriptions
      subscriptions = {}
      socket.on('subscribe', (topic) => {
        logger.socket('Client %s subscribe to %s ', socket.id, topic)
        let subscription
        subscription = (currentData) => {
          let stringValue = null
          if (currentData.value.type === 'Buffer' || currentData.value instanceof Buffer) {
            stringValue = new Buffer(currentData.value).toString()
          } else {
            stringValue = currentData.value
          }
          return socket.emit('/r/' + topic, stringValue)
        }

        subscriptions[topic] = subscription
        Data.subscribe(topic, subscription)
        return Data.find(topic, (err, data) => {
          if (err) logger.error(err)
          if ((data != null ? data.value : void 0) != null) {
            return subscription(data)
          }
        })
      })

      return socket.on('disconnect', () => {
        logger.socket(' Client has disconnected ')
        let listener, results, topic
        results = []
        for (topic in subscriptions) {
          listener = subscriptions[topic]
          results.push(Data.unsubscribe(topic, listener))
        }
        return results
      })
    })
  }
}).call(this)
