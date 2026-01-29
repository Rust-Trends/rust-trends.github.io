#!/usr/bin/env node
/**
 * Unified SEO Benchmark Runner for Rust Trends
 * Runs all SEO audits and generates a combined report
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
  dim: (text) => `\x1b[2m${text}\x1b[0m`,
};

const SCRIPTS_DIR = __dirname;
const ROOT_DIR = path.join(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'public');

class BenchmarkRunner {
  constructor(options = {}) {
    this.options = {
      buildFirst: options.buildFirst !== false,
      verbose: options.verbose || false,
      outputDir: options.outputDir || ROOT_DIR,
    };
    this.results = {
      timestamp: new Date().toISOString(),
      buildInfo: null,
      seo: null,
      performance: null,
      html: null,
      overallScore: 0,
    };
  }

  log(message, type = 'info') {
    const prefix = {
      info: colors.blue('ℹ'),
      success: colors.green('✓'),
      error: colors.red('✗'),
      warning: colors.yellow('⚠'),
    };
    console.log(`${prefix[type] || ''} ${message}`);
  }

  header(text) {
    console.log('\n' + colors.bold(colors.cyan('═'.repeat(60))));
    console.log(colors.bold(colors.cyan(`  ${text}`)));
    console.log(colors.bold(colors.cyan('═'.repeat(60))) + '\n');
  }

  async runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: ROOT_DIR,
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        ...options,
      });

      let stdout = '';
      let stderr = '';

      if (!this.options.verbose && proc.stdout) {
        proc.stdout.on('data', (data) => { stdout += data; });
      }
      if (!this.options.verbose && proc.stderr) {
        proc.stderr.on('data', (data) => { stderr += data; });
      }

      proc.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      proc.on('error', reject);
    });
  }

  async build() {
    this.header('Building Site with Zola');

    const startTime = Date.now();

    try {
      // Check if zola is installed
      execSync('which zola', { stdio: 'pipe' });
    } catch {
      this.log('Zola not found. Please install Zola first.', 'error');
      this.log('Visit: https://www.getzola.org/documentation/getting-started/installation/', 'info');
      return false;
    }

    this.log('Running zola build...');

    const result = await this.runCommand('zola', ['build']);

    const buildTime = Date.now() - startTime;

    if (result.code !== 0) {
      this.log('Build failed!', 'error');
      if (result.stderr) console.log(result.stderr);
      return false;
    }

    this.log(`Build completed in ${(buildTime / 1000).toFixed(2)}s`, 'success');

    // Get build stats
    const htmlFiles = this.countFiles(BUILD_DIR, '.html');
    const cssFiles = this.countFiles(BUILD_DIR, '.css');
    const jsFiles = this.countFiles(BUILD_DIR, '.js');

    this.results.buildInfo = {
      success: true,
      buildTime,
      files: { html: htmlFiles, css: cssFiles, js: jsFiles },
    };

    console.log(`  HTML files: ${htmlFiles}`);
    console.log(`  CSS files:  ${cssFiles}`);
    console.log(`  JS files:   ${jsFiles}`);

    return true;
  }

  countFiles(dir, ext) {
    let count = 0;
    try {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        if (file.isDirectory()) {
          count += this.countFiles(path.join(dir, file.name), ext);
        } else if (file.name.endsWith(ext)) {
          count++;
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return count;
  }

  async runSEOAudit() {
    this.header('Running SEO Audit');

    const result = await this.runCommand('node', [
      path.join(SCRIPTS_DIR, 'seo-audit.js'),
      BUILD_DIR,
    ]);

    // Read the generated report
    const reportPath = path.join(ROOT_DIR, 'seo-report.json');
    if (fs.existsSync(reportPath)) {
      this.results.seo = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      this.log(`SEO Score: ${this.results.seo.summary.score}%`,
        this.results.seo.summary.score >= 80 ? 'success' : 'warning');
    }

    return result.code === 0;
  }

  async runPerformanceAudit() {
    this.header('Running Performance Audit');

    const result = await this.runCommand('node', [
      path.join(SCRIPTS_DIR, 'performance-audit.js'),
      BUILD_DIR,
    ]);

    // Read the generated report
    const reportPath = path.join(ROOT_DIR, 'performance-report.json');
    if (fs.existsSync(reportPath)) {
      this.results.performance = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      this.log(`Performance Score: ${this.results.performance.summary.score}/100`,
        this.results.performance.summary.score >= 80 ? 'success' : 'warning');
    }

    return result.code === 0;
  }

  async runHTMLValidation() {
    this.header('Running HTML Validation');

    const result = await this.runCommand('node', [
      path.join(SCRIPTS_DIR, 'html-validator.js'),
      BUILD_DIR,
    ]);

    // Read the generated report
    const reportPath = path.join(ROOT_DIR, 'html-validation-report.json');
    if (fs.existsSync(reportPath)) {
      this.results.html = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      this.log(`Validation Score: ${this.results.html.summary.score}%`,
        this.results.html.summary.score >= 90 ? 'success' : 'warning');
    }

    return result.code === 0;
  }

  calculateOverallScore() {
    const scores = [];

    if (this.results.seo?.summary?.score) {
      scores.push({ name: 'SEO', score: this.results.seo.summary.score, weight: 0.4 });
    }
    if (this.results.performance?.summary?.score) {
      scores.push({ name: 'Performance', score: this.results.performance.summary.score, weight: 0.35 });
    }
    if (this.results.html?.summary?.score) {
      scores.push({ name: 'HTML', score: this.results.html.summary.score, weight: 0.25 });
    }

    if (scores.length === 0) return 0;

    const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
    const weightedSum = scores.reduce((sum, s) => sum + (s.score * s.weight), 0);

    return Math.round(weightedSum / totalWeight);
  }

  generateReport() {
    this.header('Final Report');

    this.results.overallScore = this.calculateOverallScore();

    // Print summary table
    console.log(colors.bold('Category Scores:'));
    console.log(colors.dim('─'.repeat(40)));

    if (this.results.seo) {
      const score = this.results.seo.summary.score;
      const color = score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
      console.log(`  SEO:         ${color(score + '%'.padStart(4))}`);
      console.log(`    Passed:    ${this.results.seo.summary.passed}`);
      console.log(`    Warnings:  ${this.results.seo.summary.warnings}`);
      console.log(`    Errors:    ${this.results.seo.summary.errors}`);
    }

    if (this.results.performance) {
      const score = this.results.performance.summary.score;
      const color = score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
      console.log(`  Performance: ${color((score + '/100').padStart(7))}`);
      console.log(`    Issues:    ${this.results.performance.summary.issues}`);
      console.log(`    Tips:      ${this.results.performance.summary.recommendations}`);
    }

    if (this.results.html) {
      const score = this.results.html.summary.score;
      const color = score >= 90 ? colors.green : score >= 70 ? colors.yellow : colors.red;
      console.log(`  HTML:        ${color(score + '%'.padStart(4))}`);
      console.log(`    Valid:     ${this.results.html.summary.validFiles}/${this.results.html.summary.filesValidated}`);
      console.log(`    Errors:    ${this.results.html.summary.totalErrors}`);
      console.log(`    Warnings:  ${this.results.html.summary.totalWarnings}`);
    }

    console.log(colors.dim('─'.repeat(40)));

    const overallColor = this.results.overallScore >= 80 ? colors.green
      : this.results.overallScore >= 60 ? colors.yellow : colors.red;

    console.log(colors.bold(`\n  OVERALL SCORE: ${overallColor(this.results.overallScore + '%')}\n`));

    // Grade
    let grade = 'F';
    if (this.results.overallScore >= 95) grade = 'A+';
    else if (this.results.overallScore >= 90) grade = 'A';
    else if (this.results.overallScore >= 85) grade = 'A-';
    else if (this.results.overallScore >= 80) grade = 'B+';
    else if (this.results.overallScore >= 75) grade = 'B';
    else if (this.results.overallScore >= 70) grade = 'B-';
    else if (this.results.overallScore >= 65) grade = 'C+';
    else if (this.results.overallScore >= 60) grade = 'C';
    else if (this.results.overallScore >= 55) grade = 'C-';
    else if (this.results.overallScore >= 50) grade = 'D';

    console.log(`  Grade: ${overallColor(grade)}\n`);

    // Top recommendations
    console.log(colors.bold('Top Recommendations:'));
    console.log(colors.dim('─'.repeat(40)));

    const recommendations = [];

    if (this.results.seo?.summary?.errors > 0) {
      recommendations.push(`Fix ${this.results.seo.summary.errors} SEO errors (see seo-report.json)`);
    }
    if (this.results.performance?.summary?.issues > 0) {
      recommendations.push(`Address ${this.results.performance.summary.issues} performance issues`);
    }
    if (this.results.html?.summary?.totalErrors > 0) {
      recommendations.push(`Fix ${this.results.html.summary.totalErrors} HTML validation errors`);
    }

    // Add specific tips
    if (this.results.seo?.pages) {
      const pagesWithoutOgImage = this.results.seo.pages.filter(p =>
        p.warnings.some(w => w.includes('og:image'))
      ).length;
      if (pagesWithoutOgImage > 0) {
        recommendations.push(`Add og:image to ${pagesWithoutOgImage} pages for better social sharing`);
      }
    }

    if (recommendations.length === 0) {
      console.log(colors.green('  Great job! No critical issues found.'));
    } else {
      recommendations.slice(0, 5).forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }

    // Save combined report
    const reportPath = path.join(this.options.outputDir, 'seo-benchmark-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n${colors.dim('Full report saved to: ' + reportPath)}`);

    return this.results.overallScore >= 70 ? 0 : 1;
  }

  async run() {
    console.log(colors.bold('\n🔍 Rust Trends SEO Benchmark Suite\n'));
    console.log(`Started: ${new Date().toLocaleString()}`);
    console.log(`Build dir: ${BUILD_DIR}\n`);

    // Build if needed
    if (this.options.buildFirst) {
      const buildSuccess = await this.build();
      if (!buildSuccess) {
        this.log('Build failed, cannot continue with audits', 'error');
        process.exit(1);
      }
    } else if (!fs.existsSync(BUILD_DIR)) {
      this.log('Build directory not found. Running build first...', 'warning');
      const buildSuccess = await this.build();
      if (!buildSuccess) {
        process.exit(1);
      }
    }

    // Run all audits
    await this.runSEOAudit();
    await this.runPerformanceAudit();
    await this.runHTMLValidation();

    // Generate final report
    const exitCode = this.generateReport();

    console.log(`\nCompleted: ${new Date().toLocaleString()}`);

    return exitCode;
  }
}

// CLI handling
const args = process.argv.slice(2);
const options = {
  buildFirst: !args.includes('--no-build'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${colors.bold('Rust Trends SEO Benchmark Suite')}

Usage: node benchmark-runner.js [options]

Options:
  --no-build    Skip the Zola build step (use existing build)
  --verbose     Show detailed output from each audit
  --help, -h    Show this help message

Individual Scripts:
  npm run seo:audit        Run SEO audit only
  npm run seo:performance  Run performance audit only
  npm run seo:validate-html Run HTML validation only
  npm run seo:benchmark    Run all audits (this script)

Reports Generated:
  seo-report.json           Detailed SEO findings
  performance-report.json   Performance metrics
  html-validation-report.json HTML validation results
  seo-benchmark-report.json Combined summary report
`);
  process.exit(0);
}

const runner = new BenchmarkRunner(options);
runner.run()
  .then(exitCode => process.exit(exitCode))
  .catch(err => {
    console.error(colors.red('Error:'), err.message);
    process.exit(1);
  });
