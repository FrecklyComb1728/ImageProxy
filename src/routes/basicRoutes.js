import { getCacheHeaders } from '../cacheUtils.js';
import { logBuffer } from '../logBuffer.js';
import { calculateUptime, formatEstablishTime } from '../uptimeUtils.js';

export default function basicRoutes(app, config, START_TIME, homepage, favicon, configHtml, CONFIG_ENDPOINT, maxAgeSeconds, cacheHeaders) {
  // 配置页
  app.get(CONFIG_ENDPOINT, (req, res) => {
    const { format } = req.query;
    if (format === "json") {
      const uptime = Date.now() - START_TIME.getTime();
      const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
      const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
      const configInfo = {
        服务状态: "运行中",
        版本信息: "v1.0",
        运行时间: calculateUptime(config.establishTime),
        建站时间: config.establishTime || "未设置",      建站时间: formatEstablishTime(config.establishTime),
        缓存时间: `${Math.floor(maxAgeSeconds / 86400)}天`,
        服务配置: {
          服务名称: config.title,
          服务描述: config.description,
          页脚信息: config.footer
        },
        代理配置: config.proxies
          .filter(proxy => proxy.visible !== false)
          .map(proxy => ({
            代理路径: proxy.prefix,
            目标地址: proxy.target,
            代理说明: proxy.description || "未提供描述",
            重定向模板: proxy.rawRedirect || "使用默认目标URL",
            使用示例: {
              代理访问: `${req.protocol}://${req.get('host')}${proxy.prefix}`,
              直接重定向: `${req.protocol}://${req.get('host')}${proxy.prefix}?raw=true`
            }
          }))
      };
      return res.set({
        'Content-Type': 'application/json; charset=utf-8',
        ...getCacheHeaders(maxAgeSeconds)
      }).send(JSON.stringify(configInfo, null, 2));
    }
    if (!configHtml) {
      return res.status(503).send("Configuration UI not available");
    }
    const uptime = Date.now() - START_TIME.getTime();
    const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const cacheDays = Math.round(maxAgeSeconds / 86400);
    const proxyListHtml = config.proxies
      .filter(proxy => proxy.visible !== false)
      .map(proxy => {
        return `
          <tr>
            <td>${proxy.prefix}</td>
            <td>${proxy.target}</td>
            <td>${proxy.description || "未提供描述"}</td>
            <td>是</td>
            <td>${proxy.rawRedirect || "自动生成"}</td>
            <td>
              <button class="copy-btn" data-url="${req.protocol}://${req.get('host')}${proxy.prefix}">复制代理URL</button>
            </td>
          </tr>
        `;
      }).join("");
    const fullConfigHtml = configHtml
      .replace(/{{TITLE}}/g, config.title || "CDN代理服务")
      .replace(/{{DESCRIPTION}}/g, config.description || "高性能CDN代理服务")
      .replace(/{{FOOTER}}/g, config.footer || "© 2025 Mifeng CDN代理服务")
      .replace(/{{ESTABLISH_TIME}}/g, formatEstablishTime(config.establishTime))
      .replace(/{{ESTABLISH_TIME_RAW}}/g, config.establishTime || '')
      .replace(/{{UPTIME}}/g, `${uptimeHours}小时${uptimeMinutes}分钟`)
      .replace(/{{CACHE_DAYS}}/g, cacheDays)
      .replace(/{{PROXY_LIST}}/g, proxyListHtml)
      .replace(/{{CONFIG_ENDPOINT}}/g, `${CONFIG_ENDPOINT}?format=json`)
      .replace(/{{VISIBLE_COUNT}}/g, config.proxies.filter(p => p.visible !== false).length)
      .replace(/{{TOTAL_COUNT}}/g, config.proxies.length);
    res.set(getCacheHeaders(maxAgeSeconds)).send(fullConfigHtml);
  });
  // favicon
  app.get('/favicon.ico', (req, res) => {
    if (!favicon) return res.status(404).send("Not Found");
    res.set({ ...cacheHeaders, "Content-Type": "image/x-icon" }).send(favicon);
  });
  // 首页
  app.get('/', (req, res) => {
    if (!homepage) return res.status(503).send("Service Unavailable");
    res.set({ ...cacheHeaders, "Content-Type": "text/html; charset=utf-8" }).send(homepage);
  });
  // 日志
  app.get('/logs', (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(logBuffer.join('\n'));
  });
}
