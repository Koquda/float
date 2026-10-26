import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const floatLedgers = sqliteTable('float_ledgers', {
  userId: text('user_id').primaryKey(),
  revision: integer('revision').notNull(),
  stateJson: text('state_json').notNull(),
});
