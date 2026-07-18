export const colors = {
  ink: '#142426',
  mineral: '#244C66',
  juniper: '#3F756B',
  pulse: '#E96A5B',
  mist: '#F2F6F5',
  paper: '#FCFDFC',
  warning: '#A96821',
  line: '#D5E0DD',
  muted: '#607174',
} as const

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
} as const

export const radii = {
  control: '10px',
  card: '14px',
  round: '999px',
} as const

export const motion = {
  quick: '160ms',
  settle: '220ms',
} as const

export type ColorToken = keyof typeof colors

const hexChannel = (hex: string, offset: number) =>
  Number.parseInt(hex.slice(offset, offset + 2), 16)

const toLinear = (channel: number) => {
  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

export const relativeLuminance = (hex: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Expected a six-digit hex color, received: ${hex}`)
  }

  const red = toLinear(hexChannel(hex, 1))
  const green = toLinear(hexChannel(hex, 3))
  const blue = toLinear(hexChannel(hex, 5))

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export const contrastRatio = (foreground: string, background: string) => {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}
