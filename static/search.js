// Simple client-side search functionality for Rust Trends
class SearchEngine {
    constructor() {
        this.searchIndex = null;
        this.loadSearchIndex();
    }

    async loadSearchIndex() {
        try {
            const response = await fetch('/search_index.en.json');
            this.searchIndex = await response.json();
        } catch (error) {
            console.error('Failed to load search index:', error);
        }
    }

    search(query) {
        if (!this.searchIndex || !query.trim()) {
            return [];
        }

        const lowercaseQuery = query.toLowerCase();
        const results = [];

        for (const [url, data] of Object.entries(this.searchIndex)) {
            let score = 0;
            const title = data.title || '';
            const body = data.body || '';
            
            // Title matches get higher score
            if (title.toLowerCase().includes(lowercaseQuery)) {
                score += 10;
            }
            
            // Body matches
            const bodyMatches = (body.toLowerCase().match(new RegExp(lowercaseQuery, 'g')) || []).length;
            score += bodyMatches;
            
            if (score > 0) {
                results.push({
                    url: url,
                    title: title,
                    body: body.substring(0, 200) + '...',
                    score: score
                });
            }
        }

        return results.sort((a, b) => b.score - a.score).slice(0, 10);
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