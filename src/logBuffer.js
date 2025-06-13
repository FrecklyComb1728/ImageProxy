const LOG_BUFFER_SIZE = 2000;
let logBuffer = [];
function pushLog(msg) {
  const time = new Date().toISOString();
  logBuffer.push(`[${time}] ${msg}`);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
}
const rawLog = console.log;
const rawError = console.error;
console.log = (...args) => {
  pushLog(args.map(String).join(' '));
  rawLog.apply(console, args);
};
console.error = (...args) => {
  pushLog('[ERROR] ' + args.map(String).join(' '));
  rawError.apply(console, args);
};
export { logBuffer };
