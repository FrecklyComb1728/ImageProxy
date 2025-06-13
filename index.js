import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadConfig } from './src/configLoader.js';
import { loadStatics } from './src/staticLoader.js';
import { parseTime, getCacheHeaders } from './src/cacheUtils.js';
import { logBuffer } from './src/logBuffer.js';
import { calculateUptime, formatEstablishTime } from './src/uptimeUtils.js';
import ImageCache from './src/imageCache.js';
import basicRoutes from './src/routes/basicRoutes.js';
import proxyRoute from './src/routes/proxyRoute.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FAVICON_PATH = join(__dirname, "public", "favicon.ico");
const INDEX_FILE = join(__dirname, "public", "index.html");
const CONFIG_HTML_FILE = join(__dirname, "public", "list.html");
const CONFIG_FILE = join(__dirname, "index_config.json");
const CONFIG_ENDPOINT = "/list";

const app = express();
const fallbackConfig = {
  title: "MIFENG CDN代理服务",
  description: "高性能多源CDN代理解决方案",
  footer: "© 2025 Mifeng CDN服务 | 提供稳定快速的资源访问",
  proxies: []
};
const config = await loadConfig(CONFIG_FILE, fallbackConfig);
const [homepage, configHtml, favicon] = await loadStatics({
  index: INDEX_FILE,
  configHtml: CONFIG_HTML_FILE,
  favicon: FAVICON_PATH
});
const START_TIME = new Date();
const maxAgeSeconds = config.cache?.maxTime ? parseTime(config.cache.maxTime) : 86400;
const cacheHeaders = getCacheHeaders(maxAgeSeconds);
const imageCache = new ImageCache(config);

basicRoutes(app, config, START_TIME, homepage, favicon, configHtml, CONFIG_ENDPOINT, maxAgeSeconds, cacheHeaders);
proxyRoute(app, config, cacheHeaders, imageCache);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务已启动，端口: ${PORT}`);
});
