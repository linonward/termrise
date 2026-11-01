import { useTranslations } from "next-intl";

import type { NewWordDto } from "@repo/research/new-word-dto";
import type { VerdictReason } from "@repo/research/new-word-rules";
import { Tag } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/utils";

import { verdictReason } from "./new-word-format";

/** Category, new and rising, as tags after the phrase. */
export function WordTags({ word }: { word: NewWordDto }) {
  const t = useTranslations("newWords");
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {word.category && <Tag>{t(`category.${word.category}`)}</Tag>}
      {word.origin?.type && word.origin.type !== "unknown" && (
        <Tag tone="brand">{t(`origin.${word.origin.type}`)}</Tag>
      )}
      {word.direction && (
        <Tag>
          {t("directionTag", { direction: t(`direction.${word.direction}`) })}
        </Tag>
      )}
      {word.copyrightRisk && (
        <span
          title={t("copyrightRiskNote")}
          className="inline-flex h-5 items-center rounded-full bg-warning-soft px-2 text-xs font-semibold text-warning"
        >
          {t("copyrightRisk")}
        </span>
      )}
      {word.isNew && <Tag tone="brand">{t("tagNew")}</Tag>}
      {word.rising && (
        <span className="inline-flex h-5 items-center rounded-full bg-success-soft px-2 text-xs font-semibold text-success">
          {t("tagRising")}
        </span>
      )}
    </span>
  );
}

/** "值得做" or "可以试试", and the kind of page in bold. */
export function VerdictLine({
  word,
  children,
}: {
  word: NewWordDto;
  children?: React.ReactNode;
}) {
  const t = useTranslations("newWords");
  if (!word.verdict)
    return (
      <p className="text-[13px] text-muted-foreground">{t("notChecked")}</p>
    );
  return (
    <p className="flex flex-wrap items-center gap-2 text-[15px]">
      <span
        className={cn(
          "rounded-sm px-2 py-0.5 text-[13px] font-semibold",
          word.verdict === "worth" && "bg-success-soft text-success",
          word.verdict === "try" && "bg-warning-soft text-warning",
          word.verdict === "skip" && "bg-surface-strong text-muted-foreground",
        )}
      >
        {t(`verdict.${word.verdict}`)}
      </span>
      {word.buildAs && (
        <strong className="font-semibold">
          {t(`buildAs.${word.buildAs}`)}
        </strong>
      )}
      {children}
    </p>
  );
}

/** The reasons as a sentence (the list) or a bullet list (the detail page). */
export function VerdictReasons({
  reasons,
  as,
}: {
  reasons: unknown;
  as: "sentence" | "list";
}) {
  const t = useTranslations("newWords.reason");
  const tWords = useTranslations("newWords");
  const list = (Array.isArray(reasons) ? reasons : []) as VerdictReason[];
  const texts = list.map((r) => {
    const { key, values } = verdictReason(r);
    // A class is named in Chinese, as on the word's tag.
    if (r.code === "category" && r.category)
      values.value = tWords(`category.${r.category as "news"}`);
    return t(key as Parameters<typeof t>[0], values);
  });
  if (as === "sentence")
    return <span className="text-muted-foreground">{texts.join("，")}</span>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-[15px]">
      {texts.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}
