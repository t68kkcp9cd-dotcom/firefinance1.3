const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { getDatabase } = require('../config/database')
const { authenticateJWT, checkHouseholdMembership } = require('../middleware/auth')
const logger = require('../config/logger')

const router = express.Router()

// IRS mileage rates (update annually)
const IRS_MILEAGE_RATES = {
  2024: { business: 0.67, medical: 0.21, charitable: 0.14 },
  2023: { business: 0.655, medical: 0.22, charitable: 0.14 }
}

/**
 * Create mileage log entry
 */
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const {
      vehicleId,
      date,
      startOdometer,
      endOdometer,
      purpose,
      notes,
      isBusinessDay,
      trips
    } = req.body

    // Validation
    if (!vehicleId || !date || !startOdometer || !endOdometer) {
      return res.status(400).json({ error: 'Required fields missing' })
    }

    if (endOdometer <= startOdometer) {
      return res.status(400).json({ error: 'End odometer must be greater than start odometer' })
    }

    const totalMiles = endOdometer - startOdometer
    const db = getDatabase()

    // Get vehicle profile
    const vehicle = await db('vehicles')
      .where({ id: vehicleId, user_id: req.user.id })
      .first()

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' })
    }

    // Calculate deduction based on IRS rates
    const currentYear = new Date().getFullYear()
    const mileageRate = IRS_MILEAGE_RATES[currentYear]?.business || IRS_MILEAGE_RATES[2024].business
    
    let deductibleMiles = 0
    let deductionAmount = 0

    if (isBusinessDay) {
      // Full day deduction (any business activity = all miles deductible)
      deductibleMiles = totalMiles
      deductionAmount = totalMiles * mileageRate
    } else if (trips && trips.length > 0) {
      // Calculate based on individual trips
      const businessTrips = trips.filter(trip => trip.purpose === 'business')
      deductibleMiles = businessTrips.reduce((sum, trip) => sum + (trip.miles || 0), 0)
      deductionAmount = deductibleMiles * mileageRate
    }

    // Create mileage log
    const [logEntry] = await db('mileage_logs')
      .insert({
        id: uuidv4(),
        user_id: req.user.id,
        vehicle_id: vehicleId,
        date,
        start_odometer: startOdometer,
        end_odometer: endOdometer,
        total_miles: totalMiles,
        deductible_miles: deductibleMiles,
        deduction_amount: deductionAmount,
        purpose,
        notes,
        is_business_day: isBusinessDay,
        mileage_rate: mileageRate,
        year: currentYear,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning(['id'])

    // Save nested trips if provided
    if (trips && trips.length > 0) {
      for (const trip of trips) {
        await db('mileage_trips').insert({
          id: uuidv4(),
          mileage_log_id: logEntry.id,
          start_location: trip.startLocation,
          end_location: trip.endLocation,
          start_time: trip.startTime,
          end_time: trip.endTime,
          miles: trip.miles,
          purpose: trip.purpose,
          notes: trip.notes,
          client_id: trip.clientId,
          created_at: new Date()
        })
      }
    }

    logger.info(`Mileage log created: ${logEntry.id}`)

    res.status(201).json({
      message: 'Mileage log created successfully',
      logId: logEntry.id,
      totalMiles,
      deductibleMiles,
      deductionAmount
    })

  } catch (error) {
    logger.error('Create mileage log error:', error)
    res.status(500).json({ error: 'Failed to create mileage log' })
  }
})

