const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const { integrateZaDark, bundleWineRuntime } = require('./build.js');

const BASE_DIR = path.join(__dirname, '..');
const APP_DIR = path.join(BASE_DIR, 'app');
const DIST_DIR = path.join(BASE_DIR, 'dist');
const WINE_DIR = path.join(APP_DIR, 'native', 'wine-runtime');

// Builds a .deb from the prepared app directory (run "npm run main:setup" first).
//
//   node scripts/build-deb.js              ZaDark, no wine
//   node scripts/build-deb.js --full       ZaDark, wine bundled (calls work offline)
//   node scripts/build-deb.js --original   no ZaDark (needs a freshly prepared app/)
async function main() {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const original = args.includes('--original');

  const packageJsonBakPath = path.join(APP_DIR, 'package.json.bak');
  if (!fs.existsSync(packageJsonBakPath)) {
    logger.error('app/package.json.bak not found - run "npm run main:setup" first');
    process.exit(1);
  }
  const zaloVersion = JSON.parse(fs.readFileSync(packageJsonBakPath, 'utf8')).version;
  const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

  let zadarkVersion = null;
  if (original) {
    // ZaDark patches app/ in place and cannot be cleanly removed from it.
    if (fs.existsSync(path.join(APP_DIR, 'pc-dist', 'zadark'))) {
      logger.error('app/ already contains ZaDark - run "npm run prepare-app" to reset it first');
      process.exit(1);
    }
  } else {
    await integrateZaDark();
    zadarkVersion = JSON.parse(fs.readFileSync(
      path.join(BASE_DIR, 'plugins', 'zadark', 'package.json'), 'utf8')).version;
  }

  const flavor = zadarkVersion ? `+ZaDark-${zadarkVersion}` : '-Original';
  const variant = full ? '-Full' : '';
  // ${arch} is expanded by electron-builder to the Debian arch (amd64, arm64)
  const artifactName = `Zalo-${zaloVersion}${flavor}-${commitHash}${variant}_\${arch}.deb`;

  logger.step(`Building .deb: Zalo ${zaloVersion}${zadarkVersion ? ` + ZaDark ${zadarkVersion}` : ''}${full ? ' (Full — wine bundled)' : ''}`);

  // Never let a leftover runtime bloat a non-Full package.
  fs.rmSync(WINE_DIR, { recursive: true, force: true });

  try {
    if (full) await bundleWineRuntime();

    fs.writeFileSync(path.join(APP_DIR, 'pc-dist', 'build-info.json'), JSON.stringify({
      version: zaloVersion,
      zadarkVersion,
      commit: commitHash,
      buildDate: new Date().toISOString()
    }, null, 2), 'utf8');

    const author = require(path.join(BASE_DIR, 'package.json')).author;
    const buildCommand = [
      'npx electron-builder --linux deb',
      `--config.linux.artifactName='${artifactName}'`,
      `-c.extraMetadata.version=${zaloVersion}`,
      `-c.linux.maintainer='${author} <${author}@users.noreply.github.com>'`,
      '--publish=never'
    ].join(' ');
    logger.dim(`Command: ${buildCommand}`);
    execSync(buildCommand, { cwd: BASE_DIR, stdio: 'inherit' });
  } catch (error) {
    logger.error('.deb build failed:', error.message);
    process.exit(1);
  } finally {
    fs.rmSync(WINE_DIR, { recursive: true, force: true });
  }

  const debName = fs.readdirSync(DIST_DIR)
    .filter((f) => f.endsWith('.deb') && f.startsWith(artifactName.split('_${arch}')[0] + '_'))
    .map((f) => ({ f, t: fs.statSync(path.join(DIST_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]?.f;
  if (!debName) {
    logger.warn('Build finished but the .deb was not found in dist/');
    return;
  }
  const size = Math.round(fs.statSync(path.join(DIST_DIR, debName)).size / 1024 / 1024);
  logger.success(`Built dist/${debName} (${size}MB)`);
  logger.dim(`Install: sudo apt install ./dist/${debName}`);
}

if (require.main === module) {
  main();
}

module.exports = { main };
