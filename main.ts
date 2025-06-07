const FAVICON_PATH = "./public/favicon.ico";
const INDEX_FILE = "./public/index.html";
const CONFIG_HTML_FILE = "./public/list.html";
const CONFIG_FILE = "./config/main_config.json";
const CACHE_MAX_AGE = 5184000; // 24小时缓存（单位：秒）
const CONFIG_ENDPOINT = "/list"; // 统一配置端点

// 加载配置文件
let config;
try {
  const configText = await Deno.readTextFile(CONFIG_FILE);
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
  Deno.readTextFile(INDEX_FILE).catch(() => null),
  Deno.readTextFile(CONFIG_HTML_FILE).catch(() => null),
  Deno.readFile(FAVICON_PATH).catch(() => null),
]);

// 服务启动时间
const START_TIME = new Date();

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 统一缓存头配置
  const cacheHeaders = {
    "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
    "CDN-Cache-Control": `max-age=${CACHE_MAX_AGE}`,
  };

  // 处理统一配置端点（整合/list和/config功能）
  if (url.pathname === CONFIG_ENDPOINT) {
    const params = new URLSearchParams(url.search);
    
    // 处理JSON格式请求
    if (params.get("format") === "json") {
      const uptime = Date.now() - START_TIME.getTime();
      const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
      const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
      
      const configInfo = {
        status: "active",
        version: "v1.0",
        uptime: `${uptimeHours}小时${uptimeMinutes}分钟`,
        startTime: START_TIME.toISOString(),
        cacheMaxAge: `${CACHE_MAX_AGE}秒`,
        serviceConfig: {
          title: config.title,
          description: config.description,
          footer: config.footer
        },
        proxies: config.proxies.map(proxy => ({
          prefix: proxy.prefix,
          target: proxy.target,
          description: proxy.description || "未提供描述",
          visible: proxy.visible === undefined ? true : proxy.visible,
          rawRedirect: proxy.rawRedirect || "使用默认目标URL",
          endpoints: [
            `https://${url.host}${proxy.prefix}`,
            `https://${url.host}${proxy.prefix}?raw=true`
          ]
        }))
      };
      
      return new Response(JSON.stringify(configInfo, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-cache"
        }
      });
    }
    
    // 处理HTML格式请求
    if (!configHtml) {
      return new Response("Configuration UI not available", { status: 503 });
    }
    
    const uptime = Date.now() - START_TIME.getTime();
    const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const cacheDays = Math.round(CACHE_MAX_AGE / 86400);
    
    // 构建代理列表HTML
    const proxyListHtml = config.proxies.map(proxy => `
      <tr>
        <td>${proxy.prefix}</td>
        <td>${proxy.target}</td>
        <td>${proxy.description || "未提供描述"}</td>
        <td>${proxy.visible === undefined ? '是' : proxy.visible ? '是' : '否'}</td>
        <td>${proxy.rawRedirect || "自动生成"}</td>
        <td>
          <button class="copy-btn" data-url="${url.origin}${proxy.prefix}">复制代理URL</button>
        </td>
      </tr>
    `).join("");
    
    // 替换配置HTML中的占位符
    const fullConfigHtml = configHtml
      .replace(/{{TITLE}}/g, config.title || "CDN代理服务")
      .replace(/{{DESCRIPTION}}/g, config.description || "高性能CDN代理服务")
      .replace(/{{FOOTER}}/g, config.footer || "© 2025 Mifeng CDN代理服务")
      .replace(/{{START_TIME}}/g, START_TIME.toLocaleString())
      .replace(/{{UPTIME}}/g, `${uptimeHours}小时${uptimeMinutes}分钟`)
      .replace(/{{CACHE_DAYS}}/g, cacheDays)
      .replace(/{{PROXY_LIST}}/g, proxyListHtml)
      .replace(/{{CONFIG_ENDPOINT}}/g, `${CONFIG_ENDPOINT}?format=json`);
    
    return new Response(fullConfigHtml, {
      headers: {
        ...cacheHeaders,
        "Content-Type": "text/html; charset=utf-8",
      }
    });
  }

  // 处理图标请求
  if (url.pathname === "/favicon.ico") {
    return favicon 
      ? new Response(favicon, {
          headers: {
            ...cacheHeaders,
            "Content-Type": "image/x-icon",
          }
        })
      : new Response("Not Found", { status: 404 });
  }

  // 处理首页
  if (url.pathname === "/" || url.pathname === "") {
    if (!homepage) {
      return new Response("Service Unavailable", { status: 503 });
    }
    
    return new Response(homepage, {
      headers: {
        ...cacheHeaders,
        "Content-Type": "text/html; charset=utf-8",
      }
    });
  }

  // 代理请求处理
  let proxyConfig = null;
  let basePath = url.pathname;

  // 查找匹配的代理配置
  for (const proxy of config.proxies) {
    if (url.pathname.startsWith(proxy.prefix)) {
      proxyConfig = proxy;
      basePath = url.pathname.slice(proxy.prefix.length);
      break;
    }
  }

  if (!proxyConfig) {
    return new Response("Not Found", { status: 404 });
  }

  // 路径安全化处理
  const sanitizedPath = basePath
    .replace(/^\//, "")
    .replace(/\|/g, "")
    .replace(/\/+/g, "/");

  // 构建目标URL
  const targetUrl = new URL(sanitizedPath, proxyConfig.target);

  // 处理 raw 参数
  if (url.searchParams.get("raw") === "true") {
    let redirectUrl;
    
    if (proxyConfig.rawRedirect) {
      redirectUrl = proxyConfig.rawRedirect.replace("{path}", sanitizedPath);
    } else {
      redirectUrl = targetUrl.toString();
    }
    
    const params = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (key !== "raw") params.append(key, value);
    });
    
    if (params.toString()) {
      redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + params.toString();
    }
    
    return new Response(null, {
      status: 302,
      headers: {
        "Location": redirectUrl,
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  }

  try {
    const headers = new Headers(req.headers);
    headers.delete("host");

    url.searchParams.forEach((value, key) => {
      targetUrl.searchParams.append(key, value);
    });

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.body,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", `public, max-age=${CACHE_MAX_AGE}`);
    
    const contentType = responseHeaders.get("Content-Type") || "application/octet-stream";
    if (!contentType.includes('charset')) {
      responseHeaders.set("Content-Type", `${contentType}; charset=utf-8`);
    } else {
      responseHeaders.set("Content-Type", contentType);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    return new Response("Bad Gateway", {
      status: 502,
      headers: {
        ...cacheHeaders,
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
});

console.log(`
✅ 服务已启动（全资源缓存 ${CACHE_MAX_AGE} 秒）
├ 服务配置:
│   标题: ${config.title || "未设置"}
│   描述: ${config.description || "未设置"}
│   页脚: ${config.footer || "未设置"}
├ 代理配置:
${config.proxies.map(p => `│   ${p.prefix} → ${p.target}\n│      描述: ${p.description || "未提供"}\n│      可见: ${p.visible === undefined ? '是' : p.visible ? '是' : '否'}\n│      重定向模板: ${p.rawRedirect || "自动生成"}`).join("\n")}
├ 统一配置端点: ${CONFIG_ENDPOINT} (HTML) 和 ${CONFIG_ENDPOINT}?format=json (JSON)
└ 启动时间: ${START_TIME.toLocaleString()}
`);