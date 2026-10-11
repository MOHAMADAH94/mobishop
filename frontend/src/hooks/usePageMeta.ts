import { useEffect } from 'react'

interface PageMeta {
  title: string
  description?: string
  image?: string | null
  url?: string
}

function setMeta(name: string, content: string, attr = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function usePageMeta({ title, description, image, url }: PageMeta) {
  useEffect(() => {
    const fullTitle = title.includes('موبي شوب') ? title : `${title} | موبي شوب`
    document.title = fullTitle
    if (description) {
      setMeta('description', description)
      setMeta('og:description', description, 'property')
    }
    setMeta('og:title', fullTitle, 'property')
    setMeta('og:type', 'website', 'property')
    if (image) setMeta('og:image', image, 'property')
    if (url) setMeta('og:url', url, 'property')
  }, [title, description, image, url])
}
