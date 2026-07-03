'use client'

import { AnimatePresence, MotionValue, Variants, animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type AnimationSequence = {
  initial: Record<string, unknown>
  animate: Record<string, unknown>
  exit: Record<string, unknown>
}

interface RotatingTextProps {
  texts: string[]
  transition?: Record<string, unknown>
  initial?: Record<string, string | number>
  animate?: Record<string, string | number>
  exit?: Record<string, string | number>
  animatePresenceMode?: 'sync' | 'wait' | 'popLayout'
  animatePresenceInitial?: boolean
  rotationInterval?: number
  staggerDuration?: number
  staggerFrom?: 'first' | 'last' | 'center' | 'random' | number
  splitBy?: string
  mainClassName?: string
  splitLevelClassName?: string
  elementLevelClassName?: string
  auto?: boolean
  loop?: boolean
  onNext?: (index: number) => void
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ')
}

export default function RotatingText({
  texts,
  transition = { type: 'tween', ease: 'easeInOut' },
  initial = { y: '100%', opacity: 0 },
  animate = { y: 0, opacity: 1 },
  exit = { y: '-100%', opacity: 0 },
  animatePresenceMode = 'wait',
  animatePresenceInitial = false,
  rotationInterval = 2000,
  staggerDuration = 0,
  staggerFrom = 'first',
  splitBy = 'characters',
  mainClassName,
  splitLevelClassName,
  elementLevelClassName,
  auto = true,
  loop = true,
  onNext,
}: RotatingTextProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const textsKey = texts.join('')
  const memoTexts = useMemo(() => texts, [textsKey])

  const getStaggerDelay = useCallback(
    (index: number, total: number) => {
      const from = staggerFrom === 'first' ? 0 : staggerFrom === 'last' ? total - 1 : staggerFrom === 'center' ? Math.floor(total / 2) : typeof staggerFrom === 'number' ? staggerFrom : 0
      if (from > total - 1) return 0
      if (staggerFrom === 'random') return Math.random() * staggerDuration
      const distance = Math.abs(from - index)
      const direction = from < index ? 1 : -1
      return direction * distance * staggerDuration
    },
    [staggerFrom, staggerDuration],
  )

  const getSequence = useCallback(
    (index: number): AnimationSequence => {
      const getStagger = (i: number, total: number) => ({
        delay: getStaggerDelay(i, total),
        ...transition,
      } as const)
      return {
        initial,
        animate: { ...animate, transition: getStagger(index, splitBy === 'characters' ? memoTexts[currentIndex].length : 1) },
        exit: { ...exit, transition: getStagger(index, splitBy === 'characters' ? memoTexts[currentIndex].length : 1) },
      }
    },
    [currentIndex, memoTexts, staggerFrom, staggerDuration, transition, initial, animate, exit],
  )

  const currentText = memoTexts[currentIndex]

  useEffect(() => {
    if (!auto) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1
        if (next >= memoTexts.length) {
          if (loop) {
            onNext?.(0)
            return 0
          }
          return prev
        }
        onNext?.(next)
        return next
      })
    }, rotationInterval)
    return () => clearInterval(interval)
  }, [auto, loop, rotationInterval, memoTexts.length, onNext])

  const containerVariants: Variants = {
    initial: {},
    animate: { transition: { staggerChildren: staggerDuration } },
    exit: { transition: { staggerChildren: staggerDuration, staggerDirection: -1 } },
  }

  const elements = splitBy === 'characters' ? currentText.split('') : splitBy === 'words' ? currentText.split(' ') : [currentText]

  return (
    <AnimatePresence mode={animatePresenceMode} initial={animatePresenceInitial}>
      <motion.span
        key={currentIndex}
        className={cn('flex flex-wrap', mainClassName)}
        variants={containerVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        aria-label={currentText}
      >
        {elements.map((element, i) => (
          <motion.span
            key={i}
            className={cn(splitLevelClassName)}
            initial={initial}
            animate={animate}
            exit={exit}
            transition={{ delay: getStaggerDelay(i, elements.length), ...transition }}
          >
            <span className={cn(elementLevelClassName)}>{element === ' ' ? ' ' : element}</span>
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  )
}
