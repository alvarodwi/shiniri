// Old flat paths keep working for bookmarks. Each old form path lands on Pulls with that form.
export const REDIRECTS: Record<string, string> = {
  '/': '/journal/anomaly',
  '/anomaly': '/journal/anomaly',
  '/gear': '/journal/gear',
  '/level': '/journal/level',
  '/solo-raid': '/journal/solo-raid',
  '/spending': '/gacha/spending',
  '/costumes': '/gacha/costumes',
  '/social': '/gacha/pulls?form=social',
  '/event': '/gacha/pulls?form=event',
  '/ordinary': '/gacha/pulls?form=ordinary',
  '/mold': '/gacha/pulls?form=mold',
  '/exchange': '/gacha/pulls?form=exchange',
  '/extra': '/gacha/pulls?form=extra',
  '/special': '/journal/anomaly',
}
