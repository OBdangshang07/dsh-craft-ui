import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = join(root, 'lib')
const generated = join(root, 'assets', 'generated')
execFileSync(process.execPath, [join(root, 'scripts', 'generate-assets.mjs')], { stdio: 'inherit' })
await mkdir(lib, { recursive: true })

await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  outfile: join(lib, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  external: ['@deepseek-ai/cordis', '@deepseek-ai/schemastery'],
  sourcemap: false,
})

let css = await readFile(join(root, 'src', 'client', 'style.css'), 'utf8')
const embeddedAssets = {
  ASSET_BUTTON_NORMAL: { path: join(generated, 'button-normal.png'), mime: 'image/png' },
  ASSET_BUTTON_HOVER: { path: join(generated, 'button-hover.png'), mime: 'image/png' },
  ASSET_BUTTON_PRESSED: { path: join(generated, 'button-pressed.png'), mime: 'image/png' },
  ASSET_PANEL: { path: join(generated, 'panel.png'), mime: 'image/png' },
  ASSET_TOOLTIP: { path: join(generated, 'tooltip.png'), mime: 'image/png' },
  ASSET_STONE: { path: join(generated, 'stone.png'), mime: 'image/png' },
  ASSET_DEEPSLATE: { path: join(generated, 'deepslate.png'), mime: 'image/png' },
  ASSET_ICONS: { path: join(generated, 'icons.png'), mime: 'image/png' },
  ASSET_FONT_UI: { path: join(root, 'assets', 'fonts', 'fusion-pixel-10px-monospaced-zh-hans.woff2'), mime: 'font/woff2' },
}
for (const [token, asset] of Object.entries(embeddedAssets)) {
  const data = await readFile(asset.path)
  css = css.replaceAll(`__${token}__`, `data:${asset.mime};base64,${data.toString('base64')}`)
}
if (/__ASSET_[A-Z_]+__/.test(css)) throw new Error('Unresolved bundled asset placeholder in client CSS')

const styleModule = `export default ${JSON.stringify(css)};`
const stylePlugin = {
  name: 'craft-ui-generated-styles',
  setup(context) {
    context.onResolve({ filter: /^\.\/generated-styles\.ts$/ }, () => ({ path: 'generated-styles', namespace: 'craft-ui' }))
    context.onLoad({ filter: /^generated-styles$/, namespace: 'craft-ui' }, () => ({ contents: styleModule, loader: 'ts' }))
  },
}

const result = await build({
  entryPoints: [join(root, 'src', 'client', 'index.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome110'],
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  plugins: [stylePlugin],
  write: false,
  sourcemap: false,
  minify: false,
  jsx: 'automatic',
})
const bundle = result.outputFiles?.find(file => file.path.endsWith('.js'))?.text ?? result.outputFiles?.[0]?.text
if (!bundle) throw new Error('Client build produced no JavaScript')
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const wrapped = `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(packageJson.name)},\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n${bundle}\n    return module.exports;\n  }\n});\n`
await writeFile(join(lib, 'client.js'), wrapped)
await build({
  entryPoints: [join(root, 'src', 'client', 'gameplay.ts')],
  outfile: join(lib, 'client-gameplay.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: ['es2022'],
})
await build({
  entryPoints: [join(root, 'src', 'client', 'hotbar.ts')],
  outfile: join(lib, 'client-hotbar.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: ['es2022'],
})
console.log(`built ${packageJson.name}: ${wrapped.length} client bytes`)