/**
 * Get mileage logs with filtering and pagination
 */
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      vehicleId,
      purpose,
      isBusinessDay,
      page = 1,
      limit = 50
    } = req.query

    const db = getDatabase()
    const offset = (page - 1) * limit

    let query = db('mileage_logs')
      .leftJoin('vehicles', 'mileage_logs.vehicle_id', 'vehicles.id')
      .where({ 'mileage_logs.user_id': req.user.id })
      .select(
        'mileage_logs.*',
        'vehicles.name as vehicle_name',
        'vehicles.make as vehicle_make',
        'vehicles.model as vehicle_model',
        'vehicles.year as vehicle_year'
      )
      .orderBy('mileage_logs.date', 'desc')

    // Apply filters
    if (startDate) {
      query = query.where('mileage_logs.date', '>=', startDate)
    }
    if (endDate) {
      query = query.where('mileage_logs.date', '<=', endDate)
    }
    if (vehicleId) {
      query = query.where('mileage_logs.vehicle_id', vehicleId)
    }
    if (purpose) {
      query = query.where('mileage_logs.purpose', purpose)
    }
    if (isBusinessDay !== undefined) {
      query = query.where('mileage_logs.is_business_day', isBusinessDay)
    }

    const totalQuery = query.clone()
    const totalResult = await totalQuery.count('* as count').first()
    const total = parseInt(totalResult.count)

    const logs = await query.limit(limit).offset(offset)

    // Get trips for each log
    for (const log of logs) {
      log.trips = await db('mileage_trips')
        .where({ mileage_log_id: log.id })
        .orderBy('start_time', 'asc')
    }

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })

  } catch (error) {
    logger.error('Get mileage logs error:', error)
    res.status(500).json({ error: 'Failed to get mileage logs' })
  }
})

/**
 * Update mileage log
 */
router.put('/:logId', authenticateJWT, async (req, res) => {
  try {
    const { logId } = req.params
    const updates = req.body

    const db = getDatabase()

    // Get existing log
    const existingLog = await db('mileage_logs')
      .where({ id: logId, user_id: req.user.id })
      .first()

    if (!existingLog) {
      return res.status(404).json({ error: 'Mileage log not found' })
    }

    // Recalculate if odometer readings changed
    if (updates.startOdometer || updates.endOdometer) {
      const startOdometer = updates.startOdometer || existingLog.start_odometer
      const endOdometer = updates.endOdometer || existingLog.end_odometer
      
      if (endOdometer <= startOdometer) {
        return res.status(400).json({ error: 'End odometer must be greater than start odometer' })
      }

      updates.total_miles = endOdometer - startOdometer
      updates.deductible_miles = updates.total_miles // Simplified - could use business day logic
      updates.deduction_amount = updates.deductible_miles * existingLog.mileage_rate
    }

    // Update log
    const updateData = {
      ...updates,
      updated_at: new Date()
    }

    await db('mileage_logs')
      .where({ id: logId })
      .update(updateData)

    logger.info(`Mileage log updated: ${logId}`)

    res.json({ message: 'Mileage log updated successfully' })

  } catch (error) {
    logger.error('Update mileage log error:', error)
    res.status(500).json({ error: 'Failed to update mileage log' })
  }
})

/**
 * Delete mileage log
 */
router.delete('/:logId', authenticateJWT, async (req, res) => {
  try {
    const { logId } = req.params

    const db = getDatabase()

    const deleted = await db('mileage_logs')
      .where({ id: logId, user_id: req.user.id })
      .del()

    if (deleted === 0) {
      return res.status(404).json({ error: 'Mileage log not found' })
    }

    logger.info(`Mileage log deleted: ${logId}`)

    res.json({ message: 'Mileage log deleted successfully' })

  } catch (error) {
    logger.error('Delete mileage log error:', error)
    res.status(500).json({ error: 'Failed to delete mileage log' })
  }
})

/**
 * Get mileage summary for tax reporting
 */
