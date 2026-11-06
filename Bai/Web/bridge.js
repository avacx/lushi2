'use strict';
(() => {
  let sequence = 0;
  const pending = new Map();
  window.bai = {
    request(command, args = {}) {
      return new Promise((resolve, reject) => {
        if (!window.chrome?.webview) return reject(new Error('请从 Bai 客户端打开此页面。'));
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('操作仍未完成，请查看运行日志。')); }, 180000);
        pending.set(id, { resolve, reject, timer });
        window.chrome.webview.postMessage({ id, command, args });
      });
    },
    onState: null,
  };
  window.chrome?.webview?.addEventListener('message', ({ data }) => {
    if (data.event === 'state') return window.bai.onState?.(data.state);
    const p = pending.get(data.id);
    if (!p) return;
    clearTimeout(p.timer); pending.delete(data.id);
    data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
  });
})();
