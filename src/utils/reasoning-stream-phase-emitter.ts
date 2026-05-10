import { STREAM_REASONING_END, STREAM_REASONING_START } from './reasoning-stream-demux';

/**
 * 将「流式 reasoning / content 片段」转成带边界标记的 onDelta，供 ReasoningStreamDemux 拆分。
 */
export function createStreamReasoningPhaseEmitter(onDelta: ((text: string) => void) | undefined) {
  let inReasoning = false;
  return {
    onReasoningDelta: (t: string) => {
      if (!t) return;
      if (!inReasoning) {
        onDelta?.(STREAM_REASONING_START);
        inReasoning = true;
      }
      onDelta?.(t);
    },
    onContentDelta: (t: string) => {
      if (!t) return;
      if (inReasoning) {
        onDelta?.(STREAM_REASONING_END);
        inReasoning = false;
      }
      onDelta?.(t);
    },
    /** 流结束或仅有 reasoning 而无正文时闭合块 */
    close: () => {
      if (inReasoning) {
        onDelta?.(STREAM_REASONING_END);
        inReasoning = false;
      }
    },
  };
}
