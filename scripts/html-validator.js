#!/usr/bin/env node
/**
 * HTML Validation Script for Rust Trends
 * Validates HTML structure and common issues
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// ANSI color codes
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
  dim: (text) => `\x1b[2m${text}\x1b[0m`,
};

class HTMLValidator {
  constructor(buildDir) {
    this.buildDir = buildDir;
    this.results = [];
  }

  validateHTML(html, filePath) {
    const errors = [];
    const warnings = [];
    const relativePath = path.relative(this.buildDir, filePath);

    // Check for DOCTYPE
    if (!html.trim().toLowerCase().startsWith('<!doctype html')) {
      errors.push('Missing DOCTYPE declaration');
    }

    // Check for required elements
    if (!/<html[^>]*>/i.test(html)) {
      errors.push('Missing <html> tag');
    }
    if (!/<head[^>]*>/i.test(html)) {
      errors.push('Missing <head> tag');
    }
    if (!/<body[^>]*>/i.test(html)) {
      errors.push('Missing <body> tag');
    }
    if (!/<title[^>]*>/i.test(html)) {
      errors.push('Missing <title> tag');
    }

    // Check for lang attribute
    if (/<html[^>]*>/i.test(html) && !/<html[^>]*lang=/i.test(html)) {
      errors.push('Missing lang attribute on <html>');
    }

    // Check for charset
    if (!/<meta[^>]*charset/i.test(html)) {
      errors.push('Missing charset meta tag');
    }

    // Check for viewport
    if (!/<meta[^>]*viewport/i.test(html)) {
      warnings.push('Missing viewport meta tag (important for mobile)');
    }

    // Check for unclosed tags (common self-closing tags)
    const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];

    // Check for images without alt
    const imgMatches = html.matchAll(/<img[^>]*>/gi);
    for (const match of imgMatches) {
      if (!/alt=/i.test(match[0])) {
        const srcMatch = match[0].match(/src=["']([^"']*)/i);
        const src = srcMatch ? srcMatch[1] : 'unknown';
        warnings.push(`Image missing alt attribute: ${src.substring(0, 50)}`);
      }
    }

    // Check for empty links
    const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi);
    for (const match of linkMatches) {
      const href = match[1];
      const content = match[2].replace(/<[^>]*>/g, '').trim();
      if (!content && !/<img/i.test(match[2])) {
        warnings.push(`Empty link found: ${href.substring(0, 50)}`);
      }
      if (href === '#' || href === '') {
        warnings.push(`Link with empty href: "${content.substring(0, 30)}"`);
      }
    }

    // Check for duplicate IDs
    const idMatches = html.matchAll(/\sid=["']([^"']+)["']/gi);
    const ids = new Map();
    for (const match of idMatches) {
      const id = match[1];
      if (ids.has(id)) {
        errors.push(`Duplicate ID found: "${id}"`);
      }
      ids.set(id, true);
    }

    // Check for deprecated tags
    const deprecatedTags = ['center', 'font', 'marquee', 'blink', 'frame', 'frameset', 'noframes'];
    for (const tag of deprecatedTags) {
      const regex = new RegExp(`<${tag}[\\s>]`, 'i');
      if (regex.test(html)) {
        warnings.push(`Deprecated tag used: <${tag}>`);
      }
    }

    // Check for inline styles (excessive use)
    const inlineStyles = (html.match(/style=["'][^"']+["']/gi) || []).length;
    if (inlineStyles > 20) {
      warnings.push(`Excessive inline styles: ${inlineStyles} occurrences`);
    }

    // Check for inline event handlers
    const eventHandlers = ['onclick', 'onmouseover', 'onmouseout', 'onload', 'onerror', 'onchange', 'onsubmit'];
    for (const handler of eventHandlers) {
      const regex = new RegExp(`${handler}=["']`, 'gi');
      const matches = html.match(regex) || [];
      if (matches.length > 0) {
        warnings.push(`Inline event handler "${handler}" found (${matches.length}x) - consider using addEventListener`);
      }
    }

    // Check for broken relative links (basic check)
    const relLinkMatches = html.matchAll(/(?:href|src)=["'](?!http|\/\/|#|mailto:|tel:|javascript:)([^"']+)["']/gi);
    for (const match of relLinkMatches) {
      const link = match[1];
      // Flag suspicious patterns
      if (link.includes('..') && link.split('..').length > 3) {
        warnings.push(`Deep relative path: ${link.substring(0, 50)}`);
      }
    }

    // Check for proper nesting of block/inline elements
    const blockInInline = html.match(/<(a|span|em|strong|b|i)[^>]*>[\s\S]*?<(div|p|h[1-6]|ul|ol|li|table|form)/gi);
    if (blockInInline) {
      warnings.push('Block element possibly nested inside inline element');
    }

    // Check for multiple H1 tags
    const h1Matches = html.match(/<h1[^>]*>/gi) || [];
    if (h1Matches.length > 1) {
      warnings.push(`Multiple H1 tags found (${h1Matches.length}) - should typically have only one`);
    }
    if (h1Matches.length === 0) {
      warnings.push('No H1 tag found');
    }

    // Check heading hierarchy
    const headings = [];
    const headingMatches = html.matchAll(/<h([1-6])[^>]*>/gi);
    for (const match of headingMatches) {
      headings.push(parseInt(match[1]));
    }
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] - headings[i - 1] > 1) {
        warnings.push(`Heading level skipped: H${headings[i - 1]} to H${headings[i]}`);
        break;
      }
    }

    // Check for forms without labels
    const inputMatches = html.matchAll(/<input[^>]*type=["'](?!hidden|submit|button|reset)([^"']*)["'][^>]*>/gi);
    for (const match of inputMatches) {
      const idMatch = match[0].match(/id=["']([^"']+)["']/i);
      if (idMatch) {
        const labelRegex = new RegExp(`<label[^>]*for=["']${idMatch[1]}["']`, 'i');
        if (!labelRegex.test(html)) {
          warnings.push(`Input "${idMatch[1]}" may be missing associated label`);
        }
      }
    }

    // Check for tables without headers
    if (/<table[^>]*>/i.test(html)) {
      if (!/<th[^>]*>/i.test(html)) {
        warnings.push('Table found without header cells (<th>)');
      }
    }

    // Note: Unquoted attributes are valid in HTML5, so we don't warn about them
    // Only check for truly malformed attributes (e.g., missing value after =)
    const malformedAttr = html.match(/\s[a-z-]+=(?=[\s>])/gi);
    if (malformedAttr) {
      for (const attr of malformedAttr.slice(0, 3)) {
        warnings.push(`Attribute with empty value: ${attr.trim()}`);
      }
    }

    // Check for script tags in head without async/defer
    const headContent = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (headContent) {
      const headScripts = headContent[1].matchAll(/<script[^>]*src=["'][^"']+["'][^>]*>/gi);
      for (const script of headScripts) {
        if (!/async|defer/i.test(script[0])) {
          warnings.push('Script in <head> without async/defer may block rendering');
        }
      }
    }

    return {
      path: relativePath,
      errors,
      warnings,
      valid: errors.length === 0,
    };
  }

  async run() {
    console.log(colors.bold('\n=== HTML Validation Report ===\n'));
    console.log(`Build directory: ${this.buildDir}\n`);

    const files = await glob('**/*.html', { cwd: this.buildDir });

    if (files.length === 0) {
      console.log(colors.red('No HTML files found. Run "zola build" first.'));
      process.exit(1);
    }

    console.log(`Validating ${files.length} HTML files\n`);
    console.log(colors.dim('─'.repeat(60)));

    let totalErrors = 0;
    let totalWarnings = 0;
    let validFiles = 0;

    for (const file of files) {
      const filePath = path.join(this.buildDir, file);
      const html = fs.readFileSync(filePath, 'utf-8');
      const result = this.validateHTML(html, filePath);
      this.results.push(result);

      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
      if (result.valid) validFiles++;

      const status = result.errors.length > 0
        ? colors.red('✗')
        : result.warnings.length > 0
          ? colors.yellow('⚠')
          : colors.green('✓');

      // Only show files with issues
      if (result.errors.length > 0 || result.warnings.length > 0) {
        console.log(`\n${status} ${colors.bold(result.path)}`);

        for (const error of result.errors) {
          console.log(`  ${colors.red('ERROR:')} ${error}`);
        }
        for (const warning of result.warnings.slice(0, 5)) {
          console.log(`  ${colors.yellow('WARN:')} ${warning}`);
        }
        if (result.warnings.length > 5) {
          console.log(`  ${colors.dim(`... and ${result.warnings.length - 5} more warnings`)}`);
        }
      }
    }

    // Summary
    console.log('\n' + colors.dim('─'.repeat(60)));
    console.log(colors.bold('\n=== Summary ===\n'));

    console.log(`Files validated: ${files.length}`);
    console.log(`${colors.green('Valid:')} ${validFiles}`);
    console.log(`${colors.red('Errors:')} ${totalErrors}`);
    console.log(`${colors.yellow('Warnings:')} ${totalWarnings}`);

    // Validation score
    const score = Math.round((validFiles / files.length) * 100);
    console.log(`\nValidation Score: ${score >= 90 ? colors.green(score + '%') : score >= 70 ? colors.yellow(score + '%') : colors.red(score + '%')}`);

    // Save report
    const reportPath = path.join(this.buildDir, '..', 'html-validation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        filesValidated: files.length,
        validFiles,
        totalErrors,
        totalWarnings,
        score,
      },
      files: this.results,
    }, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);

    return totalErrors === 0 ? 0 : 1;
  }
}

// Main execution
const buildDir = process.argv[2] || path.join(__dirname, '..', 'public');
const validator = new HTMLValidator(buildDir);

validator.run()
  .then(exitCode => process.exit(exitCode))
  .catch(err => {
    console.error(colors.red('Error:'), err.message);
    process.exit(1);
  });
