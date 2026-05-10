/** 与主进程 `clawflow-engine` 中 onDelta 包裹标记成对使用 */
export const STREAM_REASONING_START = '<<CF_REASONING>>\n';
export const STREAM_REASONING_END = '\n<</CF_REASONING>>';

/**
 * 将交错到达的 delta 拆成：普通活动文本（工具日志等）与思考块正文（不含标记）。
 * 支持块内流式追加（未到 END 前也可展示 draft）。
 */
export class ReasoningStreamDemux {
  private carry = '';
  private inBlock = false;
  private closedReasoning = '';
  private draftBody = '';
  private activityBuf = '';

  push(chunk: string): void {
    this.carry += chunk;
    const START = STREAM_REASONING_START;
    const END = STREAM_REASONING_END;

    while (this.carry.length) {
      if (!this.inBlock) {
        const idx = this.carry.indexOf(START);
        if (idx === -1) {
          const hold = Math.min(START.length - 1, this.carry.length);
          const emitLen = this.carry.length - hold;
          if (emitLen > 0) {
            this.activityBuf += this.carry.slice(0, emitLen);
            this.carry = this.carry.slice(emitLen);
          }
          return;
        }
        this.activityBuf += this.carry.slice(0, idx);
        this.carry = this.carry.slice(idx + START.length);
        this.inBlock = true;
        this.draftBody = '';
        continue;
      }

      const endIdx = this.carry.indexOf(END);
      if (endIdx === -1) {
        const hold = Math.min(END.length - 1, this.carry.length);
        const take = this.carry.length - hold;
        if (take > 0) {
          this.draftBody += this.carry.slice(0, take);
          this.carry = this.carry.slice(take);
        }
        return;
      }
      this.draftBody += this.carry.slice(0, endIdx);
      const body = this.draftBody.trim();
      if (body) {
        this.closedReasoning += (this.closedReasoning ? '\n\n—\n\n' : '') + body;
      }
      this.draftBody = '';
      this.carry = this.carry.slice(endIdx + END.length);
      this.inBlock = false;
    }
  }

  getActivity(): string {
    return this.activityBuf;
  }

  getThinkingDisplay(): string {
    const draft = this.draftBody.trim();
    if (!this.closedReasoning && !draft) return '';
    if (!draft) return this.closedReasoning;
    if (!this.closedReasoning) return draft;
    return `${this.closedReasoning}\n\n—\n\n${draft}`;
  }

  getClosedReasoning(): string {
    return this.closedReasoning;
  }

  /** 流结束：未闭合块并入 closed（含 carry 尾部） */
  finalizeReasoning(): string {
    if (this.inBlock) {
      const tail = (this.draftBody + this.carry).trim();
      if (tail) {
        this.closedReasoning += (this.closedReasoning ? '\n\n—\n\n' : '') + tail;
      }
      this.draftBody = '';
      this.carry = '';
      this.inBlock = false;
    }
    return this.closedReasoning;
  }
}
