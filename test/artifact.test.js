'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

test('Artifact regression: packed tarball installs and executes binary', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const expectedVersion = pkg.version;

  const tmpBase = os.tmpdir();
  const testDir = fs.mkdtempSync(path.join(tmpBase, 'gex-pack-regression-'));

  try {
    // 1. Pack tarball inside temp directory
    const packOutput = execSync(`npm pack "${repoRoot}"`, { cwd: testDir }).toString().trim();
    const tarballName = packOutput.split('\n').pop().trim();
    const tarballPath = path.join(testDir, tarballName);

    assert.ok(fs.existsSync(tarballPath), `Tarball must exist at ${tarballPath}`);

    // 2. Initialize consumer project and install tarball
    execSync('npm init -y', { cwd: testDir, stdio: 'ignore' });
    execSync(`npm install "${tarballPath}"`, { cwd: testDir, stdio: 'ignore' });

    // 3. Verify node_modules/.bin/gexmonitor-connect exists
    const binPath = path.join(testDir, 'node_modules', '.bin', 'gexmonitor-connect');
    assert.ok(fs.existsSync(binPath), `Binary must exist at ${binPath}`);

    // 4. Execute binary
    const versionOutput = execSync(`"${binPath}" --version`, { cwd: testDir }).toString().trim();

    // 5. Verify exact version
    assert.equal(versionOutput, `gexmonitor-connect v${expectedVersion}`);
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  }
});
