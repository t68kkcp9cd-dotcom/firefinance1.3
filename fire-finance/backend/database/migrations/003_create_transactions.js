exports.up = function(knex) {
  return knex.schema
    .createTable('categories', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.uuid('household_id').references('id').inTable('households').onDelete('SET NULL')
      table.string('name', 100).notNullable()
      table.string('description', 255)
      table.string('color', 7) // Hex color code
      table.string('icon', 50) // Icon name
      table.uuid('parent_id').references('id').inTable('categories').onDelete('CASCADE')
      table.enum('type', ['income', 'expense', 'transfer']).notNullable()
      table.boolean('is_system').defaultTo(false) // Built-in vs custom categories
      table.boolean('is_active').defaultTo(true)
      table.integer('sort_order').defaultTo(0)
      table.timestamps(true, true)
      
      table.index(['user_id'])
      table.index(['household_id'])
      table.index(['parent_id'])
      table.index(['type'])
      table.index(['is_active'])
    })
    .createTable('transactions', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      table.uuid('account_id').references('id').inTable('accounts').onDelete('CASCADE')
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.uuid('household_id').references('id').inTable('households').onDelete('SET NULL')
      table.string('plaid_transaction_id', 100)
      table.string('name', 255).notNullable()
      table.decimal('amount', 15, 2).notNullable()
      table.string('iso_currency_code', 3).defaultTo('USD')
      table.date('date').notNullable()
      table.string('merchant_name', 255)
      table.string('location', 255)
      table.uuid('category_id').references('id').inTable('categories').onDelete('SET NULL')
      table.string('subcategory', 100)
      table.enum('type', ['debit', 'credit']).notNullable()
      table.enum('status', ['pending', 'posted', 'cancelled']).defaultTo('posted')
      table.boolean('is_pending').defaultTo(false)
      table.text('notes')
      table.json('tags').defaultTo('[]') // JSON array of tags
      table.boolean('is_recurring').defaultTo(false)
      table.boolean('needs_review').defaultTo(false) // Flag for manual review
      table.boolean('is_split').defaultTo(false)
      table.uuid('parent_transaction_id').references('id').inTable('transactions').onDelete('CASCADE')
      table.json('metadata').defaultTo('{}') // Additional transaction metadata
      table.json('attachments').defaultTo('[]') // JSON array of attachment URLs
      table.timestamps(true, true)
      
      table.index(['account_id'])
      table.index(['user_id'])
      table.index(['household_id'])
      table.index(['plaid_transaction_id'])
      table.index(['date'])
      table.index(['category_id'])
      table.index(['type'])
      table.index(['status'])
      table.index(['is_pending'])
      table.index(['parent_transaction_id'])
    })
    .createTable('transaction_splits', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      table.uuid('transaction_id').references('id').inTable('transactions').onDelete('CASCADE')
      table.uuid('category_id').references('id').inTable('categories').onDelete('CASCADE')
      table.decimal('amount', 15, 2).notNullable()
      table.text('notes')
      table.timestamps(true, true)
      
      table.index(['transaction_id'])
      table.index(['category_id'])
    })
    .createTable('recurring_transactions', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      table.uuid('account_id').references('id').inTable('accounts').onDelete('CASCADE')
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.string('name', 255).notNullable()
      table.decimal('amount', 15, 2).notNullable()
      table.string('iso_currency_code', 3).defaultTo('USD')
      table.uuid('category_id').references('id').inTable('categories').onDelete('SET NULL')
      table.enum('frequency', ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).notNullable()
      table.integer('interval').defaultTo(1)
      table.date('start_date').notNullable()
      table.date('end_date')
      table.date('next_due_date').notNullable()
      table.enum('status', ['active', 'paused', 'completed', 'cancelled']).defaultTo('active')
      table.text('notes')
      table.json('metadata').defaultTo('{}')
      table.timestamps(true, true)
      
      table.index(['account_id'])
      table.index(['user_id'])
      table.index(['category_id'])
      table.index(['frequency'])
      table.index(['next_due_date'])
      table.index(['status'])
    })
}

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('recurring_transactions')
    .dropTableIfExists('transaction_splits')
    .dropTableIfExists('transactions')
    .dropTableIfExists('categories')
}