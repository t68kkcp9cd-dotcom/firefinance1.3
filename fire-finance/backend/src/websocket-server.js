const { Server } = require('socket.io')
const redis = require('socket.io-redis')
const jwt = require('jsonwebtoken')
const { getRedisClient, pubSubOperations } = require('./config/redis')
const { getDatabase } = require('./config/database')
const logger = require('./config/logger')
require('dotenv').config()

// WebSocket server configuration
const io = new Server({
  cors: {
    origin: [
      process.env.FRONTEND_WEB_URL || 'http://localhost:3000',
      'capacitor://localhost',
      'ionic://localhost',
      'http://localhost',
      'http://localhost:8080',
      'http://localhost:8100',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Use Redis adapter for horizontal scaling
const redisAdapter = redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
})
io.adapter(redisAdapter)

// Authenticate socket connection
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token
    
    if (!token) {
      return next(new Error('Authentication token required'))
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const db = getDatabase()
    
    // Get user from database
    const user = await db('users')
      .where({ id: decoded.id, is_active: true })
      .first()

    if (!user) {
      return next(new Error('Invalid authentication token'))
    }

    // Check if account is locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      return next(new Error('Account is temporarily locked'))
    }

    // Attach user to socket
    socket.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    }

    // Get user's active households
    const households = await db('household_members')
      .join('households', 'household_members.household_id', 'households.id')
      .where({
        'household_members.user_id': user.id,
        'household_members.is_active': true,
        'households.is_active': true,
      })
      .select(
        'households.id',
        'households.name',
        'household_members.role',
        'household_members.permissions'
      )

    socket.user.households = households
    next()
  } catch (error) {
    logger.error('Socket authentication error:', error)
    next(new Error('Authentication failed'))
  }
})

