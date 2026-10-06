#!/usr/bin/env node
/**
 * Performance Audit Script for Rust Trends
 * Measures page performance metrics and loading characteristics
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const { parseDocument, DomUtils } = require('htmlparser2');

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
  // HTML + same-origin CSS/JS + eagerly loaded images that one page view downloads
  pageWeight: {
    good: 500 * 1024,
    warning: 1024 * 1024,
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

  // Parse with a real HTML parser: Zola's minifier drops optional end tags
  // (</p>, </li>) and attribute quotes, which regex-based parsing misreads.
  analyzeHTML(html) {
    const doc = parseDocument(html, { lowerCaseTags: true, lowerCaseAttributeNames: true });
    const elements = DomUtils.findAll(() => true, doc.children);
    const elementCount = elements.length;

    const depthOf = (node) => {
      const kids = (node.children || []).filter(c => c.type === 'tag' || c.type === 'script' || c.type === 'style');
      return kids.length === 0 ? 0 : 1 + Math.max(...kids.map(depthOf));
    };
    const maxDepth = depthOf(doc);

    const inNoscript = (el) => {
      for (let p = el.parent; p; p = p.parent) if (p.name === 'noscript') return true;
      return false;
    };
    const rels = (el) => (el.attribs.rel || '').toLowerCase().split(/\s+/);
    const live = elements.filter(el => !inNoscript(el));

    const stylesheets = live.filter(el => el.name === 'link' && rels(el).includes('stylesheet') && el.attribs.href);
    const scripts = live.filter(el => el.name === 'script' && el.attribs.src);
    const images = live.filter(el => el.name === 'img' && el.attribs.src);

    const cssRefs = stylesheets.map(el => el.attribs.href);
    const jsRefs = scripts.map(el => el.attribs.src);
    const imgRefs = images.map(el => el.attribs.src);
    // The first image may be the LCP element, so only later images should be lazy
    const eagerImgRefs = images.filter((el, i) => i === 0 || el.attribs.loading !== 'lazy').map(el => el.attribs.src);

    const textLength = (el) => DomUtils.textContent(el).length;
    const inlineStyles = live.filter(el => el.name === 'style').reduce((sum, el) => sum + textLength(el), 0);
    const inlineScripts = live
      .filter(el => el.name === 'script' && !el.attribs.src && !(el.attribs.type || '').includes('json'))
      .reduce((sum, el) => sum + textLength(el), 0);

    const renderBlocking = {
      css: stylesheets.filter(el => !el.attribs.media || el.attribs.media === 'all' || el.attribs.media === 'screen').length,
      js: scripts.filter(el => !('async' in el.attribs) && !('defer' in el.attribs) && el.attribs.type !== 'module').length,
    };

    const hasRel = (rel) => live.some(el => el.name === 'link' && rels(el).includes(rel));
    const canonical = live.find(el => el.name === 'link' && rels(el).includes('canonical'));

    return {
      elementCount,
      maxDepth,
      cssRefs,
      jsRefs,
      imgRefs,
      eagerImgRefs,
      lazyImages: images.filter(el => el.attribs.loading === 'lazy').length,
      canonical: canonical ? canonical.attribs.href : null,
      inlineStyles,
      inlineScripts,
      renderBlocking,
      performanceHints: {
        dnsPrefetch: hasRel('dns-prefetch'),
        preconnect: hasRel('preconnect'),
        preload: hasRel('preload'),
        lazyLoading: images.some(el => el.attribs.loading === 'lazy'),
      },
    };
  }

  // Size on disk of a same-origin reference, or null for external/missing files
  localAssetSize(ref, pageFile, origin) {
    let url;
    try {
      url = new URL(ref, origin ? new URL(path.relative(this.buildDir, pageFile).split(path.sep).join('/'), origin + '/') : 'https://local.invalid/');
    } catch {
      return null;
    }
    if (origin && url.origin !== origin) return null;
    if (!origin && url.origin !== 'https://local.invalid') return null;
    const file = path.join(this.buildDir, decodeURIComponent(url.pathname));
    try {
      const stats = fs.statSync(file);
      return stats.isFile() ? stats.size : null;
    } catch {
      return null;
    }
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
    // One small first-party stylesheet has to block rendering; flag anything beyond that
    if (analysis.renderBlocking.css > 1) {
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
    const eagerBelowFirst = analysis.imgRefs.length - 1 - analysis.lazyImages;
    if (eagerBelowFirst > 2) {
      recommendations.push(`${eagerBelowFirst} images after the first lack loading="lazy"`);
    }

    // Page weight: what a first visit downloads from this site (third-party excluded)
    const origin = analysis.canonical ? new URL(analysis.canonical).origin : null;
    const sizeOf = (ref) => this.localAssetSize(ref, filePath, origin) || 0;
    const pageWeight = stats.size
      + [...analysis.cssRefs, ...analysis.jsRefs].reduce((sum, ref) => sum + sizeOf(ref), 0)
      + analysis.eagerImgRefs.reduce((sum, ref) => sum + sizeOf(ref), 0);
    if (pageWeight > THRESHOLDS.pageWeight.warning) {
      issues.push(`Page weight too high: ${this.formatSize(pageWeight)}`);
    } else if (pageWeight > THRESHOLDS.pageWeight.good) {
      recommendations.push(`Consider reducing page weight: ${this.formatSize(pageWeight)}`);
    }

    return {
      path: relativePath,
      size: stats.size,
      sizeFormatted: this.formatSize(stats.size),
      pageWeight,
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
    let cleanPages = 0;

    const pageResults = [];
    for (const file of files) {
      const filePath = path.join(this.buildDir, file);
      const result = await this.auditPage(filePath);
      pageResults.push(result);

      totalIssues += result.issues.length;
      totalRecommendations += result.recommendations.length;

      if (result.issues.length === 0 && result.recommendations.length === 0) {
        cleanPages++;
        continue;
      }

      const status = result.issues.length > 0
        ? colors.red('✗')
        : result.recommendations.length > 0
          ? colors.yellow('⚠')
          : colors.green('✓');

      console.log(`\n${status} ${colors.bold(result.path)}`);
      console.log(`  Size: ${result.sizeFormatted} | Weight: ${this.formatSize(result.pageWeight)} | Elements: ${result.analysis.elementCount} | Depth: ${result.analysis.maxDepth}`);

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

    console.log(colors.dim(`\n${cleanPages} page(s) without issues or recommendations not shown`));

    // Summary
    console.log('\n' + colors.dim('─'.repeat(60)));
    console.log(colors.bold('\n=== Summary ===\n'));

    const totalAssetSize = totalCSS + totalJS + totalImages + totalFonts;
    console.log(`Total Asset Size: ${this.formatSize(totalAssetSize)}`);
    console.log(`  CSS:    ${this.formatSize(totalCSS)} (${assets.css.length} files)`);
    console.log(`  JS:     ${this.formatSize(totalJS)} (${assets.js.length} files)`);
    console.log(`  Images: ${this.formatSize(totalImages)} (${assets.images.length} files)`);
    console.log(`  Fonts:  ${this.formatSize(totalFonts)} (${assets.fonts.length} files)`);

    console.log(`\nPages Analyzed: ${pageResults.length}`);
    console.log(`${colors.red('Issues:')} ${totalIssues}`);
    console.log(`${colors.yellow('Recommendations:')} ${totalRecommendations}`);

    // Performance score. Penalties scale with the share of affected pages, so the
    // score does not drop just because the site has more pages.
    const share = (pred) => pageResults.filter(pred).length / pageResults.length;
    const avgPageSize = pageResults.reduce((sum, p) => sum + p.size, 0) / pageResults.length;
    const avgElements = pageResults.reduce((sum, p) => sum + p.analysis.elementCount, 0) / pageResults.length;
    const avgPageWeight = pageResults.reduce((sum, p) => sum + p.pageWeight, 0) / pageResults.length;
    console.log(`Average page weight: ${this.formatSize(avgPageWeight)}`);

    let score = 100;

    // Issues penalty: 0-40 by share of pages with at least one issue
    score -= Math.round(40 * share(p => p.issues.length > 0));

    // Recommendations penalty: 0-15 by share of pages with recommendations (minor impact)
    score -= Math.round(15 * share(p => p.recommendations.length > 0));

    // Page size penalty: 0-10 based on average HTML size
    if (avgPageSize > THRESHOLDS.htmlSize.warning) {
      score -= 10;
    } else if (avgPageSize > THRESHOLDS.htmlSize.good) {
      score -= 5;
    }

    // DOM complexity penalty: 0-10 based on element count
    if (avgElements > THRESHOLDS.domElements.warning) {
      score -= 10;
    } else if (avgElements > THRESHOLDS.domElements.good) {
      score -= 5;
    }

    // Page weight penalty: 0-25 based on what an average page view downloads.
    // (The old check summed every asset in the build, which no visitor downloads.)
    if (avgPageWeight > THRESHOLDS.pageWeight.warning) {
      score -= 25;
    } else if (avgPageWeight > THRESHOLDS.pageWeight.good) {
      score -= 12;
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
        avgPageWeight: Math.round(avgPageWeight),
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
