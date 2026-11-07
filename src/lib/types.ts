export interface Style {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  prompt_template: string;
  sort_order: number | null;
  created_at?: string;
}

export interface Audience {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  prompt_suffix: string | null;
  sort_order: number | null;
  created_at?: string;
}

export interface Work {
  id: number;
  slug: string;
  title: string;
  author: string | null;
  era: string | null;
  category: string | null;
  source_type: string; // manual | fetched
  source_url: string | null;
  cover_url: string | null;
  intro: string | null;
  content: string | null;
  status: string; // draft | published | offline
  created_at: string;
  updated_at: string;
}

export interface InterpretationSection {
  quote: string;
  comment: string;
}

export interface ReadingItem {
  title: string;
  reason: string;
}

// 书名显示：AI 生成的 title 有时已自带《》（甚至多篇连写，如「《a》《b》等」），
// 直接再包一层会出现《《a》》双书名号。已含《则原样使用，否则包一层。
export function formatBookTitle(title: string): string {
  const t = (title ?? "").trim();
  if (!t) return "";
  return t.includes("《") ? t : `《${t}》`;
}

export interface InterpretationContent {
  summary: string;
  background: string;
  sections: InterpretationSection[];
  highlights: string[];
  reading_list: ReadingItem[];
}

export interface Interpretation {
  id: number;
  work_id: number;
  style_id: number;
  audience_id: number;
  title: string | null;
  summary: string | null;
  structured_content: InterpretationContent | null;
  generation_type: string; // ai | manual
  ai_model: string | null;
  quality_score: number | null;
  status: string; // generating | pending_review | published | rejected
  created_at: string;
  updated_at: string;
}

export interface GenerationJob {
  id: number;
  work_id: number;
  style_id: number;
  audience_id: number;
  model: string | null;
  status: string; // queued | running | success | failed
  error: string | null;
  retry_count: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export const WORK_STATUS: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  offline: "已下架",
};

export const INTERP_STATUS: Record<string, string> = {
  generating: "生成中",
  pending_review: "待审核",
  published: "已发布",
  rejected: "未通过",
};

export const JOB_STATUS: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  success: "成功",
  failed: "失败",
};
