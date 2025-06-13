import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FAVICON_PATH = join(__dirname, "public", "favicon.ico");
const INDEX_FILE = join(__dirname, "public", "index.html");
const CONFIG_HTML_FILE = join(__dirname, "public", "list.html");
const CONFIG_FILE = join(__dirname, "config", "main_config.json");
const CACHE_MAX_AGE = 5184000; // 24小时缓存（单位：秒）
const CONFIG_ENDPOINT = "/list"; // 统一配置端点

const app = express();

// 加载配置文件
let config;
try {
  const configText = await fs.readFile(CONFIG_FILE, 'utf-8');
  config = JSON.parse(configText);
} catch (e) {
  console.error("加载配置文件失败，使用默认配置", e);
  config = {
    title: "MIFENG CDN代理服务",
    description: "高性能多源CDN代理解决方案",
    footer: "© 2025 Mifeng CDN服务 | 提供稳定快速的资源访问",
    proxies: []
  };
}

// 预加载资源
const [homepage, configHtml, favicon] = await Promise.all([
  fs.readFile(INDEX_FILE, 'utf-8').catch(() => null),
  fs.readFile(CONFIG_HTML_FILE, 'utf-8').catch(() => null),
  fs.readFile(FAVICON_PATH).catch(() => null),
]);

// 服务启动时间
const START_TIME = new Date();

// 统一缓存头配置
const cacheHeaders = {
  "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
  "CDN-Cache-Control": `max-age=${CACHE_MAX_AGE}`,
};

// 计算服务运行时间
function calculateUptime(establishTimeStr) {
  if (!establishTimeStr) return "未设置建站时间";
  
  const [year, month, day, hour, minute] = establishTimeStr.split('/').map(Number);
  const establishDate = new Date(year, month - 1, day, hour, minute);
  
  const now = new Date();
  const diff = now - establishDate;
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  let uptime = "";
  if (days > 0) uptime += `${days}天`;
  if (hours > 0) uptime += `${hours}小时`;
  uptime += `${minutes}分钟`;
  
  return uptime;
}

// 格式化建站时间为中文格式
function formatEstablishTime(timeStr) {
  if (!timeStr) return "未设置";
  const [year, month, day, hour, minute] = timeStr.split('/').map(Number);
  return `${year}年${month}月${day}日${hour}时${minute}分`;
}

// 配置路由
app.get(CONFIG_ENDPOINT, (req, res) => {
  const { format } = req.query;
  
  // 处理JSON格式请求
  if (format === "json") {
    const uptime = Date.now() - START_TIME.getTime();
    const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    
    const configInfo = {      服务状态: "运行中",
      版本信息: "v1.0",
      运行时间: calculateUptime(config.establishTime),
      建站时间: config.establishTime || "未设置",      建站时间: formatEstablishTime(config.establishTime),
      缓存时间: `${Math.floor(CACHE_MAX_AGE / 86400)}天`,
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
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
    }).send(JSON.stringify(configInfo, null, 2));
  }
  
  // 处理HTML格式请求
  if (!configHtml) {
    return res.status(503).send("Configuration UI not available");
  }
  
  const uptime = Date.now() - START_TIME.getTime();
  const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
  const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
  const cacheDays = Math.round(CACHE_MAX_AGE / 86400);
  
  // 构建代理列表HTML
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
  
  res.set(cacheHeaders).send(fullConfigHtml);
});

// 处理图标请求
app.get('/favicon.ico', (req, res) => {
  if (!favicon) {
    return res.status(404).send("Not Found");
  }
  res.set({
    ...cacheHeaders,
    "Content-Type": "image/x-icon",
  }).send(favicon);
});

// 处理首页
app.get('/', (req, res) => {
  if (!homepage) {
    return res.status(503).send("Service Unavailable");
  }
  res.set({
    ...cacheHeaders,
    "Content-Type": "text/html; charset=utf-8",
  }).send(homepage);
});

// 代理请求处理
app.use(async (req, res) => {
  let proxyConfig = null;
  let basePath = req.path;

  // 查找匹配的代理配置
  for (const proxy of config.proxies) {
    if (req.path.startsWith(proxy.prefix)) {
      proxyConfig = proxy;
      basePath = req.path.slice(proxy.prefix.length);
      break;
    }
  }

  if (!proxyConfig) {
    return res.status(404).send("Not Found");
  }

  // 路径安全化处理
  const sanitizedPath = basePath
    .replace(/^\//, "")
    .replace(/\|/g, "")
    .replace(/\/+/g, "/");

  // 构建目标URL
  const targetUrl = new URL(sanitizedPath, proxyConfig.target);

  // 处理 raw 参数
  if (req.query.raw === "true") {
    let redirectUrl;
    
    if (proxyConfig.rawRedirect) {
      redirectUrl = proxyConfig.rawRedirect.replace("{path}", sanitizedPath);
    } else {
      redirectUrl = targetUrl.toString();
    }
    
    // 复制除了 raw 以外的所有查询参数
    const params = new URLSearchParams();
    Object.entries(req.query).forEach(([key, value]) => {
      if (key !== "raw") params.append(key, value);
    });
    
    if (params.toString()) {
      redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + params.toString();
    }
    
    return res.redirect(302, redirectUrl);
  }

  try {
    // 复制原始请求头
    const headers = { ...req.headers };
    delete headers.host;

    // 添加查询参数
    Object.entries(req.query).forEach(([key, value]) => {
      targetUrl.searchParams.append(key, value);
    });

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : null,
    });

    // 设置响应头
    const responseHeaders = Object.fromEntries(response.headers.entries());
    responseHeaders['Cache-Control'] = `public, max-age=${CACHE_MAX_AGE}`;
    
    const contentType = responseHeaders['content-type'] || "application/octet-stream";
    if (!contentType.includes('charset')) {
      responseHeaders['content-type'] = `${contentType}; charset=utf-8`;
    }

    res.status(response.status).set(responseHeaders);

    // 流式传输响应
    response.body.pipe(res);

  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    res.status(502).set({
      ...cacheHeaders,
      "Content-Type": "text/plain; charset=utf-8"
    }).send("Bad Gateway");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
✅ 服务已启动
├ 运行信息:
│   建站时间: ${config.establishTime || "未设置"}
│   已运行: ${calculateUptime(config.establishTime)}
│   缓存时间: ${Math.floor(CACHE_MAX_AGE / 86400)} 天
├ 服务配置:
│   服务名称: ${config.title || "未设置"}
│   服务描述: ${config.description || "未设置"}
│   页脚信息: ${config.footer || "未设置"}
├ 代理配置:
${config.proxies.map(p => 
    `│   ${p.prefix} → ${p.target}
│      说明: ${p.description || "未提供"}
│      状态: ${p.visible === undefined ? '显示' : p.visible ? '显示' : '隐藏'}
│      重定向: ${p.rawRedirect || "自动生成"}`
).join("\n")}
├ 访问地址:
│   配置页面: ${CONFIG_ENDPOINT}
│   JSON接口: ${CONFIG_ENDPOINT}?format=json
├ 建站时间: ${formatEstablishTime(config.establishTime)}
└ 监听端口: ${PORT}
`);
});