// Socket connection handling
io.on('connection', (socket) => {
  logger.info(`User ${socket.user.email} connected via WebSocket`)

  // Join user to their personal room
  socket.join(`user:${socket.user.id}`)

  // Join user to their household rooms
  socket.user.households.forEach((household) => {
    socket.join(`household:${household.id}`)
  })

  // Broadcast user presence
  socket.broadcast.emit('user:online', {
    userId: socket.user.id,
    username: socket.user.username,
    timestamp: new Date().toISOString(),
  })

  // Subscribe to Redis pub/sub for cross-server communication
  const userChannel = `user:${socket.user.id}`
  pubSubOperations.subscribe(userChannel, (message) => {
    socket.emit('notification', message)
  })

  // ===== COLLABORATION FEATURES =====

  // Join a specific document/screen for collaboration
  socket.on('collab:join', async (data) => {
    try {
      const { documentType, documentId, householdId } = data
      
      if (!documentType || !documentId) {
        return socket.emit('error', { message: 'Document type and ID required' })
      }

      // Verify household membership if householdId provided
      if (householdId) {
        const hasAccess = socket.user.households.some(h => h.id === householdId)
        if (!hasAccess) {
          return socket.emit('error', { message: 'Access denied to this household' })
        }
      }

      const roomName = `collab:${documentType}:${documentId}`
      socket.join(roomName)

      // Get current collaborators
      const room = io.sockets.adapter.rooms.get(roomName)
      const collaborators = Array.from(room || [])
        .map(socketId => {
          const collaboratorSocket = io.sockets.sockets.get(socketId)
          return collaboratorSocket ? {
            id: collaboratorSocket.user.id,
            username: collaboratorSocket.user.username,
            firstName: collaboratorSocket.user.firstName,
            lastName: collaboratorSocket.user.lastName,
          } : null
        })
        .filter(Boolean)

      // Notify others about new collaborator
      socket.to(roomName).emit('collab:user-joined', {
        user: {
          id: socket.user.id,
          username: socket.user.username,
          firstName: socket.user.firstName,
          lastName: socket.user.lastName,
        },
        timestamp: new Date().toISOString(),
      })

      // Send current collaborators list
      socket.emit('collab:collaborators', {
        documentType,
        documentId,
        collaborators,
      })

      logger.info(`User ${socket.user.email} joined collaboration room: ${roomName}`)
    } catch (error) {
      logger.error('Collaboration join error:', error)
      socket.emit('error', { message: 'Failed to join collaboration' })
    }
  })

  // Leave collaboration room
  socket.on('collab:leave', (data) => {
    try {
      const { documentType, documentId } = data
      const roomName = `collab:${documentType}:${documentId}`
      
      socket.leave(roomName)
      
      // Notify others
      socket.to(roomName).emit('collab:user-left', {
        userId: socket.user.id,
        username: socket.user.username,
        timestamp: new Date().toISOString(),
      })

      logger.info(`User ${socket.user.email} left collaboration room: ${roomName}`)
    } catch (error) {
      logger.error('Collaboration leave error:', error)
    }
  })

  // Handle real-time editing
  socket.on('collab:edit', async (data) => {
    try {
      const { documentType, documentId, operation, data: editData } = data
      const roomName = `collab:${documentType}:${documentId}`

      // Validate operation
      if (!['update', 'delete', 'create'].includes(operation)) {
        return socket.emit('error', { message: 'Invalid operation' })
      }

      // Broadcast edit to other collaborators (excluding sender)
      socket.to(roomName).emit('collab:edit', {
        userId: socket.user.id,
        username: socket.user.username,
        operation,
        data: editData,
        timestamp: new Date().toISOString(),
      })

      // Log activity
      const db = getDatabase()
      await db('activity_logs').insert({
        id: require('uuid').v4(),
        user_id: socket.user.id,
        action: 'collaborative_edit',
        resource_type: documentType,
        resource_id: documentId,
        metadata: JSON.stringify({ operation, data: editData }),
        created_at: new Date(),
      })

    } catch (error) {
      logger.error('Collaboration edit error:', error)
      socket.emit('error', { message: 'Edit operation failed' })
    }
  })

  // Highlight attention to specific item
  socket.on('collab:highlight', (data) => {
    try {
      const { documentType, documentId, itemId, note } = data
      const roomName = `collab:${documentType}:${documentId}`

      // Broadcast highlight to all collaborators in the room
      socket.to(roomName).emit('collab:highlight', {
        userId: socket.user.id,
        username: socket.user.username,
        itemId,
        note,
        timestamp: new Date().toISOString(),
      })

      // Auto-remove highlight after 30 seconds
      setTimeout(() => {
        socket.to(roomName).emit('collab:highlight-remove', {
          userId: socket.user.id,
          itemId,
        })
      }, 30000)

    } catch (error) {
      logger.error('Collaboration highlight error:', error)
    }
  })

  // ===== CHAT FEATURES =====

  // Join chat room
  socket.on('chat:join', (data) => {
    try {
      const { roomType, roomId } = data
      const roomName = `chat:${roomType}:${roomId}`
      
      socket.join(roomName)
      
      // Send recent messages
      sendRecentMessages(socket, roomType, roomId)

      logger.info(`User ${socket.user.email} joined chat room: ${roomName}`)
    } catch (error) {
      logger.error('Chat join error:', error)
    }
  })

  // Send chat message
  socket.on('chat:message', async (data) => {
    try {
      const { roomType, roomId, message, parentMessageId } = data
      const roomName = `chat:${roomType}:${roomId}`

      if (!message || message.trim().length === 0) {
        return socket.emit('error', { message: 'Message cannot be empty' })
      }

      // Save message to database
      const db = getDatabase()
      const [savedMessage] = await db('chat_messages')
        .insert({
          id: require('uuid').v4(),
          room_type: roomType,
          room_id: roomId,
          user_id: socket.user.id,
          message: message.trim(),
          parent_message_id: parentMessageId,
          created_at: new Date(),
        })
        .returning(['id', 'created_at'])

      const messageData = {
        id: savedMessage.id,
        roomType,
        roomId,
        user: {
          id: socket.user.id,
          username: socket.user.username,
          firstName: socket.user.firstName,
          lastName: socket.user.lastName,
        },
        message: message.trim(),
        parentMessageId,
        timestamp: savedMessage.created_at,
      }

      // Broadcast message to all users in the room
      io.to(roomName).emit('chat:message', messageData)

      // Send push notifications to offline users
      sendChatNotifications(roomType, roomId, messageData)

    } catch (error) {
      logger.error('Chat message error:', error)
      socket.emit('error', { message: 'Failed to send message' })
    }
  })

  // Typing indicators
  socket.on('chat:typing', (data) => {
    try {
      const { roomType, roomId, isTyping } = data
      const roomName = `chat:${roomType}:${roomId}`

      socket.to(roomName).emit('chat:user-typing', {
        userId: socket.user.id,
        username: socket.user.username,
        isTyping,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      logger.error('Chat typing error:', error)
    }
  })

  // ===== REAL-TIME DATA UPDATES =====

  // Subscribe to real-time updates
  socket.on('data:subscribe', (data) => {
    try {
      const { subscriptions } = data // Array of { type, id }

      subscriptions.forEach((subscription) => {
        const { type, id } = subscription
        const channel = `updates:${type}:${id}`
        
        socket.join(channel)
        logger.info(`User ${socket.user.email} subscribed to: ${channel}`)
      })
    } catch (error) {
      logger.error('Data subscription error:', error)
    }
  })

  // Unsubscribe from real-time updates
  socket.on('data:unsubscribe', (data) => {
    try {
      const { subscriptions } = data

      subscriptions.forEach((subscription) => {
        const { type, id } = subscription
        const channel = `updates:${type}:${id}`
        
        socket.leave(channel)
        logger.info(`User ${socket.user.email} unsubscribed from: ${channel}`)
      })
    } catch (error) {
      logger.error('Data unsubscribe error:', error)
    }
  })

  // ===== NOTIFICATIONS =====

  // Mark notification as read
  socket.on('notification:mark-read', async (data) => {
    try {
      const { notificationId } = data
      const db = getDatabase()

      await db('notifications')
        .where({ id: notificationId, user_id: socket.user.id })
        .update({ read_at: new Date() })

      socket.emit('notification:updated', {
        notificationId,
        read: true,
        readAt: new Date(),
      })
    } catch (error) {
      logger.error('Mark notification read error:', error)
    }
  })

  // ===== DISCONNECTION =====

  socket.on('disconnect', () => {
    logger.info(`User ${socket.user.email} disconnected from WebSocket`)

    // Broadcast user offline status
    socket.broadcast.emit('user:offline', {
      userId: socket.user.id,
      username: socket.user.username,
      timestamp: new Date().toISOString(),
    })

    // Unsubscribe from Redis pub/sub
    const userChannel = `user:${socket.user.id}`
    pubSubOperations.unsubscribe(userChannel)
  })
})

// Helper function to send recent chat messages
async function sendRecentMessages(socket, roomType, roomId, limit = 50) {
  try {
    const db = getDatabase()
    const messages = await db('chat_messages')
      .join('users', 'chat_messages.user_id', 'users.id')
      .where({
        room_type: roomType,
        room_id: roomId,
      })
      .orderBy('chat_messages.created_at', 'desc')
      .limit(limit)
      .select(
        'chat_messages.id',
        'chat_messages.message',
        'chat_messages.parent_message_id',
        'chat_messages.created_at',
        'users.id as user_id',
        'users.username',
        'users.first_name',
        'users.last_name'
      )

    const formattedMessages = messages.reverse().map(msg => ({
      id: msg.id,
      roomType,
      roomId,
      user: {
        id: msg.user_id,
        username: msg.username,
        firstName: msg.first_name,
        lastName: msg.last_name,
      },
      message: msg.message,
      parentMessageId: msg.parent_message_id,
      timestamp: msg.created_at,
    }))

    socket.emit('chat:history', {
      roomType,
      roomId,
      messages: formattedMessages,
    })
  } catch (error) {
    logger.error('Send recent messages error:', error)
  }
}

// Helper function to send chat notifications
async function sendChatNotifications(roomType, roomId, messageData) {
  try {
    const db = getDatabase()
    
    // Get users in the room who are offline
    const offlineUsers = await db('household_members')
      .where({ household_id: roomId, is_active: true })
      .whereNot('user_id', messageData.user.id)
      .select('user_id')

    for (const user of offlineUsers) {
      // Check if user has push notifications enabled
      const userPrefs = await db('user_preferences')
        .where({ user_id: user.user_id })
        .first()

      if (userPrefs?.push_notifications_enabled) {
        // Send push notification
        const { sendPushNotification } = require('./services/notificationService')
        await sendPushNotification(user.user_id, {
          title: `New message in ${roomType}`,
          body: `${messageData.user.username}: ${messageData.message}`,
          data: {
            type: 'chat_message',
            roomType,
            roomId,
            messageId: messageData.id,
          },
        })
      }
    }
  } catch (error) {
    logger.error('Send chat notifications error:', error)
  }
}

// Start WebSocket server
const startWebSocketServer = () => {
  const PORT = process.env.WEBSOCKET_PORT || 3001
  
  io.listen(PORT)
  logger.info(`WebSocket server listening on port ${PORT}`)
  
  return io
}

// Broadcast real-time updates
const broadcastUpdate = (type, id, data, excludeSocketId = null) => {
  const channel = `updates:${type}:${id}`
  
  if (excludeSocketId) {
    io.to(channel).except(excludeSocketId).emit('data:update', {
      type,
      id,
      data,
      timestamp: new Date().toISOString(),
    })
  } else {
    io.to(channel).emit('data:update', {
      type,
      id,
      data,
      timestamp: new Date().toISOString(),
    })
  }
}

// Send notification to specific user
const sendUserNotification = (userId, notification) => {
  const roomName = `user:${userId}`
  io.to(roomName).emit('notification', notification)
}

module.exports = {
  startWebSocketServer,
  broadcastUpdate,
  sendUserNotification,
}