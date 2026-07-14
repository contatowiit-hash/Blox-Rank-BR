"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <Link className={compact ? "brand brand-compact" : "brand"} href="/" aria-label="Blox Rank BR — início">
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-fallback">BRB</span>
        {!imageFailed && (
          <Image
            className="brand-image"
            src="/logo-brb.png"
            alt=""
            width={56}
            height={56}
            unoptimized
            onError={() => setImageFailed(true)}
          />
        )}
      </span>
      <span className="brand-name">
        <strong>Blox Rank</strong>
        <small>Brasil</small>
      </span>
    </Link>
  );
}
