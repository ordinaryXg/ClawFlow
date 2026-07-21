import {
  heuristicConversationModeClassification,
  mapCategoryToInteractionMode,
  parseClassificationResponse,
} from '../mode/conversation-mode-classifier';

describe('mapCategoryToInteractionMode', () => {
  it('maps a/b/c/d/e to engine modes', () => {
    expect(mapCategoryToInteractionMode('a')).toBe('ask');
    expect(mapCategoryToInteractionMode('b')).toBe('plan');
    expect(mapCategoryToInteractionMode('c')).toBe('plan');
    expect(mapCategoryToInteractionMode('d')).toBe('multitask');
    expect(mapCategoryToInteractionMode('e')).toBe('multitask');
  });
});

describe('parseClassificationResponse', () => {
  it('parses JSON body', () => {
    const r = parseClassificationResponse('{"category":"e","summary":"多步骤改造"}');
    expect(r?.category).toBe('e');
    expect(r?.mode).toBe('multitask');
  });

  it('parses fenced JSON', () => {
    const r = parseClassificationResponse('```json\n{"category":"a","summary":"hi"}\n```');
    expect(r?.mode).toBe('ask');
  });
});

describe('heuristicConversationModeClassification', () => {
  it('short greeting -> a', () => {
    expect(heuristicConversationModeClassification('你好').category).toBe('a');
  });
});
