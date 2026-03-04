/**
 * Advanced Multi-Layer Cache System
 * Demonstrates intermediate/advanced JavaScript concepts:
 * - Closures and private state
 * - Prototype-based inheritance
 * - Async/await patterns
 * - Event-driven architecture
 * - Memory management with LRU eviction
 * - Promise-based API design
 */

class AdvancedCache {
    constructor(options = {}) {
        // Private cache storage using WeakMap for memory efficiency
        const _cache = new Map();
        const _accessTimes = new Map();
        const _subscribers = new Set();
        
        // Configuration with defaults
        const config = {
            maxSize: options.maxSize || 1000,
            ttl: options.ttl || 300000, // 5 minutes default
            enableMetrics: options.enableMetrics || false,
            ...options
        };
        
        // Metrics tracking (optional)
        const metrics = config.enableMetrics ? {
            hits: 0,
            misses: 0,
            evictions: 0,
            sets: 0
        } : null;
        
        // Private methods using closures
        const _isExpired = (key) => {
            const item = _cache.get(key);
            return item && Date.now() > item.expiresAt;
        };
        
        const _updateAccessTime = (key) => {
            _accessTimes.set(key, Date.now());
        };
        
        const _evictLRU = () => {
            if (_cache.size >= config.maxSize) {
                let oldestKey = null;
                let oldestTime = Date.now();
                
                for (const [key, time] of _accessTimes) {
                    if (time < oldestTime) {
                        oldestTime = time;
                        oldestKey = key;
                    }
                }
                
                if (oldestKey) {
                    _cache.delete(oldestKey);
                    _accessTimes.delete(oldestKey);
                    if (metrics) metrics.evictions++;
                    _notifySubscribers('evict', { key: oldestKey });
                }
            }
        };
        
        const _notifySubscribers = (event, data) => {
            _subscribers.forEach(callback => {
                try {
                    callback({ type: event, ...data, timestamp: Date.now() });
                } catch (error) {
                    console.error('Cache subscriber error:', error);
                }
            });
        };
        
        // Public API methods
        this.set = (key, value, customTtl) => {
            const ttl = customTtl || config.ttl;
            const expiresAt = Date.now() + ttl;
            
            // Check if key exists to update metrics appropriately
            const exists = _cache.has(key);
            
            _cache.set(key, { value, expiresAt, createdAt: Date.now() });
            _updateAccessTime(key);
            
            if (!exists && metrics) metrics.sets++;
            
            // Trigger eviction if needed
            _evictLRU();
            
            // Notify subscribers
            _notifySubscribers('set', { key, value, ttl });
            
            return true;
        };
        
        this.get = (key) => {
            // Check if key exists and is not expired
            if (!_cache.has(key)) {
                if (metrics) metrics.misses++;
                return null;
            }
            
            if (_isExpired(key)) {
                this.delete(key);
                if (metrics) metrics.misses++;
                return null;
            }
            
            _updateAccessTime(key);
            if (metrics) metrics.hits++;
            
            const item = _cache.get(key);
            _notifySubscribers('get', { key, value: item.value });
            
            return item.value;
        };
        
        this.delete = (key) => {
            const existed = _cache.delete(key);
            _accessTimes.delete(key);
            
            if (existed) {
                _notifySubscribers('delete', { key });
            }
            
            return existed;
        };
        
        this.has = (key) => {
            return _cache.has(key) && !_isExpired(key);
        };
        
        this.clear = () => {
            const size = _cache.size;
            _cache.clear();
            _accessTimes.clear();
            
            if (metrics) metrics.evictions += size;
            _notifySubscribers('clear', { clearedItems: size });
            
            return size;
        };
        
        // Async batch operations
        this.getMany = async (keys) => {
            const results = await Promise.all(
                keys.map(async (key) => {
                    const value = this.get(key);
                    return { key, value };
                })
            );
            
            return results.reduce((acc, { key, value }) => {
                acc[key] = value;
                return acc;
            }, {});
        };
        
        this.setMany = async (entries, customTtl) => {
            const results = await Promise.all(
                entries.map(async ([key, value]) => {
                    const success = this.set(key, value, customTtl);
                    return { key, success };
                })
            );
            
            return results.filter(({ success }) => success).length;
        };
        
        // Event subscription system
        this.subscribe = (callback) => {
            _subscribers.add(callback);
            
            // Return unsubscribe function
            return () => {
                _subscribers.delete(callback);
            };
        };
        
        // Advanced features
        this.getTTL = (key) => {
            const item = _cache.get(key);
            if (!item) return -1;
            return Math.max(0, item.expiresAt - Date.now());
        };
        
        this.setTTL = (key, ttl) => {
            const item = _cache.get(key);
            if (!item) return false;
            
            item.expiresAt = Date.now() + ttl;
            _notifySubscribers('ttlUpdate', { key, ttl });
            
            return true;
        };
        
        // Utility methods
        this.size = () => _cache.size;
        this.keys = () => Array.from(_cache.keys());
        this.values = () => Array.from(_cache.values()).map(item => item.value);
        
        // Metrics access
        this.getMetrics = () => {
            if (!metrics) return null;
            
            const hitRate = metrics.hits / (metrics.hits + metrics.misses) || 0;
            
            return {
                ...metrics,
                hitRate: Math.round(hitRate * 100) / 100,
                size: _cache.size,
                maxSize: config.maxSize
            };
        };
        
        // Cleanup expired items periodically
        if (config.autoCleanup) {
            setInterval(() => {
                const now = Date.now();
                const expiredKeys = [];
                
                for (const [key, item] of _cache) {
                    if (now > item.expiresAt) {
                        expiredKeys.push(key);
                    }
                }
                
                expiredKeys.forEach(key => this.delete(key));
            }, config.cleanupInterval || 60000); // Every minute
        }
    }
}

