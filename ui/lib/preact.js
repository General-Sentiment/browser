export {
  render,
  Component,
  Fragment,
  createRef,
  h,
} from './preact.module.js'

export {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useReducer,
  useContext,
} from './hooks.module.js'

import { h } from './preact.module.js'
import htm from './htm.module.js'

export const html = htm.bind(h)
