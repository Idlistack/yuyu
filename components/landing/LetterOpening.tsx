"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Box from "@mui/material/Box";

/** Each physical movement finishes before the next one starts. */
export function LetterOpening({ onOpened }: { onOpened: () => void }) {
  const [step, setStep] = useState(0);
  const advance = (expected: number) => setStep((current) => current === expected ? current + 1 : current);
  return (
    <Box aria-hidden sx={{ height: { xs: 420, sm: 480 }, display: "grid", placeItems: "center", overflow: "hidden", perspective: "1200px" }}>
      <motion.div
        initial={{ opacity: 0, y: 55, rotate: -9, rotateX: 12 }}
        animate={{ opacity: step === 5 ? 0 : 1, y: step >= 4 ? 65 : 0, rotate: step >= 4 ? 5 : -2, rotateX: 0 }}
        transition={{ type: "spring", stiffness: 95, damping: 19, mass: 1.1 }}
        onAnimationComplete={() => advance(0)}
        style={{ position: "relative", width: "min(72vw, 350px)", height: 220, perspective: 1000 }}
      >
        <Box sx={{ position: "absolute", inset: 0, borderRadius: 1, background: "linear-gradient(155deg, #b89560, #ead5ac)", boxShadow: "0 28px 38px -15px #0008, inset 0 2px 6px #60471c55" }} />
        {/* The flap's reverse remains visible when it folds behind the paper. */}
        <motion.div
          animate={{ rotateX: step >= 2 ? -172 : 0 }}
          transition={{ duration: 0.85, ease: [0.32, 0, 0.18, 1] }}
          onAnimationComplete={() => { if (step === 2) advance(2); }}
          style={{ position: "absolute", inset: "0 0 auto", height: 125, transformOrigin: "50% 0%", zIndex: step >= 3 ? 0 : 4, clipPath: "polygon(0 0, 100% 0, 50% 100%)", background: "linear-gradient(165deg, #f8e8c8, #cba979)", filter: "drop-shadow(0 3px 2px #72502544)" }}
        />
        <motion.div
          animate={{ y: step >= 3 ? -165 : 0, rotate: step >= 3 ? 2 : 0 }}
          transition={{ duration: 0.95, ease: [0.45, 0.02, 0.16, 1] }}
          onAnimationComplete={() => { if (step === 3) advance(3); }}
          style={{ position: "absolute", inset: "12px 18px", zIndex: 1, perspective: 900 }}
        >
          <Box sx={{ height: "100%", bgcolor: "#fffaf0", borderRadius: "2px", boxShadow: "0 4px 12px #4a341d33", p: 3, color: "#786442", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
            A note from Abhiram
            <Box sx={{ mt: 2, height: 68, background: "repeating-linear-gradient(transparent 0 15px, #9d896333 15px 16px)" }} />
          </Box>
          <motion.div
            animate={{ rotateX: step >= 4 ? -175 : 0 }}
            transition={{ duration: 0.8, ease: [0.22, 0.05, 0.2, 1] }}
            onAnimationComplete={() => { if (step === 4) advance(4); }}
            style={{ position: "absolute", inset: "50% 0 0", transformOrigin: "center top", background: "linear-gradient(#e6ddc9, #fffaf0 12%)", borderTop: "1px solid #cbbd9c66", boxShadow: "0 3px 8px #4a341d22" }}
          />
        </motion.div>
        <Box sx={{ position: "absolute", inset: 0, zIndex: 2, clipPath: "polygon(0 0, 50% 58%, 100% 0, 100% 100%, 0 100%)", background: "linear-gradient(115deg, #eedcba, #d4b587)", borderRadius: 1 }} />
        <Box sx={{ position: "absolute", inset: 0, zIndex: 3, clipPath: "polygon(0 100%, 50% 47%, 100% 100%)", background: "linear-gradient(0deg, #ecd8b2, #f6e6c9)", borderBottom: "1px solid #bb9b6d" }} />
        <motion.div
          animate={step >= 1 ? { rotateY: [0, -35, -65], rotate: [0, -8, 28], x: [0, 8, 105], y: [0, -12, 90], opacity: [1, 1, 0] } : { opacity: 1 }}
          transition={{ duration: 0.85, times: [0, 0.45, 1], ease: [0.42, 0, 0.7, 0.5] }}
          onAnimationComplete={() => { if (step === 1) advance(1); }}
          style={{ position: "absolute", zIndex: 5, left: "calc(50% - 25px)", top: 95, width: 50, height: 50, transformOrigin: "85% 70%", borderRadius: "46% 54% 48% 52%", display: "grid", placeItems: "center", background: "radial-gradient(circle at 30% 25%, #cc7054, #873423 75%)", color: "#efba92", border: "3px double #e8a17a88", boxShadow: "2px 5px 6px #49271a66, inset 1px 1px 3px #f7c89c88", font: "italic bold 23px Georgia" }}
        >Y</motion.div>
      </motion.div>
      {step === 5 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} onAnimationComplete={onOpened} />}
    </Box>
  );
}
