import { defineConfig } from 'steiger'
import fsd from '@feature-sliced/steiger-plugin'

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // entities/session, entities/folder and entities/file each reference a type
    // from a sibling entity (User, PermissionLevel, AuditEntry) — the documented
    // entity-to-entity exception in FSD for data that inherently composes.
    files: [
      './src/entities/session/**',
      './src/entities/folder/model/types.ts',
      './src/entities/file/api/file-api.ts',
      './src/entities/file/model/types.ts',
    ],
    rules: {
      'fsd/forbidden-imports': 'off',
    },
  },
  {
    // The project deliberately uses one feature/entity slice per user action —
    // many are used from a single page only, which this heuristic otherwise
    // flags as "unused".
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
])
