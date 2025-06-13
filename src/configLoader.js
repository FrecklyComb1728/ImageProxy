import { promises as fs } from 'fs';

export async function loadConfig(configPath, fallback) {
  try {
    const configText = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(configText);
  } catch (e) {
    console.error("加载配置文件失败，使用默认配置", e);
    return fallback;
  }
}
