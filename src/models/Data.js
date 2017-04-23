const EventEmitter = require('events')
const globalEventEmitter = new EventEmitter()
globalEventEmitter.setMaxListeners(0)

const KEYS_SET_NAME = 'topics'

module.exports = function (app) {
  let buildKey = (key) => 'topic:' + key

  class Data {
    constructor (_key, _value = null) {
      this.key = _key
      this.value = _value
    }

    save (callback) {
      app.redis.client.set(this.redisKey, this.jsonValue, (err) => {
        return app.ascoltatore.publish(this.key, this.value, () => {
          if (callback != null) {
            return callback(err, this)
          }
        })
      })
      return app.redis.client.sadd(KEYS_SET_NAME, this.key)
    }
  }

  Object.defineProperty(Data.prototype, 'key', {
    enumerable: true,
    configurable: false,
    get: function () {
      return this._key
    },
    set: function (key) {
      this.redisKey = buildKey(key)
      this._key = key
      return this._key
    }
  })

  Object.defineProperty(Data.prototype, 'jsonValue', {
    configurable: false,
    enumerable: true,
    get: function () {
      return JSON.stringify(this.value)
    },
    set: function (value) {
      this.value = JSON.parse(value)
      return this.value
    }
  })

  Data.find = (pattern, callback) => {
    let foundRecord = (key) => {
      return app.redis.client.get(buildKey(key), (err, value) => {
        if (err) {
          if (callback != null) callback(err)
          return
        }
        if (value == null) {
          if (callback != null) callback(new Error('Record not found!'), null)
          return
        }
        if (callback != null) {
          return callback(null, Data.fromRedis(key, value))
        }
      })
    }

    if (pattern.constructor !== RegExp) {
      foundRecord(pattern)
    } else {
      app.redis.client.smembers(KEYS_SET_NAME, (err, topics) => {
        if (err) callback(new Error('Record not found!'), null)
        let results = []
        for (let i = 0; i < topics.length; i++) {
          let topic = topics[i]
          if (pattern.test(topic)) {
            results.push(foundRecord(topic))
          } else {
            results.push(void 0)
          }
        }
        return results
      })
    }
    return Data
  }

  Data.findOrCreate = (...args) => {
    let key = args.shift()
    let value = null
    let arg = args.shift()
    let callback = null
    if (typeof arg === 'function') {
      callback = arg
    } else {
      value = arg
      callback = args.shift()
    }
    app.redis.client.get(buildKey(key), (err, oldValue) => {
      if (err) callback(new Error('Record not found!'), null)
      let data = Data.fromRedis(key, oldValue)
      if (value != null) data.value = value
      return data.save(callback)
    })
    return Data
  }

  Data.fromRedis = (topic, value) => {
    let data = new Data(topic)
    data.jsonValue = value
    return data
  }

  Data.subscribe = (topic, callback) => {
    callback._subscriber = (actualTopic, value) => callback(new Data(actualTopic, value))
    app.ascoltatore.subscribe(topic, callback._subscriber)
    return this
  }

  Data.unsubscribe = (topic, callback) => {
    app.ascoltatore.unsubscribe(topic, callback._subscriber)
    return this
  }

  return Data
}
