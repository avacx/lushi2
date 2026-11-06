'use strict';
const key = document.getElementById('keyInput');
const message = document.getElementById('msg');
const verify = document.getElementById('verifyBtn');
let running = false;
window.bai.onState = state => {
  running = state.busy;
  if (document.activeElement !== key && state.key != null) key.value = state.key;
  verify.disabled = running;
  key.disabled = running;
  verify.textContent = running ? '验证中…' : '验证';
  message.textContent = state.message || '';
  message.className = 'msg' + (state.error ? ' err' : '');
};
async function submit() {
  if (running) return;
  if (!key.value.trim()) { message.textContent = '请输入卡密'; key.focus(); return; }
  verify.disabled = true;
  try { await bai.request('login', { key: key.value.trim() }); }
  catch (e) { message.textContent = e.message; message.className = 'msg err'; }
  finally { verify.disabled = false; }
}
verify.addEventListener('click', submit);
key.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
document.getElementById('quitBtn').onclick = () => bai.request('close');
document.getElementById('closeBtn').onclick = () => bai.request('close');
bai.request('ready').catch(e => { message.textContent = e.message; });
key.focus();
