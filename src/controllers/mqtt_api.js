module.exports = (app) => {
  const Data = app.models.Data
  const logger = app.helpers.winston

  return function (client) {
    let self = this
    if (!self.clients) self.clients = {}

    client.on('connect', (packet) => {
      self.clients[packet.clientId] = client
      client.id = packet.clientId
      client.subscriptions = []
      client.connack({returnCode: 0})
      logger.mqtt('Client %s has connected', client.id)
    })

    client.on('subscribe', (packet) => {
      let granted = []
      let result = []
      for (let i = 0; i < packet.subscriptions.length; i++) {
        let qos = packet.subscriptions[i].qos
        let topic = packet.subscriptions[i].topic
        let reg = new RegExp(topic.replace('+', '[^\/]+').replace('#', '.+') + '$')

        granted.push(qos)
        client.subscriptions.push(reg)
        client.suback({messageId: packet.messageId, granted: granted})

        for (let i = 0, len = client.subscriptions.length; i < len; i++) {
          result.push((function () {
            let listener
            listener = (data) => {
              try {
                let stringValue = (data.value && data.value.type === 'Buffer')
                  ? Buffer.from(data.value).toString() : data.value.toString()
                return client.publish({topic: data.key, payload: stringValue})
              } catch (err) {
                logger.error('Ooops, something happen : %s', err)
                return client.close()
              }
            }

            Data.subscribe(topic, listener)
            return Data.find(client.subscriptions[i], (err, data) => {
              if (err != null) {
                logger.error('Ooops, something happen : %s', err)
              } else {
                return listener(data)
              }
            })
          }()))
        }

        logger.mqtt('Client %s subscribe to topic %s', client.id, topic)
      }
      return result
    })

    client.on('publish', (packet) => {
      logger.mqtt('Client %s publish a message to topic %s', client.id, packet.topic)
      switch (packet.qos) {
        case 1:
          client.puback({messageId: packet.messageId})
          break
        case 2:
          client.pubrec({messageId: packet.messageId})
          break
      }
      return Data.findOrCreate(packet.topic, packet.payload)
    })

    client.on('pubrel', (packet) => {
      client.pubcomp({messageId: packet.messageId})
    })

    client.on('pingreq', (packet) => {
      logger.mqtt(' Ping from %s', client.id)
      client.pingresp()
    })

    client.on('disconnect', () => {
      logger.mqtt('Client %s has disconnected', client.id)
      client.stream.end()
    })

    client.on('error', (error) => {
      logger.error('Client %s got a problem : %s', client.id, error)
      client.stream.end()
    })

    client.on('close', (err) => {
      if (err) logger.error(err)
      logger.mqtt('Client %s has closed connection', client.id)
      delete self.clients[client.id]
    })

    return client.on('unsubscribe', (packet) => {
      logger.mqtt('Client %s has unsubscribed', client.id)
      return client.unsuback({messageId: packet.messageId})
    })
  }
}
