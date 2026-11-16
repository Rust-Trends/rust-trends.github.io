/* Charts for /linux-rust/. Data comes from the JSON embedded in the page (#lr-data),
   which follows schema v1 of kernel-rust-stats. Every number shown here is also in the
   server-rendered tables, so the page works without this script. */
(function () {
  'use strict';

  var el = document.getElementById('lr-data');
  if (!el) return;
  var data;
  try { data = JSON.parse(el.textContent); } catch (e) { return; }
  var rels = data.releases || [];
  if (!rels.length) return;
  var newest = rels[rels.length - 1];
  var labels = rels.map(function (r) { return r.tag; });

  var C = {
    core: '#f74c00',      // brand accent: first-party core
    drivers: '#3987e5',
    samples: '#199e70',
    other: '#9085e9',
    vendored: '#6b6b6b',
    toolchain: '#3a3a3a',
    surface: '#121212',
    text0: 'rgba(255,255,255,0.87)',
    text1: 'rgba(255,255,255,0.60)',
    grid: 'rgba(255,255,255,0.08)'
  };
  var MONO = "'Jetbrains Mono', ui-monospace, monospace";
  var HEAD = "'Space Grotesk', system-ui, sans-serif";
  var fmt = new Intl.NumberFormat('en-US');
  function n(x) { return fmt.format(Math.round(x)); }
  function pct(x, d) { return (x).toFixed(d) + '%'; }

  // Hatched fill for vendored code: muted grey, 45 degree lines.
  function hatch(color) {
    var c = document.createElement('canvas');
    c.width = c.height = 8;
    var g = c.getContext('2d');
    g.fillStyle = '#262626';
    g.fillRect(0, 0, 8, 8);
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-2, 10); g.lineTo(10, -2);
    g.moveTo(-2, 2); g.lineTo(2, -2);
    g.moveTo(6, 10); g.lineTo(10, 6);
    g.stroke();
    return g.createPattern(c, 'repeat');
  }

  function legend(id, items) {
    var box = document.getElementById(id);
    if (!box) return;
    items.forEach(function (it) {
      var s = document.createElement('span');
      var k = document.createElement('span');
      k.className = 'lr-key ' + (it.cls || '') + (it.line ? ' lr-key-line' : '');
      if (!it.cls) k.style.background = it.color;
      s.appendChild(k);
      s.appendChild(document.createTextNode(it.label));
      box.appendChild(s);
    });
  }

  function areaLabel(id) {
    var a = (data.areas || []).filter(function (x) { return x.id === id; })[0];
    return a ? a.label : id;
  }

  function init() {
    if (!window.Chart) return;
    var Chart = window.Chart;
    Chart.defaults.color = C.text1;
    Chart.defaults.font.family = MONO;
    Chart.defaults.font.size = 11;
    Chart.defaults.borderColor = C.grid;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.responsive = true;
    Chart.defaults.animation = false;
    Chart.defaults.plugins.legend.display = false;
    var tt = Chart.defaults.plugins.tooltip;
    tt.backgroundColor = 'rgba(28,28,28,0.96)';
    tt.borderColor = 'rgba(255,255,255,0.18)';
    tt.borderWidth = 1;
    tt.titleColor = C.text1;
    tt.bodyColor = C.text0;
    tt.titleFont = { family: HEAD, size: 12, weight: '600' };
    tt.bodyFont = { family: MONO, size: 12 };
    tt.padding = 10;
    tt.usePointStyle = true;
    tt.boxWidth = 10;
    tt.boxHeight = 2;

    function axisTitle(text) {
      return { display: true, text: text, color: C.text1, font: { family: HEAD, size: 12 } };
    }
    var xRel = { grid: { display: false }, ticks: { maxRotation: 60, autoSkip: true, autoSkipPadding: 6 } };
    var lineStyle = { pointStyle: 'line' };

    // ---- Growth: stacked areas by area ----
    var order = ['core', 'drivers', 'samples', 'other', 'vendored'];
    var growthSets = order.map(function (id) {
      var vend = id === 'vendored';
      return {
        label: areaLabel(id),
        areaId: id,
        data: rels.map(function (r) { return r.loc.rust_by_area[id].code; }),
        fill: true,
        backgroundColor: vend ? hatch('#7d7d7d') : C[id],
        borderColor: C.surface,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHitRadius: 12,
        pointStyle: 'line',
        tension: 0
      };
    });
    legend('lr-growth-legend', order.map(function (id) {
      return { label: areaLabel(id), cls: 'lr-key-' + (id === 'core' ? 'fp' : id) };
    }));
    var growth = new Chart(document.getElementById('lr-growth'), {
      type: 'line',
      data: { labels: labels, datasets: growthSets },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: xRel,
          y: { stacked: true, beginAtZero: true, title: axisTitle('Rust code lines'),
               ticks: { callback: function (v) { return v >= 1000 ? (v / 1000) + 'k' : v; } } }
        },
        plugins: {
          tooltip: {
            itemSort: function (a, b) { return b.datasetIndex - a.datasetIndex; },
            callbacks: {
              label: function (c) { return ' ' + n(c.parsed.y) + '  ' + c.dataset.label; },
              footer: function (items) {
                var t = items.reduce(function (s, i) { return s + i.parsed.y; }, 0);
                return 'Total ' + n(t);
              }
            },
            footerColor: C.text0,
            footerFont: { family: MONO, size: 12, weight: '700' }
          }
        }
      }
    });
    var fpBox = document.getElementById('lr-fp-only');
    if (fpBox) {
      fpBox.addEventListener('change', function () {
        growth.setDatasetVisibility(order.indexOf('vendored'), !fpBox.checked);
        growth.update();
      });
    }

    // ---- First-party share (own chart: no dual axes) ----
    new Chart(document.getElementById('lr-share'), {
      type: 'line',
      data: { labels: labels, datasets: [{
        label: 'First-party Rust share',
        data: rels.map(function (r) { return r.rust_share_first_party * 100; }),
        borderColor: C.core, backgroundColor: C.core, borderWidth: 2,
        pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 12, pointStyle: 'line', tension: 0
      }] },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: xRel, y: { beginAtZero: true, title: axisTitle('% of C + Rust lines'),
          ticks: { callback: function (v) { return v.toFixed(2) + '%'; } } } },
        plugins: { tooltip: { callbacks: { label: function (c) { return ' ' + pct(c.parsed.y, 3) + '  first-party Rust share'; } } } }
      }
    });

    // ---- Horizontal bar helper ----
    function hbar(id, rows, color, valueLabel, unit) {
      var cv = document.getElementById(id);
      if (!cv) return;
      var wrap = cv.parentNode;
      wrap.style.height = Math.max(200, rows.length * 26 + 50) + 'px';
      return new Chart(cv, {
        type: 'bar',
        data: { labels: rows.map(function (r) { return r.label; }), datasets: [{
          label: valueLabel,
          data: rows.map(function (r) { return r.value; }),
          backgroundColor: rows.map(function (r) { return r.color || color; }),
          borderRadius: { topRight: 4, bottomRight: 4 },
          borderSkipped: 'start',
          barPercentage: 0.8, categoryPercentage: 0.9
        }] },
        options: {
          indexAxis: 'y',
          interaction: { mode: 'nearest', axis: 'y', intersect: false },
          scales: {
            x: { beginAtZero: true, title: axisTitle(valueLabel),
                 ticks: { precision: 0, callback: function (v) { return v >= 1000 ? (v / 1000) + 'k' : n(v); } } },
            y: { grid: { display: false }, ticks: { autoSkip: false, color: C.text0,
                 callback: function (v) {
                   var s = this.getLabelForValue(v);
                   var max = window.innerWidth < 520 ? 18 : 34;
                   return s.length > max ? s.slice(0, max - 1) + '…' : s;
                 } } }
          },
          plugins: { tooltip: { callbacks: {
            label: function (c) { return ' ' + n(c.parsed.x) + ' ' + unit; }
          } } }
        }
      });
    }

    // ---- Where the Rust lives ----
    var where = [{ label: 'rust/ core abstractions', value: newest.loc.rust_by_area.core.code, color: C.core }];
    (newest.components || []).forEach(function (c) {
      where.push({ label: c.label, value: c.code, color: C[c.area] || C.drivers });
    });
    if (newest.loc.rust_by_area.other.code > 0)
      where.push({ label: 'Other (lib, scripts, ...)', value: newest.loc.rust_by_area.other.code, color: C.other });
    var vpat = hatch('#7d7d7d');
    (newest.crates || []).forEach(function (c) {
      if (c.kind === 'vendored') where.push({ label: c.name + ' (vendored)', value: c.code, color: vpat });
    });
    where.sort(function (a, b) { return b.value - a.value; });
    hbar('lr-where', where, C.drivers, 'Rust code lines', 'code lines');

    // ---- Functions per release (first-party) ----
    new Chart(document.getElementById('lr-fns'), {
      type: 'line',
      data: { labels: labels, datasets: [{
        label: 'Functions',
        data: rels.map(function (r) {
          var i = r.items, v = r.items_by_area.vendored;
          return i.fn_free + i.fn_impl + i.fn_trait - v.fn_free - v.fn_impl - v.fn_trait;
        }),
        borderColor: C.core, backgroundColor: C.core, borderWidth: 2,
        pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 12, pointStyle: 'line', tension: 0
      }] },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: xRel, y: { beginAtZero: true, title: axisTitle('First-party functions'),
          ticks: { callback: function (v) { return n(v); } } } },
        plugins: { tooltip: { callbacks: { label: function (c) { return ' ' + n(c.parsed.y) + '  functions'; } } } }
      }
    });

    // ---- Unsafe density by area ----
    var uAreas = ['core', 'drivers', 'samples'];
    legend('lr-unsafe-legend', uAreas.map(function (id) {
      return { label: areaLabel(id), color: C[id], line: true };
    }));
    new Chart(document.getElementById('lr-unsafe'), {
      type: 'line',
      data: { labels: labels, datasets: uAreas.map(function (id) {
        return {
          label: areaLabel(id),
          data: rels.map(function (r) {
            var code = r.loc.rust_by_area[id].code;
            return code > 0 ? r.unsafe_by_area[id].blocks / code * 1000 : null;
          }),
          borderColor: C[id], backgroundColor: C[id], borderWidth: 2,
          pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 12, pointStyle: 'line',
          tension: 0, spanGaps: false
        };
      }) },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: xRel, y: { beginAtZero: true, title: axisTitle('unsafe blocks per 1k lines') } },
        plugins: { tooltip: { callbacks: { label: function (c) {
          return c.parsed.y == null ? null : ' ' + c.parsed.y.toFixed(1) + '  ' + c.dataset.label;
        } } } }
      }
    });

    // ---- SAFETY comment coverage (first-party) ----
    new Chart(document.getElementById('lr-safety'), {
      type: 'line',
      data: { labels: labels, datasets: [{
        label: 'With // SAFETY: comment',
        data: rels.map(function (r) {
          var b = r.unsafe.blocks - r.unsafe_by_area.vendored.blocks;
          var s = r.unsafe.blocks_with_safety_comment - r.unsafe_by_area.vendored.blocks_with_safety_comment;
          return b > 0 ? s / b * 100 : null;
        }),
        borderColor: C.core, backgroundColor: C.core, borderWidth: 2,
        pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 12, pointStyle: 'line', tension: 0
      }] },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: xRel, y: { min: 0, max: 100, title: axisTitle('% of unsafe blocks'),
          ticks: { callback: function (v) { return v + '%'; } } } },
        plugins: { tooltip: { callbacks: { label: function (c) { return ' ' + pct(c.parsed.y, 1) + '  have a SAFETY comment'; } } } }
      }
    });

    // ---- Top C functions ----
    // bindings::foo_t(..) builds a C typedef value, it is not a call into C
    hbar('lr-ffi', (newest.ffi.top || []).filter(function (f) { return !/_t$/.test(f.name); }).slice(0, 15).map(function (f) {
      return { label: f.name.replace(/^bindings::/, ''), value: f.calls };
    }), C.drivers, 'Call sites', 'call sites');

    // ---- kernel:: imports ----
    hbar('lr-imports', (newest.imports.kernel_top || []).slice(0, 15).map(function (m) {
      return { label: 'kernel::' + m.module, value: m.files };
    }), C.drivers, 'Files importing it', 'files');
  }

  // ---- Crate dependency graph (inline SVG, layered) ----
  function graph() {
    var box = document.getElementById('lr-graph');
    if (!box) return;
    // Every crate depends on the toolchain's core; drawing those edges only adds clutter,
    // so toolchain crates are left out of the picture (the table lists them).
    var crates = (newest.crates || []).filter(function (c) { return c.kind !== 'toolchain'; });
    var byName = {};
    crates.forEach(function (c) { byName[c.name] = c; });
    // layer = longest dependency chain below the crate (leaves at 0, drawn at the bottom)
    var memo = {};
    function depth(name, seen) {
      if (memo[name] != null) return memo[name];
      if (seen[name]) return 0;
      seen[name] = true;
      var c = byName[name];
      var d = 0;
      (c ? c.deps : []).forEach(function (x) { if (byName[x]) d = Math.max(d, depth(x, seen) + 1); });
      seen[name] = false;
      memo[name] = d;
      return d;
    }
    crates.forEach(function (c) { depth(c.name, {}); });
    var maxD = 0;
    crates.forEach(function (c) { maxD = Math.max(maxD, memo[c.name]); });
    var layers = [];
    for (var i = 0; i <= maxD; i++) layers.push([]);
    crates.forEach(function (c) { layers[memo[c.name]].push(c); });
    // order within a layer: first-party, vendored, toolchain; then by name
    var rank = { first_party: 0, vendored: 1, toolchain: 2 };
    layers.forEach(function (l) {
      l.sort(function (a, b) { return (rank[a.kind] - rank[b.kind]) || (a.name < b.name ? -1 : 1); });
    });

    // draw only direct links: c -> d is left out when d is reachable through another dep of c
    // (the table below still lists every dependency)
    var reachMemo = {};
    function reach(name, seen) {
      if (reachMemo[name]) return reachMemo[name];
      seen = seen || {};
      if (seen[name]) return {};
      seen[name] = true;
      var r = {};
      ((byName[name] || {}).deps || []).forEach(function (x) {
        if (!byName[x]) return;
        r[x] = true;
        var rx = reach(x, seen);
        for (var k in rx) r[k] = true;
      });
      reachMemo[name] = r;
      return r;
    }
    function drawnDeps(c) {
      return c.deps.filter(function (d) {
        return byName[d] && !c.deps.some(function (o) { return o !== d && reach(o)[d]; });
      });
    }

    var nodeW = 150, nodeH = 30, gapX = 16, gapY = 58, pad = 12;
    var widest = Math.max.apply(null, layers.map(function (l) { return l.length; }));
    var W = Math.max(widest * (nodeW + gapX) - gapX + pad * 2, 320);
    var H = (maxD + 1) * nodeH + maxD * gapY + pad * 2;
    var pos = {};
    layers.forEach(function (l, d) {
      var rowW = l.length * (nodeW + gapX) - gapX;
      var x0 = (W - rowW) / 2;
      var y = pad + (maxD - d) * (nodeH + gapY);
      l.forEach(function (c, k) { pos[c.name] = { x: x0 + k * (nodeW + gapX), y: y }; });
    });

    var NS = 'http://www.w3.org/2000/svg';
    function mk(tag, attrs) {
      var e = document.createElementNS(NS, tag);
      for (var a in attrs) e.setAttribute(a, attrs[a]);
      return e;
    }
    var svg = mk('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-hidden': 'true' });
    svg.style.maxWidth = W + 'px';
    svg.style.minWidth = Math.min(W, 520) + 'px';
    var defs = mk('defs', {});
    var marker = mk('marker', { id: 'lr-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5',
      markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
    marker.appendChild(mk('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'rgba(255,255,255,0.45)' }));
    defs.appendChild(marker);
    var pat = mk('pattern', { id: 'lr-hatch', width: '6', height: '6', patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)' });
    pat.appendChild(mk('rect', { width: '6', height: '6', fill: '#2a2a2a' }));
    pat.appendChild(mk('line', { x1: '0', y1: '0', x2: '0', y2: '6', stroke: '#6b6b6b', 'stroke-width': '3' }));
    defs.appendChild(pat);
    svg.appendChild(defs);

    var edges = mk('g', { fill: 'none', stroke: 'rgba(255,255,255,0.28)', 'stroke-width': '1.25' });
    crates.forEach(function (c) {
      var a = pos[c.name];
      drawnDeps(c).forEach(function (dn) {
        var b = pos[dn];
        if (!a || !b) return;
        var x1 = a.x + nodeW / 2, y1 = a.y + nodeH, x2 = b.x + nodeW / 2, y2 = b.y;
        var k = gapY * 0.7;
        edges.appendChild(mk('path', { d: 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + (y1 + k) + ' ' + x2 + ',' + (y2 - k) + ' ' + x2 + ',' + (y2 - 1),
          'marker-end': 'url(#lr-arrow)' }));
      });
    });
    svg.appendChild(edges);

    crates.forEach(function (c) {
      var p = pos[c.name];
      var g = mk('g', {});
      var fill = c.kind === 'vendored' ? 'url(#lr-hatch)' : c.kind === 'toolchain' ? '#3a3a3a' : '#f74c00';
      g.appendChild(mk('rect', { x: p.x, y: p.y, width: nodeW, height: nodeH, rx: '6',
        fill: fill, stroke: c.kind === 'first_party' ? 'none' : 'rgba(255,255,255,0.3)' }));
      var t = mk('text', { x: p.x + nodeW / 2, y: p.y + nodeH / 2 + 4, 'text-anchor': 'middle',
        'font-size': '12', fill: c.kind === 'first_party' ? '#121212' : 'rgba(255,255,255,0.9)',
        'font-weight': c.kind === 'first_party' ? '700' : '400' });
      t.textContent = c.name;
      g.appendChild(t);
      var title = mk('title', {});
      title.textContent = c.name + ' (' + c.kind.replace('_', '-') + ')' +
        (c.kind === 'toolchain' ? '' : ', ' + n(c.code) + ' code lines') +
        (c.deps.length ? '; depends on ' + c.deps.join(', ') : '');
      g.appendChild(title);
      svg.appendChild(g);
    });
    box.appendChild(svg);
  }

  function start() {
    graph();
    if (window.Chart) init();
    else window.addEventListener('load', init);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
