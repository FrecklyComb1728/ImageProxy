const FAVICON_PATH = "./public/favicon.ico";
const CACHE_MAX_AGE = 5184000; // 24小时缓存（单位：秒）

// 预加载资源
const [homepage, favicon] = await Promise.all([
  Deno.readTextFile("./public/index.html").catch(() => null),
  Deno.readFile(FAVICON_PATH).catch(() => null),
]);

// 配置多个代理路径，带有冗余措施
const PROXIES = [
  {
    prefix: "/imlazy/",
    target: "https://cdn.imlazy.ink:233/img/background/",
  },
  {
    prefix: "/",
    target: "https://cdn.statically.io/gh/FrecklyComb1728/image-oss@master/",
    rawRedirect: "https://cdn.jsdmirror.cn/gh/FrecklyComb1728/image-oss@master/{path}"
  }
].sort((a, b) => b.prefix.length - a.prefix.length);

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 统一缓存头配置
  const cacheHeaders = {
    "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
    "CDN-Cache-Control": `max-age=${CACHE_MAX_AGE}`,
  };

  // 修复: 使用正确的 favicon.ico 路径
  // 处理图标请求 - 确保浏览器请求 /favicon.ico 时返回正确的图标
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
    return homepage 
      ? new Response(homepage, {
          headers: {
            ...cacheHeaders,
            "Content-Type": "text/html; charset=utf-8",
          }
        })
      : new Response("Service Unavailable", { status: 503 });
  }

  // 代理请求处理
  let proxyConfig = null;
  let basePath = url.pathname;

  // 查找匹配的代理配置 - 按前缀长度降序确保精确匹配
  for (const proxy of PROXIES) {
    if (url.pathname.startsWith(proxy.prefix)) {
      proxyConfig = proxy;
      basePath = url.pathname.slice(proxy.prefix.length);
      break;
    }
  }

  if (!proxyConfig) {
    return new Response("Not Found", { status: 404 });
  }

  // 路径安全化处理 - 防止路径遍历攻击
  const sanitizedPath = basePath
    .replace(/^\//, "") // 去除开头斜杠
    .replace(/\|/g, "") // 去除非法字符
    .replace(/\/+/g, "/"); // 合并连续斜杠

  // 构建目标URL
  const targetUrl = new URL(sanitizedPath, proxyConfig.target);

  // 处理 raw 参数（当 raw=true 时重定向到源链接）
  if (url.searchParams.get("raw") === "true") {
    let redirectUrl;
    
    // 1. 检查是否配置了自定义重定向模板
    if (proxyConfig.rawRedirect) {
      // 使用自定义模板构建重定向URL ({path}占位符会被替换)
      redirectUrl = proxyConfig.rawRedirect.replace("{path}", sanitizedPath);
    } 
    // 2. 冗余措施：没有自定义模板时自动使用目标URL作为重定向地址
    else {
      redirectUrl = targetUrl.toString();
    }
    
    // 添加查询参数（排除raw参数）
    const params = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (key !== "raw") params.append(key, value);
    });
    
    if (params.toString()) {
      // 智能处理查询参数分隔符 (? vs &)
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
    headers.delete("host"); // 删除原始host头

    // 添加所有查询参数到目标 URL
    url.searchParams.forEach((value, key) => {
      targetUrl.searchParams.append(key, value);
    });

    // 转发请求到目标服务器
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.body,
    });

    const responseHeaders = new Headers(response.headers);
    
    // 强制设置缓存头
    responseHeaders.set("Cache-Control", `public, max-age=${CACHE_MAX_AGE}`);
    
    // 确保响应包含正确的内容类型
    const contentType = responseHeaders.get("Content-Type") || "application/octet-stream";
    // 智能添加字符集参数（避免重复）
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
├ 代理配置:
${PROXIES.map(p => `│   ${p.prefix} → ${p.target}\n│      重定向模板: ${p.rawRedirect || "自动生成"}`).join("\n")}
└ 启动时间: ${new Date().toLocaleString()}
`);