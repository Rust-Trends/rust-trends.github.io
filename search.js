// ElasticLunr-based search functionality for Rust Trends
// Lazy loads the search index only when user interacts with search
class SearchEngine {
    constructor() {
        this.index = null;
        this.documents = null;
        this.loading = false;
        this.loaded = false;
    }

    async loadSearchIndex() {
        if (this.loaded || this.loading) {
            return;
        }

        this.loading = true;

        try {
            // Load ElasticLunr library first
            if (typeof elasticlunr === 'undefined') {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = '/elasticlunr.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }

            // Load the Zola-generated search index
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = '/search_index.en.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });

            // Initialize ElasticLunr with the loaded index
            if (window.searchIndex) {
                this.index = elasticlunr.Index.load(window.searchIndex);
                this.documents = {};
                this.loaded = true;
                console.log('Search index loaded successfully');
            } else {
                throw new Error('Search index not found in window.searchIndex');
            }
        } catch (error) {
            console.error('Failed to load search index:', error);
        } finally {
            this.loading = false;
        }
    }

    async search(query) {
        if (!query.trim()) {
            return [];
        }

        // Lazy load the index on first search
        if (!this.loaded) {
            await this.loadSearchIndex();
        }

        if (!this.index) {
            return [];
        }

        try {
            const results = this.index.search(query, {});

            return results.slice(0, 10).map(result => {
                const url = result.ref;
                const title = this.extractTitleFromUrl(url);

                return {
                    url: url,
                    title: title,
                    body: 'Match found in ' + title,
                    score: result.score
                };
            });
        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
    }

    extractTitleFromUrl(url) {
        const path = url.replace('https://rust-trends.com/', '');

        if (path.startsWith('newsletter/')) {
            const title = path.replace('newsletter/', '').replace('/', '');
            return this.formatTitle(title);
        }

        if (path.startsWith('posts/')) {
            const title = path.replace('posts/', '').replace('/', '');
            return this.formatTitle(title);
        }

        const title = path.replace('/', '');
        return this.formatTitle(title) || 'Home Page';
    }

    formatTitle(slug) {
        if (!slug) return 'Page';

        return slug
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

// Initialize search only if search box exists on the page
document.addEventListener('DOMContentLoaded', function() {
    const searchBox = document.getElementById('search');
    const searchResults = document.getElementById('search-results');

    // Only initialize search engine if search elements exist
    if (!searchBox || !searchResults) {
        return;
    }

    const searchEngine = new SearchEngine();
    let searchTimeout;

    // Preload search index when user focuses on search box
    searchBox.addEventListener('focus', function() {
        searchEngine.loadSearchIndex();
    }, { once: true });

    searchBox.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const query = this.value;

        searchTimeout = setTimeout(async () => {
            if (query.length > 2) {
                const results = await searchEngine.search(query);
                displaySearchResults(results, searchResults);
            } else {
                searchResults.innerHTML = '';
            }
        }, 300);
    });
});

function displaySearchResults(results, container) {
    if (results.length === 0) {
        container.innerHTML = '<p>No results found.</p>';
        return;
    }

    const html = results.map(result => `
        <div class="search-result">
            <h3><a href="${result.url}">${result.title}</a></h3>
            <p>${result.body}</p>
        </div>
    `).join('');

    container.innerHTML = html;
}
