import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import * as vscode from 'vscode'

// Runs inside a real VS Code instance (see run.js). Minimal runner — no mocha needed.
const cases: [string, () => Promise<void>][] = []
const test = (name: string, fn: () => Promise<void>) => cases.push([name, fn])

const sandbox = process.env.GIT_SELECTOR_SANDBOX!
const repo = join(sandbox, 'projects', 'sample-repo')
const config = () => vscode.workspace.getConfiguration('gitSelector')
const localEmail = () => {
  try {
    return execFileSync('git', ['config', '--local', '--get', 'user.email'], { cwd: repo })
      .toString()
      .trim()
  } catch {
    return undefined
  }
}

async function until(condition: () => boolean, timeout = 5000): Promise<boolean> {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > timeout) return false
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return true
}

test('extension activates and registers its commands', async () => {
  const extension = vscode.extensions.getExtension('studiomedio.git-selector')
  assert.ok(extension, 'extension is installed')
  await extension.activate()
  const commands = await vscode.commands.getCommands(true)
  for (const id of [
    'gitSelector.openProject',
    'gitSelector.openProjectNewWindow',
    'gitSelector.refreshProjects',
    'gitSelector.addBaseFolder',
    'gitSelector.openWorkspaceFile',
    'gitSelector.switchGitUser',
    'gitSelector.addGitUserProfile',
  ]) {
    assert.ok(commands.includes(id), `${id} is registered`)
  }
})

test('the sample repository is open as a bare folder', async () => {
  assert.equal(vscode.workspace.workspaceFile, undefined)
  assert.equal(vscode.workspace.workspaceFolders?.[0].uri.fsPath, repo)
})

test('refresh scans the configured base folders', async () => {
  await config().update(
    'baseFolders',
    [join(sandbox, 'projects')],
    vscode.ConfigurationTarget.Global,
  )
  await vscode.commands.executeCommand('gitSelector.refreshProjects')
})

test('project picker opens and closes', async () => {
  await vscode.commands.executeCommand('gitSelector.openProject')
  await vscode.commands.executeCommand('workbench.action.closeQuickOpen')
})

test('a profile with matching paths is written to the repository config', async () => {
  assert.equal(localEmail(), undefined)
  await config().update(
    'gitUser.profiles',
    [
      {
        label: 'Test',
        name: 'Test User',
        email: 'test@example.com',
        paths: [join(sandbox, 'projects')],
      },
    ],
    vscode.ConfigurationTarget.Global,
  )
  assert.ok(
    await until(() => localEmail() === 'test@example.com'),
    'profile applied to local git config',
  )
})

test('profiles for other folders leave the repository alone', async () => {
  await config().update(
    'gitUser.profiles',
    [
      {
        label: 'Other',
        name: 'Other',
        email: 'other@example.com',
        paths: [join(sandbox, 'elsewhere')],
      },
    ],
    vscode.ConfigurationTarget.Global,
  )
  await new Promise((resolve) => setTimeout(resolve, 1000))
  assert.equal(localEmail(), 'test@example.com')
})

export async function run(): Promise<void> {
  const failures: string[] = []
  for (const [name, fn] of cases) {
    try {
      await fn()
      console.log(`  ✔ ${name}`)
    } catch (error) {
      console.log(
        `  ✘ ${name}\n${String((error as Error).stack ?? error).replace(/^/gm, '      ')}`,
      )
      failures.push(name)
    }
  }
  console.log(`\n${cases.length - failures.length} passed, ${failures.length} failed`)
  if (failures.length > 0) throw new Error(`${failures.length} integration test(s) failed`)
}
