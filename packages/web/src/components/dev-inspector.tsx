'use client'

import { Inspector } from 'react-dev-inspector'

export function DevInspector() {
  if (process.env.NODE_ENV !== 'development') return null
  return <Inspector />
}
