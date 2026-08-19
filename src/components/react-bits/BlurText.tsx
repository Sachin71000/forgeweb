import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";

type BlurTextProps = {
  text: string;
  className?: string;
};

/** Platform-only React Bits-inspired text reveal. */
export function BlurText({ text, className }: BlurTextProps) {
  const reduceMotion = useReducedMotion();

  return (
    <span className={cn("inline-flex flex-wrap", className)} aria-label={text}>
      {text.split(" ").map((word, index) => (
        <motion.span
          aria-hidden="true"
          className="mr-[0.22em] inline-block"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, delay: index * 0.045, ease: "easeOut" }}
          key={`${word}-${index}`}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}
