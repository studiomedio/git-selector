import { strict as assert } from 'node:assert'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseScopedValue } from '../src/git'
import { findProfileForIdentity, findProfileForPath, identityMatches } from '../src/profiles'
import type { GitUserProfile } from '../src/types/gitUser'

const personal: GitUserProfile = {
  label: 'Personal',
  name: 'Jane',
  email: 'jane@home.dev',
  paths: ['~/dev'],
}
const work: GitUserProfile = {
  label: 'Work',
  name: 'Jane',
  email: 'jane@corp.com',
  paths: ['~/dev/corp', '/srv/corp'],
}
const manual: GitUserProfile = { label: 'Manual', name: 'J', email: 'j@x.io' }
const profiles = [personal, work, manual]

test('findProfileForPath picks the most specific matching path', () => {
  assert.equal(findProfileForPath(profiles, join(homedir(), 'dev/site')), personal)
  assert.equal(findProfileForPath(profiles, join(homedir(), 'dev/corp/app')), work)
  assert.equal(findProfileForPath(profiles, '/srv/corp/x'), work)
})

test('findProfileForPath does not match sibling folders sharing a prefix', () => {
  assert.equal(findProfileForPath(profiles, join(homedir(), 'dev-other/app')), undefined)
  assert.equal(findProfileForPath(profiles, '/srv/corporate'), undefined)
})

test('identityMatches compares name and case-insensitive email', () => {
  assert.equal(identityMatches({ name: 'Jane', email: 'JANE@corp.com' }, work), true)
  assert.equal(identityMatches({ name: 'Jane', email: 'jane@home.dev' }, work), false)
})

test('findProfileForIdentity falls back to email only', () => {
  assert.equal(findProfileForIdentity(profiles, { name: 'Other', email: 'j@x.io' }), manual)
  assert.equal(findProfileForIdentity(profiles, { email: 'nobody@x.io' }), undefined)
})

test('parseScopedValue reads git --show-scope output', () => {
  assert.deepEqual(parseScopedValue('local\tjane@corp.com\n'), {
    scope: 'local',
    value: 'jane@corp.com',
  })
  assert.deepEqual(parseScopedValue(''), {})
})
