"use client";

import Image from "next/image";
import { useState } from "react";

type Props = { name: string; url?: string | null; className: string };

export function StudentAvatar({ name, url, className }: Props) {
  const [image, setImage] = useState({ url, failed: false });
  if (image.url !== url) setImage({ url, failed: false });
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? "").join("").toUpperCase();

  return (
    <span className={`student-avatar ${className}`}>
      {url && !(image.url === url && image.failed) ? (
        <Image unoptimized width={104} height={104} src={url} alt={`Foto profil ${name}`} onError={() => setImage({ url, failed: true })} />
      ) : <span role="img" aria-label={`Foto profil ${name}`}>{initials}</span>}
    </span>
  );
}
