// Iconify 图标的来源判定。浏览器与 Node 两条加载路径共用，避免正则与规则各写一份。

// Phosphor 等库以 `-duotone` 后缀提供双色调图标（靠 currentColor + 两档透明度）。
export function isDuotoneIcon(iconId: string): boolean {
  return /duotone/i.test(iconId)
}

// SVG 是否内嵌硬编码颜色（多色图标），而非仅用 currentColor。
export function svgHasHardcodedColor(svg: string): boolean {
  return /(?:fill|stop-color)\s*=\s*["']\s*(?:#|rgb\(|hsl\()/i.test(svg)
}

// Iconify 对未知图标返回 "404" 文本而非 SVG。
export function svgIsRenderable(svg: string): boolean {
  return svg.includes('<svg')
}
