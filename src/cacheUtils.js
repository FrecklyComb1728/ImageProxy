export function parseTime(timeStr) {
    if (typeof timeStr === 'number') return timeStr;
    const match = timeStr.match(/^(\d+)S$/i);
    if (!match) throw new Error('Invalid time format. Use format like "86400S"');
    return parseInt(match[1]);
}

export function getCacheHeaders(maxAgeSeconds) {
    return {
        "Cache-Control": `public, max-age=${maxAgeSeconds}`,
        "CDN-Cache-Control": `max-age=${maxAgeSeconds}`,
    };
}
