"use client";

import { PublicPage } from "@/components/public-shell";
import { PlacementRunner } from "@/components/placement-runner";

export default function PlacementResultPage() {
  return <PublicPage active="Placement Test"><PlacementRunner report /></PublicPage>;
}
