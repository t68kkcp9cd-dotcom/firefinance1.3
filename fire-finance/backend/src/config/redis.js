const redis = require('redis')
const logger = require('./logger')

let redisClient = null
let redisSubscriber = null
let redisPublisher = null

const initializeRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    
    // Create Redis client for caching and operations
    redisClient = redis.createClient({
      url: redisUrl,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          return new Error('Redis server connection refused')
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Redis retry time exhausted')
        }
        if (options.attempt > 10) {
          return undefined
        }
        return Math.min(options.attempt * 100, 3000)
      },
    })

    // Create separate subscriber client
    redisSubscriber = redisClient.duplicate()
    redisPublisher = redisClient.duplicate()

    // Handle connection events
    redisClient.on('connect', () => {
      logger.info('Redis client connected')
    })

    redisClient.on('error', (error) => {
      logger.error('Redis client error:', error)
    })

    redisClient.on('ready', () => {
      logger.info('Redis client ready')
    })

    redisClient.on('end', () => {
      logger.info('Redis client disconnected')
    })

    // Connect all clients
    await Promise.all([
      redisClient.connect(),
      redisSubscriber.connect(),
      redisPublisher.connect(),
    ])

    logger.info('Redis initialized successfully')
    return { redisClient, redisSubscriber, redisPublisher }
  } catch (error) {
    logger.error('Failed to initialize Redis:', error)
    throw error
  }
}

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.')
  }
  return redisClient
}

const getRedisSubscriber = () => {
  if (!redisSubscriber) {
    throw new Error('Redis subscriber not initialized. Call initializeRedis() first.')
  }
  return redisSubscriber
}

const getRedisPublisher = () => {
  if (!redisPublisher) {
    throw new Error('Redis publisher not initialized. Call initializeRedis() first.')
  }
  return redisPublisher
}

// Cache operations
const cacheOperations = {
  // Set cache with TTL
  set: async (key, value, ttl = 3600) => {
    try {
      const client = getRedisClient()
      const serializedValue = JSON.stringify(value)
      await client.setEx(key, ttl, serializedValue)
    } catch (error) {
      logger.error('Cache set error:', error)
      throw error
    }
  },

  // Get from cache
  get: async (key) => {
    try {
      const client = getRedisClient()
      const value = await client.get(key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      logger.error('Cache get error:', error)
      throw error
    }
  },

  // Delete from cache
  del: async (key) => {
    try {
      const client = getRedisClient()
      await client.del(key)
    } catch (error) {
      logger.error('Cache delete error:', error)
      throw error
    }
  },

  // Check if key exists
  exists: async (key) => {
    try {
      const client = getRedisClient()
      const result = await client.exists(key)
      return result === 1
    } catch (error) {
      logger.error('Cache exists error:', error)
      throw error
    }
  },

  // Increment counter
  incr: async (key) => {
    try {
      const client = getRedisClient()
      return await client.incr(key)
    } catch (error) {
      logger.error('Cache increment error:', error)
      throw error
    }
  },

  // Decrement counter
  decr: async (key) => {
    try {
      const client = getRedisClient()
      return await client.decr(key)
    } catch (error) {
      logger.error('Cache decrement error:', error)
      throw error
    }
  },
}

// Pub/Sub operations
const pubSubOperations = {
  // Subscribe to channel
  subscribe: async (channel, callback) => {
    try {
      const subscriber = getRedisSubscriber()
      await subscriber.subscribe(channel, (message) => {
        try {
          const parsedMessage = JSON.parse(message)
          callback(parsedMessage)
        } catch (error) {
          logger.error('Pub/Sub message parse error:', error)
        }
      })
    } catch (error) {
      logger.error('Pub/Sub subscribe error:', error)
      throw error
    }
  },

  // Unsubscribe from channel
  unsubscribe: async (channel) => {
    try {
      const subscriber = getRedisSubscriber()
      await subscriber.unsubscribe(channel)
    } catch (error) {
      logger.error('Pub/Sub unsubscribe error:', error)
      throw error
    }
  },

  // Publish message to channel
  publish: async (channel, message) => {
    try {
      const publisher = getRedisPublisher()
      const serializedMessage = JSON.stringify(message)
      await publisher.publish(channel, serializedMessage)
    } catch (error) {
      logger.error('Pub/Sub publish error:', error)
      throw error
    }
  },
}

// Session operations
const sessionOperations = {
  // Store session data
  storeSession: async (sessionId, data, ttl = 86400) => {
    try {
      const key = `session:${sessionId}`
      await cacheOperations.set(key, data, ttl)
    } catch (error) {
      logger.error('Session store error:', error)
      throw error
    }
  },

  // Get session data
  getSession: async (sessionId) => {
    try {
      const key = `session:${sessionId}`
      return await cacheOperations.get(key)
    } catch (error) {
      logger.error('Session get error:', error)
      throw error
    }
  },

  // Delete session
  deleteSession: async (sessionId) => {
    try {
      const key = `session:${sessionId}`
      await cacheOperations.del(key)
    } catch (error) {
      logger.error('Session delete error:', error)
      throw error
    }
  },
}

// Rate limiting operations
const rateLimitOperations = {
  // Check rate limit
  checkRateLimit: async (key, maxRequests, windowSeconds) => {
    try {
      const client = getRedisClient()
      const windowKey = `rate:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`
      
      const count = await client.incr(windowKey)
      if (count === 1) {
        await client.expire(windowKey, windowSeconds)
      }

      return {
        allowed: count <= maxRequests,
        remaining: Math.max(0, maxRequests - count),
        resetTime: Math.ceil((windowSeconds * 1000 - (Date.now() % (windowSeconds * 1000))) / 1000),
      }
    } catch (error) {
      logger.error('Rate limit check error:', error)
      // Fail open - allow request if rate limiting fails
      return { allowed: true, remaining: 1, resetTime: 60 }
    }
  },
}

// Close Redis connections
const closeRedis = async () => {
  try {
    if (redisClient) await redisClient.quit()
    if (redisSubscriber) await redisSubscriber.quit()
    if (redisPublisher) await redisPublisher.quit()
    logger.info('Redis connections closed')
  } catch (error) {
    logger.error('Error closing Redis connections:', error)
  }
}

module.exports = {
  initializeRedis,
  getRedisClient,
  getRedisSubscriber,
  getRedisPublisher,
  cacheOperations,
  pubSubOperations,
  sessionOperations,
  rateLimitOperations,
  closeRedis,
}