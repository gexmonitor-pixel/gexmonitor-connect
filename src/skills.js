'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { SKILLS_REPO, SKILL_NAME, REQUIRED_SKILL_FILES, ERROR_CODES } = require('./constants');
const { verbose } = require('./utils/output');

/**
 * Copies skill directory contents from srcDir to destDir recursively.
 * @param {string} srcDir 
 * @param {string} destDir 
 */
function copyDirRecursive(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Fallback skill installer: Clones repository or copies skill directory directly.
 * @param {string} targetDir 
 */
function fallbackInstallSkill(targetDir) {
  const tmpDir = path.join(path.dirname(targetDir), `.tmp-skill-clone-${Date.now()}`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    execSync(`git clone --depth 1 https://github.com/${SKILLS_REPO}.git "${tmpDir}"`, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const skillSourceDir = path.join(tmpDir, 'skills', SKILL_NAME);
    const effectiveSource = fs.existsSync(skillSourceDir) ? skillSourceDir : tmpDir;

    copyDirRecursive(effectiveSource, targetDir);
  } finally {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // Ignored
    }
  }
}

/**
 * Installs or updates GEX Monitor skill for the specified client.
 * @param {import('./clients/base')} client 
 * @param {{ dryRun?: boolean, yes?: boolean, verbose?: boolean }} options 
 * @param {Record<string, any>} [env] 
 * @returns {Promise<{ success: boolean, alreadyInstalled?: boolean, method: string, error?: string, errorCode?: string }>}
 */
async function installSkill(client, options = {}, env = process.env) {
  const targetDir = client.getSkillTargetDir(env);
  const verifyBefore = await client.verifySkill(env);

  if (verifyBefore.installed) {
    verbose(`Skill already installed at ${targetDir}`);
    return {
      success: true,
      alreadyInstalled: true,
      method: 'existing'
    };
  }

  if (options.dryRun) {
    return {
      success: true,
      method: 'dry-run'
    };
  }

  // 1. Build official Skills CLI command
  const agentArg = client.getSkillAdapterArg();
  const flags = client.getSkillsCliFlags().join(' ');
  const cmd = `npx skills add ${SKILLS_REPO} --skill ${SKILL_NAME} -a ${agentArg} ${flags}`;

  verbose(`Executing: ${cmd}`);

  let skillsCliSuccess = false;
  try {
    execSync(cmd, {
      stdio: options.verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      env
    });
    skillsCliSuccess = true;
  } catch (err) {
    verbose(`Skills CLI execution error: ${err.message}`);
  }

  // Check verification
  let verifyAfter = await client.verifySkill(env);

  // If Skills CLI didn't place files or failed, use fallback clone
  if (!verifyAfter.installed) {
    verbose('Attempting direct repository fallback installation...');
    try {
      fallbackInstallSkill(targetDir);
      verifyAfter = await client.verifySkill(env);
    } catch (fallbackErr) {
      verbose(`Direct fallback installation failed: ${fallbackErr.message}`);
    }
  }

  // If in Memoh environment with /data/skills, also copy there
  const memohSkillsDir = path.join('/data', 'skills', SKILL_NAME);
  if (fs.existsSync('/data/skills') && fs.existsSync(targetDir)) {
    try {
      copyDirRecursive(targetDir, memohSkillsDir);
      verbose(`Copied skill to Memoh container path: ${memohSkillsDir}`);
    } catch (memohErr) {
      verbose(`Could not copy to /data/skills: ${memohErr.message}`);
    }
  }

  if (!verifyAfter.installed) {
    return {
      success: false,
      errorCode: ERROR_CODES.SKILL_INSTALL_FAILED,
      error: `Missing files after installation: ${verifyAfter.missingFiles.join(', ')}`,
      method: skillsCliSuccess ? 'skills-cli' : 'fallback'
    };
  }

  return {
    success: true,
    alreadyInstalled: false,
    method: skillsCliSuccess ? 'skills-cli' : 'fallback'
  };
}

module.exports = {
  installSkill
};
