// Add indexes for common filters in requests table
exports.up = async (knex: any) => {
  // Index for status filtering
  await knex.schema.table('requests', (table: any) => {
    table.index(['status']);
  });

  // Index for assignee filtering
  await knex.schema.table('requests', (table: any) => {
    table.index(['assignee_id']);
  });

  // Index for on-call schedule filtering
  await knex.schema.table('oncall_schedules', (table: any) => {
    table.index(['is_active']);
  });

  // Index for shift status filtering
  await knex.schema.table('shifts', (table: any) => {
    table.index(['status']);
  });
};

exports.down = async (knex: any) => {
  await knex.schema.table('requests', (table: any) => {
    table.dropIndex(['status']);
    table.dropIndex(['assignee_id']);
  });

  await knex.schema.table('oncall_schedules', (table: any) => {
    table.dropIndex(['is_active']);
  });

  await knex.schema.table('shifts', (table: any) => {
    table.dropIndex(['status']);
  });
};