router.get('/summary', authenticateJWT, async (req, res) => {
  try {
    const { year, vehicleId } = req.query
    const targetYear = year ? parseInt(year) : new Date().getFullYear()

    const db = getDatabase()

    let query = db('mileage_logs')
      .where({ 
        user_id: req.user.id,
        year: targetYear 
      })

    if (vehicleId) {
      query = query.where({ vehicle_id: vehicleId })
    }

    const logs = await query

    const summary = {
      year: targetYear,
      totalLogs: logs.length,
      totalMiles: logs.reduce((sum, log) => sum + log.total_miles, 0),
      totalDeductibleMiles: logs.reduce((sum, log) => sum + log.deductible_miles, 0),
      totalDeductionAmount: logs.reduce((sum, log) => sum + log.deduction_amount, 0),
      businessDays: logs.filter(log => log.is_business_day).length,
      averageMilesPerDay: 0,
      vehicles: []
    }

    if (summary.totalLogs > 0) {
      summary.averageMilesPerDay = summary.totalMiles / summary.totalLogs
    }

    // Group by vehicle
    const vehicleStats = {}
    for (const log of logs) {
      if (!vehicleStats[log.vehicle_id]) {
        vehicleStats[log.vehicle_id] = {
          vehicleId: log.vehicle_id,
          vehicleName: log.vehicle_name,
          totalLogs: 0,
          totalMiles: 0,
          deductibleMiles: 0,
          deductionAmount: 0
        }
      }
      
      vehicleStats[log.vehicle_id].totalLogs++
      vehicleStats[log.vehicle_id].totalMiles += log.total_miles
      vehicleStats[log.vehicle_id].deductibleMiles += log.deductible_miles
      vehicleStats[log.vehicle_id].deductionAmount += log.deduction_amount
    }

    summary.vehicles = Object.values(vehicleStats)

    res.json(summary)

  } catch (error) {
    logger.error('Get mileage summary error:', error)
    res.status(500).json({ error: 'Failed to get mileage summary' })
  }
})

/**
 * Export mileage data for tax software
 */
router.get('/export', authenticateJWT, async (req, res) => {
  try {
    const { year, format = 'csv' } = req.query
    const targetYear = year ? parseInt(year) : new Date().getFullYear()

    const db = getDatabase()

    const logs = await db('mileage_logs')
      .leftJoin('vehicles', 'mileage_logs.vehicle_id', 'vehicles.id')
      .leftJoin('mileage_trips', 'mileage_logs.id', 'mileage_trips.mileage_log_id')
      .where({ 
        'mileage_logs.user_id': req.user.id,
        'mileage_logs.year': targetYear 
      })
      .select(
        'mileage_logs.date',
        'vehicles.name as vehicle',
        'mileage_logs.start_odometer',
        'mileage_logs.end_odometer',
        'mileage_logs.total_miles',
        'mileage_logs.deductible_miles',
        'mileage_logs.deduction_amount',
        'mileage_logs.purpose',
        'mileage_logs.notes',
        'mileage_logs.is_business_day',
        'mileage_trips.start_location',
        'mileage_trips.end_location',
        'mileage_trips.purpose as trip_purpose',
        'mileage_trips.miles as trip_miles'
      )
      .orderBy('mileage_logs.date', 'desc')

    if (format === 'csv') {
      const { exportToCSV } = require('../utils/exportUtils')
      const csv = exportToCSV(logs, [
        { key: 'date', header: 'Date' },
        { key: 'vehicle', header: 'Vehicle' },
        { key: 'start_odometer', header: 'Start Odometer' },
        { key: 'end_odometer', header: 'End Odometer' },
        { key: 'total_miles', header: 'Total Miles' },
        { key: 'deductible_miles', header: 'Deductible Miles' },
        { key: 'deduction_amount', header: 'Deduction Amount' },
        { key: 'purpose', header: 'Purpose' },
        { key: 'notes', header: 'Notes' },
        { key: 'is_business_day', header: 'Business Day' }
      ])

      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="mileage_${targetYear}.csv"`)
      res.send(csv)
    } else {
      res.json(logs)
    }

  } catch (error) {
    logger.error('Export mileage data error:', error)
    res.status(500).json({ error: 'Failed to export mileage data' })
  }
})

module.exports = router