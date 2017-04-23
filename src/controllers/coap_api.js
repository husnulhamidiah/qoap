module.exports = (app) => {
  const Data = app.models.Data
  const logger = app.helpers.winston

  return (req, res) => {
    const sendResponse = (code, payload) => {
      res.code = code
      res.end(JSON.stringify(payload))
    }

    let handlerGet = () => {
      if (/^\/r\/(.+)$/.exec(req.url) === null) {
        return sendResponse('4.04', {
          status: 404,
          message: 'Requested URL not found'
        })
      }

      let topic = /^\/r\/(.+)$/.exec(req.url)[1]

      logger.coap('Incoming %s request from %s for topic %s ', req.method, req.rsinfo.address, topic)

      let handlerObserver = function (payload) {
        let listener = function (data) {
          try {
            let stringValue = (data.value && data.value.type === 'Buffer')
              ? Buffer.from(data.value).toString() : data.value.toString()
            res.write(JSON.stringify({topic: topic, payload: stringValue}))
          } catch (err) {
            logger.error('Ooops, something happen : %s', err.toLowerCase())
          }
        }

        res.write(JSON.stringify(payload))
        Data.subscribe(topic, listener)

        res.on('finish', (err) => {
          if (err) logger.error(err)
          res.reset()
        })
      }

      Data.find(topic, (err, data) => {
        if (err != null || data == null) {
          sendResponse('4.04', {
            status: 404,
            message: 'Data not found'
          })
        } else {
          let stringValue = (data.value && data.value.type === 'Buffer')
            ? Buffer.from(data.value).toString() : data.value
          if (req.headers['Observe'] !== 0) {
            // if payload is too long, request there will be two requests
            sendResponse('2.05', {
              status: 205,
              data: {
                topic: topic,
                payload: stringValue
              },
              message: 'Success to retrieve data'
            })
          } else {
            // check this one. it's lil bit messy
            handlerObserver({topic: topic, payload: stringValue})
          }
        }
      })
    }

    const handlerPost = () => {
      if (/^\/r\/(.+)$/.exec(req.url) === null) {
        return sendResponse('4.05', {
          status: 405,
          message: 'No sufficient permission'
        })
      }

      const topic = /^\/r\/(.+)$/.exec(req.url)[1]
      Data.findOrCreate(topic, req.payload)
      sendResponse('2.01', {
        status: 201,
        message: 'Data sent successfully'
      })
      logger.coap('Incoming %s request from %s for topic %s ', req.method, req.rsinfo.address, topic)
    }

    const handlerOther = () => {
      logger.coap('Incoming %s request from %s for undefined topic', req.method, req.rsinfo.address)
      sendResponse('4.05', {
        status: 405,
        message: 'Method not allowed'
      })
    }

    switch (req.method) {
      case 'GET' :
        handlerGet()
        break
      case 'PUT' :
      case 'POST' :
        handlerPost()
        break
      default :
        handlerOther()
        break
    }
  }
}
