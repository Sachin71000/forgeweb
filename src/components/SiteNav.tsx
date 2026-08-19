import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import GooeyNav, { type GooeyNavItem } from "./react-bits/GooeyNav";

export interface SiteNavProps {
  logo: string;
  logoAlt: string;
  items: GooeyNavItem[];
}

export default function SiteNav({ logo, logoAlt, items }: SiteNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <motion.header
      className="site-nav-root"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="site-nav-shell">
        <a href="#top" className="site-nav-brand" aria-label="ForgeWeb home">
          <img src={logo} alt={logoAlt} className="size-8" />
          <span>ForgeWeb</span>
        </a>
        <div className="site-nav-desktop">
          <GooeyNav
            items={items}
            particleCount={15}
            particleDistances={[90, 10]}
            particleR={100}
            initialActiveIndex={0}
            animationTime={600}
            timeVariance={300}
            colors={[1, 2, 3, 1, 2, 3, 1, 4]}
          />
        </div>
        <a href="#product-prompt" className="site-nav-cta">
          Start building <span aria-hidden="true">↗</span>
        </a>
        <button
          type="button"
          className="site-nav-menu"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-navigation"
            className="site-nav-mobile"
            aria-label="Mobile navigation"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {items.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.label}<span aria-hidden="true">↗</span>
              </a>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
