import fetch from 'node-fetch';
export default function proxyRoute(app, config, cacheHeaders, imageCache) {
  app.use(async (req, res) => {
    try {
      console.log(`[请求] 路径: ${req.path}, 原始URL: ${req.originalUrl}, 方法: ${req.method}`);
      let proxyConfig = null;
      let basePath = req.path;
      for (const proxy of config.proxies) {
        if (req.path.startsWith(proxy.prefix)) {
          proxyConfig = proxy;
          basePath = req.path.slice(proxy.prefix.length);
          break;
        }
      }
      if (!proxyConfig) {
        console.log(`[输出] 未匹配到代理，返回404`);
        res.status(404).send('Not Found');
        return;
      }
      const sanitizedPath = basePath.replace(/^[\/]+/, "").replace(/\|/g, "").replace(/[\/]+/g, "/");
      const targetUrl = new URL(sanitizedPath, proxyConfig.target);
      console.log(`[代理] 目标URL: ${targetUrl}`);
      if (req.query.raw === "true") {
        let redirectUrl;
        if (proxyConfig.rawRedirect) {
          redirectUrl = proxyConfig.rawRedirect.replace("{path}", sanitizedPath);
        } else {
          redirectUrl = targetUrl.toString();
        }
        const params = new URLSearchParams();
        Object.entries(req.query).forEach(([key, value]) => {
          if (key !== "raw") params.append(key, value);
        });
        if (params.toString()) {
          redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + params.toString();
        }
        return res.redirect(302, redirectUrl);
      }
      if (config.cache?.enabled) {
        const cachedImage = imageCache.get(req);
        if (cachedImage) {
          console.log(`[缓存] 命中 ${req.path} (${imageCache.formatSize(cachedImage.data.length)})`);
          res.set('Content-Type', cachedImage.contentType);
          res.set(cacheHeaders);
          res.send(cachedImage.data);
          console.log(`[输出] 已从缓存返回图片，状态: 200`);
          return;
        }
      }
      const headers = { ...req.headers };
      delete headers.host;
      Object.entries(req.query).forEach(([key, value]) => {
        targetUrl.searchParams.append(key, value);
      });
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req : null,
      });
      if (!response.ok) {
        console.log(`[输出] 远程资源获取失败，状态: ${response.status}`);
        res.status(response.status).send(response.statusText);
        return;
      }
      const contentType = response.headers.get('content-type');
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = targetUrl.pathname.split('.').pop()?.toLowerCase();
      if (config.cache?.enabled && imageCache.isCacheable(ext, buffer.length)) {
        console.log(`[缓存] 存储 ${req.path} (${imageCache.formatSize(buffer.length)})`);
        imageCache.set(req, buffer, contentType);
      }
      res.set('Content-Type', contentType);
      res.set(cacheHeaders);
      res.send(buffer);
      console.log(`[输出] 已返回远程图片，状态: 200`);
    } catch (error) {
      console.error('代理请求失败:', error);
      res.status(500).send('Internal Server Error');
    }
  });
}
