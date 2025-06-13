export function calculateUptime(establishTimeStr) {
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

export function formatEstablishTime(timeStr) {
  if (!timeStr) return "未设置";
  const [year, month, day, hour, minute] = timeStr.split('/').map(Number);
  return `${year}年${month}月${day}日${hour}时${minute}分`;
}
