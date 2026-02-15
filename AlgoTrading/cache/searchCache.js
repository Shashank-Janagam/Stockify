const cache = new Map();

/*
 key   → search query
 value → results
*/
export function getFromCache(query) {
  return cache.get(query);
}

export function setToCache(query, results) {
  cache.set(query, {
    data: results,
    ts: Date.now()
  });
}
