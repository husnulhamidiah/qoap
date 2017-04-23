module.exports = (app) => {
  const logger = app.helpers.winston
  const Data = app.models.Data

  app.get(/^\/r\/(.+)$/, (req, res) => {
    let topic = req.params[0]

    logger.http(' Incoming %s request from %s for topic %s ', req.method, req.ip, topic)
    return Data.find(topic, (err, data) => {
      let type = req.accepts(['txt', 'json'])

      if (err != null || data == null) {
        return res.status(404).send({
          status: 404,
          message: 'Unable to find data on database'
        })
      } else if (type === 'json') {
        res.contentType('json')
        try {
          let stringValue = (data.value.type === 'Buffer')
            ? Buffer.from(data.value).toString() : data.value.toString()
          return res.send(stringValue)
        } catch (error) {
          return res.status(204).send({
            status: 204,
            message: 'Valid request but server send empty response'
          })
        }
      } else if (type === 'txt') {
        return res.send(data.value)
      } else {
        return res.status(406).send({
          status: 406,
          message: 'Content not accpetable'
        })
      }
    })
  })

  return app.post(/^\/r\/(.+)$/, (req, res) => {
    let topic = req.params[0]
    let payload = (req.is('json')) ? req.body : req.body.payload

    Data.findOrCreate(topic, payload)
    logger.http(' Incoming %s request from %s for topic %s ', req.method, req.ip, topic)
    return res.status(204).send({
      status: 204,
      message: 'Valid request but server send empty response'
    })
  })
}
