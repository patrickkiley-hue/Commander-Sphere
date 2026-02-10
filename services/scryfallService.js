// src/services/scryfallService.js
// Scryfall API service for fetching Magic: The Gathering commander data
// API Documentation: https://scryfall.com/docs/api

class ScryfallService {
  constructor() {
    this.baseUrl = 'https://api.scryfall.com';
    this.lastRequestTime = 0;
    this.minRequestInterval = 100; // 100ms between requests (10 req/s limit)
    this.cachePrefix = 'scryfall-card-';
    this.abortController = null; // Track current request for cancellation
  }

  // --- Utility Helpers ---

  isFuzzyMatch(name, query) {
    const n = name.toLowerCase();
    const q = query.toLowerCase().replace(/\s/g, '');
    let i = 0, j = 0;
    while (i < n.length && j < q.length) {
      if (n[i] === q[j]) j++;
      i++;
    }
    return j === q.length;
  }

  // Cache management
  getCachedCard(name) {
    try {
      const cached = localStorage.getItem(this.cachePrefix + name);
      if (cached) {
        const data = JSON.parse(cached);
        // Cache expires after 7 days
        if (data.timestamp && Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
          return data.card;
        } else {
          // Expired, remove it
          localStorage.removeItem(this.cachePrefix + name);
        }
      }
    } catch (error) {
      console.error('Cache read error:', error);
    }
    return null;
  }

  cacheCard(name, card) {
    try {
      localStorage.setItem(this.cachePrefix + name, JSON.stringify({
        card: card,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Cache write error:', error);
      // If localStorage is full, clear old Scryfall cache entries
      this.clearOldCache();
    }
  }

  clearOldCache() {
    try {
      const keys = Object.keys(localStorage);
      const scryfallKeys = keys.filter(k => k.startsWith(this.cachePrefix));
      
      // Sort by timestamp and remove oldest entries
      scryfallKeys.sort((a, b) => {
        const dataA = JSON.parse(localStorage.getItem(a) || '{}');
        const dataB = JSON.parse(localStorage.getItem(b) || '{}');
        return (dataA.timestamp || 0) - (dataB.timestamp || 0);
      });
      
      // Remove oldest 20% of entries
      const toRemove = Math.ceil(scryfallKeys.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        localStorage.removeItem(scryfallKeys[i]);
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  // Enforce rate limiting (10 requests per second)
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const delay = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  // Search for commanders with a query string
  // Returns array of card objects matching the search
  async searchCommanders(query) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    // Abort any existing request before starting a new one
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    await this.enforceRateLimit();

    try {
      // Build search query: must be legal in commander AND can be a commander
      const searchQuery = `legal:commander is:commander ${query}`;
      const encodedQuery = encodeURIComponent(searchQuery);
      
      const response = await fetch(
        `${this.baseUrl}/cards/search?q=${encodedQuery}&order=name`,
        { signal: this.abortController.signal }
      );

      if (response.status === 404) {
        // No cards found - this is not an error, just empty results
        return [];
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Scryfall search failed');
      }

      const data = await response.json();
      const cards = data.data || [];
      
      // Cache each result individually for future lookups
      cards.forEach(card => {
        this.cacheCard(card.name, card);
      });
      
      return cards;
    } catch (error) {
      if (error.name === 'AbortError') {
        // Silence abort errors - this is expected behavior
        return [];
      }
      console.error('Scryfall search error:', error);
      throw error;
    }
  }

  // Get a specific commander by exact or fuzzy name match
  // Returns a single card object
  async getCommanderByName(name) {
    if (!name || name.trim().length === 0) {
      throw new Error('Card name is required');
    }

    // Check cache first
    const cached = this.getCachedCard(name);
    if (cached) {
      console.log(`Cache hit for ${name}`);
      return cached;
    }

    await this.enforceRateLimit();

    try {
      // Search using is:commander filter to only get valid commanders
      const searchQuery = `is:commander "${name}"`;
      const encodedQuery = encodeURIComponent(searchQuery);
      
      const response = await fetch(
        `${this.baseUrl}/cards/search?q=${encodedQuery}&unique=cards`
      );

      if (response.status === 404) {
        throw new Error(`Commander "${name}" not found`);
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to fetch commander');
      }

      const data = await response.json();
      
      // Return the first match (most relevant)
      if (data.data && data.data.length > 0) {
        const card = data.data[0];
        // Cache the result
        this.cacheCard(name, card);
        console.log(`Cached ${name}`);
        return card;
      } else {
        throw new Error(`Commander "${name}" not found`);
      }
    } catch (error) {
      console.error('Scryfall fetch error:', error);
      throw error;
    }
  }

  // Get autocomplete suggestions (faster, limited results)
  // Returns array of card names (not full card objects)
  async getCommanderSuggestions(query) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    try {
      // Use searchCommanders which filters by is:commander
      const cards = await this.searchCommanders(query);
      const cleanQuery = query.toLowerCase().trim();

      return cards
        .filter(card => {
          const name = card.name.toLowerCase();
          // Handles spaces correctly by checking inclusion or fuzzy match
          return name.includes(cleanQuery) || this.isFuzzyMatch(name, cleanQuery);
        })
        .sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();

          // Scoring for priority: Starts With > Word Boundary > Contains > Fuzzy
          const getScore = (name) => {
            if (name.startsWith(cleanQuery)) return 3;
            if (new RegExp(`[\\s,\\-]${cleanQuery}`).test(name)) return 2;
            if (name.includes(cleanQuery)) return 1;
            return 0;
          };

          const scoreA = getScore(aName);
          const scoreB = getScore(bName);

          if (scoreA !== scoreB) return scoreB - scoreA;
          return aName.localeCompare(bName);
        })
        .map(card => card.name);
    } catch (error) {
      if (error.name === 'AbortError') {
        // Silence abort errors
        return [];
      }
      console.error('Scryfall autocomplete error:', error);
      return [];
    }
  }

  // Helper: Extract color identity from card object
  // Returns array like ['W', 'U', 'B', 'G', 'R']
  getColorIdentity(card) {
    return card.color_identity || [];
  }

  // Helper: Get best image URL for a card
  // Returns URL string or null if no image available
  getCardImage(card, size = 'normal') {
    // Available sizes: small, normal, large, png, art_crop, border_crop
    if (card.image_uris) {
      return card.image_uris[size] || card.image_uris.normal;
    }
    
    // Handle double-faced cards
    if (card.card_faces && card.card_faces[0]?.image_uris) {
      return card.card_faces[0].image_uris[size] || card.card_faces[0].image_uris.normal;
    }
    
    return null;
  }

  // Helper: Get art crop URL (good for compact displays)
  getArtCrop(card) {
    return this.getCardImage(card, 'art_crop');
  }
}

// Export singleton instance
const scryfallService = new ScryfallService();
export default scryfallService;
