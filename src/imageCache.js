// 工具函数
function parseSize(sizeStr) {
    if (typeof sizeStr === 'number') return sizeStr;
    const match = sizeStr.match(/^(\d+)(MB|KB|B)$/i);
    if (!match) throw new Error('Invalid size format. Use format like "8MB", "1024KB" or "1048576B"');
    const [, size, unit] = match;
    const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1024 * 1024 };
    return parseInt(size) * multipliers[unit.toUpperCase()];
}
function parseTime(timeStr) {
    if (typeof timeStr === 'number') return timeStr;
    const match = timeStr.match(/^(\d+)S$/i);
    if (!match) throw new Error('Invalid time format. Use format like "86400S"');
    return parseInt(match[1]) * 1000;
}
function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(2)}${units[unitIndex]}`;
}

class MemoryCache {
    constructor(maxSize) {
        this.cache = new Map();
        this.maxSize = parseSize(maxSize);
        this.currentSize = 0;
    }
    set(key, value, size, maxAge) {
        while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
            const firstKey = this.cache.keys().next().value;
            this.delete(firstKey);
        }
        if (size > this.maxSize) {
            return false;
        }
        const expiresAt = maxAge ? Date.now() + parseTime(maxAge) : null;
        this.cache.set(key, {
            data: value,
            size: size,
            timestamp: Date.now(),
            expiresAt
        });
        this.currentSize += size;
        return true;
    }
    get(key) {
        const item = this.cache.get(key);
        if (item) {
            if (item.expiresAt && Date.now() > item.expiresAt) {
                this.delete(key);
                return null;
            }
            item.timestamp = Date.now();
            return item.data;
        }
        return null;
    }
    delete(key) {
        const item = this.cache.get(key);
        if (item) {
            this.currentSize -= item.size;
            this.cache.delete(key);
        }
    }
    has(key) {
        if (!this.cache.has(key)) return false;
        const item = this.cache.get(key);
        if (item.expiresAt && Date.now() > item.expiresAt) {
            this.delete(key);
            return false;
        }
        return true;
    }
    getSize() {
        return this.currentSize;
    }
    clear() {
        this.cache.clear();
        this.currentSize = 0;
    }
}

class ImageCache {
    constructor(config) {
        this.config = config;
        this.memoryCache = new MemoryCache("1024MB");
    }
    getCacheKey(req) {
        return req.path;
    }
    isCacheable(ext, bufferLength) {
        const allowedTypes = this.config.cache?.imageTypes || ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];
        const minSize = parseSize(this.config.cache?.minSize || "8MB");
        return allowedTypes.includes(ext) && bufferLength >= minSize;
    }
    get(req) {
        return this.memoryCache.get(this.getCacheKey(req));
    }
    set(req, buffer, contentType) {
        const cacheKey = this.getCacheKey(req);
        const maxTime = this.config.cache?.maxTime;
        this.memoryCache.set(cacheKey, { data: buffer, contentType }, buffer.length, maxTime);
    }
    formatSize(bytes) {
        return formatSize(bytes);
    }
}

export default ImageCache;
