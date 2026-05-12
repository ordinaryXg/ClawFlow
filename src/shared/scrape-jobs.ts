/**
 * 网页爬取记录（每工作区持久化于 `.agent/.clawflow/scrape-jobs.v1.json`）。
 * 工具 `web_scrape` 的回执正文在对话里；此处供右侧 Tab 列表与全文查看。
 */

export const SCRAPE_JOBS_FILE_VERSION = 1 as const;

export type ScrapeJobStatus = 'ok' | 'error';

export type ScrapeJobRecord = {
  id: string;
  createdAt: number;
  url: string;
  title?: string;
  status: ScrapeJobStatus;
  errorMessage?: string;
  /** 抓取得到的纯文本总长度（成功时） */
  charsTotal?: number;
  /** 写入对话回执用的摘要（与工具返回 excerpt 一致策略） */
  excerpt?: string;
  /** 相对工作区根路径，如 `.agent/.clawflow/scrapes/<id>.md` */
  artifactRelPath?: string;
};

export type ScrapeJobsFile = {
  version: typeof SCRAPE_JOBS_FILE_VERSION;
  jobs: ScrapeJobRecord[];
};
