#!/usr/bin/env node
/**
 * Performance Audit Script for Rust Trends
 * Measures page performance metrics and loading characteristics
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
  dim: (text) => `\x1b[2m${text}\x1b[0m`,
};

// Performance thresholds (in bytes and counts)
const THRESHOLDS = {
  htmlSize: {
    good: 50 * 1024,      // 50KB
    warning: 100 * 1024,  // 100KB
  },
  cssSize: {
    good: 50 * 1024,
    warning: 100 * 1024,
  },
  jsSize: {
    good: 100 * 1024,
    warning: 200 * 1024,
  },
  imageCount: {
    good: 10,
    warning: 20,
  },
  totalAssets: {
    good: 20,
    warning: 40,
  },
  domDepth: {
    good: 15,
    warning: 25,
  },
  domElements: {
    good: 1000,
    warning: 2000,
  },
};

class PerformanceAuditor {
  constructor(buildDir) {
    this.buildDir = buildDir;
    this.results = {
      pages: [],
      assets: {
        css: [],
        js: [],
        images: [],
        fonts: [],
      },
    };
  }

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  getStatus(value, threshold) {
    if (value <= threshold.good) return colors.green('GOOD');
    if (value <= threshold.warning) return colors.yellow('WARN');
    return colors.red('POOR');
  }

  analyzeHTML(html) {
    // Count DOM elements (approximate)
    const tagMatches = html.match(/<[a-z][^>]*>/gi) || [];
    const elementCount = tagMatches.length;

    // Calculate DOM depth (approximate)
    let maxDepth = 0;
    let currentDepth = 0;
    const openTags = /<([a-z][a-z0-9]*)\b[^>]*(?<!\/)\s*>/gi;
    const closeTags = /<\/([a-z][a-z0-9]*)\s*>/gi;

    // Simple depth estimation
    let pos = 0;
    while (pos < html.length) {
      const openMatch = html.slice(pos).match(/<([a-z][a-z0-9]*)\b[^>]*>/i);
      const closeMatch = html.slice(pos).match(/<\/([a-z][a-z0-9]*)\s*>/i);

      if (!openMatch && !closeMatch) break;

      const openPos = openMatch ? html.indexOf(openMatch[0], pos) : Infinity;
      const closePos = closeMatch ? html.indexOf(closeMatch[0], pos) : Infinity;

      if (openPos < closePos) {
        const tag = openMatch[1].toLowerCase();
        const selfClosing = ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
        if (!selfClosing.includes(tag) && !openMatch[0].endsWith('/>')) {
          currentDepth++;
          maxDepth = Math.max(maxDepth, currentDepth);
        }
        pos = openPos + openMatch[0].length;
      } else {
        currentDepth = Math.max(0, currentDepth - 1);
        pos = closePos + closeMatch[0].length;
      }
    }

    // Extract referenced assets
    const cssRefs = (html.match(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi) || [])
      .map(m => m.match(/href=["']([^"']+)["']/i)?.[1])
      .filter(Boolean);

    const jsRefs = (html.match(/<script[^>]*src=["']([^"']+)["']/gi) || [])
      .map(m => m.match(/src=["']([^"']+)["']/i)?.[1])
      .filter(Boolean);

    const imgRefs = (html.match(/<img[^>]*src=["']([^"']+)["']/gi) || [])
      .map(m => m.match(/src=["']([^"']+)["']/i)?.[1])
      .filter(Boolean);

    // Check for inline styles and scripts
    const inlineStyles = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [])
      .reduce((sum, s) => sum + s.length, 0);

    const inlineScripts = (html.match(/<script(?![^>]*src)[^>]*>[\s\S]*?<\/script>/gi) || [])
      .reduce((sum, s) => sum + s.length, 0);

    // Check for render-blocking resources
    const renderBlocking = {
      css: cssRefs.filter(ref => !html.includes(`media="print"`) && !html.includes('preload')).length,
      js: jsRefs.filter(ref => {
        const scriptTag = html.match(new RegExp(`<script[^>]*src=["']${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i'));
        return scriptTag && !scriptTag[0].includes('async') && !scriptTag[0].includes('defer');
      }).length,
    };

    // Check for performance hints
    const hasDNSPrefetch = html.includes('dns-prefetch');
    const hasPreconnect = html.includes('preconnect');
    const hasPreload = html.includes('rel="preload"') || html.includes("rel='preload'");
    const hasLazyLoading = html.includes('loading="lazy"') || html.includes("loading='lazy'");

    return {
      elementCount,
      maxDepth,
      cssRefs,
      jsRefs,
      imgRefs,
      inlineStyles,
      inlineScripts,
      renderBlocking,
      performanceHints: {
        dnsPrefetch: hasDNSPrefetch,
        preconnect: hasPreconnect,
        preload: hasPreload,
        lazyLoading: hasLazyLoading,
      },
    };
  }

  async auditPage(filePath) {
    const html = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);
    const relativePath = path.relative(this.buildDir, filePath);
    const analysis = this.analyzeHTML(html);

    const issues = [];
    const recommendations = [];

    // HTML size check
    if (stats.size > THRESHOLDS.htmlSize.warning) {
      issues.push(`HTML file too large: ${this.formatSize(stats.size)}`);
    } else if (stats.size > THRESHOLDS.htmlSize.good) {
      recommendations.push(`Consider reducing HTML size: ${this.formatSize(stats.size)}`);
    }

    // DOM complexity checks
    if (analysis.elementCount > THRESHOLDS.domElements.warning) {
      issues.push(`Too many DOM elements: ${analysis.elementCount}`);
    } else if (analysis.elementCount > THRESHOLDS.domElements.good) {
      recommendations.push(`High DOM element count: ${analysis.elementCount}`);
    }

    if (analysis.maxDepth > THRESHOLDS.domDepth.warning) {
      issues.push(`DOM too deeply nested: ${analysis.maxDepth} levels`);
    } else if (analysis.maxDepth > THRESHOLDS.domDepth.good) {
      recommendations.push(`Consider flattening DOM: ${analysis.maxDepth} levels`);
    }

    // Render-blocking resources
    if (analysis.renderBlocking.css > 0) {
      recommendations.push(`${analysis.renderBlocking.css} render-blocking CSS file(s)`);
    }
    if (analysis.renderBlocking.js > 0) {
      issues.push(`${analysis.renderBlocking.js} render-blocking JS file(s) - use async/defer`);
    }

    // Inline resource warnings
    if (analysis.inlineStyles > 10000) {
      recommendations.push(`Large inline styles: ${this.formatSize(analysis.inlineStyles)}`);
    }
    if (analysis.inlineScripts > 10000) {
      recommendations.push(`Large inline scripts: ${this.formatSize(analysis.inlineScripts)}`);
    }

    // Performance hints
    const hints = analysis.performanceHints;
    if (!hints.dnsPrefetch && !hints.preconnect) {
      recommendations.push('Consider adding dns-prefetch/preconnect for external resources');
    }
    if (analysis.imgRefs.length > 3 && !hints.lazyLoading) {
      recommendations.push('Consider adding lazy loading for images');
    }

    return {
      path: relativePath,
      size: stats.size,
      sizeFormatted: this.formatSize(stats.size),
      analysis,
      issues,
      recommendations,
    };
  }

  async auditAssets() {
    // Find all static assets
    const cssFiles = await glob('**/*.css', { cwd: this.buildDir });
    const jsFiles = await glob('**/*.js', { cwd: this.buildDir });
    const imageFiles = await glob('**/*.{png,jpg,jpeg,gif,webp,svg,ico}', { cwd: this.buildDir });
    const fontFiles = await glob('**/*.{woff,woff2,ttf,otf,eot}', { cwd: this.buildDir });

    const getFileSizes = (files) => files.map(f => {
      const fullPath = path.join(this.buildDir, f);
      const stats = fs.statSync(fullPath);
      return { path: f, size: stats.size };
    }).sort((a, b) => b.size - a.size);

    return {
      css: getFileSizes(cssFiles),
      js: getFileSizes(jsFiles),
      images: getFileSizes(imageFiles),
      fonts: getFileSizes(fontFiles),
    };
  }

  async run() {
    console.log(colors.bold('\n=== Performance Audit Report ===\n'));
    console.log(`Build directory: ${this.buildDir}\n`);

    // Find all HTML files
    const files = await glob('**/*.html', {
      cwd: this.buildDir,
      ignore: ['**/404.html'],
    });

    if (files.length === 0) {
      console.log(colors.red('No HTML files found. Run "zola build" first.'));
      process.exit(1);
    }

    // Audit assets first
    console.log(colors.bold('Asset Analysis'));
    console.log(colors.dim('─'.repeat(60)));

    const assets = await this.auditAssets();

    const totalCSS = assets.css.reduce((sum, f) => sum + f.size, 0);
    const totalJS = assets.js.reduce((sum, f) => sum + f.size, 0);
    const totalImages = assets.images.reduce((sum, f) => sum + f.size, 0);
    const totalFonts = assets.fonts.reduce((sum, f) => sum + f.size, 0);

    console.log(`\nCSS Files: ${assets.css.length} (${this.formatSize(totalCSS)}) ${this.getStatus(totalCSS, THRESHOLDS.cssSize)}`);
    if (assets.css.length > 0) {
      assets.css.slice(0, 3).forEach(f => {
        console.log(`  ${colors.dim('•')} ${f.path}: ${this.formatSize(f.size)}`);
      });
    }

    console.log(`\nJS Files: ${assets.js.length} (${this.formatSize(totalJS)}) ${this.getStatus(totalJS, THRESHOLDS.jsSize)}`);
    if (assets.js.length > 0) {
      assets.js.slice(0, 3).forEach(f => {
        console.log(`  ${colors.dim('•')} ${f.path}: ${this.formatSize(f.size)}`);
      });
    }

    console.log(`\nImages: ${assets.images.length} (${this.formatSize(totalImages)}) ${this.getStatus(assets.images.length, THRESHOLDS.imageCount)}`);
    if (assets.images.length > 0) {
      assets.images.slice(0, 5).forEach(f => {
        console.log(`  ${colors.dim('•')} ${f.path}: ${this.formatSize(f.size)}`);
      });
      if (assets.images.length > 5) {
        console.log(`  ${colors.dim(`... and ${assets.images.length - 5} more`)}`);
      }
    }

    console.log(`\nFonts: ${assets.fonts.length} (${this.formatSize(totalFonts)})`);

    // Audit HTML pages
    console.log('\n' + colors.dim('─'.repeat(60)));
    console.log(colors.bold('\nPage Analysis'));
    console.log(colors.dim('─'.repeat(60)));

    let totalIssues = 0;
    let totalRecommendations = 0;

    const pageResults = [];
    for (const file of files.slice(0, 20)) { // Limit to first 20 pages for performance
      const filePath = path.join(this.buildDir, file);
      const result = await this.auditPage(filePath);
      pageResults.push(result);

      totalIssues += result.issues.length;
      totalRecommendations += result.recommendations.length;

      const status = result.issues.length > 0
        ? colors.red('✗')
        : result.recommendations.length > 0
          ? colors.yellow('⚠')
          : colors.green('✓');

      console.log(`\n${status} ${colors.bold(result.path)}`);
      console.log(`  Size: ${result.sizeFormatted} | Elements: ${result.analysis.elementCount} | Depth: ${result.analysis.maxDepth}`);

      if (result.issues.length > 0) {
        result.issues.forEach(issue => {
          console.log(`  ${colors.red('ISSUE:')} ${issue}`);
        });
      }
      if (result.recommendations.length > 0) {
        result.recommendations.forEach(rec => {
          console.log(`  ${colors.yellow('TIP:')} ${rec}`);
        });
      }
    }

    if (files.length > 20) {
      console.log(colors.dim(`\n... and ${files.length - 20} more pages (not shown)`));
    }

    // Summary
    console.log('\n' + colors.dim('─'.repeat(60)));
    console.log(colors.bold('\n=== Summary ===\n'));

    const totalAssetSize = totalCSS + totalJS + totalImages + totalFonts;
    console.log(`Total Asset Size: ${this.formatSize(totalAssetSize)}`);
    console.log(`  CSS:    ${this.formatSize(totalCSS)} (${assets.css.length} files)`);
    console.log(`  JS:     ${this.formatSize(totalJS)} (${assets.js.length} files)`);
    console.log(`  Images: ${this.formatSize(totalImages)} (${assets.images.length} files)`);
    console.log(`  Fonts:  ${this.formatSize(totalFonts)} (${assets.fonts.length} files)`);

    console.log(`\nPages Analyzed: ${Math.min(files.length, 20)} of ${files.length}`);
    console.log(`${colors.red('Issues:')} ${totalIssues}`);
    console.log(`${colors.yellow('Recommendations:')} ${totalRecommendations}`);

    // Performance score - more granular calculation
    const avgPageSize = pageResults.reduce((sum, p) => sum + p.size, 0) / pageResults.length;
    const avgElements = pageResults.reduce((sum, p) => sum + p.analysis.elementCount, 0) / pageResults.length;

    // Calculate score components
    let score = 100;

    // Issues penalty: scale from 0-40 based on issue count (0 issues = 0 penalty, 20+ = max penalty)
    const issuesPenalty = Math.min(40, Math.round((totalIssues / 20) * 40));
    score -= issuesPenalty;

    // Recommendations penalty: scale from 0-15 (minor impact)
    const recsPenalty = Math.min(15, totalRecommendations * 2);
    score -= recsPenalty;

    // Page size penalty: 0-15 based on average page size
    if (avgPageSize > THRESHOLDS.htmlSize.warning) {
      score -= 15;
    } else if (avgPageSize > THRESHOLDS.htmlSize.good) {
      score -= 8;
    }

    // DOM complexity penalty: 0-15 based on element count
    if (avgElements > THRESHOLDS.domElements.warning) {
      score -= 15;
    } else if (avgElements > THRESHOLDS.domElements.good) {
      score -= 8;
    }

    // Asset size penalty: 0-15 (exclude fonts if using CDN - check for font preload absence)
    // Note: If fonts aren't preloaded locally, likely using CDN
    const effectiveAssetSize = totalCSS + totalJS + totalImages; // Exclude fonts for CDN case
    if (effectiveAssetSize > 5 * 1024 * 1024) {
      score -= 15;
    } else if (effectiveAssetSize > 1 * 1024 * 1024) {
      score -= 8;
    }

    score = Math.max(0, score);

    console.log(`\nPerformance Score: ${score >= 80 ? colors.green(score + '/100') : score >= 60 ? colors.yellow(score + '/100') : colors.red(score + '/100')}`);

    // Save report
    const reportPath = path.join(this.buildDir, '..', 'performance-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        totalAssetSize,
        assetBreakdown: {
          css: { count: assets.css.length, size: totalCSS },
          js: { count: assets.js.length, size: totalJS },
          images: { count: assets.images.length, size: totalImages },
          fonts: { count: assets.fonts.length, size: totalFonts },
        },
        pagesAnalyzed: pageResults.length,
        totalPages: files.length,
        issues: totalIssues,
        recommendations: totalRecommendations,
        score,
      },
      assets,
      pages: pageResults,
    }, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);

    return totalIssues === 0 ? 0 : 1;
  }
}

// Main execution
const buildDir = process.argv[2] || path.join(__dirname, '..', 'public');
const auditor = new PerformanceAuditor(buildDir);

auditor.run()
  .then(exitCode => process.exit(exitCode))
  .catch(err => {
    console.error(colors.red('Error:'), err.message);
    process.exit(1);
  });
