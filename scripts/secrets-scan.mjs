#!/usr/bin/env node

/**
 * Secrets Scanner for CI/CD
 * Scans repository for common secret patterns to prevent accidental commits
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Secret patterns to detect
const PATTERNS = [
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z\\-_]{35}/, severity: 'HIGH' },
  { name: 'Private Key', regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, severity: 'HIGH' },
  { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{48}/, severity: 'HIGH' },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, severity: 'HIGH' },
  { name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/, severity: 'HIGH' },
  { name: 'Generic Secret', regex: /(secret|password|token|key)[\s]*[=:]["'][^"'\s]{20,}["']/, severity: 'MEDIUM' },
  { name: 'Hardcoded JWT_SECRET', regex: /JWT_SECRET\s*=\s*["'][^"']{16,}["'](?!.*dev-secret)/, severity: 'HIGH' },
  { name: 'Hardcoded CSRF_SECRET', regex: /CSRF_SECRET\s*=\s*["'][^"']{16,}["'](?!.*dev-secret)/, severity: 'HIGH' },
];

// Files and directories to always ignore
const IGNORE_PATTERNS = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  'coverage/',
  'playwright-report/',
  '.env.example',
  '.env.ci',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'secrets-scan.mjs',
  'SECURITY.md',
  'GITHUB_PUSH.md',
];

// Load custom ignore patterns if they exist
function loadIgnoreFile() {
  const ignoreFilePath = join(rootDir, '.secrets-scan-ignore.json');
  if (existsSync(ignoreFilePath)) {
    try {
      const content = readFileSync(ignoreFilePath, 'utf8');
      const config = JSON.parse(content);
      return config.ignore || [];
    } catch (err) {
      console.warn(`Warning: Could not parse .secrets-scan-ignore.json: ${err.message}`);
    }
  }
  return [];
}

function shouldIgnoreFile(filePath) {
  const customIgnores = loadIgnoreFile();
  const allIgnores = [...IGNORE_PATTERNS, ...customIgnores];
  
  return allIgnores.some(pattern => filePath.includes(pattern));
}

function scanFile(filePath) {
  if (shouldIgnoreFile(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const findings = [];

    PATTERNS.forEach(({ name, regex, severity }) => {
      const matches = content.matchAll(new RegExp(regex, 'g'));
      for (const match of matches) {
        const lines = content.substring(0, match.index).split('\n');
        const lineNumber = lines.length;
        const lineContent = lines[lineNumber - 1].trim();
        
        findings.push({
          file: filePath,
          line: lineNumber,
          pattern: name,
          severity,
          preview: lineContent.substring(0, 80)
        });
      }
    });

    return findings;
  } catch (err) {
    // Skip files that can't be read (binary, permissions, etc.)
    return [];
  }
}

function getAllFiles() {
  try {
    // Use git ls-files to get tracked files
    const output = execSync('git ls-files', { cwd: rootDir, encoding: 'utf8' });
    return output.trim().split('\n').filter(f => f);
  } catch (err) {
    console.error('Error: git ls-files failed. Are you in a git repository?');
    process.exit(1);
  }
}

function main() {
  console.log('🔍 Scanning repository for secrets...\n');

  const files = getAllFiles();
  let allFindings = [];

  for (const file of files) {
    const fullPath = join(rootDir, file);
    const findings = scanFile(fullPath);
    allFindings = allFindings.concat(findings);
  }

  if (allFindings.length === 0) {
    console.log('✅ No secrets detected in tracked files.\n');
    process.exit(0);
  }

  // Group by severity
  const high = allFindings.filter(f => f.severity === 'HIGH');
  const medium = allFindings.filter(f => f.severity === 'MEDIUM');

  console.error(`❌ Found ${allFindings.length} potential secret(s):\n`);

  if (high.length > 0) {
    console.error(`🔴 HIGH SEVERITY (${high.length}):`);
    high.forEach(f => {
      console.error(`  ${f.file}:${f.line} - ${f.pattern}`);
      console.error(`    ${f.preview}...\n`);
    });
  }

  if (medium.length > 0) {
    console.error(`🟡 MEDIUM SEVERITY (${medium.length}):`);
    medium.forEach(f => {
      console.error(`  ${f.file}:${f.line} - ${f.pattern}`);
      console.error(`    ${f.preview}...\n`);
    });
  }

  console.error('ℹ️  To ignore false positives, add patterns to .secrets-scan-ignore.json\n');
  process.exit(1);
}

main();
