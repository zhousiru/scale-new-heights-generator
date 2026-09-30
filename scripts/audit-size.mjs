import { readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const dependencies = new Map()
function collectModules() {
  return {
    name: 'audit-module-size',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue
        for (const [id, module] of Object.entries(chunk.modules)) {
          const match = id.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/)
          if (!match) continue
          const name = match[1]
          const files = dependencies.get(name) ?? new Map()
          files.set(id, module.renderedLength)
          dependencies.set(name, files)
        }
      }
    },
  }
}

// 在内存中构建，统计包含 Worker 的产物，不写入 dist。
const result = await build({
  root,
  logLevel: 'silent',
  plugins: [collectModules()],
  worker: { plugins: () => [collectModules()] },
  build: { write: false, reportCompressedSize: false },
})
const outputs = (Array.isArray(result) ? result : [result]).flatMap(value => value.output)
const assets = outputs
  .map(output => {
    const content = output.type === 'chunk' ? output.code : output.source
    return {
      file: output.fileName,
      bytes: Buffer.byteLength(content),
      gzip: gzipSync(content).length,
      ...(output.type === 'chunk' ? { imports: output.imports, dynamicImports: output.dynamicImports } : {}),
    }
  }).sort((a, b) => b.bytes - a.bytes)
const publicFiles = await Promise.all((await readdir(new URL('../public/', import.meta.url))).map(async file => ({
  file,
  bytes: (await stat(new URL(`../public/${file}`, import.meta.url))).size,
})))
console.log(JSON.stringify({
  assets,
  publicFiles,
  // 模块长度来自最终压缩之前，只用于定位体积来源，不能相加当作下载体积。
  dependenciesBeforeMinification: [...dependencies].map(([name, files]) => ({
    name, bytes: [...files.values()].reduce((sum, bytes) => sum + bytes, 0),
  })).sort((a, b) => b.bytes - a.bytes),
}, null, 2))
