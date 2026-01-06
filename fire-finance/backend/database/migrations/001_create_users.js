exports.up = function(knex) {
  return knex.schema
    .createTable('users', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      table.string('email', 255).notNullable().unique()
      table.string('username', 50).notNullable().unique()
      table.string('password_hash', 255).notNullable()
      table.string('first_name', 100).notNullable()
      table.string('last_name', 100).notNullable()
      table.string('phone', 20)
      table.string('avatar_url', 500)
      table.boolean('email_verified').defaultTo(false)
      table.boolean('phone_verified').defaultTo(false)
      table.string('mfa_secret', 32)
      table.boolean('mfa_enabled').defaultTo(false)
      table.string('mfa_recovery_codes', 500) // JSON array of recovery codes
      table.enum('role', ['admin', 'auditor', 'tax_prepper', 'user']).defaultTo('user')
      table.boolean('is_active').defaultTo(true)
      table.timestamp('last_login')
      table.integer('login_attempts').defaultTo(0)
      table.timestamp('locked_until')
      table.json('preferences').defaultTo('{}') // User preferences and settings
      table.timestamps(true, true)
      
      // Indexes
      table.index(['email'])
      table.index(['username'])
      table.index(['role'])
      table.index(['is_active'])
    })
    .createTable('households', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      table.string('name', 100).notNullable()
      table.text('description')
      table.uuid('owner_id').references('id').inTable('users').onDelete('CASCADE')
      table.json('settings').defaultTo('{}')
      table.boolean('is_active').defaultTo(true)
      table.timestamps(true, true)
      
      table.index(['owner_id'])
      table.index(['is_active'])
    })
    .createTable('household_members', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      table.uuid('household_id').references('id').inTable('households').onDelete('CASCADE')
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.enum('role', ['admin', 'member', 'viewer']).defaultTo('member')
      table.enum('permissions', ['full', 'read_write', 'read_only']).defaultTo('read_write')
      table.boolean('can_invite').defaultTo(false)
      table.timestamp('joined_at').defaultTo(knex.fn.now())
      table.timestamp('last_activity')
      table.timestamps(true, true)
      
      table.unique(['household_id', 'user_id'])
      table.index(['household_id'])
      table.index(['user_id'])
      table.index(['role'])
    })
}

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('household_members')
    .dropTableIfExists('households')
    .dropTableIfExists('users')
}