// Factory function for specialized cache instances
const createCache = (type, options = {}) => {
    switch (type) {
        case 'lru':
            return new AdvancedCache({ ...options, maxSize: options.maxSize || 100 });
        case 'session':
            return new AdvancedCache({ ...options, ttl: options.ttl || 1800000 }); // 30 mins
        case 'persistent':
            return new AdvancedCache({ ...options, ttl: options.ttl || 86400000 }); // 24 hours
        default:
            return new AdvancedCache(options);
    }
};

// Usage examples demonstrating the capabilities
const demonstrateCache = async () => {
    console.log('🚀 Advanced Cache System Demo');
    
    // Create a specialized cache
    const cache = createCache('lru', { 
        maxSize: 5, 
        enableMetrics: true,
        autoCleanup: true 
    });
    
    // Subscribe to cache events
    const unsubscribe = cache.subscribe((event) => {
        console.log(`📡 Cache Event: ${event.type}`, event);
    });
    
    // Basic operations
    cache.set('user:1', { name: 'Alice', role: 'admin' });
    cache.set('user:2', { name: 'Bob', role: 'user' });
    
    console.log('Get user:1:', cache.get('user:1'));
    console.log('Has user:2:', cache.has('user:2'));
    
    // Async batch operations
    await cache.setMany([
        ['session:abc', { userId: 1, token: 'xyz' }],
        ['settings:theme', 'dark'],
        ['settings:lang', 'en']
    ]);
    
    const batchResults = await cache.getMany(['user:1', 'session:abc', 'settings:theme']);
    console.log('Batch results:', batchResults);
    
    // Test LRU eviction
    cache.set('temp:1', 'data1');
    cache.set('temp:2', 'data2');
    cache.set('temp:3', 'data3');
    cache.set('temp:4', 'data4');
    cache.set('temp:5', 'data5');
    cache.set('temp:6', 'data6'); // Should evict oldest
    
    console.log('Cache size after eviction:', cache.size());
    console.log('Cache keys:', cache.keys());
    
    // TTL operations
    cache.set('expiring', 'will expire soon', 1000); // 1 second
    setTimeout(() => {
        console.log('Expired key exists:', cache.has('expiring'));
    }, 1500);
    
    // Metrics
    console.log('Cache metrics:', cache.getMetrics());
    
    // Cleanup
    unsubscribe();
    cache.clear();
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AdvancedCache, createCache, demonstrateCache };
}

// Auto-run demo if called directly
if (typeof window === 'undefined' && require.main === module) {
    demonstrateCache().catch(console.error);
}
