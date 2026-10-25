import { describe, expect, it } from 'vitest'
import { shownCommand } from './setup-cloud.mjs'

describe('setup-cloud error messages', () => {
  it.each([
    [['link', '--project-ref', 'abc', '--password', 'pw-123'], 'link --project-ref abc --password ***'],
    [['db', 'push', '--linked', '--password', 'pw-123', '--yes'], 'db push --linked --password *** --yes'],
    [['projects', 'create', 'win-notes', '--db-password', 'pw-123', '--region', 'us-east-1'], 'projects create win-notes --db-password *** --region us-east-1']
  ])('never print the database password: %j', (args, shown) => {
    expect(shownCommand(args)).toBe(shown)
  })
})
