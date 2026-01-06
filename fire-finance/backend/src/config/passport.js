const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt')
const { Strategy: LocalStrategy } = require('passport-local')
const bcrypt = require('bcryptjs')
const { getDatabase } = require('./database')
const logger = require('./logger')

const initializePassport = (passport) => {
  // JWT Strategy
  const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET,
    algorithms: ['HS256'],
  }

  passport.use(
    new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
      try {
        const db = getDatabase()
        const user = await db('users').where({ id: jwtPayload.id, is_active: true }).first()

        if (user) {
          // Check if account is locked
          if (user.locked_until && new Date() < new Date(user.locked_until)) {
            return done(null, false, { message: 'Account is temporarily locked' })
          }

          // Reset login attempts on successful auth
          if (user.login_attempts > 0) {
            await db('users').where({ id: user.id }).update({
              login_attempts: 0,
              locked_until: null,
            })
          }

          return done(null, user)
        }

        return done(null, false)
      } catch (error) {
        logger.error('JWT Strategy error:', error)
        return done(error, false)
      }
    })
  )

  // Local Strategy for username/password
  const localOptions = {
    usernameField: 'email',
    passwordField: 'password',
  }

  passport.use(
    new LocalStrategy(localOptions, async (email, password, done) => {
      try {
        const db = getDatabase()
        const user = await db('users').where({ email: email.toLowerCase(), is_active: true }).first()

        if (!user) {
          return done(null, false, { message: 'Invalid email or password' })
        }

        // Check if account is locked
        if (user.locked_until && new Date() < new Date(user.locked_until)) {
          return done(null, false, { message: 'Account is temporarily locked due to too many failed attempts' })
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash)

        if (!isValidPassword) {
          // Increment login attempts
          const loginAttempts = (user.login_attempts || 0) + 1
          const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5
          const lockoutDuration = parseInt(process.env.ACCOUNT_LOCKOUT_DURATION_MINUTES) || 30

          let lockedUntil = null
          if (loginAttempts >= maxAttempts) {
            lockedUntil = new Date(Date.now() + lockoutDuration * 60 * 1000)
          }

          await db('users').where({ id: user.id }).update({
            login_attempts: loginAttempts,
            locked_until: lockedUntil,
          })

          if (lockedUntil) {
            return done(null, false, { message: 'Account has been temporarily locked due to too many failed login attempts' })
          }

          return done(null, false, { message: 'Invalid email or password' })
        }

        // Reset login attempts on successful login
        await db('users').where({ id: user.id }).update({
          login_attempts: 0,
          locked_until: null,
          last_login: new Date(),
        })

        return done(null, user)
      } catch (error) {
        logger.error('Local Strategy error:', error)
        return done(error, false)
      }
    })
  )

  // Serialize user for session (not used in JWT but good to have)
  passport.serializeUser((user, done) => {
    done(null, user.id)
  })

  // Deserialize user from session
  passport.deserializeUser(async (id, done) => {
    try {
      const db = getDatabase()
      const user = await db('users').where({ id, is_active: true }).first()
      done(null, user || false)
    } catch (error) {
      logger.error('Deserialize user error:', error)
      done(error, false)
    }
  })
}

module.exports = {
  initializePassport,
}