import { initialSchemaSql } from './001_initial_schema.js';

export interface Migration {
  id: string;
  name: string;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    id: '001',
    name: 'initial_schema',
    sql: initialSchemaSql,
  },
];
