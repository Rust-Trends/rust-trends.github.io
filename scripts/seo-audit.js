#!/usr/bin/env node
/**
 * SEO Audit Script for Rust Trends
 * Validates SEO best practices in built HTML files
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// ANSI color codes (works without chalk)
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
  dim: (text) => `\x1b[2m${text}\x1b[0m`,
};

// SEO Best Practice Rules
const SEO_RULES = {
  // Title tag rules
  title: {
    minLength: 30,
    maxLength: 60,
    required: true,
  },
  // Meta description rules
  metaDescription: {
    minLength: 120,
    maxLength: 160,
    required: true,
  },
  // Open Graph rules
  openGraph: {
    required: ['og:title', 'og:description', 'og:url', 'og:type'],
    recommended: ['og:image', 'og:site_name'],
  },
  // Twitter Card rules
  twitterCard: {
    required: ['twitter:card', 'twitter:title', 'twitter:description'],
    recommended: ['twitter:image', 'twitter:site'],
  },
  // Structured Data rules
  structuredData: {
    requiredTypes: ['Article', 'Organization', 'BreadcrumbList', 'WebSite'],
  },
  // Other SEO elements
  other: {
    required: ['canonical', 'viewport', 'charset', 'lang'],
    recommended: ['robots', 'author'],
  },
};

class SEOAuditor {
  constructor(buildDir) {
    this.buildDir = buildDir;
    this.results = {
      passed: 0,
      warnings: 0,
      errors: 0,
      pages: [],
    };
  }

  // Simple HTML parser (no external dependency)
  parseHTML(html) {
    const getTagContent = (tag) => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const match = html.match(regex);
      return match ? match[1].trim() : null;
    };

    const getMetaContent = (name) => {
      // Handle both quoted and unquoted attributes in minified HTML
      // Pattern: name=value or name="value" or name='value'
      const namePatterns = [
        `name=["']${name}["']`,
        `name=${name}(?=[\\s>])`,
      ];
      const contentPatterns = [
        `content=["']([^"']*)["']`,
        `content=([^\\s>]+)`,
      ];

      for (const namePattern of namePatterns) {
        for (const contentPattern of contentPatterns) {
          // Try name before content
          let regex = new RegExp(`<meta[^>]*${namePattern}[^>]*${contentPattern}`, 'i');
          let match = html.match(regex);
          if (match) return match[1];

          // Try content before name
          regex = new RegExp(`<meta[^>]*${contentPattern}[^>]*${namePattern}`, 'i');
          match = html.match(regex);
          if (match) return match[1];
        }
      }

      return null;
    };

    const getMetaProperty = (property) => {
      // Handle both quoted and unquoted attributes
      const propPatterns = [
        `property=["']${property}["']`,
        `property=${property.replace(':', '\\:')}(?=[\\s>])`,
      ];
      const contentPatterns = [
        `content=["']([^"']*)["']`,
        `content=([^\\s>]+)`,
      ];

      for (const propPattern of propPatterns) {
        for (const contentPattern of contentPatterns) {
          let regex = new RegExp(`<meta[^>]*${propPattern}[^>]*${contentPattern}`, 'i');
          let match = html.match(regex);
          if (match) return match[1];

          regex = new RegExp(`<meta[^>]*${contentPattern}[^>]*${propPattern}`, 'i');
          match = html.match(regex);
          if (match) return match[1];
        }
      }

      return null;
    };

    const getCanonical = () => {
      // Handle both quoted and unquoted attributes in minified HTML
      const patterns = [
        /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i,
        /<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["']/i,
        /<link[^>]*rel=canonical[^>]*href=([^\s>]+)/i,
        /<link[^>]*href=([^\s>]+)[^>]*rel=canonical/i,
      ];
      for (const regex of patterns) {
        const match = html.match(regex);
        if (match) return match[1];
      }
      return null;
    };

    const getCharset = () => {
      const regex = /<meta[^>]*charset=["']?([^"'\s>]+)/i;
      const match = html.match(regex);
      return match ? match[1] : null;
    };

    const getViewport = () => {
      return getMetaContent('viewport');
    };

    const getLang = () => {
      // Handle both quoted and unquoted lang attribute
      let regex = /<html[^>]*lang=["']([^"']*)["']/i;
      let match = html.match(regex);
      if (match) return match[1];

      // Unquoted: lang=en
      regex = /<html[^>]*lang=([a-zA-Z-]+)/i;
      match = html.match(regex);
      return match ? match[1] : null;
    };

    const getStructuredData = () => {
      const scripts = [];
      // Handle both quoted and unquoted type attribute
      const regex = /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        try {
          scripts.push(JSON.parse(match[1]));
        } catch (e) {
          // Invalid JSON
        }
      }
      return scripts;
    };

    const getImages = () => {
      const images = [];
      const regex = /<img[^>]*>/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const altMatch = match[0].match(/alt=["']([^"']*)["']/i);
        const srcMatch = match[0].match(/src=["']([^"']*)["']/i);
        images.push({
          src: srcMatch ? srcMatch[1] : '',
          alt: altMatch ? altMatch[1] : null,
          hasAlt: altMatch !== null,
        });
      }
      return images;
    };

    const getHeadings = () => {
      const headings = { h1: [], h2: [], h3: [] };
      for (const level of ['h1', 'h2', 'h3']) {
        const regex = new RegExp(`<${level}[^>]*>([\\s\\S]*?)<\\/${level}>`, 'gi');
        let match;
        while ((match = regex.exec(html)) !== null) {
          headings[level].push(match[1].replace(/<[^>]*>/g, '').trim());
        }
      }
      return headings;
    };

    const getLinks = () => {
      const links = { internal: 0, external: 0, nofollow: 0 };
      const regex = /<a[^>]*href=["']([^"']*)["'][^>]*>/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const href = match[1];
        if (href.startsWith('http') && !href.includes('rust-trends.com')) {
          links.external++;
        } else if (!href.startsWith('#') && !href.startsWith('mailto:')) {
          links.internal++;
        }
        if (match[0].includes('nofollow')) {
          links.nofollow++;
        }
      }
      return links;
    };

    return {
      title: getTagContent('title'),
      metaDescription: getMetaContent('description'),
      ogTitle: getMetaProperty('og:title'),
      ogDescription: getMetaProperty('og:description'),
      ogUrl: getMetaProperty('og:url'),
      ogType: getMetaProperty('og:type'),
      ogImage: getMetaProperty('og:image'),
      ogSiteName: getMetaProperty('og:site_name'),
      twitterCard: getMetaContent('twitter:card'),
      twitterTitle: getMetaContent('twitter:title'),
      twitterDescription: getMetaContent('twitter:description'),
      twitterImage: getMetaContent('twitter:image'),
      twitterSite: getMetaContent('twitter:site'),
      canonical: getCanonical(),
      charset: getCharset(),
      viewport: getViewport(),
      lang: getLang(),
      robots: getMetaContent('robots'),
      author: getMetaContent('author'),
      structuredData: getStructuredData(),
      images: getImages(),
      headings: getHeadings(),
      links: getLinks(),
    };
  }

  auditPage(filePath, html) {
    const data = this.parseHTML(html);
    const relativePath = path.relative(this.buildDir, filePath);
    const issues = [];
    const warnings = [];
    const passes = [];

    // Title checks
    if (!data.title) {
      issues.push('Missing <title> tag');
    } else {
      const len = data.title.length;
      if (len < SEO_RULES.title.minLength) {
        warnings.push(`Title too short (${len} chars, min ${SEO_RULES.title.minLength})`);
      } else if (len > SEO_RULES.title.maxLength) {
        warnings.push(`Title too long (${len} chars, max ${SEO_RULES.title.maxLength})`);
      } else {
        passes.push(`Title length OK (${len} chars)`);
      }
    }

    // Meta description checks
    if (!data.metaDescription) {
      issues.push('Missing meta description');
    } else {
      const len = data.metaDescription.length;
      if (len < SEO_RULES.metaDescription.minLength) {
        warnings.push(`Meta description short (${len} chars, recommended ${SEO_RULES.metaDescription.minLength}+)`);
      } else if (len > SEO_RULES.metaDescription.maxLength) {
        warnings.push(`Meta description long (${len} chars, max ${SEO_RULES.metaDescription.maxLength})`);
      } else {
        passes.push(`Meta description length OK (${len} chars)`);
      }
    }

    // Open Graph checks
    const ogChecks = [
      ['og:title', data.ogTitle],
      ['og:description', data.ogDescription],
      ['og:url', data.ogUrl],
      ['og:type', data.ogType],
    ];
    for (const [name, value] of ogChecks) {
      if (!value) {
        issues.push(`Missing ${name}`);
      } else {
        passes.push(`Has ${name}`);
      }
    }
    if (!data.ogImage) {
      warnings.push('Missing og:image (recommended for social sharing)');
    }

    // Twitter Card checks
    const twitterChecks = [
      ['twitter:card', data.twitterCard],
      ['twitter:title', data.twitterTitle],
      ['twitter:description', data.twitterDescription],
    ];
    for (const [name, value] of twitterChecks) {
      if (!value) {
        issues.push(`Missing ${name}`);
      } else {
        passes.push(`Has ${name}`);
      }
    }
    if (!data.twitterImage) {
      warnings.push('Missing twitter:image (recommended for social sharing)');
    }

    // Canonical URL check
    if (!data.canonical) {
      issues.push('Missing canonical URL');
    } else {
      passes.push('Has canonical URL');
    }

    // Basic HTML checks
    if (!data.charset) {
      issues.push('Missing charset declaration');
    } else {
      passes.push('Has charset');
    }
    if (!data.viewport) {
      issues.push('Missing viewport meta tag');
    } else {
      passes.push('Has viewport');
    }
    if (!data.lang) {
      issues.push('Missing lang attribute on <html>');
    } else {
      passes.push(`Has lang="${data.lang}"`);
    }

    // Structured Data checks
    if (data.structuredData.length === 0) {
      warnings.push('No structured data (JSON-LD) found');
    } else {
      const types = new Set();
      const collectTypes = (obj) => {
        if (obj['@type']) {
          types.add(obj['@type']);
        }
        if (obj['@graph']) {
          obj['@graph'].forEach(collectTypes);
        }
      };
      data.structuredData.forEach(collectTypes);
      passes.push(`Has structured data: ${Array.from(types).join(', ')}`);
    }

    // Heading structure checks
    if (data.headings.h1.length === 0) {
      warnings.push('No H1 heading found');
    } else if (data.headings.h1.length > 1) {
      warnings.push(`Multiple H1 headings (${data.headings.h1.length})`);
    } else {
      passes.push('Single H1 heading');
    }

    // Image alt text checks
    const imagesWithoutAlt = data.images.filter(img => !img.hasAlt);
    if (imagesWithoutAlt.length > 0) {
      warnings.push(`${imagesWithoutAlt.length} image(s) missing alt text`);
    } else if (data.images.length > 0) {
      passes.push(`All ${data.images.length} images have alt text`);
    }

    return {
      path: relativePath,
      issues,
      warnings,
      passes,
      data: {
        titleLength: data.title?.length || 0,
        descriptionLength: data.metaDescription?.length || 0,
        structuredDataTypes: data.structuredData.length,
        imageCount: data.images.length,
        imagesWithoutAlt: imagesWithoutAlt.length,
        h1Count: data.headings.h1.length,
        internalLinks: data.links.internal,
        externalLinks: data.links.external,
      },
    };
  }

  async run() {
    console.log(colors.bold('\n=== SEO Audit Report ===\n'));
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

    console.log(`Found ${files.length} HTML files to audit\n`);
    console.log(colors.dim('─'.repeat(60)));

    let totalPassed = 0;
    let totalWarnings = 0;
    let totalErrors = 0;

    for (const file of files) {
      const filePath = path.join(this.buildDir, file);
      const html = fs.readFileSync(filePath, 'utf-8');
      const result = this.auditPage(filePath, html);

      this.results.pages.push(result);
      totalPassed += result.passes.length;
      totalWarnings += result.warnings.length;
      totalErrors += result.issues.length;

      // Print page results
      const statusIcon = result.issues.length > 0
        ? colors.red('✗')
        : result.warnings.length > 0
          ? colors.yellow('⚠')
          : colors.green('✓');

      console.log(`\n${statusIcon} ${colors.bold(result.path)}`);

      if (result.issues.length > 0) {
        result.issues.forEach(issue => {
          console.log(`  ${colors.red('ERROR:')} ${issue}`);
        });
      }
      if (result.warnings.length > 0) {
        result.warnings.forEach(warning => {
          console.log(`  ${colors.yellow('WARN:')} ${warning}`);
        });
      }
    }

    // Summary
    console.log('\n' + colors.dim('─'.repeat(60)));
    console.log(colors.bold('\n=== Summary ===\n'));
    console.log(`Pages audited: ${files.length}`);
    console.log(`${colors.green('Passed:')} ${totalPassed}`);
    console.log(`${colors.yellow('Warnings:')} ${totalWarnings}`);
    console.log(`${colors.red('Errors:')} ${totalErrors}`);

    // Score calculation
    const maxPoints = (totalPassed + totalWarnings + totalErrors);
    const score = maxPoints > 0
      ? Math.round((totalPassed / maxPoints) * 100)
      : 0;

    console.log(`\nSEO Score: ${score >= 80 ? colors.green(score + '%') : score >= 60 ? colors.yellow(score + '%') : colors.red(score + '%')}`);

    // Save JSON report
    const reportPath = path.join(this.buildDir, '..', 'seo-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        pagesAudited: files.length,
        passed: totalPassed,
        warnings: totalWarnings,
        errors: totalErrors,
        score,
      },
      pages: this.results.pages,
    }, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);

    return totalErrors === 0 ? 0 : 1;
  }
}

// Main execution
const buildDir = process.argv[2] || path.join(__dirname, '..', 'public');
const auditor = new SEOAuditor(buildDir);

auditor.run()
  .then(exitCode => process.exit(exitCode))
  .catch(err => {
    console.error(colors.red('Error:'), err.message);
    process.exit(1);
  });
