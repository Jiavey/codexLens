const HOME_FILE_URL_PATTERNS = [
  /file:\/\/\/Users\/[^/\s"'`]+(?=\/|$)/g,
  /file:\/\/\/home\/[^/\s"'`]+(?=\/|$)/g,
]

const HOME_PATH_PATTERNS = [
  /\/Users\/[^/\s"'`]+(?=\/|$)/g,
  /\/home\/[^/\s"'`]+(?=\/|$)/g,
]

export function maskDisplayText(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  let next = value

  for (const pattern of HOME_FILE_URL_PATTERNS) {
    next = next.replace(pattern, '~')
  }

  for (const pattern of HOME_PATH_PATTERNS) {
    next = next.replace(pattern, '~')
  }

  return next
}

export function maskDisplayValue(value: string | null | undefined, fallback = '暂无'): string {
  return maskDisplayText(value) || fallback
}
