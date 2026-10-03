import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

// LMS039 — Accessibility controls and preferences

// Get current user's accessibility preferences
router.get("/preferences", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    let prefs = await prisma.userAccessibilityPreferences.findUnique({
      where: { userId },
    });
    
    // Return defaults if not yet created
    if (!prefs) {
      prefs = {
        id: "",
        userId,
        fontSize: 16,
        lineHeight: 1.5,
        contrastMode: "normal",
        dyslexiaFriendlyFont: false,
        reducedMotion: false,
        screenReaderOptimized: false,
        // LMS025 — low-bandwidth mode
        lowBandwidthMode: false,
        updatedAt: new Date(),
      };
    }
    
    res.json(prefs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Save/update accessibility preferences
router.put("/preferences", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const {
      fontSize,
      lineHeight,
      contrastMode,
      dyslexiaFriendlyFont,
      reducedMotion,
      screenReaderOptimized,
      lowBandwidthMode,
    } = req.body;
    
    // Validate ranges
    const validFontSizes = [14, 16, 18, 20];
    const validLineHeights = [1.5, 1.8, 2.0];
    const validContrasts = ["normal", "high"];
    
    if (fontSize && !validFontSizes.includes(fontSize)) {
      return res.status(400).json({ error: "Invalid fontSize" });
    }
    
    if (lineHeight && !validLineHeights.includes(lineHeight)) {
      return res.status(400).json({ error: "Invalid lineHeight" });
    }
    
    if (contrastMode && !validContrasts.includes(contrastMode)) {
      return res.status(400).json({ error: "Invalid contrastMode" });
    }
    
    const prefs = await prisma.userAccessibilityPreferences.upsert({
      where: { userId },
      create: {
        userId,
        fontSize: fontSize || 16,
        lineHeight: lineHeight || 1.5,
        contrastMode: contrastMode || "normal",
        dyslexiaFriendlyFont: dyslexiaFriendlyFont || false,
        reducedMotion: reducedMotion || false,
        screenReaderOptimized: screenReaderOptimized || false,
        lowBandwidthMode: lowBandwidthMode || false,
      },
      update: {
        ...(fontSize && { fontSize }),
        ...(lineHeight && { lineHeight }),
        ...(contrastMode && { contrastMode }),
        ...(dyslexiaFriendlyFont !== undefined && { dyslexiaFriendlyFont }),
        ...(reducedMotion !== undefined && { reducedMotion }),
        ...(screenReaderOptimized !== undefined && { screenReaderOptimized }),
        ...(lowBandwidthMode !== undefined && { lowBandwidthMode }),
      },
    });
    
    res.json(prefs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reset preferences to defaults
router.post("/preferences/reset", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    const prefs = await prisma.userAccessibilityPreferences.upsert({
      where: { userId },
      create: {
        userId,
      },
      update: {
        fontSize: 16,
        lineHeight: 1.5,
        contrastMode: "normal",
        dyslexiaFriendlyFont: false,
        reducedMotion: false,
        screenReaderOptimized: false,
        lowBandwidthMode: false,
      },
    });
    
    res.json(prefs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
