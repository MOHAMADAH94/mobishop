import { cn } from '../lib/utils'

/** شعار موبي شوب — الملف: frontend/public/favicon.png */
export const BRAND_LOGO_SRC = '/favicon.png'

export function BrandLogo({
  className,
  alt = 'موبي شوب',
}: {
  className?: string
  alt?: string
}) {
  return <img src={BRAND_LOGO_SRC} alt={alt} className={cn('object-contain', className)} />
}
