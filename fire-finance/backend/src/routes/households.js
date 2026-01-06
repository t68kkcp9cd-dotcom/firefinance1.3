const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { getDatabase } = require('../config/database')
const { authenticateJWT, authorize, checkHouseholdMembership } = require('../middleware/auth')
const { checkUserCap, canAddUserToHousehold, sendUserLimitAlerts } = require('../middleware/userCap')
const logger = require('../config/logger')
const { sendEmail } = require('../services/emailService')

const router = express.Router()

/**
 * Invite user to household
 */
router.post('/:householdId/invite', 
  authenticateJWT, 
  authorize(['admin']),
  checkHouseholdMembership('full'),
  checkUserCap,
  async (req, res) => {
    try {
      const { householdId } = req.params
      const { email, role = 'member', permissions = 'read_write' } = req.body
      const invitedBy = req.user.id

      if (!email) {
        return res.status(400).json({ error: 'Email is required' })
      }

      const db = getDatabase()

      // Check if user already exists
      const existingUser = await db('users')
        .where({ email: email.toLowerCase() })
        .first()

      if (existingUser) {
        // Check if user is already a member
        const existingMember = await db('household_members')
          .where({ 
            household_id: householdId, 
            user_id: existingUser.id 
          })
          .first()

        if (existingMember) {
          if (existingMember.is_active) {
            return res.status(400).json({ error: 'User is already a member of this household' })
          } else {
            // Reactivate inactive member
            await db('household_members')
              .where({ id: existingMember.id })
              .update({ 
                is_active: true,
                role,
                permissions,
                updated_at: new Date()
              })

            return res.json({ 
              message: 'User reactivated successfully',
              user: existingUser
            })
          }
        }
      }

      // Create invitation
      const invitationId = uuidv4()
      const invitationToken = jwt.sign(
        { 
          invitationId, 
          householdId, 
          email, 
          role, 
          permissions 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      )

      await db('household_invitations').insert({
        id: invitationId,
        household_id: householdId,
        email: email.toLowerCase(),
        role,
        permissions,
        invited_by: invitedBy,
        token: invitationToken,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        created_at: new Date()
      })

      // Send invitation email
      const household = await db('households')
        .where({ id: householdId })
        .first()

      await sendEmail({
        to: email,
        subject: `Invitation to join ${household.name} on Fire Finance`,
        template: 'household-invitation',
        data: {
          householdName: household.name,
          invitedBy: req.user.first_name,
          invitationToken,
          appUrl: process.env.FRONTEND_WEB_URL,
          role,
          permissions
        }
      })

      logger.info(`Invitation sent to ${email} for household ${householdId}`)

      res.json({ 
        message: 'Invitation sent successfully',
        invitationId,
        remainingSlots: req.maxUsers - (req.userCount + 1)
      })

    } catch (error) {
      logger.error('Invitation error:', error)
      res.status(500).json({ error: 'Failed to send invitation' })
    }
  }
)

/**
 * Accept household invitation
 */
router.post('/invitations/:invitationId/accept', authenticateJWT, async (req, res) => {
  try {
    const { invitationId } = req.params
    const userId = req.user.id

    const db = getDatabase()

    // Get invitation
    const invitation = await db('household_invitations')
      .where({ 
        id: invitationId, 
        status: 'pending',
        expires_at: '>', new Date()
      })
      .first()

    if (!invitation) {
      return res.status(400).json({ error: 'Invalid or expired invitation' })
    }

    // Check if user matches invitation email
    if (req.user.email !== invitation.email) {
      return res.status(403).json({ error: 'Invitation is for a different email address' })
    }

    // Check user cap before accepting
    const capacityCheck = await canAddUserToHousehold(invitation.household_id)
    if (!capacityCheck.canAdd) {
      return res.status(403).json({ 
        error: 'User limit reached',
        message: `Maximum ${capacityCheck.maxUsers} users allowed per household.`
      })
    }

    // Add user to household
    await db('household_members').insert({
      id: uuidv4(),
      household_id: invitation.household_id,
      user_id: userId,
      role: invitation.role,
      permissions: invitation.permissions,
      can_invite: invitation.role === 'admin',
      joined_at: new Date(),
      is_active: true
    })

    // Update invitation status
    await db('household_invitations')
      .where({ id: invitationId })
      .update({
        status: 'accepted',
        accepted_at: new Date()
      })

    // Alert admins if approaching limit
    if (capacityCheck.currentUsers + 1 >= capacityCheck.maxUsers - 1) {
      await sendUserLimitAlerts(invitation.household_id, capacityCheck.currentUsers + 1, capacityCheck.maxUsers)
    }

    logger.info(`User ${userId} accepted invitation to household ${invitation.household_id}`)

    res.json({ 
      message: 'Invitation accepted successfully',
      householdId: invitation.household_id
    })

  } catch (error) {
    logger.error('Accept invitation error:', error)
    res.status(500).json({ error: 'Failed to accept invitation' })
  }
})

/**
 * Get household user statistics
 */
router.get('/:householdId/users/stats',
  authenticateJWT,
  checkHouseholdMembership('read'),
  async (req, res) => {
    try {
      const { householdId } = req.params
      const { getHouseholdUserStats } = require('../middleware/userCap')
      
      const stats = await getHouseholdUserStats(householdId)
      
      res.json(stats)
    } catch (error) {
      logger.error('Get household stats error:', error)
      res.status(500).json({ error: 'Failed to get household statistics' })
    }
  }
)

/**
 * Remove user from household
 */
router.delete('/:householdId/users/:userId',
  authenticateJWT,
  authorize(['admin']),
  checkHouseholdMembership('full'),
  async (req, res) => {
    try {
      const { householdId, userId } = req.params
      const requestingUserId = req.user.id

      // Prevent self-removal
      if (userId === requestingUserId) {
        return res.status(400).json({ error: 'Cannot remove yourself from the household' })
      }

      const db = getDatabase()

      // Check if user is a member
      const member = await db('household_members')
        .where({ 
          household_id: householdId, 
          user_id: userId,
          is_active: true
        })
        .first()

      if (!member) {
        return res.status(404).json({ error: 'User not found in household' })
      }

      // Deactivate user
      await db('household_members')
        .where({ id: member.id })
        .update({
          is_active: false,
          updated_at: new Date()
        })

      logger.info(`User ${userId} removed from household ${householdId}`)

      res.json({ message: 'User removed from household successfully' })

    } catch (error) {
      logger.error('Remove user error:', error)
      res.status(500).json({ error: 'Failed to remove user from household' })
    }
  }
)

module.exports = router