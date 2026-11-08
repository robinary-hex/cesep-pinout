/**
 * Rastérisation d'un SVG en PNG dans le navigateur : le SVG devient une image, dessinée sur un
 * canvas aux dimensions exactes demandées, puis encodée. Les PNG embarqués en data URL et les
 * polices système passent sans réseau.
 */

export function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Canvas 2D indisponible'))
        return
      }
      context.drawImage(image, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Encodage PNG impossible'))),
        'image/png'
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Le SVG n’a pas pu être rendu en image'))
    }
    image.src = url
  })
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const comma = text.indexOf(',')
      resolve(comma >= 0 ? text.slice(comma + 1) : text)
    }
    reader.onerror = () => reject(new Error('Lecture du PNG impossible'))
    reader.readAsDataURL(blob)
  })
}
