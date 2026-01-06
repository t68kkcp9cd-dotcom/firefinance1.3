const { getDatabase } = require('../config/database')
const logger = require('../config/logger')

/**
 * Middleware to enforce the 5-user limit per household
 * Checks active user count before allowing new registrations/invites
 */

const checkUserCap = async (req, res, next) => {
  try {
    const db = getDatabase()
    const householdId = req.body.householdId || req.params.householdId || req.user?.householdId
    
    if (!householdId) {
      return res.status(400).json({ error: 'Household ID is required' })
    }

    // Get active user count for the household
    const activeUsers = await db('household_members')
      .where({ 
        household_id: householdId, 
        is_active: true 
      })
      .count('* as count')
      .first()

    const currentUserCount = parseInt(activeUsers.count)
    const maxUsers = parseInt(process.env.MAX_USERS) || 5

    if (currentUserCount >= maxUsers) {
      logger.warn(`User cap exceeded for household ${householdId}: ${currentUserCount}/${maxUsers}`)
      return res.status(403).json({ 
        error: 'User limit reached', 
        message: `Maximum ${maxUsers} users allowed per household. Please contact an admin to remove inactive users.`,
        currentUsers: currentUserCount,
        maxUsers: maxUsers
      })
    }

    // Store user count for potential use in next middleware
    req.userCount = currentUserCount
    req.maxUsers = maxUsers
    
    next()
  } catch (error) {
    logger.error('Error checking user cap:', error)
    return res.status(500).json({ error: 'Failed to check user limit' })
  }
}

/**
 * Check if user can be added to household (for invitations)
 */
const canAddUserToHousehold = async (householdId) => {
  try {
    const db = getDatabase()
    const activeUsers = await db('household_members')
      .where({ 
        household_id: householdId, 
        is_active: true 
      })
      .count('* as count')
      .first()

    const currentUserCount = parseInt(activeUsers.count)
    const maxUsers = parseInt(process.env.MAX_USERS) || 5

    return {
      canAdd: currentUserCount < maxUsers,
      currentUsers: currentUserCount,
      maxUsers: maxUsers,
      remainingSlots: maxUsers - currentUserCount
    }
  } catch (error) {
    logger.error('Error checking household capacity:', error)
    throw error
  }
}

/**
 * Get detailed user statistics for a household
 */
const getHouseholdUserStats = async (householdId) => {
  try {
    const db = getDatabase()
    
    const stats = await db('household_members')
      .leftJoin('users', 'household_members.user_id', 'users.id')
      .where({ 'household_members.household_id': householdId })
      .select(
        'users.id',
        'users.email',
        'users.username',
        'users.first_name',
        'users.last_name',
        'users.last_login',
        'household_members.role',
        'household_members.permissions',
        'household_members.joined_at',
        'household_members.is_active'
      )
      .orderBy('household_members.joined_at', 'asc')

    const activeUsers = stats.filter(user => user.is_active)
    const inactiveUsers = stats.filter(user => !user.is_active)
    const maxUsers = parseInt(process.env.MAX_USERS) || 5

    return {
      totalUsers: stats.length,
      activeUsers: activeUsers.length,
      inactiveUsers: inactiveUsers.length,
      maxUsers: maxUsers,
      remainingSlots: maxUsers - activeUsers.length,
      utilization: (activeUsers.length / maxUsers) * 100,
      users: {
        active: activeUsers,
        inactive: inactiveUsers
      },
      warnings: {
        nearLimit: activeUsers.length >= maxUsers - 1,
        atLimit: activeUsers.length >= maxUsers,
        overLimit: activeUsers.length > maxUsers
      }
    }
  } catch (error) {
    logger.error('Error getting household user stats:', error)
    throw error
  }
}

/**
 * Alert admins when approaching user limit
 */
const sendUserLimitAlerts = async (householdId, currentCount, maxCount) => {
  try {
    const db = getDatabase()
    const utilization = (currentCount / maxCount) * 100
    
    if (utilization >= 80) { // Alert at 80% capacity
      const admins = await db('household_members')
        .join('users', 'household_members.user_id', 'users.id')
        .where({
          'household_members.household_id': householdId,
          'household_members.role': 'admin',
          'household_members.is_active': true,
          'users.email_verified': true
        })
        .select('users.email', 'users.first_name', 'users.last_name')

      for (const admin of admins) {
        // Send email notification
        const { sendEmail } = require('../services/emailService')
        await sendEmail({
          to: admin.email,
          subject: 'Fire Finance - User Limit Alert',
          template: 'user-limit-warning',
          data: {
            firstName: admin.first_name,
            currentUsers: currentCount,
            maxUsers: maxCount,
            utilization: Math.round(utilization),
            householdId: householdId
          }
        })
      }
    }
  } catch (error) {
    logger.error('Error sending user limit alerts:', error)
  }
}

module.exports = {
  checkUserCap,
  canAddUserToHousehold,
  getHouseholdUserStats,
  sendUserLimitAlerts
}