// ElasticLunr-based search functionality for Rust Trends
class SearchEngine {
    constructor() {
        this.index = null;
        this.documents = null;
        this.loadSearchIndex();
    }

    async loadSearchIndex() {
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
                // Store documents separately for displaying results
                this.documents = {};
                
                // Extract document data from the search index
                // This is a simplified approach - in practice, you might need 
                // to fetch this data from a separate endpoint
                console.log('Search index loaded successfully');
            } else {
                throw new Error('Search index not found in window.searchIndex');
            }
        } catch (error) {
            console.error('Failed to load search index:', error);
        }
    }

    search(query) {
        if (!this.index || !query.trim()) {
            return [];
        }

        try {
            // Use ElasticLunr to search
            const results = this.index.search(query, {});
            
            // Format results for display
            return results.slice(0, 10).map(result => {
                // Extract basic info from the URL
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
        // Extract a readable title from the URL path
        const path = url.replace('https://rust-trends.com/', '');
        
        // Handle newsletter URLs
        if (path.startsWith('newsletter/')) {
            const title = path.replace('newsletter/', '').replace('/', '');
            return this.formatTitle(title);
        }
        
        // Handle post URLs
        if (path.startsWith('posts/')) {
            const title = path.replace('posts/', '').replace('/', '');
            return this.formatTitle(title);
        }
        
        // Handle other pages
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

// Initialize search when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const searchEngine = new SearchEngine();
    
    // Add search functionality if search box exists
    const searchBox = document.getElementById('search');
    const searchResults = document.getElementById('search-results');
    
    if (searchBox && searchResults) {
        let searchTimeout;
        
        searchBox.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            const query = this.value;
            
            searchTimeout = setTimeout(() => {
                if (query.length > 2) {
                    const results = searchEngine.search(query);
                    displaySearchResults(results, searchResults);
                } else {
                    searchResults.innerHTML = '';
                }
            }, 300);
        });
    }
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