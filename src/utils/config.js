'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Creates a bounded backup of a file.
 * @param {string} filePath 
 * @returns {string | null} backup path or null if file didn't exist
 */
function createBackup(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const timestamp = Date.now();
  const backupPath = `${filePath}.bak.${timestamp}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Restores a file from a backup.
 * @param {string} backupPath 
 * @param {string} targetPath 
 */
function restoreBackup(backupPath, targetPath) {
  if (backupPath && fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, targetPath);
    try {
      fs.unlinkSync(backupPath);
    } catch {
      // Ignore cleanup error during recovery
    }
  }
}

/**
 * Removes a temporary backup file.
 * @param {string} backupPath 
 */
function removeBackup(backupPath) {
  if (backupPath && fs.existsSync(backupPath)) {
    try {
      fs.unlinkSync(backupPath);
    } catch {
      // Ignore cleanup error
    }
  }
}

/**
 * Atomically writes content to a target file.
 * @param {string} filePath 
 * @param {string} content 
 */
function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Safely mutates a configuration file with automatic backup, validation, and rollback.
 * @param {string} filePath 
 * @param {(currentContent: string | null) => string} mutatorFn 
 * @param {(newContent: string) => boolean} [validatorFn] 
 * @returns {{ mutated: boolean, backupPath: string | null }}
 */
function safeMutateFile(filePath, mutatorFn, validatorFn) {
  const fileExisted = fs.existsSync(filePath);
  const currentContent = fileExisted ? fs.readFileSync(filePath, 'utf8') : null;
  const backupPath = fileExisted ? createBackup(filePath) : null;

  try {
    const newContent = mutatorFn(currentContent);
    if (currentContent !== null && newContent === currentContent) {
      if (backupPath) removeBackup(backupPath);
      return { mutated: false, backupPath: null };
    }

    atomicWrite(filePath, newContent);

    if (validatorFn) {
      const isValid = validatorFn(newContent);
      if (!isValid) {
        throw new Error(`Validation failed for mutated file: ${filePath}`);
      }
    }

    if (backupPath) {
      removeBackup(backupPath);
    }

    return { mutated: true, backupPath: null };
  } catch (err) {
    if (backupPath) {
      restoreBackup(backupPath, filePath);
    } else if (!fileExisted && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Ignore unlink error
      }
    }
    throw err;
  }
}

module.exports = {
  createBackup,
  restoreBackup,
  removeBackup,
  atomicWrite,
  safeMutateFile
};
