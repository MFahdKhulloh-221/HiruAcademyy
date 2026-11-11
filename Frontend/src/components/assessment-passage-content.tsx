import type { AssessmentImage, AssessmentPassageBlock } from "@/lib/assessment-image";
import { AssessmentContent } from "@/components/assessment-content";
import { PlacementRichText } from "@/components/placement-rich-text";
import styles from "./assessment-passage-content.module.css";

export function AssessmentPassageContent({ passage }: { passage: AssessmentImage & { body: string; blocks?: AssessmentPassageBlock[] | null } }) {
  if (!passage.blocks?.length) return <AssessmentContent content={passage}><PlacementRichText value={passage.body} /></AssessmentContent>;
  return <div className={styles.blocks}>{passage.blocks.map((block, index) => <div className={styles.block} key={index}>
    {block.type === "text" ? <PlacementRichText value={block.text} /> : <AssessmentContent content={block}>{null}</AssessmentContent>}
  </div>)}</div>;
}
