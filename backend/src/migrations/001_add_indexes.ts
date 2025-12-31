// Add indexes for common filters in requests table
exports.up = async (knex) => {
  // Index for status filtering
  await knex.schema.table('requests', (table) => {
    table.index(['status']);
  });
  
  // Index for assignee filtering
  await knex.schema.table('requests', (table) => {
    table.index(['assignee_id']);
  });
  
  // Index for on-call schedule filtering
  await knex.schema.table('oncall_schedules', (table) => {
    table.index(['is_active']);
  });
  
  // Index for shift status filtering
  await knex.schema.table('shifts', (table) => {
    table.index(['status']);
  });
};

exports.down = async (knex) => {
  await knex.schema.table('requests', (table) => {
    table.dropIndex(['status']);
    table.dropIndex(['assignee_id']);
  });
  
  await knex.schema.table('oncall_schedules', (table) => {
    table.dropIndex(['is_active']);
  });
  
  await knex.schema.table('shifts', (table) => {
    table.dropIndex(['status']);
  });
};