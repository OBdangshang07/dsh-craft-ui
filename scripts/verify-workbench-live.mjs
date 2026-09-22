import assert from 'node:assert/strict'
import { withCanaryBrowser, delay } from './canary-browser.mjs'

// Only run against the isolated seeded canary. Never submits a model request.
const log = process.argv[2]
if (!log) throw new Error('Pass the isolated seeded canary startup log')
const sessionId = 'c8cd6e4e-38ab-49f9-b12e-a562d8f02721'
await withCanaryBrowser(log, async b => {
  const { call, evaluate, waitFor, clickText, capture, errors } = b
  await call('Page.bringToFront')
  await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续'))?.click()`)
  const row = `[data-row-key="session:${sessionId}"]`
  await waitFor(`!!document.querySelector(${JSON.stringify(row)})`)
  await evaluate(`document.querySelector(${JSON.stringify(row)}).click()`)
  await waitFor(`document.querySelectorAll('.craft-map-preview img').length===3`)
  await capture('workbench-real-session')
  const change = async (selector, value) => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await clickText('打开图片工作台 / 对比')
  await waitFor(`!!document.querySelector('.craft-image-canvas img')`)
  await change('.craft-region-fields input', '20')
  await change('.craft-annotation-controls textarea', '真实插槽与 Host 持久化集成测试')
  await clickText('保存标注')
  await waitFor(`document.querySelector('.craft-workbench-notice')?.textContent.includes('标注已保存')`)
  await clickText('将反馈加入草稿')
  await waitFor(`document.querySelector('.craft-workbench-notice')?.textContent.includes('已加入草稿')`)
  await capture('workbench-real-annotation')
  await clickText('关闭')
  await clickText('打开会话书签')
  await waitFor(`!!document.querySelector('.craft-note-card')`)
  await clickText('收藏消息')
  await clickText('收藏摘录')
  await clickText('保存')
  await waitFor(`document.querySelector('.craft-workbench')?.textContent.includes('已保存；没有发送给模型')`)
  await clickText('来源原文')
  await waitFor(`!!document.querySelector('.craft-notebook-source')`)
  assert.match(await evaluate(`document.querySelector('.craft-notebook-source').textContent`), /三个持久图片附件/)
  await clickText('返回')
  const count = await evaluate(`document.querySelectorAll('.craft-note-card').length`)
  assert.ok(count >= 2)
  await capture('workbench-real-book')
  await call('Page.reload', { ignoreCache: true })
  await waitFor(`!!document.querySelector('[aria-label="打开会话书签"]')`)
  await clickText('打开会话书签')
  await waitFor(`document.querySelectorAll('.craft-note-card').length===${count}`)
  assert.deepEqual(errors, [])
  console.log('Real DSH integration passed: persisted images, native slots, annotation/source RPC, draft insertion, bookmarks and reload. No model requests.')
})
