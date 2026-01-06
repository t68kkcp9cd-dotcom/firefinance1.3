exports.up = function(knex) {
  return knex.schema
    .createTable('financial_institutions', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      table.string('name', 100).notNullable()
      table.string('plaid_institution_id', 100)
      table.string('logo_url', 500)
      table.string('website_url', 500)
      table.json('supported_products') // JSON array of supported products
      table.timestamps(true, true)
      
      table.index(['plaid_institution_id'])
    })
    .createTable('accounts', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.uuid('household_id').references('id').inTable('households').onDelete('SET NULL')
      table.uuid('institution_id').references('id').inTable('financial_institutions').onDelete('SET NULL')
      table.string('plaid_account_id', 100)
      table.string('account_name', 100).notNullable()
      table.string('account_type', 50).notNullable() // checking, savings, credit, investment, loan
      table.string('account_subtype', 50)
      table.string('mask', 4) // Last 4 digits
      table.decimal('current_balance', 15, 2).defaultTo(0.00)
      table.decimal('available_balance', 15, 2).defaultTo(0.00)
      table.string('iso_currency_code', 3).defaultTo('USD')
      table.boolean('is_active').defaultTo(true)
      table.boolean('is_manual').defaultTo(false) // Manual vs linked account
      table.boolean('include_in_net_worth').defaultTo(true)
      table.boolean('include_in_budget').defaultTo(true)
      table.json('metadata').defaultTo('{}') // Additional account metadata
      table.timestamp('last_sync')
      table.timestamps(true, true)
      
      table.index(['user_id'])
      table.index(['household_id'])
      table.index(['institution_id'])
      table.index(['plaid_account_id'])
      table.index(['account_type'])
      table.index(['is_active'])
    })
    .createTable('account_balances', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      table.uuid('account_id').references('id').inTable('accounts').onDelete('CASCADE')
      table.decimal('current_balance', 15, 2).notNullable()
      table.decimal('available_balance', 15, 2)
      table.date('balance_date').notNullable()
      table.timestamps(true, true)
      
      table.index(['account_id'])
      table.index(['balance_date'])
    })
}

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('account_balances')
    .dropTableIfExists('accounts')
    .dropTableIfExists('financial_institutions')
}