// Downloads an isolated VS Code into .vscode-test/ and runs the integration suite in it,
// with a throwaway git repository (containing a workspace file) open as the folder.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { runTests } = require('@vscode/test-electron')

async function main() {
  // Set when launched from VS Code's own terminal/extension host; it would start the test instance as plain Node.
  delete process.env.ELECTRON_RUN_AS_NODE
  const root = path.resolve(__dirname, '../..')
  const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-selector-it-')))
  const repo = path.join(sandbox, 'projects', 'sample-repo')
  fs.mkdirSync(repo, { recursive: true })
  execFileSync('git', ['init', '--quiet'], { cwd: repo })
  fs.writeFileSync(
    path.join(repo, 'sample-repo.code-workspace'),
    '{ "folders": [{ "path": "." }] }',
  )
  fs.mkdirSync(path.join(sandbox, 'projects', 'plain', '.git'), { recursive: true })

  try {
    await runTests({
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(root, 'out-test/integration/suite.js'),
      launchArgs: [repo, '--disable-extensions', '--skip-welcome', '--skip-release-notes'],
      extensionTestsEnv: { GIT_SELECTOR_SANDBOX: sandbox },
    })
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

main().catch(() => process.exit(1))
