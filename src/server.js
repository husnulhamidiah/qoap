import consign from 'consign'
import config from 'config'
import redis from 'redis'
import ascoltatori from 'ascoltatori'
import mqtt from 'mqtt'
import coap from 'coap'
import express from 'express'
import bodyParser from 'body-parser'
import http from 'http'
import socketio from 'socket.io'

let app = express()
let server = http.Server(app)

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.io = socketio(server)
app.redis = {}

export const setupAscoltatore = (opts = {}) => {
  app.ascoltatore = new ascoltatori.RedisAscoltatore({
    redis: redis,
    port: opts.port,
    host: opts.host,
    db: opts.db
  })
  return app.ascoltatore
}

export const setup = (opts = {}) => {
  let args = [opts.port, opts.host]
  app.redis.client = redis.createClient.apply(redis, args)
  app.redis.client.select(opts.db)
  return setupAscoltatore(opts)
}

export const configure = () => {
  return consign({cwd: 'src', verbose: false})
    .include('models')
    .include('helpers')
    .include('controllers')
    .into(app)
}

export const start = (opts = {}, callback = {}) => {
  configure()
  // console.log(app.models.Data.prototype)
  let logger = app.helpers.winston

  opts.httpPort || (opts.httpPort = config.get('port.http'))
  opts.coapPort || (opts.coapPort = config.get('port.coap'))
  opts.mqttPort || (opts.mqttPort = config.get('port.mqtt'))
  opts.redisHost || (opts.redisHost = config.get('redis.host'))  
  opts.redisPort || (opts.redisPort = config.get('redis.port'))
  opts.redisDB || (opts.redisDB = config.get('redis.db'))

  setup({
    port: opts.redisPort,
    host: opts.redisHost,
    db: opts.redisDB
  })

  let countDone = 0
  let done = function () {
    if (countDone++ === 3) {
      return callback()
    }
  }

  server.listen(opts.httpPort, () => {
    logger.socket('Websocket listening on port %d in %s mode', opts.httpPort, process.env.NODE_ENV, {protocol: 'websocket'})
    logger.http('HTTP server listening on port %d in %s mode', opts.httpPort, process.env.NODE_ENV)
    done()
  })

  let coapServer = coap.createServer()
  coapServer.on('request', app.controllers.coap_api).listen(opts.coapPort, () => {
    logger.coap('CoAP server listening on port %d in %s mode', opts.coapPort, process.env.NODE_ENV)
    done()
  })

  new mqtt.Server(app.controllers.mqtt_api).listen(opts.mqttPort, () => {
    logger.mqtt('MQTT server listening on port %d in %s mode', opts.mqttPort, process.env.NODE_ENV)
    done()
  })
  return app
}

if (require.main.filename === __filename) {
  start()
}

start()

export default app
