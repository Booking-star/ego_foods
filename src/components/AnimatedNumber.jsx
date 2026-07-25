import React, { useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

export default function AnimatedNumber({ value, formatter = (v) => v }) {
  const count = useMotionValue(value);
  const rounded = useTransform(count, (latest) => formatter(Math.round(latest)));
  const ref = useRef(null);

  useEffect(() => {
    const animation = animate(count, value, { duration: 0.6, ease: 'easeOut' });
    return animation.stop;
  }, [value, count]);

  return <motion.span ref={ref}>{rounded}</motion.span>;
}
